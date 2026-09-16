import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings, reset_settings_cache
from app.db.base import Base
from app.db.schema_status import reset_schema_status_cache

POSTGRES_POOL_SIZE = 3
POSTGRES_MAX_OVERFLOW = 2
POSTGRES_POOL_TIMEOUT = 5
POSTGRES_POOL_RECYCLE = 1800


def _int_env(name: str, default: int, *, minimum: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return max(int(raw), minimum)
    except ValueError:
        return default


def _build_engine():
    settings = get_settings()
    url = settings.sqlalchemy_database_url
    is_sqlite = url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    kwargs: dict = {}
    if not is_sqlite:
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = POSTGRES_POOL_RECYCLE
        kwargs["pool_timeout"] = _int_env(
            "DB_POOL_TIMEOUT", POSTGRES_POOL_TIMEOUT, minimum=1
        )
        kwargs["pool_size"] = _int_env("DB_POOL_SIZE", POSTGRES_POOL_SIZE, minimum=1)
        kwargs["max_overflow"] = _int_env(
            "DB_MAX_OVERFLOW", POSTGRES_MAX_OVERFLOW, minimum=0
        )
    return create_engine(url, connect_args=connect_args, **kwargs)


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create tables from metadata for development/tests only.

    Production schema must be created with ``alembic upgrade head``.
    """
    if get_settings().requires_postgres:
        return
    Base.metadata.create_all(bind=engine)


def reconfigure_engine() -> None:
    """Recreate engine/session after environment changes (tests)."""
    global engine, SessionLocal
    reset_settings_cache()
    reset_schema_status_cache()
    engine = _build_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
