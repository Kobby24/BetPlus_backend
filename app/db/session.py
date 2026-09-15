from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings, reset_settings_cache
from app.db.base import Base

POSTGRES_POOL_SIZE = 3
POSTGRES_MAX_OVERFLOW = 2
POSTGRES_POOL_TIMEOUT = 30
POSTGRES_POOL_RECYCLE = 1800


def _build_engine():
    settings = get_settings()
    url = settings.sqlalchemy_database_url
    is_sqlite = url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    kwargs: dict = {}
    if not is_sqlite:
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = POSTGRES_POOL_RECYCLE
        kwargs["pool_timeout"] = POSTGRES_POOL_TIMEOUT
        kwargs["pool_size"] = POSTGRES_POOL_SIZE
        kwargs["max_overflow"] = POSTGRES_MAX_OVERFLOW
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
    engine = _build_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
