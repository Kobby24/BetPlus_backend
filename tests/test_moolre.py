import json
from decimal import Decimal

import httpx
import pytest

from tests.helpers import auth_headers, register_and_token


ACCOUNT = "100000123456"
SECRET = "moolre-callback-secret"


class DummyResponse:
    def __init__(self, payload, status_code=200):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _configure_moolre(monkeypatch):
    monkeypatch.setenv("PAYMENTS_MODE", "moolre")
    monkeypatch.setenv("MOOLRE_ENV", "sandbox")
    monkeypatch.setenv("MOOLRE_API_BASE_URL", "https://sandbox.moolre.com")
    monkeypatch.setenv("MOOLRE_API_USER", "demo-user")
    monkeypatch.setenv("MOOLRE_PUBLIC_KEY", "demo-pub")
    monkeypatch.setenv("MOOLRE_API_KEY", "demo-private")
    monkeypatch.setenv("MOOLRE_ACCOUNT_NUMBER", ACCOUNT)
    monkeypatch.setenv("MOOLRE_WEBHOOK_SECRET", SECRET)
    from app.core.config import reset_settings_cache

    reset_settings_cache()


def _success_status(reference: str, amount="25.00", txstatus=1, **overrides):
    data = {
        "txstatus": txstatus,
        "amount": amount,
        "externalref": reference,
        "accountnumber": ACCOUNT,
        "payer": "0241234567",
        "transactionid": "32712684",
        "ts": "2024-11-27 21:11:29",
    }
    data.update(overrides)
    return {
        "status": 1,
        "code": "SS01",
        "message": "Transaction Successful",
        "data": data,
        "go": None,
    }


def test_channel_and_phone_mapping():
    from app.services.moolre_service import MoolreService

    assert MoolreService.collection_channel("mtn") == "MTN"
    assert MoolreService.collection_channel_code("mtn") == "13"
    assert MoolreService.collection_channel_code("telecel") == "6"
    assert MoolreService.collection_channel_code("airteltigo") == "7"
    assert MoolreService.transfer_channel("mtn") == "MTN"
    assert MoolreService.transfer_channel_code("mtn") == "1"
    assert MoolreService.transfer_channel_code("telecel") == "6"
    assert MoolreService.normalize_phone("0241234567") == "0241234567"
    assert MoolreService.normalize_phone("+233241234567") == "0241234567"
    with pytest.raises(Exception):
        MoolreService.collection_channel("paypal")
    with pytest.raises(Exception):
        MoolreService.normalize_phone("123")


