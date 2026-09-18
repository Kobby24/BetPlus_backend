from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.money import to_decimal
from app.models.payment import PaymentIntent

logger = logging.getLogger("app.payments.moolre")

SANDBOX_BASE_URL = "https://sandbox.moolre.com"
LIVE_BASE_URL = "https://api.moolre.com"

COLLECTION_PATH = "/open/transact/payment"
TRANSFER_PATH = "/open/transact/transfer"
STATUS_PATH = "/open/transact/status"

TX_PENDING = {0, "0"}
TX_SUCCESS = {1, "1", True}
TX_FAILED = {2, "2"}

COLLECTION_CHANNELS = {
    "mtn": "MTN",
    "mtnmomo": "MTN",
    "mobilemoney": "MTN",
    "mobile_money": "MTN",
    "momo": "MTN",
    "telecel": "TELECEL",
    "telecelcash": "TELECEL",
    "airteltigo": "AT",
    "airteltigomoney": "AT",
    "at": "AT",
    "13": "MTN",
    "6": "TELECEL",
    "7": "AT",
}

TRANSFER_CHANNELS = {
    "mtn": "MTN",
    "mtnmomo": "MTN",
    "mobilemoney": "MTN",
    "mobile_money": "MTN",
    "momo": "MTN",
    "telecel": "TELECEL",
    "telecelcash": "TELECEL",
    "airteltigo": "AT",
    "airteltigomoney": "AT",
    "at": "AT",
    "1": "MTN",
    "6": "TELECEL",
    "7": "AT",
}

# Moolre collection uses 13=MTN; transfers use 1=MTN. Named values are rejected.
COLLECTION_CHANNEL_CODES = {"MTN": "13", "TELECEL": "6", "AT": "7"}
TRANSFER_CHANNEL_CODES = {"MTN": "1", "TELECEL": "6", "AT": "7"}

SAFE_PROVIDER_MESSAGES = {
    "TP13": "Payment reference was already used. Please retry.",
    "TP14": "Phone verification is required before this payment can continue.",
    "TR013": "Transfer reference was already used. Please retry.",
}


