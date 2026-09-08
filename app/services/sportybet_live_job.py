"""PostgreSQL-backed queue for SportyBet live/prematch synchronization.

The web dyno only enqueues. A Heroku worker claims and executes jobs.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from sqlalchemy.exc import IntegrityError, ProgrammingError, TimeoutError as SQLAlchemyTimeoutError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal, engine
from app.models.sportybet_sync_job import SportyBetSyncJob, new_uuid
from app.services.sportybet_live_client import (
    SportyBetLiveUpstreamError,
    fetch_live_or_prematch_events,
)
from app.services.sportybet_live_sync import (
    LiveCatalogSchemaError,
    sync_sportybet_live_games,
)

logger = logging.getLogger("app.services.sportybet_live_job")

LIVE_SYNC_TYPE = "live_or_prematch"
ACTIVE_STATUSES = ("queued", "running")
SAFE_ERROR_MAX = 180

FetchFn = Callable[..., Any]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_error(message: str) -> str:
    compact = " ".join(str(message or "live sync failed").split())
    return compact[:SAFE_ERROR_MAX]


def _pool_status() -> str:
    try:
        return engine.pool.status()
    except Exception:
        return "unavailable"


def _log_pool_status(message: str, *, job_id: str | None = None) -> None:
    logger.info(
        "%s worker=%s pid=%s job_id=%s pool=%s",
        message,
        os.environ.get("DYNO", "local"),
        os.getpid(),
        job_id or "-",
        _pool_status(),
    )


def find_active_live_sync_job(db: Session) -> SportyBetSyncJob | None:
    return (
        db.query(SportyBetSyncJob)
        .filter(
            SportyBetSyncJob.sync_type == LIVE_SYNC_TYPE,
            SportyBetSyncJob.status.in_(ACTIVE_STATUSES),
        )
        .order_by(SportyBetSyncJob.created_at.asc())
        .first()
    )


def find_latest_live_sync_job(db: Session) -> SportyBetSyncJob | None:
    return (
        db.query(SportyBetSyncJob)
        .filter(SportyBetSyncJob.sync_type == LIVE_SYNC_TYPE)
        .order_by(
            SportyBetSyncJob.created_at.desc(),
            SportyBetSyncJob.id.desc(),
        )
        .first()
    )


def find_current_live_sync_job(db: Session) -> SportyBetSyncJob | None:
    """Job stored for the bot: the active one, otherwise the latest row."""
    return find_active_live_sync_job(db) or find_latest_live_sync_job(db)


def enqueue_live_sync_job(
    db: Session, *, actor_id: str | None = None
) -> tuple[SportyBetSyncJob, bool]:
    """Create a queued job, or return the existing queued/running one.

    Returns (job, created).
    """
    existing = find_active_live_sync_job(db)
    if existing:
        return existing, False
    job = SportyBetSyncJob(
        id=new_uuid(),
        sync_type=LIVE_SYNC_TYPE,
        status="queued",
        actor_id=actor_id,
    )
    try:
        with db.begin_nested():
            db.add(job)
            db.flush()
        return job, True
    except IntegrityError:
        existing = find_active_live_sync_job(db)
        if existing:
            return existing, False
        raise


def job_queued_payload(job: SportyBetSyncJob) -> dict[str, Any]:
    return {
        "success": True,
        "status": job.status,
        "job_id": job.id,
    }


def job_status_payload(job: SportyBetSyncJob) -> dict[str, Any]:
    skipped = int(job.skipped_invalid or 0) + int(job.skipped_protected or 0)
    return {
        "job_id": job.id,
        "status": job.status,
        "sync_type": job.sync_type,
        "fetched": job.fetched,
        "processed": job.processed,
        "created": job.created_count,
        "updated": job.updated_count,
        "unchanged": job.unchanged_count,
        "skipped": skipped,
        "skipped_invalid": job.skipped_invalid,
        "skipped_protected": job.skipped_protected,
        "failed": job.failed,
        "live_updated": job.live_updated,
        "ended_updated": job.ended_updated,
        "attempt_count": job.attempt_count,
        "error_message": job.error_message,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
    }


def idle_job_payload() -> dict[str, Any]:
    return {
        "job_id": None,
        "status": "idle",
        "sync_type": LIVE_SYNC_TYPE,
        "fetched": 0,
        "processed": 0,
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "skipped": 0,
        "skipped_invalid": 0,
        "skipped_protected": 0,
        "failed": 0,
        "live_updated": 0,
        "ended_updated": 0,
        "attempt_count": 0,
        "error_message": None,
        "created_at": None,
        "started_at": None,
        "completed_at": None,
    }


def current_job_status_payload(job: SportyBetSyncJob | None) -> dict[str, Any]:
    if job is None:
        return idle_job_payload()
    return job_status_payload(job)


def apply_summary_to_job(job: SportyBetSyncJob, summary: dict[str, Any]) -> None:
    job.fetched = int(summary.get("fetched") or 0)
    job.created_count = int(summary.get("created") or 0)
    job.updated_count = int(summary.get("updated") or 0)
    job.unchanged_count = int(summary.get("unchanged") or 0)
    job.skipped_invalid = int(summary.get("skipped_invalid") or 0)
    job.skipped_protected = int(summary.get("skipped_protected") or 0)
    job.failed = int(summary.get("failed") or 0)
    job.live_updated = int(summary.get("live_updated") or 0)
    job.ended_updated = int(summary.get("ended_updated") or 0)
    job.processed = (
        job.created_count
        + job.updated_count
        + job.unchanged_count
        + job.skipped_invalid
        + job.skipped_protected
        + job.failed
    )


def recover_stale_live_sync_jobs(
    db: Session,
    *,
    now: datetime | None = None,
    stale_seconds: float | None = None,
    max_attempts: int | None = None,
) -> int:
    settings = get_settings()
    stale_seconds = float(
        stale_seconds
        if stale_seconds is not None
        else getattr(settings, "sportybet_live_sync_stale_seconds", 600)
    )
    max_attempts = int(
        max_attempts
        if max_attempts is not None
        else getattr(settings, "sportybet_live_sync_max_attempts", 3)
    )
    moment = now or _now()
    cutoff = moment - timedelta(seconds=max(stale_seconds, 1.0))
    stale = (
        db.query(SportyBetSyncJob)
        .filter(
            SportyBetSyncJob.status == "running",
            SportyBetSyncJob.started_at.isnot(None),
            SportyBetSyncJob.started_at < cutoff,
        )
        .all()
    )
    for job in stale:
        if int(job.attempt_count or 0) >= max_attempts:
            job.status = "failed"
            job.completed_at = moment
            job.error_message = _safe_error(
                "worker crashed; job marked failed after max attempts"
            )
            logger.warning("Stale live-sync job %s marked failed", job.id)
        else:
            job.status = "queued"
            job.started_at = None
            job.error_message = _safe_error("requeued after stale running state")
            logger.warning("Stale live-sync job %s requeued", job.id)
        db.add(job)
    if stale:
        db.commit()
    return len(stale)


def claim_next_live_sync_job(
    db: Session, *, job_id: str | None = None
) -> SportyBetSyncJob | None:
    q = (
        db.query(SportyBetSyncJob)
        .filter(
            SportyBetSyncJob.sync_type == LIVE_SYNC_TYPE,
            SportyBetSyncJob.status == "queued",
        )
        .order_by(SportyBetSyncJob.created_at.asc())
    )
    if job_id is not None:
        q = q.filter(SportyBetSyncJob.id == job_id)
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        q = q.with_for_update(skip_locked=True)
    job = q.first()
    if job is None:
        return None
    changed = (
        db.query(SportyBetSyncJob)
        .filter(
            SportyBetSyncJob.id == job.id,
            SportyBetSyncJob.status == "queued",
        )
        .update(
            {
                "status": "running",
                "started_at": _now(),
                "attempt_count": SportyBetSyncJob.attempt_count + 1,
                "error_message": None,
            },
            synchronize_session="fetch",
        )
    )
    if not changed:
        db.rollback()
        return None
    db.commit()
    db.refresh(job)
    return job


def _await_fetch(fetch: FetchFn) -> dict[str, Any]:
    result = fetch()
    if asyncio.iscoroutine(result):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(result)
        raise RuntimeError("live sync worker must run outside an event loop")
    return result


def _load_job_snapshot(job_id: str) -> SportyBetSyncJob | None:
    with SessionLocal() as db:
        job = db.get(SportyBetSyncJob, job_id)
        if job is None:
            return None
        db.expunge(job)
        return job


def _fail_job(job_id: str, message: str) -> SportyBetSyncJob | None:
    with SessionLocal() as db:
        try:
            job = db.get(SportyBetSyncJob, job_id)
            if job is None:
                return None
            job.status = "failed"
            job.completed_at = _now()
            job.error_message = _safe_error(message)
            db.add(job)
            db.commit()
            db.refresh(job)
            db.expunge(job)
            return job
        except Exception:
            db.rollback()
            raise
        finally:
            _log_pool_status("Live-sync failure status persisted", job_id=job_id)


def _fail_job_in_session(
    db: Session, job: SportyBetSyncJob, message: str
) -> SportyBetSyncJob:
    job.status = "failed"
    job.completed_at = _now()
    job.error_message = _safe_error(message)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def execute_live_sync_job(
    job_id: str,
    *,
    fetch: FetchFn | None = None,
    claimed: bool = False,
) -> SportyBetSyncJob:
    """Run a job without holding a database connection during upstream HTTP work."""
    fetch_fn = fetch or fetch_live_or_prematch_events
    if not claimed:
        with SessionLocal() as claim_db:
            job = claim_next_live_sync_job(claim_db, job_id=job_id)
            if job is None:
                snapshot = _load_job_snapshot(job_id)
                if snapshot is None:
                    raise LookupError(f"live sync job {job_id} not found")
                return snapshot
            claim_db.expunge(job)
        claimed = True

    _log_pool_status("Live-sync job claimed; starting upstream fetch", job_id=job_id)
    try:
        payload = _await_fetch(fetch_fn)
        _log_pool_status("Upstream fetch completed; opening persistence session", job_id=job_id)
    except SportyBetLiveUpstreamError as exc:
        logger.warning("Live-sync job %s upstream failure: %s", job_id, exc.message)
        return _fail_job(job_id, exc.message)  # type: ignore[return-value]
    except Exception as exc:
        logger.exception("Live-sync job %s fetch failed", job_id)
        return _fail_job(job_id, str(exc))  # type: ignore[return-value]

    with SessionLocal() as db:
        try:
            job = db.get(SportyBetSyncJob, job_id)
            if job is None:
                raise LookupError(f"live sync job {job_id} not found")
            if job.status != "running":
                db.expunge(job)
                return job

            def on_progress(summary: dict[str, Any]) -> None:
                apply_summary_to_job(job, summary)
                db.add(job)

            summary = sync_sportybet_live_games(
                db, payload, on_progress=on_progress
            )
            apply_summary_to_job(job, summary)
            job.status = "completed"
            job.completed_at = _now()
            job.error_message = None
            db.add(job)
            db.commit()
            db.refresh(job)
            logger.info(
                "Live-sync job %s completed fetched=%s created=%s updated=%s",
                job.id,
                job.fetched,
                job.created_count,
                job.updated_count,
            )
            _log_pool_status("Live-sync persistence committed", job_id=job_id)
            return job
        except SportyBetLiveUpstreamError as exc:
            logger.warning("Live-sync job %s upstream failure during persistence: %s", job_id, exc.message)
            db.rollback()
            return _fail_job_in_session(db, job, exc.message)
        except LiveCatalogSchemaError as exc:
            logger.exception("Live-sync job %s schema error", job_id)
            db.rollback()
            return _fail_job_in_session(db, job, str(exc))
        except (ProgrammingError, SQLAlchemyTimeoutError) as exc:
            db.rollback()
            orig = str(getattr(exc, "orig", exc)).split("\n", 1)[0]
            logger.exception("Live-sync job %s database error pool=%s", job_id, _pool_status())
            return _fail_job_in_session(db, job, orig or "database error")
        except Exception as exc:
            db.rollback()
            logger.exception("Live-sync job %s failed", job_id)
            return _fail_job_in_session(db, job, str(exc))
        finally:
            _log_pool_status("Live-sync persistence session closing", job_id=job_id)


def process_one_live_sync_job(*, fetch: FetchFn | None = None) -> str | None:
    with SessionLocal() as db:
        recover_stale_live_sync_jobs(db)
        job = claim_next_live_sync_job(db)
        job_id = job.id if job else None
    if not job_id:
        return None
    execute_live_sync_job(job_id, fetch=fetch, claimed=True)
    return job_id
