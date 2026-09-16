"""Runtime checks that Alembic has created the application schema."""

from __future__ import annotations

import time

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

#: How long a *failing* schema check is trusted before it is retried, so a
#: completed migration recovers without a dyno restart.
GAP_CACHE_TTL_SECONDS = 30.0

__all__ = (
    "missing_required_tables",
    "missing_required_columns",
    "schema_gaps",
    "cached_schema_gaps",
    "reset_schema_status_cache",
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


def schema_gaps(bind) -> list[str]:
    """Missing tables and columns from one inspector, i.e. one connection."""
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    gaps = [name for name in REQUIRED_RUNTIME_TABLES if name not in tables]
    if "games" not in tables:
        gaps.extend(f"games.{name}" for name in REQUIRED_GAME_COLUMNS)
        return gaps
    columns = {col["name"] for col in inspector.get_columns("games")}
    gaps.extend(
        f"games.{name}" for name in REQUIRED_GAME_COLUMNS if name not in columns
    )
    return gaps


_verified = False
_cached_gaps: list[str] | None = None
_checked_at = 0.0


def cached_schema_gaps(bind, *, ttl: float = GAP_CACHE_TTL_SECONDS) -> list[str]:
    """``schema_gaps`` for hot request paths.

    Reflection checks out its own connection, so running it per request costs
    the pool an extra slot on top of the request's own session. A migrated
    schema never un-migrates itself at runtime, so a clean result is cached for
    the life of the process.
    """
    global _verified, _cached_gaps, _checked_at
    if _verified:
        return []
    now = time.monotonic()
    if _cached_gaps is not None and (now - _checked_at) < ttl:
        return list(_cached_gaps)
    gaps = schema_gaps(bind)
    _checked_at = now
    _cached_gaps = list(gaps)
    if not gaps:
        _verified = True
    return list(gaps)


def reset_schema_status_cache() -> None:
    global _verified, _cached_gaps, _checked_at
    _verified = False
    _cached_gaps = None
    _checked_at = 0.0
