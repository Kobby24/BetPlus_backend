from tests.helpers import auth_headers, promote_user, register_and_token


def test_normal_user_cannot_access_admin(client):
    token = register_and_token(client, "user-admin-deny@example.com")
    resp = client.get("/api/v1/admin/users", headers=auth_headers(token))
    assert resp.status_code == 403

    resp = client.get("/api/v1/admin/stats", headers=auth_headers(token))
    assert resp.status_code == 403

    resp = client.post("/api/v1/admin/settlement/run", headers=auth_headers(token))
    assert resp.status_code == 403


def test_manager_cannot_access_admin(client):
    token = register_and_token(client, "mgr-admin-deny@example.com")
    promote_user("mgr-admin-deny@example.com", is_manager=True)
    resp = client.get("/api/v1/admin/users", headers=auth_headers(token))
    assert resp.status_code == 403


def test_admin_lists_users_and_credits(client):
    user_token = register_and_token(client, "credit-target@example.com", name="Target")
    admin_token = register_and_token(client, "real-admin@example.com", name="Admin")
    promote_user("real-admin@example.com", is_admin=True)

    users = client.get("/api/v1/admin/users", headers=auth_headers(admin_token))
    assert users.status_code == 200
    emails = [u["email"] for u in users.json()]
    assert "credit-target@example.com" in emails

    target = next(u for u in users.json() if u["email"] == "credit-target@example.com")
    credit = client.post(
        f"/api/v1/admin/users/{target['id']}/credit",
        json={"amount": 40, "description": "Admin credit"},
        headers=auth_headers(admin_token),
    )
    assert credit.status_code == 200
    assert credit.json()["type"] == "deposit"

    me = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()
    assert me["balance"] == 40

    stats = client.get("/api/v1/admin/stats", headers=auth_headers(admin_token))
    assert stats.status_code == 200
    assert stats.json()["platform_balance"] >= 40

    ledger = client.get("/api/v1/admin/ledger", headers=auth_headers(admin_token))
    assert ledger.status_code == 200
    assert any(e["entry_type"] == "admin_credit" for e in ledger.json())


def test_admin_grant_manager_and_settle_bet(client):
    from tests.helpers import ensure_finished_game

    user_token = register_and_token(client, "settle-user@example.com")
    admin_token = register_and_token(client, "settle-admin@example.com")
    promote_user("settle-admin@example.com", is_admin=True)

    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 50, "description": "seed"},
        headers=auth_headers(user_token),
    )
    placed = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 10,
            "selections": [
                {
                    "match_id": "m1",
                    "home_team": "Arsenal",
                    "away_team": "Chelsea",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 2.0,
                    "league": "EPL",
                }
            ],
        },
        headers=auth_headers(user_token),
    )
    assert placed.status_code == 201
    bet_id = placed.json()["id"]

    settle = client.post(
        f"/api/v1/admin/bets/{bet_id}/settle",
        json={"status": "won"},
        headers=auth_headers(admin_token),
    )
    assert settle.status_code == 200
    assert settle.json()["status"] == "won"

    me = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()
    assert me["balance"] == 60

    ensure_finished_game()
    grant = client.patch(
        f"/api/v1/admin/users/{client.get('/api/v1/auth/me', headers=auth_headers(user_token)).json()['id']}",
        json={"is_manager": True},
        headers=auth_headers(admin_token),
    )
    assert grant.status_code == 200
    assert grant.json()["is_manager"] is True
    assert grant.json()["referral_code"]
