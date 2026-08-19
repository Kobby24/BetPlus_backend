"""Import all models so SQLAlchemy metadata and Alembic see every table."""

from app.models.audit import AuditLog
from app.models.bet import Bet, BetSelection
from app.models.game import Game
from app.models.league import League
from app.models.payment import IdempotencyKey, PaymentIntent, RateLimitHit
from app.models.platform_ledger import PlatformLedger
from app.models.referral import ReferralDeposit
from app.models.sport import Sport
from app.models.transaction import Transaction
from app.models.user import User

__all__ = [
    "AuditLog",
    "Bet",
    "BetSelection",
    "Game",
    "IdempotencyKey",
    "League",
    "PaymentIntent",
    "PlatformLedger",
    "RateLimitHit",
    "ReferralDeposit",
    "Sport",
    "Transaction",
    "User",
]
