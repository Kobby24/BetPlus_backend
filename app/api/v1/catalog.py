from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.models.user import User
from app.schemas import GameOut, LeagueOut, SportOut, SportyBetSyncOut
from app.services.audit_service import AuditService
from app.services.catalog_service import catalog_game_view
from app.services.sportybet_client import SportyBetUpstreamError, fetch_important_events
from app.services.sportybet_sync import sync_sportybet_payload

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
def list_games(
    league_id: int | None = None,
    sport: str | None = None,
    live: bool | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Game)
    if league_id:
        q = q.filter(Game.league_id == league_id)
    if sport:
        q = q.join(League).join(Sport).filter(Sport.slug == sport)
    if live is True:
        q = q.filter(Game.is_live == 1)
    games = q.order_by(Game.starts_at.asc()).all()
    return [GameOut.model_validate(catalog_game_view(db, g)) for g in games]


@router.get("/games/{external_id}", response_model=GameOut)
def get_game(external_id: str, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.external_id == external_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Match not found")
    return GameOut.model_validate(catalog_game_view(db, game))


@router.post("/sync/sportybet", response_model=SportyBetSyncOut)
async def sync_sportybet(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        payload = await fetch_important_events()
    except SportyBetUpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    summary = sync_sportybet_payload(db, payload)
    AuditService.log(
        db,
        actor_id=admin.id,
        role="admin",
        action="Sync SportyBet catalog",
        detail=(
            f"fetched={summary['fetched']} created={summary['created']} "
            f"updated={summary['updated']} skipped_existing={summary['skipped_existing']} "
            f"skipped_invalid={summary['skipped_invalid']} failed={summary['failed']}"
        ),
    )
    db.commit()
    return SportyBetSyncOut.model_validate(summary)
