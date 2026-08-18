from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings, reset_settings_cache
from app.db.base import Base


def _build_engine():
    settings = get_settings()
    is_sqlite = settings.database_url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    kwargs: dict = {}
    if not is_sqlite:
        kwargs["pool_pre_ping"] = True
    return create_engine(
        settings.database_url, connect_args=connect_args, **kwargs
    )


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create tables from metadata. Prefer Alembic migrations in production."""
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
