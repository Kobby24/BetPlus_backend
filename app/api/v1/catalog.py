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
)
from app.services.audit_service import AuditService
from app.services.catalog_service import catalog_game_view
from app.services.sportybet_live_job import (
    IMPORTANT_SYNC_TYPE,
    LIVE_SYNC_TYPE,
    current_job_status_payload,
    enqueue_sync_job,
    find_current_sync_job,
    job_queued_payload,
    job_status_payload,
)

router = APIRouter()

_SPORTYBET_GAME_COLUMNS = ("external_event_id", "external_game_id")


def missing_required_columns(bind) -> list[str]:
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "games" not in tables:
        return [f"games.{name}" for name in _SPORTYBET_GAME_COLUMNS]
    existing = {col["name"] for col in inspector.get_columns("games")}
    return [f"games.{name}" for name in _SPORTYBET_GAME_COLUMNS if name not in existing]


_sync_infrastructure_verified = False


def missing_live_sync_infrastructure(bind) -> list[str]:
    """Schema gaps that block queueing a sync job.

    Reflection checks out its own pooled connection and the bot polls these
    endpoints continuously, so a clean result is cached. A failing result is
    never cached, so the endpoints recover as soon as migrations finish.
    """
    global _sync_infrastructure_verified
    if _sync_infrastructure_verified:
        return []
    missing = missing_required_columns(bind)
    if "sportybet_sync_jobs" not in set(inspect(bind).get_table_names()):
        missing.append("sportybet_sync_jobs")
    if not missing:
        _sync_infrastructure_verified = True
    return missing


def reset_sync_infrastructure_cache() -> None:
    global _sync_infrastructure_verified
    _sync_infrastructure_verified = False


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
    live: bool | None = None,
    date: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Game)
    if date is not None:
        start_of_day = datetime.combine(date, datetime.min.time(), tzinfo=timezone.utc)
        start_of_next_day = start_of_day + timedelta(days=1)
        q = q.filter(Game.starts_at >= start_of_day, Game.starts_at < start_of_next_day)
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


@router.post(
    "/sync/sportybet",
    response_model=SportyBetLiveSyncQueuedOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def enqueue_sportybet_sync(db: Session = Depends(get_db)):
    """Queue the important-events catalog sync for the worker dyno.

    Running the scrape in the request would hold a pooled connection for the
    duration of the upstream call and put the whole payload in the web dyno's
    memory budget.
    """
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
    job, created = enqueue_sync_job(db, actor_id=None, sync_type=IMPORTANT_SYNC_TYPE)
    AuditService.log(
        db,
        actor_id=None,
        role="system",
        action="Queue SportyBet catalog sync",
        detail=f"job_id={job.id} created={created} status={job.status}",
    )
    db.commit()
    db.refresh(job)
    return SportyBetLiveSyncQueuedOut.model_validate(job_queued_payload(job))


@router.get("/sync/sportybet", response_model=SportyBetLiveSyncJobOut)
def get_current_sportybet_sync_job(db: Session = Depends(get_db)):
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
    job = find_current_sync_job(db, IMPORTANT_SYNC_TYPE)
    return SportyBetLiveSyncJobOut.model_validate(
        current_job_status_payload(job, IMPORTANT_SYNC_TYPE)
    )


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
    job, created = enqueue_sync_job(db, actor_id=None, sync_type=LIVE_SYNC_TYPE)
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
    job = find_current_sync_job(db, LIVE_SYNC_TYPE)
    return SportyBetLiveSyncJobOut.model_validate(
        current_job_status_payload(job, LIVE_SYNC_TYPE)
    )


@router.get("/sync/sportybet/jobs/{job_id}", response_model=SportyBetLiveSyncJobOut)
def get_sportybet_sync_job(job_id: str, db: Session = Depends(get_db)):
    """Status of any sync job, live or important-events."""
    job = db.get(SportyBetSyncJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Sync job not found")
    return SportyBetLiveSyncJobOut.model_validate(job_status_payload(job))


@router.get("/sync/sportybet/live/{job_id}", response_model=SportyBetLiveSyncJobOut)
def get_sportybet_live_sync_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(SportyBetSyncJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Sync job not found")
    return SportyBetLiveSyncJobOut.model_validate(job_status_payload(job))
