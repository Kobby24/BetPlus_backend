from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.db_url import normalize_database_url


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
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

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_test(self) -> bool:
        return self.environment == "test"

    @property
    def sqlalchemy_database_url(self) -> str:
        return normalize_database_url(self.database_url, environment=self.environment)

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
        if self.is_production and not self.allow_demo_seed:
            return False
        return self.seed_demo_data

    @property
    def should_seed_demo_users(self) -> bool:
        if not self.should_seed_demo:
            return False
        if self.is_production:
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
        if not self.is_production:
            return
        if self.secret_key.startswith("dev-insecure"):
            raise RuntimeError("SECRET_KEY must be set to a strong secret in production")
        if "*" in self.cors_origin_list:
            raise RuntimeError("CORS_ORIGINS must not include * in production")
        if self.sqlalchemy_database_url.startswith("sqlite"):
            raise RuntimeError("SQLite is not allowed in production; set DATABASE_URL")
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