def test_moolre_deposit_initiation_uses_sandbox_contract(client, monkeypatch):
    _configure_moolre(monkeypatch)
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return DummyResponse({"status": 1, "code": "TR099", "message": None, "data": "f25fc80e"})

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-init@example.com")
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 25, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["provider_ref"].startswith("bp_")
    assert calls[0]["url"] == "https://sandbox.moolre.com/open/transact/payment"
    assert calls[0]["json"]["type"] == 1
    assert calls[0]["json"]["channel"] == "13"
    assert calls[0]["json"]["payer"] == "0241234567"
    assert calls[0]["json"]["amount"] == "25.00"
    assert calls[0]["json"]["accountnumber"] == ACCOUNT
    assert calls[0]["json"]["skipotp"] is True
    assert calls[0]["headers"]["X-API-USER"] == "demo-user"
    assert calls[0]["headers"]["X-API-PUBKEY"] == "demo-pub"
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_moolre_telecel_and_at_channels(client, monkeypatch):
    _configure_moolre(monkeypatch)
    captured = []

    def fake_post(url, json, headers, timeout):
        captured.append(json["channel"])
        return DummyResponse({"status": 1, "code": "TR099", "data": "ok"})

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-ch@example.com")
    for channel in ("telecel", "airteltigo"):
        resp = client.post(
            "/api/v1/payments/deposits",
            json={"amount": 10, "channel": channel, "phone": "0241234567"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "pending"
    assert captured == ["6", "7"]


def test_moolre_rejects_invalid_network_and_amount(client, monkeypatch):
    _configure_moolre(monkeypatch)
    token = register_and_token(client, "moolre-bad@example.com")
    monkeypatch.setattr(
        "app.services.moolre_service.httpx.post",
        lambda *a, **k: DummyResponse({"status": 1, "code": "TR099", "data": "x"}),
    )
    bad_net = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 10, "channel": "paypal", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert bad_net.status_code == 400
    bad_amt = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 0, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert bad_amt.status_code == 422
    bad_phone = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 10, "channel": "mtn", "phone": "12"},
        headers=auth_headers(token),
    )
    assert bad_phone.status_code == 400
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_pending_status_does_not_credit(client, monkeypatch):
    _configure_moolre(monkeypatch)

    def fake_post(url, json, headers, timeout):
        if url.endswith("/payment"):
            return DummyResponse({"status": 1, "code": "TR099", "data": "x"})
        return DummyResponse(_success_status(json["id"], txstatus=0))

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-pend@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 25, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    reference = created.json()["provider_ref"]
    status = client.get(f"/api/v1/payments/{reference}", headers=auth_headers(token))
    assert status.status_code == 200
    assert status.json()["status"] == "pending"
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_successful_verification_credits_once(client, monkeypatch):
    _configure_moolre(monkeypatch)
    state = {"ref": None}

    def fake_post(url, json, headers, timeout):
        if url.endswith("/payment"):
            return DummyResponse({"status": 1, "code": "TR099", "data": "x"})
        return DummyResponse(_success_status(json["id"], amount="25.00"))

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-ok@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 25, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    reference = created.json()["provider_ref"]
    state["ref"] = reference
    first = client.get(f"/api/v1/payments/{reference}", headers=auth_headers(token))
    second = client.get(f"/api/v1/payments/{reference}", headers=auth_headers(token))
    assert first.json()["status"] == "completed"
    assert second.json()["status"] == "completed"
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 25
    txs = client.get("/api/v1/wallet/transactions", headers=auth_headers(token)).json()
    assert sum(1 for t in txs if t["type"] == "deposit") == 1


def test_moolre_webhook_secret_and_replay(client, monkeypatch):
    _configure_moolre(monkeypatch)

    def fake_post(url, json, headers, timeout):
        if url.endswith("/payment"):
            return DummyResponse({"status": 1, "code": "TR099", "data": "x"})
        return DummyResponse(_success_status(json["id"], amount="15.00"))

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-wh@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 15, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    reference = created.json()["provider_ref"]
    payload = {
        "status": 1,
        "code": "P01",
        "message": "Transaction Successful",
        "data": {
            "txstatus": 1,
            "payer": "0241234567",
            "accountnumber": ACCOUNT,
            "amount": "15.00",
            "value": "15.00",
            "transactionid": "32712684",
            "externalref": reference,
            "ts": "2024-11-27 21:11:29",
        },
        "go": None,
    }
    missing = client.post("/api/v1/payments/webhook", content=json.dumps(payload).encode())
    assert missing.status_code == 400

    payload["data"]["secret"] = "wrong"
    bad = client.post(
        "/api/v1/payments/webhook",
        content=json.dumps(payload).encode(),
    )
    assert bad.status_code == 400

    payload["data"]["secret"] = SECRET
    raw = json.dumps(payload).encode()
    first = client.post("/api/v1/payments/webhook", content=raw)
    second = client.post("/api/v1/payments/webhook", content=raw)
    assert first.status_code == 200
    assert second.status_code == 200
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 15


