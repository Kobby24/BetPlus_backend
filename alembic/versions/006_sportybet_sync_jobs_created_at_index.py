"""Index live-sync jobs for current-job lookup without a URL job_id."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_sportybet_sync_jobs_created_at_index"
down_revision: Union[str, None] = "005_sportybet_sync_jobs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_sportybet_sync_jobs_sync_type_created_at",
        "sportybet_sync_jobs",
        ["sync_type", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_sportybet_sync_jobs_sync_type_created_at",
        table_name="sportybet_sync_jobs",
    )
