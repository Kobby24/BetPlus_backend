from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.money import to_decimal
from app.models.transaction import Transaction
from app.models.user import User
from app.services.ledger_service import LedgerService
from app.services.referral_service import ReferralService


class InsufficientBalanceError(Exception):
    pass


class WalletService:
    @staticmethod
    def _lock_user(db: Session, user_id: str) -> User:
        user = (
            db.query(User)
            .filter(User.id == user_id)
            .with_for_update()
            .first()
        )
        if not user:
            raise ValueError("User not found")
        return user

    @staticmethod
    def get_balance(db: Session, user_id: str) -> Decimal:
        user = db.get(User, user_id)
        if not user:
            raise ValueError("User not found")
        return to_decimal(user.balance)

    @staticmethod
    def deposit(
        db: Session,
        user_id: str,
        amount: float,
        description: str | None = None,
        *,
        bet_id: str | None = None,
        tx_type: str = "deposit",
        ledger_type: str = "deposit",
        track_referral: bool = True,
        commit: bool = True,
    ) -> Transaction:
        dec_amount = to_decimal(amount)
        if dec_amount <= 0:
            raise ValueError("Amount must be positive")

        user = WalletService._lock_user(db, user_id)
        user.balance = to_decimal(user.balance) + dec_amount
        tx = Transaction(
            user_id=user_id,
            bet_id=bet_id,
            type=tx_type,
            amount=dec_amount,
            description=description,
        )
        db.add(tx)
        db.add(user)
        db.flush()

        LedgerService.record(
            db,
            entry_type=ledger_type,
            amount=dec_amount,
            description=description or f"{ledger_type} {dec_amount}",
            user_id=user_id,
            bet_id=bet_id,
        )
        if track_referral and tx_type == "deposit":
            ReferralService.track_deposit(
                db,
                referred_user_id=user_id,
                amount=dec_amount,
                transaction_id=tx.id,
            )

        if commit:
            db.commit()
            db.refresh(tx)
        return tx

    @staticmethod
    def withdraw(
        db: Session,
        user_id: str,
        amount: float,
        description: str | None = None,
        *,
        bet_id: str | None = None,
        tx_type: str = "withdraw",
        commit: bool = True,
    ) -> Transaction:
        dec_amount = to_decimal(amount)
        if dec_amount <= 0:
            raise ValueError("Amount must be positive")

        user = WalletService._lock_user(db, user_id)
        balance = to_decimal(user.balance)
        if balance < dec_amount:
            raise InsufficientBalanceError("Insufficient balance")

        user.balance = balance - dec_amount
        tx = Transaction(
            user_id=user_id,
            bet_id=bet_id,
            type=tx_type,
            amount=-dec_amount,
            description=description,
        )
        db.add(tx)
        db.add(user)
        db.flush()

        LedgerService.record(
            db,
            entry_type="withdraw",
            amount=-dec_amount,
            description=description or f"withdraw {dec_amount}",
            user_id=user_id,
            bet_id=bet_id,
        )

        if commit:
            db.commit()
            db.refresh(tx)
        return tx

    @staticmethod
    def set_balance(
        db: Session,
        user_id: str,
        new_balance: float,
        description: str = "Admin balance adjustment",
    ) -> Transaction | None:
        target = to_decimal(new_balance)
        if target < 0:
            raise ValueError("Balance cannot be negative")

        user = WalletService._lock_user(db, user_id)
        current = to_decimal(user.balance)
        delta = target - current
        if delta == 0:
            return None
        if delta > 0:
            return WalletService.deposit(
                db,
                user_id,
                float(delta),
                description,
                ledger_type="admin_credit",
                track_referral=False,
            )
        return WalletService.withdraw(
            db, user_id, float(-delta), description
        )

    @staticmethod
    def debit_for_bet(
        db: Session,
        user_id: str,
        amount: Decimal,
        bet_id: str,
        description: str,
    ) -> Transaction:
        user = WalletService._lock_user(db, user_id)
        balance = to_decimal(user.balance)
        if balance < amount:
            raise InsufficientBalanceError("Insufficient balance")

        user.balance = balance - amount
        tx = Transaction(
            user_id=user_id,
            bet_id=bet_id,
            type="bet",
            amount=-amount,
            description=description,
        )
        db.add(tx)
        db.add(user)
        return tx

    @staticmethod
    def credit_winnings(
        db: Session,
        user_id: str,
        amount: Decimal,
        bet_id: str,
        description: str,
    ) -> Transaction:
        user = WalletService._lock_user(db, user_id)
        user.balance = to_decimal(user.balance) + amount
        tx = Transaction(
            user_id=user_id,
            bet_id=bet_id,
            type="win",
            amount=amount,
            description=description,
        )
        db.add(tx)
        db.add(user)
        return tx

    @staticmethod
    def list_transactions(db: Session, user_id: str) -> list[Transaction]:
        return (
            db.query(Transaction)
            .filter(Transaction.user_id == user_id)
            .order_by(Transaction.created_at.desc())
            .all()
        )