def test_amount_and_reference_mismatch_do_not_credit(client, monkeypatch):
    _configure_moolre(monkeypatch)

    def fake_post(url, json, headers, timeout):
        if url.endswith("/payment"):
            return DummyResponse({"status": 1, "code": "TR099", "data": "x"})
        return DummyResponse(
            _success_status(json["id"], amount="99.00", externalref="other-ref")
        )

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-mm@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 25, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    reference = created.json()["provider_ref"]
    client.get(f"/api/v1/payments/{reference}", headers=auth_headers(token))
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_provider_timeout_and_invalid_json(client, monkeypatch):
    _configure_moolre(monkeypatch)

    def timeout_post(url, json, headers, timeout):
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr("app.services.moolre_service.httpx.post", timeout_post)
    token = register_and_token(client, "moolre-to@example.com")
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 10, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400

    class BadJSON:
        status_code = 200

        def json(self):
            raise ValueError("nope")

    monkeypatch.setattr(
        "app.services.moolre_service.httpx.post", lambda *a, **k: BadJSON()
    )
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 10, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    http_fail = DummyResponse({"status": 0, "code": "TP13", "message": "dup"}, 400)
    monkeypatch.setattr(
        "app.services.moolre_service.httpx.post", lambda *a, **k: http_fail
    )
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 10, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


def test_user_cannot_query_another_users_payment(client, monkeypatch):
    _configure_moolre(monkeypatch)
    monkeypatch.setattr(
        "app.services.moolre_service.httpx.post",
        lambda *a, **k: DummyResponse({"status": 1, "code": "TR099", "data": "x"}),
    )
    owner = register_and_token(client, "moolre-owner@example.com")
    other = register_and_token(client, "moolre-other@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 10, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(owner),
    )
    reference = created.json()["provider_ref"]
    denied = client.get(f"/api/v1/payments/{reference}", headers=auth_headers(other))
    assert denied.status_code == 404


