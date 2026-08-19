def register_and_token(client, email: str = "wuser@example.com"):
    client.post(
        "/api/v1/auth/register",
        json={"name": "Wallet User", "email": email, "password": "secret"},
    )
    resp = client.post(
        "/api/v1/auth/login", data={"username": email, "password": "secret"}
    )
    return resp.json().get("access_token")


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_deposit_withdraw_transactions(client):
    token = register_and_token(client)
    resp = client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 50, "description": "Test deposit"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    tx = resp.json()
    assert tx["amount"] == 50 or tx["amount"] == 50.0
    assert tx["type"] == "deposit"
    assert "created_at" in tx
    assert "id" in tx
    assert "user_id" in tx

    resp = client.post(
        "/api/v1/wallet/withdraw",
        json={"amount": 20, "description": "Test withdraw"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    tx = resp.json()
    assert tx["amount"] == -20 or tx["amount"] == -20.0
    assert tx["type"] == "withdraw"

    resp = client.get(
        "/api/v1/wallet/transactions", headers=auth_headers(token)
    )
    assert resp.status_code == 200
    txs = resp.json()
    assert isinstance(txs, list)
    assert len(txs) >= 2


def test_deposit_updates_balance(client):
    token = register_and_token(client, "balance@example.com")
    me_before = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert me_before.json()["balance"] == 0

    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 75, "description": "Top up"},
        headers=auth_headers(token),
    )
    me_after = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert me_after.json()["balance"] == 75


def test_insufficient_balance(client):
    token = register_and_token(client, "poor@example.com")
    resp = client.post(
        "/api/v1/wallet/withdraw",
        json={"amount": 10, "description": "Too much"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "Insufficient" in resp.json()["detail"]

    me = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert me.json()["balance"] == 0


def test_failed_withdrawal_does_not_modify_balance(client):
    token = register_and_token(client, "failwd@example.com")
    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 30, "description": "seed"},
        headers=auth_headers(token),
    )
    resp = client.post(
        "/api/v1/wallet/withdraw",
        json={"amount": 100, "description": "Too much"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400

    me = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert me.json()["balance"] == 30

    txs = client.get(
        "/api/v1/wallet/transactions", headers=auth_headers(token)
    ).json()
    assert len(txs) == 1
    assert txs[0]["type"] == "deposit"


def test_unauthorized_wallet_access(client):
    resp = client.get("/api/v1/wallet/transactions")
    assert resp.status_code == 401

    resp = client.post(
        "/api/v1/wallet/deposit", json={"amount": 10, "description": "x"}
    )
    assert resp.status_code == 401

    resp = client.post(
        "/api/v1/wallet/withdraw", json={"amount": 10, "description": "x"}
    )
    assert resp.status_code == 401


def test_invalid_amounts_rejected(client):
    token = register_and_token(client, "invalid@example.com")
    for amount in [0, -5]:
        resp = client.post(
            "/api/v1/wallet/deposit",
            json={"amount": amount, "description": "bad"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 422


def test_user_sees_only_own_transactions(client):
    token_a = register_and_token(client, "usera@example.com")
    token_b = register_and_token(client, "userb@example.com")

    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 40, "description": "A deposit"},
        headers=auth_headers(token_a),
    )
    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 60, "description": "B deposit"},
        headers=auth_headers(token_b),
    )

    txs_a = client.get(
        "/api/v1/wallet/transactions", headers=auth_headers(token_a)
    ).json()
    txs_b = client.get(
        "/api/v1/wallet/transactions", headers=auth_headers(token_b)
    ).json()

    assert len(txs_a) == 1
    assert txs_a[0]["description"] == "A deposit"
    assert len(txs_b) == 1
    assert txs_b[0]["description"] == "B deposit"
