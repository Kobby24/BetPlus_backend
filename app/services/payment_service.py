import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.money import to_decimal
from app.models.payment import PaymentIntent, PaymentWebhookEvent
from app.services.moolre_service import (
    MoolreError,
    MoolreService,
    is_tx_failed,
    is_tx_pending,
    is_tx_success,
)
from app.services.wallet_service import InsufficientBalanceError, WalletService

logger = logging.getLogger("app.payments")

TERMINAL_STATUSES = frozenset(
    {"completed", "failed", "cancelled", "expired", "reversed"}
)
PENDING_STATUSES = frozenset({"pending", "processing"})


class PaymentError(Exception):
    def __init__(self, message: str, *, reference: str | None = None):
        super().__init__(message)
        self.reference = reference


def _new_ref() -> str:
    return "bp_" + secrets.token_hex(12)


def _now():
    return datetime.now(timezone.utc)


def _extra(intent: PaymentIntent) -> dict[str, Any]:
    return dict(intent.extra or {})


class PaymentService:
    @staticmethod
    def initiate_deposit(
        db: Session,
        *,
        user_id: str,
        amount: float,
        channel: str | None = None,
        email: str | None = None,
        payer_phone: str | None = None,
    ) -> PaymentIntent:
        del email
        settings = get_settings()
        if settings.payments_mode == "disabled":
            raise PaymentError("Payments are disabled")

        dec_amount = to_decimal(amount)
        if dec_amount <= 0:
            raise PaymentError("Amount must be positive")

        if settings.payments_mode == "moolre":
            try:
                MoolreService.collection_channel(channel or "mtn")
                MoolreService.normalize_phone(payer_phone)
            except MoolreError as exc:
                raise PaymentError(str(exc)) from exc

        intent = PaymentIntent(
            user_id=user_id,
            provider=settings.payments_mode,
            kind="deposit",
            provider_ref=_new_ref(),
            amount=dec_amount,
            currency=settings.payment_currency,
            status="pending",
            channel=channel or "mtn",
        )
        db.add(intent)
        db.flush()

        if settings.payments_mode == "moolre":
            try:
                intent.extra = PaymentService._initiate_collection_with_retry(
                    intent, payer_phone=payer_phone
                )
            except MoolreError as exc:
                intent.status = "failed"
                intent.completed_at = _now()
                intent.extra = {"error": str(exc), "code": exc.code}
                db.add(intent)
                db.commit()
                raise PaymentError(str(exc), reference=intent.provider_ref) from exc
            db.add(intent)
            db.commit()
            db.refresh(intent)
            logger.info(
                "payment.deposit_pending id=%s ref=%s user=%s",
                intent.id,
                intent.provider_ref,
                user_id,
            )
            return intent

        db.commit()
        db.refresh(intent)
        if settings.payments_mode == "simulated":
            intent = PaymentService.complete_intent(db, intent)
        db.refresh(intent)
        return intent

    @staticmethod
    def _initiate_collection_with_retry(
        intent: PaymentIntent, *, payer_phone: str | None
    ) -> dict[str, Any]:
        try:
            return MoolreService.initiate_collection(intent, payer_phone=payer_phone)
        except MoolreError as exc:
            if exc.code != "TP13":
                raise
            intent.provider_ref = _new_ref()
            return MoolreService.initiate_collection(intent, payer_phone=payer_phone)

    @staticmethod
    def complete_intent(
        db: Session,
        intent: PaymentIntent,
        *,
        commit: bool = True,
        provider_txn_id: str | None = None,
    ) -> PaymentIntent:
        locked = (
            db.query(PaymentIntent)
            .filter(PaymentIntent.id == intent.id)
            .with_for_update()
            .first()
        )
        if not locked:
            raise PaymentError("Payment not found")
        if locked.status == "completed":
            return locked
        if locked.status in {"failed", "cancelled", "expired", "reversed"}:
            raise PaymentError("Payment already failed")
        if locked.status != "pending":
            return locked

        locked.status = "processing"
        db.flush()

        if locked.kind == "deposit":
            WalletService.deposit(
                db,
                locked.user_id,
                float(locked.amount),
                f"Payment {locked.provider_ref}",
                track_referral=True,
                commit=False,
            )
        elif locked.kind == "withdrawal":
            pass
        else:
            raise PaymentError("Unknown payment kind")

        locked.status = "completed"
        locked.completed_at = _now()
        if provider_txn_id:
            locked.provider_txn_id = str(provider_txn_id)[:64]
        db.add(locked)
        db.flush()
        logger.info(
            "payment.completed id=%s ref=%s kind=%s",
            locked.id,
            locked.provider_ref,
            locked.kind,
        )
        if commit:
            db.commit()
            db.refresh(locked)
        return locked

    @staticmethod
    def _lock_by_ref(db: Session, reference: str) -> PaymentIntent:
        intent = (
            db.query(PaymentIntent)
            .filter(PaymentIntent.provider_ref == reference)
            .with_for_update()
            .first()
        )
        if not intent:
            raise PaymentError("Unknown payment reference")
        return intent

    @staticmethod
    def _fail_intent(
        db: Session,
        intent: PaymentIntent,
        *,
        status: str = "failed",
        restore_withdrawal: bool = True,
        commit: bool = True,
    ) -> PaymentIntent:
        if intent.status == "completed" and status == "reversed":
            return PaymentService._reverse_completed_withdrawal(
                db, intent, commit=commit
            )
        if intent.status in TERMINAL_STATUSES:
            return intent
        if (
            restore_withdrawal
            and intent.kind == "withdrawal"
            and not _extra(intent).get("funds_restored")
        ):
            WalletService.deposit(
                db,
                intent.user_id,
                float(intent.amount),
                f"Withdrawal reversal {intent.provider_ref}",
                tx_type="withdraw_reversal",
                ledger_type="withdraw_reversal",
                track_referral=False,
                commit=False,
            )
            extra = _extra(intent)
            extra["funds_restored"] = True
            intent.extra = extra
        intent.status = status
        intent.completed_at = _now()
        db.add(intent)
        db.flush()
        logger.info(
            "payment.failed id=%s ref=%s status=%s",
            intent.id,
            intent.provider_ref,
            status,
        )
        if commit:
            db.commit()
            db.refresh(intent)
        return intent

    @staticmethod
    def _reverse_completed_withdrawal(
        db: Session, intent: PaymentIntent, *, commit: bool = True
    ) -> PaymentIntent:
        if intent.kind != "withdrawal":
            return intent
        if intent.status == "reversed":
            return intent
        if _extra(intent).get("funds_restored"):
            intent.status = "reversed"
            db.add(intent)
            if commit:
                db.commit()
                db.refresh(intent)
            return intent
        WalletService.deposit(
            db,
            intent.user_id,
            float(intent.amount),
            f"Withdrawal reversal {intent.provider_ref}",
            tx_type="withdraw_reversal",
            ledger_type="withdraw_reversal",
            track_referral=False,
            commit=False,
        )
        extra = _extra(intent)
        extra["funds_restored"] = True
        intent.extra = extra
        intent.status = "reversed"
        intent.completed_at = _now()
        db.add(intent)
        db.flush()
        if commit:
            db.commit()
            db.refresh(intent)
        return intent

    @staticmethod
    def verify_payment_reference(
        db: Session,
        reference: str,
        *,
        commit: bool = True,
        allow_transfer_status: bool = False,
    ) -> PaymentIntent:
        settings = get_settings()
        intent = PaymentService._lock_by_ref(db, reference)
        if intent.status in TERMINAL_STATUSES:
            return intent
        if settings.payments_mode != "moolre":
            return intent

        try:
            body = MoolreService.get_payment_status(
                reference, private=allow_transfer_status or intent.kind == "withdrawal"
            )
        except MoolreError as exc:
            raise PaymentError(str(exc)) from exc

        return PaymentService._apply_provider_data(
            db, intent, body, commit=commit, require_verified_success=True
        )

    @staticmethod
    def _apply_provider_data(
        db: Session,
        intent: PaymentIntent,
        body: dict[str, Any],
        *,
        commit: bool,
        require_verified_success: bool,
    ) -> PaymentIntent:
        settings = get_settings()
        data = body.get("data") if isinstance(body.get("data"), dict) else None
        if data is None:
            return intent
        if is_tx_pending(data) and not is_tx_success(data):
            return intent
        if is_tx_failed(data):
            return PaymentService._fail_intent(db, intent, commit=commit)
        if not is_tx_success(data):
            return intent

        try:
            verified = MoolreService.verified_success_data(
                body,
                expected_ref=intent.provider_ref,
                expected_amount=to_decimal(intent.amount),
                expected_account=settings.moolre_account_number,
            )
        except MoolreError as exc:
            if require_verified_success:
                raise PaymentError(str(exc)) from exc
            logger.warning(
                "payment.verify_mismatch ref=%s reason=%s",
                intent.provider_ref,
                str(exc),
            )
            return intent

        txn_id = verified.get("transactionid")
        return PaymentService.complete_intent(
            db,
            intent,
            commit=commit,
            provider_txn_id=str(txn_id) if txn_id is not None else None,
        )

    @staticmethod
    def initiate_withdrawal(
        db: Session,
        *,
        user_id: str,
        amount: float,
        channel: str | None = None,
        destination: str | None = None,
    ) -> PaymentIntent:
        settings = get_settings()
        if settings.payments_mode == "disabled":
            raise PaymentError("Payments are disabled")
        dec_amount = to_decimal(amount)
        if dec_amount <= 0:
            raise PaymentError("Amount must be positive")

        receiver = destination
        if settings.payments_mode == "moolre":
            try:
                MoolreService.transfer_channel(channel or "mtn")
                receiver = MoolreService.normalize_phone(destination)
            except MoolreError as exc:
                raise PaymentError(str(exc)) from exc

        intent = PaymentIntent(
            user_id=user_id,
            provider=settings.payments_mode,
            kind="withdrawal",
            provider_ref=_new_ref(),
            amount=dec_amount,
            currency=settings.payment_currency,
            status="pending",
            channel=channel or "mtn",
            extra={"destination": receiver} if receiver else None,
        )
        db.add(intent)
        db.flush()

        try:
            WalletService.withdraw(
                db,
                user_id,
                float(dec_amount),
                f"Withdrawal {intent.provider_ref}",
                commit=False,
            )
        except InsufficientBalanceError as exc:
            db.rollback()
            raise PaymentError(str(exc)) from exc

        if settings.payments_mode == "simulated":
            intent.status = "completed"
            intent.completed_at = _now()
            db.add(intent)
            db.commit()
            db.refresh(intent)
            return intent

        if settings.payments_mode == "moolre":
            try:
                body = MoolreService.initiate_transfer(intent, receiver_phone=receiver)
            except MoolreError as exc:
                PaymentService._fail_intent(db, intent, commit=True)
                raise PaymentError(str(exc), reference=intent.provider_ref) from exc
            extra = _extra(intent)
            extra["provider_response_code"] = body.get("code")
            intent.extra = extra
            data = body.get("data") if isinstance(body.get("data"), dict) else None
            if data and is_tx_success(data):
                try:
                    verified = MoolreService.verified_success_data(
                        body,
                        expected_ref=intent.provider_ref,
                        expected_amount=dec_amount,
                        expected_account=settings.moolre_account_number,
                    )
                except MoolreError:
                    db.add(intent)
                    db.commit()
                    db.refresh(intent)
                    return intent
                txn_id = verified.get("transactionid")
                if txn_id is not None:
                    intent.provider_txn_id = str(txn_id)[:64]
                intent.status = "completed"
                intent.completed_at = _now()
            elif data and is_tx_failed(data):
                return PaymentService._fail_intent(db, intent, commit=True)
            db.add(intent)
            db.commit()
            db.refresh(intent)
            logger.info(
                "payment.withdrawal_pending id=%s ref=%s user=%s",
                intent.id,
                intent.provider_ref,
                user_id,
            )
            return intent

        db.commit()
        db.refresh(intent)
        return intent

    @staticmethod
    def verify_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
        settings = get_settings()
        secret = settings.payment_webhook_secret or settings.payment_secret_key
        if not secret:
            if settings.payments_mode == "simulated" and not settings.is_production:
                return True
            return False
        if not signature:
            return False
        digest_sha512 = hmac.new(
            secret.encode("utf-8"), raw_body, hashlib.sha512
        ).hexdigest()
        digest_sha256 = hmac.new(
            secret.encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(digest_sha512, signature) or hmac.compare_digest(
            digest_sha256, signature
        )

    @staticmethod
    def verify_moolre_callback_secret(payload: dict[str, Any]) -> bool:
        secret = (get_settings().moolre_webhook_secret or "").strip()
        if not secret:
            return False
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        provided = str(data.get("secret") or payload.get("secret") or "")
        if not provided:
            return False
        return hmac.compare_digest(provided, secret)

    @staticmethod
    def _webhook_event_key(payload: dict[str, Any], reference: str) -> str:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        txn_id = data.get("transactionid")
        if txn_id is not None and str(txn_id).strip():
            return str(txn_id).strip()[:128]
        ts = str(data.get("ts") or "")
        txstatus = str(data.get("txstatus") or payload.get("status") or "")
        digest = hashlib.sha256(
            f"{reference}:{ts}:{txstatus}".encode("utf-8")
        ).hexdigest()
        return digest[:128]

    @staticmethod
    def _claim_webhook_event(
        db: Session, *, provider: str, event_key: str, intent_id: str
    ) -> bool:
        try:
            with db.begin_nested():
                db.add(
                    PaymentWebhookEvent(
                        provider=provider,
                        event_key=event_key,
                        payment_intent_id=intent_id,
                    )
                )
                db.flush()
            return True
        except IntegrityError:
            return False

    @staticmethod
    def handle_webhook(db: Session, payload: dict[str, Any]) -> PaymentIntent | None:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        reference = str(
            data.get("externalref")
            or data.get("reference")
            or payload.get("externalref")
            or payload.get("reference")
            or ""
        )
        if not reference:
            raise PaymentError("Missing payment reference")

        intent = PaymentService._lock_by_ref(db, reference)
        event_key = PaymentService._webhook_event_key(payload, reference)
        claimed = PaymentService._claim_webhook_event(
            db,
            provider=intent.provider or "moolre",
            event_key=event_key,
            intent_id=intent.id,
        )
        if not claimed:
            logger.info("payment.webhook_duplicate ref=%s event=%s", reference, event_key)
            return intent

        settings = get_settings()
        if settings.payments_mode == "moolre":
            if is_tx_failed(data):
                return PaymentService._fail_intent(db, intent, commit=True)
            try:
                verified = PaymentService.verify_payment_reference(
                    db, reference, commit=False
                )
            except PaymentError as exc:
                message = str(exc).lower()
                logger.warning("payment.webhook_verify_failed ref=%s", reference)
                if "mismatch" in message:
                    db.commit()
                    return intent
                db.rollback()
                raise
            db.commit()
            db.refresh(verified)
            return verified

        event = str(payload.get("event") or data.get("status") or "")
        success = event in {
            "charge.success",
            "success",
            "successful",
            "completed",
            "transfer.success",
        }
        failed = event in {"charge.failed", "failed", "transfer.failed"}
        if failed:
            return PaymentService._fail_intent(db, intent, commit=True)
        if not success and intent.provider != "simulated":
            db.commit()
            return intent
        return PaymentService.complete_intent(db, intent)

    @staticmethod
    def get_by_ref(db: Session, reference: str) -> PaymentIntent | None:
        return (
            db.query(PaymentIntent)
            .filter(PaymentIntent.provider_ref == reference)
            .first()
        )

    @staticmethod
    def get_owned_and_refresh(
        db: Session, *, reference: str, user_id: str, is_admin: bool = False
    ) -> PaymentIntent:
        intent = PaymentService.get_by_ref(db, reference)
        if not intent or (intent.user_id != user_id and not is_admin):
            raise PaymentError("not_found")
        if (
            get_settings().payments_mode == "moolre"
            and intent.status in PENDING_STATUSES
        ):
            try:
                intent = PaymentService.verify_payment_reference(db, reference)
            except PaymentError:
                db.rollback()
                intent = PaymentService.get_by_ref(db, reference) or intent
        return intent