def test_failed_withdrawal_restores_balance_once(client, monkeypatch):
    _configure_moolre(monkeypatch)
    from app.db.session import SessionLocal
    from app.models.user import User

    token = register_and_token(client, "moolre-wd@example.com")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "moolre-wd@example.com").first()
        user.balance = Decimal("80.00")
        db.add(user)
        db.commit()
    finally:
        db.close()

    def fake_post(url, json, headers, timeout):
        if url.endswith("/transfer"):
            return DummyResponse(
                {"status": 0, "code": "OB00", "message": "failed", "data": {}},
                400,
            )
        return DummyResponse({"status": 1, "code": "TR099", "data": "x"})

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    resp = client.post(
        "/api/v1/payments/withdrawals",
        json={"amount": 30, "channel": "mtn", "destination": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 80


def test_duplicate_external_reference_is_retried(client, monkeypatch):
    _configure_moolre(monkeypatch)
    seen = {"count": 0}

    def fake_post(url, json, headers, timeout):
        seen["count"] += 1
        if seen["count"] == 1:
            return DummyResponse(
                {
                    "status": "0",
                    "code": "TP13",
                    "message": "External Reference is required and must be unique.",
                    "data": "externalref",
                },
                400,
            )
        return DummyResponse({"status": 1, "code": "TR099", "data": "ok"})

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-dupref@example.com")
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 12, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    assert seen["count"] == 2


def test_deposit_idempotency_key_replays(client, monkeypatch):
    _configure_moolre(monkeypatch)
    monkeypatch.setattr(
        "app.services.moolre_service.httpx.post",
        lambda *a, **k: DummyResponse({"status": 1, "code": "TR099", "data": "x"}),
    )
    token = register_and_token(client, "moolre-idem@example.com")
    headers = {**auth_headers(token), "Idempotency-Key": "pay-click-1"}
    payload = {"amount": 18, "channel": "mtn", "phone": "0241234567"}
    first = client.post("/api/v1/payments/deposits", json=payload, headers=headers)
    second = client.post("/api/v1/payments/deposits", json=payload, headers=headers)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


def _detail(resp):
    payload = resp.json()["detail"]
    if isinstance(payload, dict):
        return payload
    return {"message": str(payload)}


def test_moolre_http_200_failed_envelope_returns_structured_400(client, monkeypatch):
    _configure_moolre(monkeypatch)

    def fake_post(url, json, headers, timeout):
        return DummyResponse(
            {
                "status": 0,
                "code": "CH01",
                "message": "Invalid channel",
                "data": None,
                "go": None,
            }
        )

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-env0@example.com")
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 20, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    detail = _detail(resp)
    assert detail["message"] == "Invalid channel"
    assert detail["code"] == "PAYMENT_FAILED"
    assert str(detail.get("reference") or "").startswith("bp_")
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_moolre_http_200_in01_surfaces_live_credential_guidance(client, monkeypatch):
    _configure_moolre(monkeypatch)

    def fake_post(url, json, headers, timeout):
        return DummyResponse(
            {
                "status": 0,
                "code": "IN01",
                "message": "Invalid account or credentials",
                "data": None,
                "go": None,
            }
        )

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-in01@example.com")
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 20, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    detail = _detail(resp)
    assert "live API user" in detail["message"]
    assert detail["code"] == "PAYMENT_FAILED"
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_moolre_http_200_tp14_requires_phone_verification(client, monkeypatch):
    _configure_moolre(monkeypatch)

    def fake_post(url, json, headers, timeout):
        return DummyResponse(
            {
                "status": 1,
                "code": "TP14",
                "message": "Please complete the verification process sent to you via SMS and try again.",
                "data": "all",
                "go": None,
            }
        )

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-tp14@example.com")
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 20, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["otp_required"] is True
    reference = body["provider_ref"]
    status = client.get(f"/api/v1/payments/{reference}", headers=auth_headers(token))
    assert status.status_code == 200
    assert status.json()["otp_required"] is True
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_moolre_tp14_otp_then_prompt(client, monkeypatch):
    _configure_moolre(monkeypatch)
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append(json)
        if json.get("otpcode") == "123456":
            return DummyResponse({"status": 1, "code": "TR099", "data": "ok"})
        return DummyResponse(
            {
                "status": 1,
                "code": "TP14",
                "message": "Please complete the verification process sent to you via SMS and try again.",
                "data": "all",
            }
        )

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-otp@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 20, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    reference = created.json()["provider_ref"]
    bad = client.post(
        f"/api/v1/payments/{reference}/otp",
        json={"otpcode": "000000"},
        headers=auth_headers(token),
    )
    assert bad.status_code == 400
    assert created.json()["otp_required"] is True
    ok = client.post(
        f"/api/v1/payments/{reference}/otp",
        json={"otpcode": "123456"},
        headers=auth_headers(token),
    )
    assert ok.status_code == 200
    assert ok.json()["otp_required"] is False
    assert ok.json()["status"] == "pending"
    assert any(call.get("otpcode") == "123456" for call in calls)
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_moolre_tp14_then_tp17_then_prompt(client, monkeypatch):
    _configure_moolre(monkeypatch)
    seen = {"otp": 0, "follow": 0}

    def fake_post(url, json, headers, timeout):
        if json.get("otpcode"):
            seen["otp"] += 1
            return DummyResponse({"status": 1, "code": "TP17", "data": "verified"})
        if seen["otp"]:
            seen["follow"] += 1
            return DummyResponse({"status": 1, "code": "TR099", "data": "ok"})
        return DummyResponse({"status": 1, "code": "TP14", "data": "all"})

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-tp17@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 15, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    reference = created.json()["provider_ref"]
    ok = client.post(
        f"/api/v1/payments/{reference}/otp",
        json={"otpcode": "654321"},
        headers=auth_headers(token),
    )
    assert ok.status_code == 200
    assert ok.json()["otp_required"] is False
    assert seen["otp"] == 1
    assert seen["follow"] == 1


def test_moolre_otp_unauthorized_and_not_waiting(client, monkeypatch):
    _configure_moolre(monkeypatch)
    monkeypatch.setattr(
        "app.services.moolre_service.httpx.post",
        lambda *a, **k: DummyResponse({"status": 1, "code": "TR099", "data": "x"}),
    )
    owner = register_and_token(client, "moolre-otp-owner@example.com")
    other = register_and_token(client, "moolre-otp-other@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 10, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(owner),
    )
    reference = created.json()["provider_ref"]
    denied = client.post(
        f"/api/v1/payments/{reference}/otp",
        json={"otpcode": "123456"},
        headers=auth_headers(other),
    )
    assert denied.status_code == 404
    not_waiting = client.post(
        f"/api/v1/payments/{reference}/otp",
        json={"otpcode": "123456"},
        headers=auth_headers(owner),
    )
    assert not_waiting.status_code == 400
    client.cookies.clear()
    anon = client.post(
        f"/api/v1/payments/{reference}/otp",
        json={"otpcode": "123456"},
    )
    assert anon.status_code == 401


def test_moolre_deposit_unauthenticated(client, monkeypatch):
    _configure_moolre(monkeypatch)
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 20, "channel": "mtn", "phone": "0241234567"},
    )
    assert resp.status_code == 401


