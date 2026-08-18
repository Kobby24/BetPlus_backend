from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas import BetCreate, BetOut, BetPlaceIn
from app.services.bet_service import BetService, SelectionInput
from app.services.wallet_service import InsufficientBalanceError

router = APIRouter()


def _bet_to_out(bet) -> BetOut:
    return BetOut.model_validate(bet)


@router.post("/place", response_model=BetOut, status_code=201)
def place_bet(
    payload: BetPlaceIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    selections = [
        SelectionInput(
            match_id=s.match_id,
            home_team=s.home_team,
            away_team=s.away_team,
            selection=s.selection,
            selection_label=s.selection_label,
            odds=s.odds,
            league=s.league,
            market_id=s.market_id,
            market_name=s.market_name,
        )
        for s in payload.selections
    ]
    try:
        bet = BetService.place_bet(
            db,
            user_id=current_user.id,
            stake=payload.stake,
            selections=selections,
            flex_cut=payload.flex_cut,
        )
        return _bet_to_out(bet)
    except InsufficientBalanceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/place/simple", response_model=BetOut, status_code=201, include_in_schema=False)
def place_simple_bet(
    payload: BetCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        bet = BetService.place_simple_bet(
            db, current_user.id, payload.stake, payload.odds
        )
        return _bet_to_out(bet)
    except InsufficientBalanceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/my", response_model=list[BetOut])
def my_bets(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    bets = BetService.list_user_bets(db, current_user.id)
    return [_bet_to_out(b) for b in bets]


@router.get("/code/{booking_code}", response_model=BetOut)
def get_by_booking_code(booking_code: str, db: Session = Depends(get_db)):
    bet = BetService.get_by_booking_code(db, booking_code)
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    return _bet_to_out(bet)


@router.get("/verify/{verify_code}", response_model=BetOut)
def get_by_verify_code(verify_code: str, db: Session = Depends(get_db)):
    bet = BetService.get_by_verify_code(db, verify_code)
    if not bet:
        raise HTTPException(status_code=404, detail="Bet not found")
    return _bet_to_out(bet)
