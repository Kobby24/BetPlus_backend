from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from app.api.health import router as health_router
from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.logging import init_logging
from app.db.schema_status import missing_required_tables
from app.db.session import engine, init_db
from app.seed import seed_demo_data

logger = logging.getLogger("app.middleware")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_logging()
    settings = get_settings()
    settings.validate_for_runtime()
    init_db()
    missing = missing_required_tables(engine)
    if missing:
        logger.error(
            "Database schema is not migrated (missing %s). Run: alembic upgrade head",
            ", ".join(missing),
        )
    if settings.should_seed_demo:
        seed_demo_data()
    yield


app = FastAPI(title="BetPlus Backend", lifespan=lifespan)

settings = get_settings()
if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Webhook-Signature", "X-Paystack-Signature"],
    )


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    logger.info("%s %s", request.method, request.url.path)
    try:
        response: Response = await call_next(request)
    except Exception:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        raise
    if response.status_code >= 400:
        logger.warning(
            "%s %s -> %s", request.method, request.url.path, response.status_code
        )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "geolocation=()")
    return response


app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(v1_router, prefix="/api/v1")

# Legacy route aliases — delegate to v1 handlers during migration.
from app.api.v1 import auth as v1_auth
from app.api.v1 import bets as v1_bets
from app.api.v1 import wallet as v1_wallet
from app.api.v1 import catalog as v1_catalog
from app.api.v1 import admin as v1_admin

app.include_router(v1_auth.router, prefix="/api/auth", tags=["auth-legacy"])
app.include_router(v1_wallet.router, prefix="/api/wallet", tags=["wallet-legacy"])
app.include_router(v1_bets.router, prefix="/api/bets", tags=["bets-legacy"])
app.include_router(v1_catalog.router, prefix="/api/catalog", tags=["catalog-legacy"])
app.include_router(
    v1_admin.router,
    prefix="/api/admin",
    tags=["admin-legacy"],
)
