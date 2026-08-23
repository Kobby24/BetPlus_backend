import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.core.db_url import normalize_database_url, reject_sqlite_if_hosted
from app.db.alembic_preflight import prepare_database
from app.db.base import Base
from app.models import (  # noqa: F401
    AuditLog,
    Bet,
    BetSelection,
    Game,
    IdempotencyKey,
    League,
    PaymentIntent,
    PlatformLedger,
    RateLimitHit,
    ReferralDeposit,
    Sport,
    SportyBetSyncJob,
    Transaction,
    User,
)

config = context.config

# alembic.ini declares SQLAlchemy/Alembic loggers; keep app loggers intact.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def get_url() -> str:
    """Use the same DATABASE_URL as FastAPI; never fall back to SQLite on Heroku."""
    settings = get_settings()
    raw = (os.environ.get("DATABASE_URL") or "").strip() or settings.database_url
    url = normalize_database_url(
        raw,
        environment=settings.environment,
        require_ssl=settings.requires_postgres,
    )
    reject_sqlite_if_hosted(url, environment=settings.environment)
    return url


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        prepare_database(connection)
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()
        # SQLAlchemy 2 autobegins a transaction on connect(). SQLite reports
        # transactional_ddl=False, so Alembic does not commit that transaction
        # itself — without this, upgrade logs success then rolls back 002+.
        if connection.in_transaction():
            connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()