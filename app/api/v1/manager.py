from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_manager
from app.db.session import get_db
from app.models.bet import Bet
from app.models.user import User
from app.schemas import AuditLogOut, BetOut, ManagerLegPatch, ManagerMatchCreate, ManagerMatchPatch
from app.services.audit_service import AuditService
from app.services.bet_service import SettlementService
from app.services.manager_service import ManagerService
from app.services.referral_service import ReferralService

router = APIRouter()


@router.get("/matches")
def list_matches(
    db: Session = Depends(get_db),
    _manager: User = Depends(require_manager),
):
    return ManagerService.list_matches(db)


@router.post("/matches", status_code=201)
def create_match(
    payload: ManagerMatchCreate,
    db: Session = Depends(get_db),
    manager: User = Depends(require_manager),
):
    game = ManagerService.create_manual_match(
        db,
        home_team=payload.home_team,
        away_team=payload.away_team,
        league=payload.league,
        sport=payload.sport,
        kickoff=payload.kickoff,
        note=payload.note,
    )
    AuditService.log(
        db,
        actor_id=manager.id,
        role="manager",
        action="Create match",
        detail=f"{game.home} vs {game.away}",
        match_id=game.external_id,
    )
    db.commit()
    return ManagerService._to_view(db, game)


@router.post("/matches/{match_id}/control")
def take_control(
    match_id: str,
    db: Session = Depends(get_db),
    manager: User = Depends(require_manager),
):
    game = ManagerService.take_control(db, match_id)
    if not game:
        raise HTTPException(status_code=404, detail="Match not found")
    AuditService.log(
        db,
        actor_id=manager.id,
        role="manager",
        action="Take control",
        detail=f"{game.home} vs {game.away}",
        match_id=match_id,
    )
    db.commit()
    return ManagerService._to_view(db, game)


@router.delete("/matches/{match_id}/control")
def release_control(
    match_id: str,
    db: Session = Depends(get_db),
    manager: User = Depends(require_manager),
):
    if not ManagerService.release_control(db, match_id):
        raise HTTPException(status_code=400, detail="Cannot release this match")
    AuditService.log(
        db,
        actor_id=manager.id,
        role="manager",
        action="Release control",
        detail=match_id,
        match_id=match_id,
    )
    db.commit()
    return {"ok": True}


@router.patch("/matches/{match_id}")
def update_match(
    match_id: str,
    payload: ManagerMatchPatch,
    db: Session = Depends(get_db),
    manager: User = Depends(require_manager),
):
    try:
        game = ManagerService.update_match(
            db,
            match_id,
            status=payload.status,
            home_score=payload.home_score,
            away_score=payload.away_score,
            home_team=payload.home_team,
            away_team=payload.away_team,
            league=payload.league,
            kickoff=payload.kickoff,
            note=payload.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not game:
        raise HTTPException(status_code=404, detail="Match not found")
    AuditService.log(
        db,
        actor_id=manager.id,
        role="manager",
        action="Update match",
        detail=f"{game.home} vs {game.away} → {game.manager_status}",
        match_id=match_id,
    )
    db.commit()
    return ManagerService._to_view(db, game)


@router.delete("/matches/{match_id}")
def delete_match(
    match_id: str,
    db: Session = Depends(get_db),
    manager: User = Depends(require_manager),
):
    if not ManagerService.delete_manual_match(db, match_id):
        raise HTTPException(status_code=400, detail="Only manual matches can be deleted")
    AuditService.log(
        db,
        actor_id=manager.id,
        role="manager",
        action="Delete match",
        detail=match_id,
        match_id=match_id,
    )
    db.commit()
    return {"ok": True}


@router.patch("/bets/{bet_id}/legs/{leg_index}", response_model=BetOut)
def update_leg(
    bet_id: str,
    leg_index: int,
    payload: ManagerLegPatch,
    db: Session = Depends(get_db),
    manager: User = Depends(require_manager),
):
    bet = db.get(Bet, bet_id)
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")

    ft_score = None
    clear_ft = False
    if payload.ft_home_score is not None and payload.ft_away_score is not None:
        ft_score = {"home": payload.ft_home_score, "away": payload.ft_away_score}
    elif payload.ft_home_score is None and payload.ft_away_score is None:
        if payload.outcome_status == "not_started":
            clear_ft = True

    try:
        updated = SettlementService.update_leg(
            db,
            bet,
            leg_index,
            selection=payload.selection,
            selection_label=payload.selection_label,
            odds=payload.odds,
            market_id=payload.market_id,
            market_name=payload.market_name,
            outcome_label=payload.outcome_label,
            manager_ft_score=ft_score,
            outcome_status=payload.outcome_status,
            clear_ft_score=clear_ft,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    AuditService.log(
        db,
        actor_id=manager.id,
        role="manager",
        action="Update bet leg",
        detail=f"{updated.booking_code} leg {leg_index}",
        bet_id=updated.id,
        booking_code=updated.booking_code,
    )
    db.commit()
    return BetOut.model_validate(updated)


@router.get("/referrals")
def my_referrals(
    db: Session = Depends(get_db),
    manager: User = Depends(require_manager),
):
    stats = ReferralService.manager_stats(db, manager.id)
    db.commit()
    return stats


@router.get("/audit", response_model=list[AuditLogOut])
def manager_audit(
    db: Session = Depends(get_db),
    _manager: User = Depends(require_manager),
):
    return AuditService.list_entries(db, role="manager")
