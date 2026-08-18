from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.schemas import GameOut, LeagueOut, SportOut

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
    games = q.all()
    return [
        GameOut(
            id=g.id,
            external_id=g.external_id,
            league_id=g.league_id,
            home=g.home,
            away=g.away,
            home_abbr=g.home_abbr,
            away_abbr=g.away_abbr,
            starts_at=g.starts_at,
            status=g.status,
            is_live=bool(g.is_live),
            live_minute=g.live_minute,
            home_score=g.home_score,
            away_score=g.away_score,
            odds_home=float(g.odds_home) if g.odds_home is not None else None,
            odds_draw=float(g.odds_draw) if g.odds_draw is not None else None,
            odds_away=float(g.odds_away) if g.odds_away is not None else None,
        )
        for g in games
    ]
