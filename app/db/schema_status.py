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


def missing_required_tables(bind) -> list[str]:
    existing = set(inspect(bind).get_table_names())
    return [name for name in REQUIRED_RUNTIME_TABLES if name not in existing]
