from fastapi import APIRouter

from app.api.v1 import admin, auth, bets, catalog, manager, wallet

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(wallet.router, prefix="/wallet", tags=["wallet"])
router.include_router(bets.router, prefix="/bets", tags=["bets"])
router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])
router.include_router(manager.router, prefix="/manager", tags=["manager"])
