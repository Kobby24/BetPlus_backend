import hashlib
import hmac
import json

from tests.helpers import auth_headers, register_and_token


def test_simulated_deposit_credits_via_payment_intent(client):
    token = register_and_token(client, "pay-user@example.com")
    resp = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 40, "channel": "mobile_money"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "completed"
    assert body["kind"] == "deposit"
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 40
    txs = client.get("/api/v1/wallet/transactions", headers=auth_headers(token)).json()
    assert any(t["type"] == "deposit" for t in txs)


def test_webhook_is_idempotent(client, monkeypatch):
    monkeypatch.setenv("PAYMENT_WEBHOOK_SECRET", "whsec")
    from app.core.config import reset_settings_cache

    reset_settings_cache()
    token = register_and_token(client, "webhook-user@example.com")
    created = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 25, "channel": "mobile_money"},
        headers=auth_headers(token),
    )
    assert created.status_code == 201
    reference = created.json()["provider_ref"]
    payload = {"event": "charge.success", "data": {"reference": reference}}
    raw = json.dumps(payload).encode()
    signature = hmac.new(b"whsec", raw, hashlib.sha256).hexdigest()

    first = client.post(
        "/api/v1/payments/webhook",
        content=raw,
        headers={"X-Webhook-Signature": signature, "Content-Type": "application/json"},
    )
    second = client.post(
        "/api/v1/payments/webhook",
        content=raw,
        headers={"X-Webhook-Signature": signature, "Content-Type": "application/json"},
    )
    assert first.status_code == 200
    assert second.status_code == 200
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 25


def test_invalid_webhook_signature_rejected(client, monkeypatch):
    monkeypatch.setenv("PAYMENT_WEBHOOK_SECRET", "whsec")
    from app.core.config import reset_settings_cache

    reset_settings_cache()
    payload = {"event": "charge.success", "data": {"reference": "missing"}}
    raw = json.dumps(payload).encode()
    resp = client.post(
        "/api/v1/payments/webhook",
        content=raw,
        headers={"X-Webhook-Signature": "bad", "Content-Type": "application/json"},
    )
    assert resp.status_code == 400


def test_moolre_deposit_initiation_uses_sandbox_contract(monkeypatch):
    from app.core.config import get_settings, reset_settings_cache
    from app.models.payment import PaymentIntent
    from app.services.payment_service import PaymentService
    from app.db.session import SessionLocal

    monkeypatch.setenv("PAYMENTS_MODE", "moolre")
    monkeypatch.setenv("MOOLRE_ENV", "sandbox")
    monkeypatch.setenv("MOOLRE_API_BASE_URL", "https://sandbox.moolre.com")
    monkeypatch.setenv("MOOLRE_API_USER", "demo-user")
    monkeypatch.setenv("MOOLRE_PUBLIC_KEY", "demo-pub")
    monkeypatch.setenv("MOOLRE_ACCOUNT_NUMBER", "100000123456")
    reset_settings_cache()
    settings = get_settings()
    assert settings.payments_mode == "moolre"
    assert settings.moolre_api_base_url.startswith("https://sandbox.moolre.com")

    class DummyResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"status": 1, "code": "TR099", "message": "", "data": "f25fc80e"}

    calls = {}

    def fake_post(url, json, headers, timeout):
        calls["url"] = url
        calls["json"] = json
        calls["headers"] = headers
        calls["timeout"] = timeout
        return DummyResponse()

    monkeypatch.setattr("app.services.payment_service.httpx.post", fake_post)

    db = SessionLocal()
    try:
        intent = PaymentService.initiate_deposit(
            db,
            user_id="user-123",
            amount=25,
            channel="mtn",
            email="user@example.com",
        )
        assert intent.provider == "moolre"
        assert intent.status == "pending"
        assert intent.provider_ref.startswith("bp_")
        assert calls["url"] == "https://sandbox.moolre.com/open/transact/payment"
        assert calls["json"]["channel"] == "13"
        assert calls["json"]["payer"] == "233000000000"
        assert calls["json"]["amount"] == "25.00"
        assert calls["json"]["accountnumber"] == settings.moolre_account_number
        assert calls["headers"]["X-API-USER"] == "demo-user"
        assert calls["headers"]["X-API-PUBKEY"] == "demo-pub"
    finally:
        db.close()


def test_moolre_verification_credits_wallet_once(monkeypatch):
    from app.core.config import reset_settings_cache
    from app.models.user import User
    from app.db.session import SessionLocal
    from app.services.payment_service import PaymentService

    monkeypatch.setenv("PAYMENTS_MODE", "moolre")
    monkeypatch.setenv("MOOLRE_ENV", "sandbox")
    monkeypatch.setenv("MOOLRE_API_BASE_URL", "https://sandbox.moolre.com")
    monkeypatch.setenv("MOOLRE_API_USER", "demo-user")
    monkeypatch.setenv("MOOLRE_PUBLIC_KEY", "demo-pub")
    monkeypatch.setenv("MOOLRE_ACCOUNT_NUMBER", "100000123456")
    reset_settings_cache()

    class DummyResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "status": 1,
                "code": "SS01",
                "message": "Transaction Successful",
                "data": {
                    "txstatus": 1,
                    "amount": "25",
                    "externalref": "bp_demo_ref",
                    "accountnumber": "100000123456",
                    "payer": "233000000000",
                    "payee": "100000123456",
                },
            }

    db = SessionLocal()
    try:
        user = User(
            name="Moolre User",
            email="moolre@example.com",
            phone="233000000000",
            hashed_password="x",
            balance=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        monkeypatch.setattr(
            "app.services.payment_service.httpx.post", lambda *a, **k: DummyResponse()
        )

        intent = PaymentService.initiate_deposit(
            db,
            user_id=user.id,
            amount=25,
            channel="mtn",
            email=user.email,
        )
        intent.provider_ref = "bp_demo_ref"
        db.add(intent)
        db.commit()

        verified = PaymentService.verify_payment_reference(db, intent.provider_ref)
        assert verified is not None
        assert verified.status == "completed"
        db.refresh(user)
        assert float(user.balance) == 25.0
    finally:
        db.close()
