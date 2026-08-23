"""Production settings and DATABASE_URL normalization used by FastAPI and Alembic."""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.core.db_url import normalize_database_url, uses_pgbouncer


def test_heroku_postgres_scheme_gets_psycopg2_driver():
    url = normalize_database_url(
        "postgres://user:pass@host:5432/db",
        environment="development",
    )
    assert url == "postgresql+psycopg2://user:pass@host:5432/db"


def test_postgresql_scheme_gets_psycopg2_driver():
    url = normalize_database_url(
        "postgresql://user:pass@host:5432/db",
        environment="development",
    )
    assert url == "postgresql+psycopg2://user:pass@host:5432/db"


def test_staging_adds_sslmode_require():
    url = normalize_database_url(
        "postgresql://user:pass@host:5432/db",
        environment="staging",
    )
    assert url.startswith("postgresql+psycopg2://")
    assert "sslmode=require" in url


def test_existing_psycopg2_url_is_preserved():
    raw = "postgresql+psycopg2://user:pass@host:5432/db"
    assert normalize_database_url(raw, environment="development") == raw


def test_production_adds_sslmode_require():
    url = normalize_database_url(
        "postgresql://user:pass@db.project.supabase.co:5432/postgres",
        environment="production",
    )
    assert url.startswith("postgresql+psycopg2://")
    assert "sslmode=require" in url


def test_production_preserves_explicit_sslmode():
    url = normalize_database_url(
        "postgresql://user:pass@host:5432/db?sslmode=verify-full",
        environment="production",
    )
    assert "sslmode=verify-full" in url
    assert "sslmode=require" not in url


def test_pgbouncer_detection_for_supabase_pooler():
    pooler = "postgresql+psycopg2://user:pass@aws-0-eu.pooler.supabase.com:6543/postgres"
    direct = "postgresql+psycopg2://user:pass@db.project.supabase.co:5432/postgres"
    assert uses_pgbouncer(pooler)
    assert uses_pgbouncer("postgresql+psycopg2://user:pass@host:6543/postgres")
    assert not uses_pgbouncer(direct)


def test_settings_sqlalchemy_url_matches_app_normalization(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgres://user:pass@aws-0-eu.pooler.supabase.com:6543/postgres",
    )
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "unit-test-production-secret-key")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com")
    monkeypatch.setenv("PAYMENTS_MODE", "disabled")
    settings = Settings()
    url = settings.sqlalchemy_database_url
    assert url.startswith("postgresql+psycopg2://")
    assert "sslmode=require" in url
    assert not url.startswith("sqlite")


def test_production_rejects_default_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "dev-insecure-key-set-SECRET_KEY-in-production")
    monkeypatch.setenv("JWT_SECRET", "")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com")
    monkeypatch.setenv("PAYMENTS_MODE", "disabled")
    settings = Settings()
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        settings.validate_for_runtime()


def test_production_rejects_sqlite(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "unit-test-production-secret-key")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./betplus.db")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com")
    monkeypatch.setenv("PAYMENTS_MODE", "disabled")
    settings = Settings()
    with pytest.raises(RuntimeError, match="SQLite"):
        settings.validate_for_runtime()


def test_production_rejects_wildcard_cors(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "unit-test-production-secret-key")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com,*")
    monkeypatch.setenv("PAYMENTS_MODE", "disabled")
    settings = Settings()
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        settings.validate_for_runtime()


def test_production_rejects_simulated_payments_without_override(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "unit-test-production-secret-key")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com")
    monkeypatch.setenv("PAYMENTS_MODE", "simulated")
    monkeypatch.setenv("ALLOW_SIMULATED_PAYMENTS", "false")
    settings = Settings()
    with pytest.raises(RuntimeError, match="PAYMENTS_MODE"):
        settings.validate_for_runtime()


def test_heroku_dyno_rejects_sqlite_default(monkeypatch):
    monkeypatch.setenv("DYNO", "release.1")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./betplus.db")
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("SECRET_KEY", "unit-test-production-secret-key")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com")
    settings = Settings()
    with pytest.raises(RuntimeError, match="SQLite is not allowed on Heroku"):
        settings.validate_for_runtime()


def test_heroku_dyno_adds_ssl_when_environment_is_development(monkeypatch):
    monkeypatch.setenv("DYNO", "web.1")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://user:pass@db.project.supabase.co:5432/postgres",
    )
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("SECRET_KEY", "unit-test-production-secret-key")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com")
    settings = Settings()
    url = settings.sqlalchemy_database_url
    assert url.startswith("postgresql+psycopg2://")
    assert "sslmode=require" in url
    settings.validate_for_runtime()


def test_heroku_dyno_prefers_process_database_url_over_settings_default(monkeypatch):
    monkeypatch.setenv("DYNO", "web.1")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgres://user:pass@aws-0-eu.pooler.supabase.com:6543/postgres",
    )
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "unit-test-production-secret-key")
    monkeypatch.setenv("CORS_ORIGINS", "https://example.com")
    monkeypatch.setenv("PAYMENTS_MODE", "disabled")
    settings = Settings()
    url = settings.sqlalchemy_database_url
    assert not url.startswith("sqlite")
    assert "pooler.supabase.com" in url
    assert "sslmode=require" in url


def test_heroku_does_not_seed_demo_users(monkeypatch):
    monkeypatch.setenv("DYNO", "web.1")
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    monkeypatch.setenv("SEED_DEMO_USERS", "true")
    monkeypatch.setenv("ALLOW_DEMO_SEED", "false")
    settings = Settings()
    assert settings.should_seed_demo is False
    assert settings.should_seed_demo_users is False


def test_local_development_still_allows_sqlite(monkeypatch):
    monkeypatch.delenv("DYNO", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./betplus.db")
    settings = Settings()
    assert settings.sqlalchemy_database_url.startswith("sqlite")
    settings.validate_for_runtime()


def test_settings_include_sportybet_defaults():
    settings = Settings()
    assert settings.sportybet_client_id == "web"
    assert settings.sportybet_oper_id == "3"
    assert settings.sportybet_facts_url.startswith("https://www.sportybet.com/")
    assert settings.sportybet_live_url.endswith("liveOrPrematchEvents")
    assert settings.sportybet_sport_id == "sr:sport:1"


def test_production_does_not_seed_demo_users(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "unit-test-production-secret-key")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    monkeypatch.setenv("SEED_DEMO_USERS", "true")
    monkeypatch.setenv("ALLOW_DEMO_SEED", "false")
    settings = Settings()
    assert settings.should_seed_demo is False
    assert settings.should_seed_demo_users is False