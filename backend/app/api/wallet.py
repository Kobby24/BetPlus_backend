from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas import TransactionOut, WalletOp

router = APIRouter()


@router.get("/transactions", response_model=list[TransactionOut])
def get_transactions(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
    return txs


@router.post("/deposit", response_model=TransactionOut)
def deposit(
    payload: WalletOp,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    # update balance
    user = db.query(User).get(current_user.id)
    user.balance = (user.balance or 0.0) + float(payload.amount)
    tx = Transaction(
        user_id=current_user.id,
        type="deposit",
        amount=float(payload.amount),
        description=payload.description,
    )
    db.add(tx)
    db.add(user)
    db.commit()
    db.refresh(tx)
    return tx


@router.post("/withdraw", response_model=TransactionOut)
def withdraw(
    payload: WalletOp,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    user = db.query(User).get(current_user.id)
    if (user.balance or 0.0) < payload.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    user.balance = (user.balance or 0.0) - float(payload.amount)
    tx = Transaction(
        user_id=current_user.id,
        type="withdraw",
        amount=-float(payload.amount),
        description=payload.description,
    )
    db.add(tx)
    db.add(user)
    db.commit()
    db.refresh(tx)
    return tx
