from types import SimpleNamespace

from sqlalchemy.pool import QueuePool

from app.db import session as db_session


def test_supabase_engine_uses_bounded_pool(monkeypatch):
    settings = SimpleNamespace(
        sqlalchemy_database_url=(
            "postgresql+psycopg2://user:password@"
            "aws-0-eu-north-1.pooler.supabase.com:5432/postgres"
        )
    )
    monkeypatch.setattr(db_session, "get_settings", lambda: settings)

    engine = db_session._build_engine()
    try:
        assert isinstance(engine.pool, QueuePool)
        assert engine.pool.size() == db_session.POSTGRES_POOL_SIZE
        assert engine.pool._max_overflow == db_session.POSTGRES_MAX_OVERFLOW
        assert engine.pool._timeout == db_session.POSTGRES_POOL_TIMEOUT
        assert engine.pool._recycle == db_session.POSTGRES_POOL_RECYCLE
    finally:
        engine.dispose()
