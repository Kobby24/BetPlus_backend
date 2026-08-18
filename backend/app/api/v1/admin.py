from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_admin
from app.core.money import to_decimal
from app.db.session import get_db
from app.models.bet import Bet
from app.models.user import User
from app.schemas import (
    AdminBetPatch,
    AdminCreditIn,
    AdminSettleIn,
    AdminStatsOut,
    AdminUserPatch,
    AuditLogOut,
    BetOut,
    LedgerEntryOut,
    TransactionOut,
    UserOut,
)
from app.services.audit_service import AuditService
from app.services.bet_service import BetService, SettlementService
from app.services.ledger_service import LedgerService
from app.services.referral_service import ReferralService
from app.services.wallet_service import WalletService

router = APIRouter()


def _bet_to_out(bet: Bet) -> BetOut:
    return BetOut.model_validate(bet)


@router.post("/settlement/run")
def run_settlement(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    settled = SettlementService.run_open_bets(db)
    AuditService.log(
        db,
        actor_id=admin.id,
        role="admin",
        action="Run settlement",
        detail=f"{len(settled)} bets processed",
    )
    db.commit()
    return {
        "settled": len(settled),
        "results": [
            {"bet_id": b.id, "status": b.status, "payout": float(b.payout or 0)}
            for b in settled
        ],
    }


@router.get("/stats", response_model=AdminStatsOut)
def admin_stats(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    users = db.query(User).count()
    bets = db.query(Bet).count()
    open_bets = db.query(Bet).filter(Bet.status == "open").count()
    liabilities = LedgerService.user_liabilities(db)
    platform = LedgerService.platform_balance(db)
    return AdminStatsOut(
        users=users,
        bets=bets,
        open_bets=open_bets,
        total_user_balance=float(liabilities),
        platform_balance=float(platform),
        net_position=float(platform - liabilities),
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(
    user_id: str,
    payload: AdminUserPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.is_manager is not None:
        user.is_manager = payload.is_manager
        if payload.is_manager:
            ReferralService.ensure_manager_referral_code(db, user)
        db.add(user)
        AuditService.log(
            db,
            actor_id=admin.id,
            role="admin",
            action="Grant manager" if payload.is_manager else "Revoke manager",
            detail=user.email,
        )

    if payload.balance is not None:
        try:
            WalletService.set_balance(
                db, user_id, payload.balance, f"Admin set balance to {payload.balance}"
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        AuditService.log(
            db,
            actor_id=admin.id,
            role="admin",
            action="Set balance",
            detail=f"{user.email} → {payload.balance}",
        )

    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/credit", response_model=TransactionOut)
def credit_user(
    user_id: str,
    payload: AdminCreditIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        tx = WalletService.deposit(
            db,
            user_id,
            payload.amount,
            payload.description or "Admin credit",
            ledger_type="admin_credit",
            track_referral=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    AuditService.log(
        db,
        actor_id=admin.id,
        role="admin",
        action="Credit wallet",
        detail=f"{user.email} +{payload.amount}",
    )
    db.commit()
    return tx


@router.get("/users/{user_id}/transactions", response_model=list[TransactionOut])
def user_transactions(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return WalletService.list_transactions(db, user_id)


@router.get("/users/{user_id}/bets", response_model=list[BetOut])
def user_bets(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return [_bet_to_out(b) for b in BetService.list_user_bets(db, user_id)]


@router.get("/bets", response_model=list[BetOut])
def list_bets(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    bets = (
        db.query(Bet)
        .options(joinedload(Bet.selections))
        .order_by(Bet.placed_at.desc())
        .all()
    )
    return [_bet_to_out(b) for b in bets]


@router.get("/bets/{bet_id}", response_model=BetOut)
def get_bet(
    bet_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    bet = db.get(Bet, bet_id)
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    return _bet_to_out(bet)


@router.patch("/bets/{bet_id}", response_model=BetOut)
def patch_bet(
    bet_id: str,
    payload: AdminBetPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    bet = db.get(Bet, bet_id)
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    if bet.status != "open":
        raise HTTPException(status_code=400, detail="Cannot edit a settled bet")

    if payload.stake is not None:
        bet.stake = to_decimal(payload.stake)

    if payload.selections is not None:
        if len(payload.selections) != len(bet.selections):
            raise HTTPException(
                status_code=400, detail="Selection count must match existing legs"
            )
        for index, incoming in enumerate(payload.selections):
            target = next((s for s in bet.selections if s.leg_index == index), None)
            if not target:
                continue
            target.match_id = incoming.match_id
            target.home_team = incoming.home_team
            target.away_team = incoming.away_team
            target.selection = incoming.selection
            target.selection_label = incoming.selection_label
            target.odds = to_decimal(incoming.odds)
            target.league = incoming.league
            target.market_id = incoming.market_id
            target.market_name = incoming.market_name

    total_odds = Decimal("1")
    for sel in bet.selections:
        total_odds *= to_decimal(sel.odds)
    bet.total_odds = total_odds
    bet.potential_win = (to_decimal(bet.stake) * total_odds).quantize(Decimal("0.01"))
    bet.bonus = (
        (to_decimal(bet.potential_win) * Decimal("0.04")).quantize(Decimal("0.01"))
        if len(bet.selections) >= 3
        else Decimal("0")
    )
    db.add(bet)
    AuditService.log(
        db,
        actor_id=admin.id,
        role="admin",
        action="Pick edit saved",
        detail=bet.booking_code,
        bet_id=bet.id,
        booking_code=bet.booking_code,
    )
    db.commit()
    db.refresh(bet)
    return _bet_to_out(bet)


@router.post("/bets/{bet_id}/settle", response_model=BetOut)
def settle_bet(
    bet_id: str,
    payload: AdminSettleIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    bet = db.get(Bet, bet_id)
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    if bet.status != "open":
        raise HTTPException(status_code=400, detail="Bet already settled")
    try:
        settled = SettlementService.settle_bet(db, bet, force_status=payload.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    AuditService.log(
        db,
        actor_id=admin.id,
        role="admin",
        action="Settle bet",
        detail=f"{settled.booking_code} → {payload.status}",
        bet_id=settled.id,
        booking_code=settled.booking_code,
    )
    db.commit()
    return _bet_to_out(settled)


@router.get("/ledger", response_model=list[LedgerEntryOut])
def list_ledger(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return LedgerService.list_entries(db)


@router.get("/referrals")
def list_referrals(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return ReferralService.all_managers_overview(db)


@router.get("/referrals/{manager_id}")
def manager_referral_detail(
    manager_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    try:
        return ReferralService.manager_stats(db, manager_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/audit", response_model=list[AuditLogOut])
def list_audit(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return AuditService.list_entries(db, role="admin")
