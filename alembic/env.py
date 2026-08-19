from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
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
    Transaction,
    User,
)

config = context.config

# alembic.ini declares SQLAlchemy/Alembic loggers; keep app loggers intact.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def get_url() -> str:
    """Use the same normalized DATABASE_URL as the FastAPI application."""
    settings = get_settings()
    url = settings.sqlalchemy_database_url
    if settings.is_production and url.startswith("sqlite"):
        raise RuntimeError("SQLite is not allowed in production; set DATABASE_URL")
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
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()