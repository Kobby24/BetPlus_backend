"""Alembic preflight for leftover unversioned tables."""

from app.db.alembic_preflight import leftover_unversioned_tables, schema_reset_requested


def test_leftover_tables_ignored_when_versioned():
    leftover = leftover_unversioned_tables(
        {"sports", "users", "alembic_version"}, versioned=True
    )
    assert leftover == []


def test_leftover_tables_detected_when_unversioned():
    leftover = leftover_unversioned_tables(
        {"sports", "users", "pg_stat_statements"}, versioned=False
    )
    assert leftover == ["sports", "users"]


def test_empty_database_has_no_leftover_tables():
    assert leftover_unversioned_tables(set(), versioned=False) == []


def test_schema_reset_requested(monkeypatch):
    monkeypatch.delenv("ALLOW_SCHEMA_RESET", raising=False)
    assert schema_reset_requested() is False
    monkeypatch.setenv("ALLOW_SCHEMA_RESET", "true")
    assert schema_reset_requested() is True
    monkeypatch.setenv("ALLOW_SCHEMA_RESET", "no")
    assert schema_reset_requested() is False