def test_moolre_withdrawal_uses_numeric_transfer_channel(client, monkeypatch):
    _configure_moolre(monkeypatch)
    from app.db.session import SessionLocal
    from app.models.user import User

    token = register_and_token(client, "moolre-wdch@example.com")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "moolre-wdch@example.com").first()
        user.balance = Decimal("50.00")
        db.add(user)
        db.commit()
    finally:
        db.close()

    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append({"url": url, "json": json})
        return DummyResponse({"status": 1, "code": "OBGH01", "data": {}})

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    resp = client.post(
        "/api/v1/payments/withdrawals",
        json={"amount": 10, "channel": "mtn", "destination": "0241234567"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"
    assert calls[0]["json"]["channel"] == "1"
    assert calls[0]["url"].endswith("/open/transact/transfer")
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 40


def test_moolre_status_unknown_and_unauthorized(client, monkeypatch):
    _configure_moolre(monkeypatch)
    monkeypatch.setattr(
        "app.services.moolre_service.httpx.post",
        lambda *a, **k: DummyResponse({"status": 1, "code": "TR099", "data": "x"}),
    )
    owner = register_and_token(client, "moolre-st-owner@example.com")
    other = register_and_token(client, "moolre-st-other@example.com")
    missing = client.get("/api/v1/payments/bp_missing", headers=auth_headers(owner))
    assert missing.status_code == 404
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 10, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(owner),
    )
    reference = created.json()["provider_ref"]
    denied = client.get(f"/api/v1/payments/{reference}", headers=auth_headers(other))
    assert denied.status_code == 404
    client.cookies.clear()
    anon = client.get(f"/api/v1/payments/{reference}")
    assert anon.status_code == 401


def test_moolre_http_200_failed_txstatus_does_not_credit(client, monkeypatch):
    _configure_moolre(monkeypatch)

    def fake_post(url, json, headers, timeout):
        if url.endswith("/payment"):
            return DummyResponse({"status": 1, "code": "TR099", "data": "x"})
        return DummyResponse(_success_status(json["id"], txstatus=2))

    monkeypatch.setattr("app.services.moolre_service.httpx.post", fake_post)
    token = register_and_token(client, "moolre-failtx@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 25, "channel": "mtn", "phone": "0241234567"},
        headers=auth_headers(token),
    )
    reference = created.json()["provider_ref"]
    status = client.get(f"/api/v1/payments/{reference}", headers=auth_headers(token))
    assert status.status_code == 200
    assert status.json()["status"] == "failed"
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0


def test_moolre_webhook_unknown_reference(client, monkeypatch):
    _configure_moolre(monkeypatch)
    payload = {
        "status": 1,
        "code": "P01",
        "data": {
            "txstatus": 1,
            "externalref": "bp_unknown",
            "secret": SECRET,
            "amount": "10.00",
        },
    }
    resp = client.post("/api/v1/payments/webhook", content=json.dumps(payload).encode())
    assert resp.status_code == 400
