"""Add durable SportyBet live-sync job queue."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_sportybet_sync_jobs"
down_revision: Union[str, None] = "004_sportybet_external_ids"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sportybet_sync_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sync_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("actor_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unchanged_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_invalid", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_protected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("live_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ended_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sportybet_sync_jobs_status",
        "sportybet_sync_jobs",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_sportybet_sync_jobs_sync_type",
        "sportybet_sync_jobs",
        ["sync_type"],
        unique=False,
    )
    op.create_index(
        "ix_sportybet_sync_jobs_sync_type_status",
        "sportybet_sync_jobs",
        ["sync_type", "status"],
        unique=False,
    )
    op.create_index(
        "uq_sportybet_sync_jobs_active",
        "sportybet_sync_jobs",
        ["sync_type"],
        unique=True,
        sqlite_where=sa.text("status IN ('queued', 'running')"),
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )


def downgrade() -> None:
    op.drop_index("uq_sportybet_sync_jobs_active", table_name="sportybet_sync_jobs")
    op.drop_index("ix_sportybet_sync_jobs_sync_type_status", table_name="sportybet_sync_jobs")
    op.drop_index("ix_sportybet_sync_jobs_sync_type", table_name="sportybet_sync_jobs")
    op.drop_index("ix_sportybet_sync_jobs_status", table_name="sportybet_sync_jobs")
    op.drop_table("sportybet_sync_jobs")
