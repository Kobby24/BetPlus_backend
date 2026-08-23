import uuid

from sqlalchemy import Column, DateTime, Index, Integer, String, Text, text
from sqlalchemy.sql import func

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class SportyBetSyncJob(Base):
    """Durable live/prematch synchronization job. Status is the source of truth."""

    __tablename__ = "sportybet_sync_jobs"
    __table_args__ = (
        Index("ix_sportybet_sync_jobs_status", "status"),
        Index("ix_sportybet_sync_jobs_sync_type_status", "sync_type", "status"),
        Index(
            "ix_sportybet_sync_jobs_sync_type_created_at",
            "sync_type",
            "created_at",
        ),
        Index(
            "uq_sportybet_sync_jobs_active",
            "sync_type",
            unique=True,
            sqlite_where=text("status IN ('queued', 'running')"),
            postgresql_where=text("status IN ('queued', 'running')"),
        ),
    )

    id = Column(String(36), primary_key=True, default=new_uuid)
    sync_type = Column(String(32), nullable=False, default="live_or_prematch", index=True)
    status = Column(String(16), nullable=False, default="queued")
    actor_id = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    fetched = Column(Integer, nullable=False, default=0)
    processed = Column(Integer, nullable=False, default=0)
    created_count = Column(Integer, nullable=False, default=0)
    updated_count = Column(Integer, nullable=False, default=0)
    unchanged_count = Column(Integer, nullable=False, default=0)
    skipped_invalid = Column(Integer, nullable=False, default=0)
    skipped_protected = Column(Integer, nullable=False, default=0)
    failed = Column(Integer, nullable=False, default=0)
    live_updated = Column(Integer, nullable=False, default=0)
    ended_updated = Column(Integer, nullable=False, default=0)
    attempt_count = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
