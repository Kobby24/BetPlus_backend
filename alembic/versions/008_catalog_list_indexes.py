"""Indexes for catalog tab queries: live, upcoming window, league schedule."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_catalog_list_indexes"
down_revision: Union[str, None] = "007_webhook_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_games_is_live_starts_at",
        "games",
        ["is_live", "starts_at"],
        unique=False,
    )
    op.create_index(
        "ix_games_league_id_starts_at",
        "games",
        ["league_id", "starts_at"],
        unique=False,
    )
    op.create_index(
        "ix_games_status_starts_at",
        "games",
        ["status", "starts_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_games_status_starts_at", table_name="games")
    op.drop_index("ix_games_league_id_starts_at", table_name="games")
    op.drop_index("ix_games_is_live_starts_at", table_name="games")
