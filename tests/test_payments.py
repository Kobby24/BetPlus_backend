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
