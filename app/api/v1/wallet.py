from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.transaction import Transaction
from app.schemas import TransactionOut, WalletOp
from app.services.payment_service import PaymentService
from app.services.rate_limit import enforce_rate_limit
from app.services.wallet_service import InsufficientBalanceError, WalletService

router = APIRouter()


@router.get("/transactions", response_model=list[TransactionOut])
def get_transactions(
    current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    return WalletService.list_transactions(db, current_user.id)


@router.post("/deposit", response_model=TransactionOut)
def deposit(
    payload: WalletOp,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    if not settings.allow_direct_wallet_funding:
        raise HTTPException(
            status_code=403,
            detail="Direct deposits are disabled. Initiate a provider payment.",
        )
    try:
        return WalletService.deposit(
            db, current_user.id, payload.amount, payload.description
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/withdraw", response_model=TransactionOut)
def withdraw(
    payload: WalletOp,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    if not settings.allow_direct_wallet_funding:
        try:
            intent = PaymentService.initiate_withdrawal(
                db,
                user_id=current_user.id,
                amount=payload.amount,
                destination=payload.description,
            )
            txs = WalletService.list_transactions(db, current_user.id)
            match = next(
                (t for t in txs if intent.provider_ref in (t.description or "")),
                None,
            )
            if match:
                return match
            raise HTTPException(status_code=400, detail="Withdrawal recorded without transaction")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return WalletService.withdraw(
            db, current_user.id, payload.amount, payload.description
        )
    except InsufficientBalanceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
