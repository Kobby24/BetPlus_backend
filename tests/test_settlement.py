def test_settlement_requires_admin(client):
    token_register = client.post(
        "/api/v1/auth/register",
        json={"name": "User", "email": "user@example.com", "password": "secret"},
    )
    assert token_register.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        data={"username": "user@example.com", "password": "secret"},
    )
    token = login.json()["access_token"]
    resp = client.post(
        "/api/v1/admin/settlement/run",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


def test_auto_settlement_credits_winner(client):
    from tests.helpers import (
        auth_headers,
        ensure_finished_game,
        ensure_open_game,
        promote_user,
        register_and_token,
    )

    user_token = register_and_token(client, "auto-settle-user@example.com")
    admin_token = register_and_token(client, "auto-settle-admin@example.com")
    promote_user("auto-settle-admin@example.com", is_admin=True)
    ensure_open_game(external_id="settle-m1", odds_home=2.0)

    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 20, "description": "seed"},
        headers=auth_headers(user_token),
    )
    placed = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 10,
            "selections": [
                {
                    "match_id": "settle-m1",
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

    ensure_finished_game(external_id="settle-m1", home_score=3, away_score=0, odds_home=2.0)

    run = client.post(
        "/api/v1/admin/settlement/run",
        headers=auth_headers(admin_token),
    )
    assert run.status_code == 200
    assert run.json()["settled"] >= 1

    me = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()
    assert me["balance"] == 30

    bets = client.get("/api/v1/bets/my", headers=auth_headers(user_token)).json()
    assert bets[0]["status"] == "won"


def test_double_settlement_does_not_double_pay(client):
    from tests.helpers import auth_headers, ensure_open_game, promote_user, register_and_token

    user_token = register_and_token(client, "double-settle-user@example.com")
    admin_token = register_and_token(client, "double-settle-admin@example.com")
    promote_user("double-settle-admin@example.com", is_admin=True)
    ensure_open_game("double-m1", odds_home=2.0)

    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 20, "description": "seed"},
        headers=auth_headers(user_token),
    )
    placed = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 10,
            "selections": [
                {
                    "match_id": "double-m1",
                    "home_team": "Arsenal",
                    "away_team": "Chelsea",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 2.0,
                }
            ],
        },
        headers=auth_headers(user_token),
    )
    assert placed.status_code == 201
    bet_id = placed.json()["id"]

    first = client.post(
        f"/api/v1/admin/bets/{bet_id}/settle",
        json={"status": "won"},
        headers=auth_headers(admin_token),
    )
    second = client.post(
        f"/api/v1/admin/bets/{bet_id}/settle",
        json={"status": "won"},
        headers=auth_headers(admin_token),
    )
    assert first.status_code == 200
    assert second.status_code == 400

    me = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()
    assert me["balance"] == 30
    txs = client.get(
        "/api/v1/wallet/transactions", headers=auth_headers(user_token)
    ).json()
    wins = [t for t in txs if t["type"] == "win"]
    assert len(wins) == 1
