"""Normalize database URLs for SQLAlchemy, Heroku, and Supabase."""

from __future__ import annotations

import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def running_on_heroku() -> bool:
    """Heroku sets ``DYNO`` for web, worker, and release processes."""
    return bool(os.environ.get("DYNO"))


def hosted_postgres_required(*, environment: str) -> bool:
    return environment in {"production", "staging"} or running_on_heroku()


def looks_like_supabase(url: str) -> bool:
    lowered = url.lower()
    return "supabase.co" in lowered or "pooler.supabase.com" in lowered


def normalize_database_url(
    url: str,
    *,
    environment: str = "development",
    require_ssl: bool | None = None,
) -> str:
    """Return a SQLAlchemy-compatible PostgreSQL/SQLite URL.

    Handles:
    - Heroku ``postgres://`` scheme
    - missing SQLAlchemy driver
    - Supabase / production SSL
    """
    url = (url or "").strip()
    if not url:
        raise ValueError("DATABASE_URL is empty")

    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = "postgresql+psycopg2://" + url[len("postgresql://") :]

    if require_ssl is None:
        require_ssl = hosted_postgres_required(
            environment=environment
        ) or looks_like_supabase(url)
    if url.startswith("postgresql+") and require_ssl:
        url = _ensure_sslmode(url)

    return url


def reject_sqlite_if_hosted(url: str, *, environment: str) -> None:
    if hosted_postgres_required(environment=environment) and url.startswith("sqlite"):
        raise RuntimeError(
            "SQLite is not allowed on Heroku/production. "
            "Set DATABASE_URL to the Supabase PostgreSQL URI "
            "(heroku config:set DATABASE_URL=postgresql://...)."
        )


def _ensure_sslmode(url: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "sslmode" not in query:
        query["sslmode"] = "require"
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


def uses_pgbouncer(url: str) -> bool:
    """Return True only for actual PgBouncer/transaction-pool endpoints.

    Supabase session-mode pooler URLs on port 5432 are still limited to a small
    fixed number of sessions and should not be treated as a no-pool connection
    strategy. We keep a conservative SQLAlchemy QueuePool there instead of
    disabling pooling entirely.
    """
    lowered = url.lower()
    if "pgbouncer=true" in lowered:
        return True
    if ":6543" in lowered:
        return True
    return False
