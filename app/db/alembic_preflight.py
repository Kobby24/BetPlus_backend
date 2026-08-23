"""Guard Alembic against leftover create_all() tables with no version history."""

from __future__ import annotations

import logging
import os

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import ProgrammingError

logger = logging.getLogger("alembic.preflight")

APP_TABLES = frozenset(
    {
        "sports",
        "users",
        "leagues",
        "games",
        "bets",
        "bet_selections",
        "transactions",
        "platform_ledger",
        "audit_logs",
        "referral_deposits",
        "payment_intents",
        "idempotency_keys",
        "rate_limit_hits",
        "sportybet_sync_jobs",
    }
)

_RESET_TRUTHY = {"1", "true", "yes", "on"}


def schema_reset_requested() -> bool:
    return os.environ.get("ALLOW_SCHEMA_RESET", "").strip().lower() in _RESET_TRUTHY


def leftover_unversioned_tables(table_names: set[str], *, versioned: bool) -> list[str]:
    if versioned:
        return []
    return sorted(table_names & APP_TABLES)


def _has_alembic_revision(connection: Connection, tables: set[str]) -> bool:
    if "alembic_version" not in tables:
        return False
    rows = connection.execute(text("SELECT version_num FROM alembic_version")).fetchall()
    return any(row[0] for row in rows)


def _reset_public_schema(connection: Connection) -> None:
    if connection.dialect.name != "postgresql":
        raise RuntimeError("ALLOW_SCHEMA_RESET is only supported on PostgreSQL")
    logger.warning("ALLOW_SCHEMA_RESET=true: dropping and recreating schema public")
    connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
    connection.execute(text("CREATE SCHEMA public"))
    connection.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
    connection.execute(text("GRANT ALL ON SCHEMA public TO public"))
    for role in ("postgres", "anon", "authenticated", "service_role"):
        try:
            with connection.begin_nested():
                connection.execute(text(f"GRANT USAGE ON SCHEMA public TO {role}"))
                connection.execute(text(f"GRANT ALL ON SCHEMA public TO {role}"))
        except ProgrammingError:
            logger.info("Skipped GRANT for role %s (not present)", role)
    connection.commit()


def prepare_database(connection: Connection) -> None:
    """Fail fast (or reset, if explicitly allowed) when 001 would hit DuplicateTable."""
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    leftover = leftover_unversioned_tables(
        tables, versioned=_has_alembic_revision(connection, tables)
    )
    if not leftover:
        return
    if schema_reset_requested():
        _reset_public_schema(connection)
        return
    names = ", ".join(leftover)
    raise RuntimeError(
        "Database already has tables ("
        + names
        + ") but no Alembic revision. This is leftover create_all()/dev schema, "
        "not a completed migration. Do not stamp 001_initial unless the live "
        "schema exactly matches that revision. For a first deploy with no data "
        "to keep: set ALLOW_SCHEMA_RESET=true, run `alembic upgrade head`, then "
        "immediately unset ALLOW_SCHEMA_RESET. Or run in Supabase SQL: "
        "DROP SCHEMA public CASCADE; CREATE SCHEMA public; "
        "GRANT ALL ON SCHEMA public TO CURRENT_USER, public;"
    )