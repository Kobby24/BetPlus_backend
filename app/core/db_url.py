"""Normalize database URLs for SQLAlchemy, Heroku, and Supabase."""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def normalize_database_url(url: str, *, environment: str = "development") -> str:
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

    if url.startswith("postgresql+") and environment == "production":
        url = _ensure_sslmode(url)

    return url


def _ensure_sslmode(url: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "sslmode" not in query:
        query["sslmode"] = "require"
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


def uses_pgbouncer(url: str) -> bool:
    lowered = url.lower()
    return "pooler.supabase.com" in lowered or ":6543" in lowered or "pgbouncer=true" in lowered