class MoolreError(Exception):
    def __init__(self, message: str, *, retryable: bool = False, code: str | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.code = code


def _normalize_key(value: str | None) -> str:
    return (value or "").strip().lower().replace(" ", "").replace("-", "").replace("_", "")


def envelope_accepted(body: dict[str, Any] | None) -> bool:
    """HTTP 200 is not enough; Moolre uses status 1 for an accepted envelope."""
    if not isinstance(body, dict):
        return False
    return body.get("status") in {1, "1", True, 1.0}


def envelope_code(body: dict[str, Any] | None) -> str:
    if not isinstance(body, dict):
        return ""
    return str(body.get("code") or "").strip().upper()


def txstatus_value(data: dict[str, Any] | None) -> object:
    if not isinstance(data, dict):
        return None
    return data.get("txstatus")


def is_tx_success(data: dict[str, Any] | None) -> bool:
    return txstatus_value(data) in TX_SUCCESS


def is_tx_pending(data: dict[str, Any] | None) -> bool:
    status = txstatus_value(data)
    return status in TX_PENDING or status is None


def is_tx_failed(data: dict[str, Any] | None) -> bool:
    return txstatus_value(data) in TX_FAILED


def safe_provider_message(code: object, fallback: str) -> str:
    key = str(code or "").strip().upper()
    return SAFE_PROVIDER_MESSAGES.get(key, fallback)


class MoolreService:
    @staticmethod
    def base_url() -> str:
        settings = get_settings()
        return settings.moolre_request_base_url()

    @staticmethod
    def normalize_phone(raw_phone: str | None) -> str:
        if not raw_phone or not str(raw_phone).strip():
            raise MoolreError("A valid mobile money number is required")
        digits = "".join(ch for ch in str(raw_phone) if ch.isdigit())
        if digits.startswith("233") and len(digits) >= 12:
            local = "0" + digits[3:12]
        elif len(digits) == 10 and digits.startswith("0"):
            local = digits
        elif len(digits) == 9:
            local = "0" + digits
        else:
            raise MoolreError("Mobile money number must be a valid Ghana local number")
        if len(local) != 10 or not local.startswith("0"):
            raise MoolreError("Mobile money number must be a valid Ghana local number")
        return local

    @staticmethod
    def collection_channel(channel: str | None) -> str:
        normalized = _normalize_key(channel)
        mapped = COLLECTION_CHANNELS.get(normalized)
        if mapped:
            return mapped
        if (channel or "").strip().upper() in {"MTN", "TELECEL", "AT"}:
            return (channel or "").strip().upper()
        raise MoolreError("Unsupported mobile money network")

    @staticmethod
    def collection_channel_code(channel: str | None) -> str:
        return COLLECTION_CHANNEL_CODES[MoolreService.collection_channel(channel)]

    @staticmethod
    def transfer_channel(channel: str | None) -> str:
        normalized = _normalize_key(channel)
        mapped = TRANSFER_CHANNELS.get(normalized)
        if mapped:
            return mapped
        if (channel or "").strip().upper() in {"MTN", "TELECEL", "AT"}:
            return (channel or "").strip().upper()
        raise MoolreError("Unsupported mobile money network")

    @staticmethod
    def transfer_channel_code(channel: str | None) -> str:
        return TRANSFER_CHANNEL_CODES[MoolreService.transfer_channel(channel)]

    @staticmethod
    def _auth_headers(*, private: bool = False) -> dict[str, str]:
        settings = get_settings()
        if not settings.moolre_api_user:
            raise MoolreError("Moolre API credentials are not configured")
        headers = {
            "X-API-USER": settings.moolre_api_user,
            "Content-Type": "application/json",
        }
        if private:
            if not settings.moolre_api_key:
                raise MoolreError("Moolre private API key is not configured")
            headers["X-API-KEY"] = settings.moolre_api_key
        else:
            if settings.moolre_env != "sandbox" and not settings.moolre_public_key:
                raise MoolreError("Moolre public API key is not configured")
            if settings.moolre_public_key:
                headers["X-API-PUBKEY"] = settings.moolre_public_key
        return headers

    @staticmethod
    def _require_account_number() -> str:
        account = (get_settings().moolre_account_number or "").strip()
        if not account:
            raise MoolreError("Moolre account number is not configured")
        return account

    @staticmethod
    def _post(path: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        url = f"{MoolreService.base_url()}{path}"
        try:
            response = httpx.post(url, json=payload, headers=headers, timeout=20.0)
        except httpx.TimeoutException as exc:
            logger.warning("moolre.timeout path=%s", path)
            raise MoolreError("Payment provider timed out", retryable=True) from exc
        except httpx.HTTPError as exc:
            logger.warning("moolre.http_error path=%s", path)
            raise MoolreError("Payment provider is unavailable", retryable=True) from exc

        if response.status_code >= 500:
            raise MoolreError("Payment provider is unavailable", retryable=True)
        try:
            body = response.json()
        except (json.JSONDecodeError, ValueError) as exc:
            raise MoolreError("Payment provider returned an invalid response") from exc
        if not isinstance(body, dict):
            raise MoolreError("Payment provider returned an invalid response")
        logger.info(
            "moolre.response path=%s http=%s status=%s code=%s",
            path,
            response.status_code,
            body.get("status"),
            body.get("code"),
        )
        if response.status_code >= 400:
            code = body.get("code")
            raise MoolreError(
                safe_provider_message(code, "Payment provider rejected the request"),
                code=str(code) if code is not None else None,
            )
        return body

    @staticmethod
    def initiate_collection(
        payment: PaymentIntent, *, payer_phone: str | None = None
    ) -> dict[str, Any]:
        settings = get_settings()
        account = MoolreService._require_account_number()
        payload: dict[str, Any] = {
            "type": 1,
            "channel": MoolreService.collection_channel_code(payment.channel),
            "currency": payment.currency or settings.payment_currency,
            "payer": MoolreService.normalize_phone(payer_phone),
            "amount": str(to_decimal(payment.amount)),
            "externalref": payment.provider_ref,
            "accountnumber": account,
        }
        if settings.moolre_env == "sandbox":
            payload["skipotp"] = True

        body = MoolreService._post(
            COLLECTION_PATH,
            payload,
            MoolreService._auth_headers(private=False),
        )
        if not envelope_accepted(body):
            logger.warning(
                "moolre.collection_rejected ref=%s status=%s code=%s",
                payment.provider_ref,
                body.get("status"),
                body.get("code"),
            )
            code = body.get("code")
            raise MoolreError(
                safe_provider_message(code, "Payment provider rejected the request"),
                code=str(code) if code is not None else None,
            )
        if envelope_code(body) == "TP14":
            logger.warning(
                "moolre.collection_otp_required ref=%s code=TP14",
                payment.provider_ref,
            )
            raise MoolreError(
                safe_provider_message("TP14", "Phone verification is required"),
                code="TP14",
            )
        logger.info(
            "moolre.collection_initiated ref=%s code=%s",
            payment.provider_ref,
            body.get("code"),
        )
        return body

    @staticmethod
    def initiate_transfer(
        payment: PaymentIntent, *, receiver_phone: str | None = None
    ) -> dict[str, Any]:
        settings = get_settings()
        account = MoolreService._require_account_number()
        payload = {
            "type": 1,
            "channel": MoolreService.transfer_channel_code(payment.channel),
            "currency": payment.currency or settings.payment_currency,
            "amount": str(to_decimal(payment.amount)),
            "receiver": MoolreService.normalize_phone(receiver_phone),
            "externalref": payment.provider_ref,
            "accountnumber": account,
        }
        body = MoolreService._post(
            TRANSFER_PATH,
            payload,
            MoolreService._auth_headers(private=True),
        )
        if not envelope_accepted(body):
            logger.warning(
                "moolre.transfer_rejected ref=%s status=%s code=%s",
                payment.provider_ref,
                body.get("status"),
                body.get("code"),
            )
            code = body.get("code")
            raise MoolreError(
                safe_provider_message(code, "Payout provider rejected the request"),
                code=str(code) if code is not None else None,
            )
        logger.info(
            "moolre.transfer_initiated ref=%s code=%s",
            payment.provider_ref,
            body.get("code"),
        )
        return body

    @staticmethod
    def get_payment_status(reference: str, *, private: bool = False) -> dict[str, Any]:
        account = MoolreService._require_account_number()
        return MoolreService._post(
            STATUS_PATH,
            {
                "type": 1,
                "idtype": 1,
                "id": reference,
                "accountnumber": account,
            },
            MoolreService._auth_headers(private=private),
        )

    @staticmethod
    def verified_success_data(
        body: dict[str, Any],
        *,
        expected_ref: str,
        expected_amount: Decimal,
        expected_account: str,
    ) -> dict[str, Any]:
        data = body.get("data") if isinstance(body.get("data"), dict) else None
        if not data:
            raise MoolreError("Payment is not yet confirmed")
        if not is_tx_success(data):
            if is_tx_failed(data):
                raise MoolreError("Payment was not successful")
            raise MoolreError("Payment is still pending")
        reported_ref = str(data.get("externalref") or "")
        if reported_ref and reported_ref != expected_ref:
            raise MoolreError("Payment reference mismatch")
        reported_account = str(data.get("accountnumber") or "")
        if reported_account and reported_account != expected_account:
            raise MoolreError("Payment account mismatch")
        if data.get("amount") is None:
            raise MoolreError("Payment amount mismatch")
        if to_decimal(data.get("amount")) != to_decimal(expected_amount):
            raise MoolreError("Payment amount mismatch")
        return data
