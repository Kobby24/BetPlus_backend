from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.sport import Sport
from app.models.league import League
from app.models.game import Game
from app.schemas import SportOut, LeagueOut, GameOut

router = APIRouter()


@router.get("/sports", response_model=List[SportOut])
def list_sports(db: Session = Depends(get_db)):
    return db.query(Sport).all()


@router.get("/leagues", response_model=List[LeagueOut])
def list_leagues(sport_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(League)
    if sport_id:
        q = q.filter(League.sport_id == sport_id)
    return q.all()


@router.get("/games", response_model=List[GameOut])
def list_games(league_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Game)
    if league_id:
        q = q.filter(Game.league_id == league_id)
    return q.all()
