"""Add SportyBet external identifiers and league uniqueness."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_sportybet_external_ids"
down_revision: Union[str, None] = "003_production_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("games", sa.Column("external_event_id", sa.String(length=64), nullable=True))
    op.add_column("games", sa.Column("external_game_id", sa.String(length=32), nullable=True))
    op.create_index("ix_games_external_event_id", "games", ["external_event_id"], unique=False)
    op.create_index("ix_games_external_game_id", "games", ["external_game_id"], unique=False)
    op.create_index(
        "uq_games_external_event_game",
        "games",
        ["external_event_id", "external_game_id"],
        unique=True,
    )

    # Skip if existing rows already share a sport/slug pair; uniqueness is
    # still enforced going forward by application get-or-create.
    bind = op.get_bind()
    duplicates = bind.execute(
        sa.text(
            "SELECT 1 FROM leagues GROUP BY sport_id, slug HAVING COUNT(*) > 1 LIMIT 1"
        )
    ).fetchone()
    if duplicates is None:
        op.create_index(
            "uq_leagues_sport_slug",
            "leagues",
            ["sport_id", "slug"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    league_indexes = {idx["name"] for idx in inspector.get_indexes("leagues")}
    if "uq_leagues_sport_slug" in league_indexes:
        op.drop_index("uq_leagues_sport_slug", table_name="leagues")
    op.drop_index("uq_games_external_event_game", table_name="games")
    op.drop_index("ix_games_external_game_id", table_name="games")
    op.drop_index("ix_games_external_event_id", table_name="games")
    op.drop_column("games", "external_game_id")
    op.drop_column("games", "external_event_id")
