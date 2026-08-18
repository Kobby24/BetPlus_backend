from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.transaction import Transaction
from app.schemas import TransactionOut, WalletOp
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
    try:
        return WalletService.withdraw(
            db, current_user.id, payload.amount, payload.description
        )
    except InsufficientBalanceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
