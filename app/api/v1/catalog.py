from datetime import date, datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.models.sportybet_sync_job import SportyBetSyncJob
from app.schemas import (
    GameOut,
    LeagueOut,
    SportOut,
    SportyBetLiveSyncJobOut,
    SportyBetLiveSyncQueuedOut,
    SportyBetSyncOut,
)
from app.services.audit_service import AuditService
from app.services.catalog_service import catalog_game_view
from app.services.sportybet_client import (
    SportyBetUpstreamError,
    fetch_important_events,
)
from app.services.sportybet_live_job import (
    current_job_status_payload,
    enqueue_live_sync_job,
    find_current_live_sync_job,
    job_queued_payload,
    job_status_payload,
)
from app.services.sportybet_sync import CatalogSchemaError, sync_sportybet_payload

router = APIRouter()

_SPORTYBET_GAME_COLUMNS = ("external_event_id", "external_game_id")


def missing_required_columns(bind) -> list[str]:
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "games" not in tables:
        return [f"games.{name}" for name in _SPORTYBET_GAME_COLUMNS]
    existing = {col["name"] for col in inspector.get_columns("games")}
    return [f"games.{name}" for name in _SPORTYBET_GAME_COLUMNS if name not in existing]


def missing_live_sync_infrastructure(bind) -> list[str]:
    missing = missing_required_columns(bind)
    inspector = inspect(bind)
    if "sportybet_sync_jobs" not in inspector.get_table_names():
        missing.append("sportybet_sync_jobs")
    return missing


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
    live: bool | None = None,
    date: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Game)
    selected_date = date or datetime.now(timezone.utc).date()
    start_of_day = datetime.combine(
        selected_date, datetime.min.time(), tzinfo=timezone.utc
    )
    start_of_next_day = start_of_day + timedelta(days=1)
    print(
        f"[catalog.games] date={selected_date} "
        f"range={start_of_day.isoformat()} to {start_of_next_day.isoformat()}",
        flush=True,
    )
    q = q.filter(Game.starts_at >= start_of_day, Game.starts_at < start_of_next_day)
    if league_id:
        q = q.filter(Game.league_id == league_id)
    if live is True:
        q = q.filter(Game.is_live == 1)
    games = q.order_by(Game.starts_at.asc()).all()
    print(
        f"[catalog.games] matched={len(games)} "
        f"starts_at={[game.starts_at.isoformat() if game.starts_at else None for game in games]}",
        flush=True,
    )
    return [GameOut.model_validate(catalog_game_view(db, g)) for g in games]


@router.get("/games/{external_id}", response_model=GameOut)
def get_game(external_id: str, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.external_id == external_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Match not found")
    return GameOut.model_validate(catalog_game_view(db, game))


@router.post("/sync/sportybet", response_model=SportyBetSyncOut)
async def sync_sportybet(db: Session = Depends(get_db)):
    missing = missing_required_columns(db.get_bind())
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                "database schema is not migrated (missing "
                + ", ".join(missing)
                + "); run alembic upgrade head"
            ),
        )
    try:
        payload = await fetch_important_events()
    except SportyBetUpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    try:
        summary = sync_sportybet_payload(db, payload)
    except CatalogSchemaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    AuditService.log(
        db,
        actor_id=None,
        role="system",
        action="Sync SportyBet catalog",
        detail=(
            f"fetched={summary['fetched']} created={summary['created']} "
            f"updated={summary['updated']} skipped_existing={summary['skipped_existing']} "
            f"skipped_invalid={summary['skipped_invalid']} failed={summary['failed']}"
        ),
    )
    db.commit()
    return SportyBetSyncOut.model_validate(summary)


@router.post(
    "/sync/sportybet/live",
    response_model=SportyBetLiveSyncQueuedOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def enqueue_sportybet_live_sync(db: Session = Depends(get_db)):
    missing = missing_live_sync_infrastructure(db.get_bind())
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                "database schema is not migrated (missing "
                + ", ".join(missing)
                + "); run alembic upgrade head"
            ),
        )
    job, created = enqueue_live_sync_job(db, actor_id=None)
    AuditService.log(
        db,
        actor_id=None,
        role="system",
        action="Queue SportyBet live catalog sync",
        detail=f"job_id={job.id} created={created} status={job.status}",
    )
    db.commit()
    db.refresh(job)
    return SportyBetLiveSyncQueuedOut.model_validate(job_queued_payload(job))


@router.get("/sync/sportybet/live", response_model=SportyBetLiveSyncJobOut)
def get_current_sportybet_live_sync_job(db: Session = Depends(get_db)):
    missing = missing_live_sync_infrastructure(db.get_bind())
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                "database schema is not migrated (missing "
                + ", ".join(missing)
                + "); run alembic upgrade head"
            ),
        )
    job = find_current_live_sync_job(db)
    return SportyBetLiveSyncJobOut.model_validate(current_job_status_payload(job))


@router.get("/sync/sportybet/live/{job_id}", response_model=SportyBetLiveSyncJobOut)
def get_sportybet_live_sync_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(SportyBetSyncJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Sync job not found")
    return SportyBetLiveSyncJobOut.model_validate(job_status_payload(job))
