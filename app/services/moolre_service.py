from __future__ import annotations

from decimal import Decimal

import httpx

from app.core.config import get_settings
from app.models.payment import PaymentIntent


class MoolreService:
    @staticmethod
    def base_url() -> str:
        settings = get_settings()
        return (settings.moolre_api_base_url or "https://sandbox.moolre.com").rstrip(
            "/"
        )

    @staticmethod
    def normalize_phone(raw_phone: str | None) -> str:
        if not raw_phone or not str(raw_phone).strip():
            if get_settings().moolre_env == "sandbox":
                return "233000000000"
            raise ValueError("A valid mobile money number is required")
        digits = "".join(ch for ch in str(raw_phone) if ch.isdigit())
        if len(digits) == 9 and digits.startswith("0"):
            return "233" + digits[1:]
        if len(digits) == 10 and not digits.startswith("0"):
            return "233" + digits
        if len(digits) == 12 and digits.startswith("233"):
            return digits
        raise ValueError("Mobile money number must be a valid Ghana local number")

    @staticmethod
    def network_code(channel: str | None) -> str:
        normalized = (channel or "mobile_money").strip().lower().replace(" ", "")
        mapping = {
            "mtn": "13",
            "mtnmomo": "13",
            "mobilemoney": "13",
            "telecel": "6",
            "telecelcash": "6",
            "airteltigo": "7",
            "airteltigomoney": "7",
            "at": "7",
            "momo": "13",
        }
        if normalized in mapping:
            return mapping[normalized]
        if normalized.isdigit():
            return normalized
        raise ValueError("Unsupported Moolre mobile network")

    @staticmethod
    def initiate_collection(
        payment: PaymentIntent, *, payer_phone: str | None = None
    ) -> dict:
        settings = get_settings()
        if not settings.moolre_api_user or not settings.moolre_public_key:
            raise ValueError("Moolre API credentials are not configured")
        if not settings.moolre_account_number:
            raise ValueError("Moolre account number is not configured")

        base = MoolreService.base_url()
        payload = {
            "type": 1,
            "channel": MoolreService.network_code(payment.channel),
            "currency": payment.currency or settings.payment_currency,
            "payer": MoolreService.normalize_phone(payer_phone),
            "amount": str(Decimal(str(payment.amount)).quantize(Decimal("0.01"))),
            "externalref": payment.provider_ref,
            "accountnumber": settings.moolre_account_number,
        }
        if settings.moolre_env == "sandbox":
            payload["skipotp"] = True

        response = httpx.post(
            f"{base}/open/transact/payment",
            json=payload,
            headers={
                "X-API-USER": settings.moolre_api_user,
                "X-API-PUBKEY": settings.moolre_public_key,
                "Content-Type": "application/json",
            },
            timeout=20.0,
        )
        if response.status_code >= 400:
            raise ValueError("Moolre payment initialization failed")

        body = response.json()
        if not isinstance(body, dict):
            raise ValueError("Invalid Moolre response payload")
        status = body.get("status")
        if status not in (1, "1", True):
            code = body.get("code") or "UNKNOWN"
            message = body.get("message") or "Moolre rejected the payment initiation"
            raise ValueError(f"Moolre rejected payment request ({code}): {message}")
        return body

    @staticmethod
    def get_payment_status(reference: str) -> dict:
        settings = get_settings()
        if not settings.moolre_api_user or not settings.moolre_public_key:
            raise ValueError("Moolre API credentials are not configured")
        if not settings.moolre_account_number:
            raise ValueError("Moolre account number is not configured")

        response = httpx.post(
            f"{MoolreService.base_url()}/open/transact/status",
            json={
                "type": 1,
                "idtype": 1,
                "id": reference,
                "accountnumber": settings.moolre_account_number,
            },
            headers={
                "X-API-USER": settings.moolre_api_user,
                "X-API-PUBKEY": settings.moolre_public_key,
                "Content-Type": "application/json",
            },
            timeout=20.0,
        )
        if response.status_code >= 400:
            raise ValueError("Moolre status verification failed")
        body = response.json()
        if not isinstance(body, dict):
            raise ValueError("Invalid Moolre status payload")
        return body
