import hashlib
import hmac
import json
import secrets
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.money import to_decimal
from app.models.payment import PaymentIntent
from app.services.moolre_service import MoolreService
from app.services.wallet_service import WalletService


class PaymentError(Exception):
    pass


def _new_ref() -> str:
    return "bp_" + secrets.token_hex(12)


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
        settings = get_settings()
        if settings.payments_mode == "disabled":
            raise PaymentError("Payments are disabled")

        dec_amount = to_decimal(amount)
        if dec_amount <= 0:
            raise PaymentError("Amount must be positive")

        intent = PaymentIntent(
            user_id=user_id,
            provider=settings.payments_mode,
            kind="deposit",
            provider_ref=_new_ref(),
            amount=dec_amount,
            currency=settings.payment_currency,
            status="pending",
            channel=channel or "mobile_money",
        )

        if settings.payments_mode == "moolre":
            try:
                intent.extra = MoolreService.initiate_collection(
                    intent, payer_phone=payer_phone
                )
            except (TypeError, ValueError) as exc:
                raise PaymentError(str(exc)) from exc
            intent.authorization_url = None
        elif settings.payments_mode == "paystack":
            if not settings.payment_secret_key:
                raise PaymentError("PAYMENT_SECRET_KEY is not configured")
            payload = {
                "email": email or f"{user_id}@betplus.local",
                "amount": int((dec_amount * 100).quantize(Decimal("1"))),
                "currency": settings.payment_currency,
                "reference": intent.provider_ref,
                "metadata": {"user_id": user_id, "kind": "deposit"},
            }
            response = httpx.post(
                "https://api.paystack.co/transaction/initialize",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.payment_secret_key}",
                    "Content-Type": "application/json",
                },
                timeout=20.0,
            )
            if response.status_code >= 400:
                raise PaymentError("Payment provider rejected initialization")
            body = response.json()
            data = body.get("data") or {}
            intent.authorization_url = data.get("authorization_url")
            intent.extra = {"provider_response": {"status": body.get("status")}}

        db.add(intent)
        db.commit()
        db.refresh(intent)

        if settings.payments_mode == "simulated":
            intent = PaymentService.complete_intent(db, intent)

        db.refresh(intent)
        return intent

    @staticmethod
    def complete_intent(
        db: Session,
        intent: PaymentIntent,
        *,
        commit: bool = True,
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
        if locked.status == "failed":
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
        locked.completed_at = datetime.now(timezone.utc)
        db.add(locked)
        db.flush()
        if commit:
            db.commit()
            db.refresh(locked)
        return locked

    @staticmethod
    def verify_payment_reference(db: Session, reference: str) -> PaymentIntent | None:
        settings = get_settings()
        intent = (
            db.query(PaymentIntent)
            .filter(PaymentIntent.provider_ref == reference)
            .with_for_update()
            .first()
        )
        if not intent:
            raise PaymentError("Unknown payment reference")
        if intent.status == "completed":
            return intent
        if settings.payments_mode != "moolre":
            return intent

        try:
            body = MoolreService.get_payment_status(reference)
        except (TypeError, ValueError) as exc:
            raise PaymentError(str(exc)) from exc

        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        if data.get("externalref") and str(data.get("externalref")) != reference:
            raise PaymentError("Reference mismatch")
        if (
            data.get("accountnumber")
            and str(data.get("accountnumber")) != settings.moolre_account_number
        ):
            raise PaymentError("Account mismatch")
        expected_amount = Decimal(str(intent.amount))
        reported_amount = data.get("amount")
        if reported_amount is not None:
            if Decimal(str(reported_amount)) != expected_amount:
                raise PaymentError("Amount mismatch")

        tx_status = data.get("txstatus")
        success = tx_status in {1, "1", True} or body.get("status") in {1, "1", True}
        if not success:
            intent.status = "failed"
            intent.completed_at = datetime.now(timezone.utc)
            db.add(intent)
            db.commit()
            return intent
        return PaymentService.complete_intent(db, intent)

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
        dec_amount = to_decimal(amount)
        if dec_amount <= 0:
            raise PaymentError("Amount must be positive")

        intent = PaymentIntent(
            user_id=user_id,
            provider=settings.payments_mode,
            kind="withdrawal",
            provider_ref=_new_ref(),
            amount=dec_amount,
            currency=settings.payment_currency,
            status="pending",
            channel=channel or "mobile_money",
            extra={"destination": destination} if destination else None,
        )
        db.add(intent)
        db.flush()

        WalletService.withdraw(
            db,
            user_id,
            float(dec_amount),
            f"Withdrawal {intent.provider_ref}",
            commit=False,
        )

        if settings.payments_mode == "simulated":
            intent.status = "completed"
            intent.completed_at = datetime.now(timezone.utc)
            db.add(intent)

        db.commit()
        db.refresh(intent)
        return intent

    @staticmethod
    def verify_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
        settings = get_settings()
        if settings.payments_mode == "moolre":
            return True
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
    def handle_webhook(db: Session, payload: dict) -> PaymentIntent | None:
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

        intent = (
            db.query(PaymentIntent)
            .filter(PaymentIntent.provider_ref == reference)
            .with_for_update()
            .first()
        )
        if not intent:
            raise PaymentError("Unknown payment reference")

        if get_settings().payments_mode == "moolre":
            status_value = payload.get("status")
            tx_status = data.get("txstatus") if isinstance(data, dict) else None
            if status_value in {1, "1", True} or tx_status in {1, "1", True}:
                return PaymentService.verify_payment_reference(db, reference)
            if status_value in {0, "0", False} or tx_status in {0, "0", False}:
                if intent.status != "completed":
                    intent.status = "failed"
                    db.add(intent)
                    db.commit()
                return intent
            return intent

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
            if intent.status != "completed":
                intent.status = "failed"
                db.add(intent)
                db.commit()
            return intent
        if not success and intent.provider != "simulated":
            return intent
        return PaymentService.complete_intent(db, intent)

    @staticmethod
    def get_by_ref(db: Session, reference: str) -> PaymentIntent | None:
        return (
            db.query(PaymentIntent)
            .filter(PaymentIntent.provider_ref == reference)
            .first()
        )
