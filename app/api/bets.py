from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.bet import Bet
from app.models.user import User
from app.schemas import BetCreate, BetOut

router = APIRouter()


@router.post("/place", response_model=BetOut)
def place_bet(
    payload: BetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.stake <= 0:
        raise HTTPException(status_code=400, detail="Stake must be positive")
    user = db.query(User).get(current_user.id)
    if (user.balance or 0.0) < payload.stake:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    # deduct balance
    user.balance = (user.balance or 0.0) - float(payload.stake)
    bet = Bet(
        user_id=current_user.id, stake=float(payload.stake), odds=float(payload.odds)
    )
    db.add(bet)
    db.add(user)
    db.commit()
    db.refresh(bet)
    return bet


@router.get("/my", response_model=list[BetOut])
def my_bets(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    bets = (
        db.query(Bet)
        .filter(Bet.user_id == current_user.id)
        .order_by(Bet.created_at.desc())
        .all()
    )
    return bets
