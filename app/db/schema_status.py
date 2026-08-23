"""Runtime checks that Alembic has created the application schema."""

from __future__ import annotations

from sqlalchemy import inspect

REQUIRED_RUNTIME_TABLES = (
    "sports",
    "users",
    "leagues",
    "games",
    "bets",
)

REQUIRED_GAME_COLUMNS = (
    "external_event_id",
    "external_game_id",
)

__all__ = (
    "missing_required_tables",
    "missing_required_columns",
)


def missing_required_tables(bind) -> list[str]:
    existing = set(inspect(bind).get_table_names())
    return [name for name in REQUIRED_RUNTIME_TABLES if name not in existing]


def missing_required_columns(bind) -> list[str]:
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "games" not in tables:
        return ["games.external_event_id", "games.external_game_id"]
    existing = {col["name"] for col in inspector.get_columns("games")}
    return [
        f"games.{name}"
        for name in REQUIRED_GAME_COLUMNS
        if name not in existing
    ]
