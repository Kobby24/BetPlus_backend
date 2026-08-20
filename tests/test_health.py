from sqlalchemy import create_engine

from app.db.schema_status import missing_required_tables


def test_empty_engine_reports_missing_games():
    engine = create_engine("sqlite://")
    missing = missing_required_tables(engine)
    assert "games" in missing
    assert "users" in missing
    engine.dispose()


def test_health_ok_and_ready_ok(client):
    assert client.get("/health/").status_code == 200
    ready = client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok"}
