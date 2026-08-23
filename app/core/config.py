from functools import lru_cache
import os

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.db_url import (
    hosted_postgres_required,
    normalize_database_url,
    reject_sqlite_if_hosted,
    running_on_heroku,
)


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    database_url: str = Field(
        default="sqlite:///./betplus.db",
        validation_alias="DATABASE_URL",
    )
    secret_key: str = Field(
        default="dev-insecure-key-set-SECRET_KEY-in-production",
        validation_alias="SECRET_KEY",
    )
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(
        default=60 * 24,
        validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES",
    )
    cors_origins: str = Field(
        default="http://localhost:3000",
        validation_alias="CORS_ORIGINS",
    )
    seed_demo_data: bool = Field(default=True, validation_alias="SEED_DEMO_DATA")
    seed_demo_users: bool = Field(default=True, validation_alias="SEED_DEMO_USERS")
    allow_demo_seed: bool = Field(default=False, validation_alias="ALLOW_DEMO_SEED")
    environment: str = Field(default="development", validation_alias="ENVIRONMENT")
    port: int = Field(default=8000, validation_alias="PORT")

    rate_limit_enabled: bool = Field(default=True, validation_alias="RATE_LIMIT_ENABLED")
    payments_mode: str = Field(default="simulated", validation_alias="PAYMENTS_MODE")
    allow_simulated_payments: bool = Field(
        default=False, validation_alias="ALLOW_SIMULATED_PAYMENTS"
    )
    payment_secret_key: str = Field(default="", validation_alias="PAYMENT_SECRET_KEY")
    payment_public_key: str = Field(default="", validation_alias="PAYMENT_PUBLIC_KEY")
    payment_webhook_secret: str = Field(
        default="", validation_alias="PAYMENT_WEBHOOK_SECRET"
    )
    payment_currency: str = Field(default="GHS", validation_alias="PAYMENT_CURRENCY")

    sportybet_facts_url: str = Field(
        default="https://www.sportybet.com/api/gh/factsCenter/importantEvents",
        validation_alias="SPORTYBET_FACTS_URL",
    )
    sportybet_live_url: str = Field(
        default="https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents",
        validation_alias="SPORTYBET_LIVE_URL",
    )
    sportybet_live_sport_id: str = Field(
        default="sr:sport:1",
        validation_alias="SPORTYBET_LIVE_SPORT_ID",
    )
    sportybet_live_timeout_seconds: float = Field(
        default=15.0,
        validation_alias="SPORTYBET_LIVE_TIMEOUT_SECONDS",
    )
    sportybet_live_retry_attempts: int = Field(
        default=2,
        validation_alias="SPORTYBET_LIVE_RETRY_ATTEMPTS",
    )
    sportybet_live_sync_stale_seconds: float = Field(
        default=600.0,
        validation_alias="SPORTYBET_LIVE_SYNC_STALE_SECONDS",
    )
    sportybet_live_sync_poll_seconds: float = Field(
        default=2.0,
        validation_alias="SPORTYBET_LIVE_SYNC_POLL_SECONDS",
    )
    sportybet_live_sync_max_attempts: int = Field(
        default=3,
        validation_alias="SPORTYBET_LIVE_SYNC_MAX_ATTEMPTS",
    )
    sportybet_sport_id: str = Field(
        default="sr:sport:1",
        validation_alias="SPORTYBET_SPORT_ID",
    )
    sportybet_timeout_seconds: float = Field(
        default=15.0,
        validation_alias="SPORTYBET_TIMEOUT_SECONDS",
    )
    sportybet_retry_attempts: int = Field(
        default=2,
        validation_alias="SPORTYBET_RETRY_ATTEMPTS",
    )
    sportybet_client_id: str = Field(
        default="web",
        validation_alias="SPORTYBET_CLIENT_ID",
    )
    sportybet_oper_id: str = Field(
        default="3",
        validation_alias="SPORTYBET_OPER_ID",
    )
    sportybet_referer: str = Field(
        default="https://www.sportybet.com/gh/",
        validation_alias="SPORTYBET_REFERER",
    )
    sportybet_user_agent: str = Field(
        default=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/128.0.0.0 Safari/537.36"
        ),
        validation_alias="SPORTYBET_USER_AGENT",
    )

    @field_validator("environment")
    @classmethod
    def normalize_environment(cls, value: str) -> str:
        return (value or "development").strip().lower()

    @field_validator("payments_mode")
    @classmethod
    def normalize_payments_mode(cls, value: str) -> str:
        mode = (value or "simulated").strip().lower()
        if mode not in {"simulated", "paystack", "disabled"}:
            raise ValueError("PAYMENTS_MODE must be simulated, paystack, or disabled")
        return mode

    @field_validator("sportybet_timeout_seconds", "sportybet_live_timeout_seconds")
    @classmethod
    def clamp_sportybet_timeout(cls, value: float) -> float:
        return min(max(float(value), 1.0), 60.0)

    @field_validator("sportybet_retry_attempts", "sportybet_live_retry_attempts")
    @classmethod
    def clamp_sportybet_retries(cls, value: int) -> int:
        return min(max(int(value), 1), 3)

    @field_validator("sportybet_live_sync_stale_seconds")
    @classmethod
    def clamp_live_sync_stale(cls, value: float) -> float:
        return min(max(float(value), 30.0), 3600.0)

    @field_validator("sportybet_live_sync_poll_seconds")
    @classmethod
    def clamp_live_sync_poll(cls, value: float) -> float:
        return min(max(float(value), 0.25), 30.0)

    @field_validator("sportybet_live_sync_max_attempts")
    @classmethod
    def clamp_live_sync_attempts(cls, value: int) -> int:
        return min(max(int(value), 1), 5)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_test(self) -> bool:
        return self.environment == "test"

    @property
    def requires_postgres(self) -> bool:
        return hosted_postgres_required(environment=self.environment)

    @property
    def sqlalchemy_database_url(self) -> str:
        raw = (os.environ.get("DATABASE_URL") or "").strip() or self.database_url
        return normalize_database_url(
            raw,
            environment=self.environment,
            require_ssl=self.requires_postgres,
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def should_seed_demo(self) -> bool:
        if self.is_test:
            return False
        if self.requires_postgres and not self.allow_demo_seed:
            return False
        return self.seed_demo_data

    @property
    def should_seed_demo_users(self) -> bool:
        if not self.should_seed_demo:
            return False
        if self.requires_postgres:
            return False
        return self.seed_demo_users

    @property
    def allow_direct_wallet_funding(self) -> bool:
        if self.payments_mode == "simulated":
            return True
        if self.is_test:
            return True
        return False

    @property
    def effective_rate_limit_enabled(self) -> bool:
        if self.is_test:
            return False
        return self.rate_limit_enabled

    def validate_for_runtime(self) -> None:
        reject_sqlite_if_hosted(
            self.sqlalchemy_database_url, environment=self.environment
        )
        if not self.is_production and not running_on_heroku():
            return
        if self.secret_key.startswith("dev-insecure"):
            raise RuntimeError("SECRET_KEY must be set to a strong secret in production")
        if "*" in self.cors_origin_list:
            raise RuntimeError("CORS_ORIGINS must not include * in production")
        if not self.is_production:
            return
        if self.payments_mode == "simulated" and not self.allow_simulated_payments:
            raise RuntimeError(
                "PAYMENTS_MODE=simulated is not allowed in production unless "
                "ALLOW_SIMULATED_PAYMENTS=true (staging/demo only; not real-money)"
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()