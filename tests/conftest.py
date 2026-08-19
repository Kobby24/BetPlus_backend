import os

# Force isolated test configuration before any application imports.
os.environ["DATABASE_URL"] = "sqlite:///./backend_test.db"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["ENVIRONMENT"] = "test"

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings, reset_settings_cache
from app.db.base import Base
from app.db.session import engine, init_db, reconfigure_engine

reset_settings_cache()
reconfigure_engine()


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    db_path = os.path.join(os.getcwd(), "backend_test.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    reset_settings_cache()
    reconfigure_engine()
    init_db()
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.fixture(scope="module")
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
