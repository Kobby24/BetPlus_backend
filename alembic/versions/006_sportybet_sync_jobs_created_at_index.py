"""Keep the old 006 filename on the linear chain.

The first 006 revision id was longer than alembic_version.version_num
(varchar 32) and must not stay in the graph. This file replaces that
script in place so deploys that still include both 006 files have one head.
"""

from typing import Sequence, Union

revision: str = "006b_job_created_idx"
down_revision: Union[str, None] = "006_live_sync_job_idx"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    return


def downgrade() -> None:
    return
