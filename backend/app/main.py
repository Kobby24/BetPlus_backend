from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from app.api.health import router as health_router
from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.logging import init_logging
from app.db.session import init_db
from app.seed import seed_demo_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_logging()
    settings = get_settings()
    init_db()
    if settings.seed_demo_data:
        seed_demo_data()
    yield


app = FastAPI(title="BetPlus Backend", lifespan=lifespan)

settings = get_settings()
if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    from logging import getLogger

    logger = getLogger("app.middleware")
    logger.info("%s %s", request.method, request.url)
    response: Response = await call_next(request)
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
