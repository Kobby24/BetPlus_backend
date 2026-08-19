from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.money import to_decimal
from app.models.platform_ledger import PlatformLedger
from app.models.user import User

# Types that move house cash. Matches the previous frontend platform-store rules.
CASH_TYPES = frozenset({"deposit", "withdraw", "admin_credit", "payout"})


class LedgerService:
    @staticmethod
    def record(
        db: Session,
        *,
        entry_type: str,
        amount: Decimal | float | int,
        description: str,
        user_id: str | None = None,
        bet_id: str | None = None,
    ) -> PlatformLedger:
        entry = PlatformLedger(
            entry_type=entry_type,
            amount=to_decimal(amount),
            description=description,
            user_id=user_id,
            bet_id=bet_id,
        )
        db.add(entry)
        return entry

    @staticmethod
    def platform_balance(db: Session) -> Decimal:
        total = Decimal("0.00")
        rows = (
            db.query(PlatformLedger)
            .filter(PlatformLedger.entry_type.in_(CASH_TYPES))
            .all()
        )
        for row in rows:
            total += to_decimal(row.amount)
        return total

    @staticmethod
    def user_liabilities(db: Session) -> Decimal:
        total = Decimal("0.00")
        for (balance,) in db.query(User.balance).all():
            total += to_decimal(balance)
        return total

    @staticmethod
    def list_entries(db: Session, limit: int = 200) -> list[PlatformLedger]:
        return (
            db.query(PlatformLedger)
            .order_by(PlatformLedger.created_at.desc())
            .limit(limit)
            .all()
        )
