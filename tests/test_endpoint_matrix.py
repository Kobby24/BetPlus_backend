"""Direct tests for every public FastAPI route surface."""

from tests.helpers import auth_headers, ensure_open_game, promote_user, register_and_token


def _seed_wallet(client, token, amount=100):
    resp = client.post(
        "/api/v1/wallet/deposit",
        json={"amount": amount, "description": "seed"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200


def test_catalog_endpoints(client):
    ensure_open_game("m1")
    sports = client.get("/api/v1/catalog/sports")
    assert sports.status_code == 200
    assert isinstance(sports.json(), list)

    leagues = client.get("/api/v1/catalog/leagues")
    assert leagues.status_code == 200

    games = client.get("/api/v1/catalog/games")
    assert games.status_code == 200
    assert any(g["external_id"] == "m1" for g in games.json())

    football = client.get("/api/v1/catalog/games", params={"sport": "football"})
    assert football.status_code == 200

    one = client.get("/api/v1/catalog/games/m1")
    assert one.status_code == 200
    assert one.json()["home"] == "Arsenal"

    missing = client.get("/api/v1/catalog/games/does-not-exist")
    assert missing.status_code == 404


def test_payments_deposit_withdraw_get_and_idor(client):
    token_a = register_and_token(client, "pay-a@example.com")
    token_b = register_and_token(client, "pay-b@example.com")

    deposit = client.post(
        "/api/v1/payments/deposits",
        json={"amount": 35, "channel": "mobile_money"},
        headers=auth_headers(token_a),
    )
    assert deposit.status_code == 201
    body = deposit.json()
    assert body["status"] == "completed"
    assert "authorization_url" in body
    ref = body["provider_ref"]

    fetched = client.get(f"/api/v1/payments/{ref}", headers=auth_headers(token_a))
    assert fetched.status_code == 200
    assert fetched.json()["amount"] == 35

    idor = client.get(f"/api/v1/payments/{ref}", headers=auth_headers(token_b))
    assert idor.status_code == 404

    missing = client.get("/api/v1/payments/no-such-ref", headers=auth_headers(token_a))
    assert missing.status_code == 404

    me = client.get("/api/v1/auth/me", headers=auth_headers(token_a)).json()
    assert me["balance"] == 35

    withdraw = client.post(
        "/api/v1/payments/withdrawals",
        json={"amount": 10, "channel": "mobile_money", "destination": "0241111111"},
        headers=auth_headers(token_a),
    )
    assert withdraw.status_code == 201
    after = client.get("/api/v1/auth/me", headers=auth_headers(token_a)).json()
    assert after["balance"] == 25


def test_bets_lookup_errors_and_simple_place(client):
    token = register_and_token(client, "bet-matrix@example.com")
    _seed_wallet(client, token)
    ensure_open_game("m1", odds_home=2.0)

    unauthorized = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 5,
            "selections": [
                {
                    "match_id": "m1",
                    "home_team": "Arsenal",
                    "away_team": "Chelsea",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 2.0,
                }
            ],
        },
    )
    assert unauthorized.status_code == 401

    placed = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 5,
            "selections": [
                {
                    "match_id": "m1",
                    "home_team": "Arsenal",
                    "away_team": "Chelsea",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 99.0,
                    "league": "EPL",
                }
            ],
        },
        headers=auth_headers(token),
    )
    assert placed.status_code == 201
    bet = placed.json()
    assert bet["total_odds"] == 2.0
    assert client.get(f"/api/v1/bets/code/{bet['booking_code']}").status_code == 200
    assert client.get(f"/api/v1/bets/verify/{bet['verify_code']}").status_code == 200
    assert client.get("/api/v1/bets/code/NOPE").status_code == 404
    assert client.get("/api/v1/bets/verify/NOPE").status_code == 404

    simple = client.post(
        "/api/v1/bets/place/simple",
        json={"stake": 5, "odds": 1.5},
        headers=auth_headers(token),
    )
    assert simple.status_code in {201, 400}


def test_admin_and_manager_remaining_routes(client):
    user_token = register_and_token(client, "matrix-user@example.com")
    admin_token = register_and_token(client, "matrix-admin@example.com")
    mgr_token = register_and_token(client, "matrix-mgr@example.com")
    promote_user("matrix-admin@example.com", is_admin=True)
    promote_user("matrix-mgr@example.com", is_manager=True)
    user_id = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()["id"]

    assert client.get("/api/v1/admin/users/missing", headers=auth_headers(admin_token)).status_code == 404
    user = client.get(f"/api/v1/admin/users/{user_id}", headers=auth_headers(admin_token))
    assert user.status_code == 200

    txs = client.get(
        f"/api/v1/admin/users/{user_id}/transactions",
        headers=auth_headers(admin_token),
    )
    assert txs.status_code == 200
    bets = client.get(
        f"/api/v1/admin/users/{user_id}/bets",
        headers=auth_headers(admin_token),
    )
    assert bets.status_code == 200
    assert client.get("/api/v1/admin/bets", headers=auth_headers(admin_token)).status_code == 200
    assert client.get("/api/v1/admin/audit", headers=auth_headers(admin_token)).status_code == 200
    assert client.get("/api/v1/admin/referrals", headers=auth_headers(admin_token)).status_code == 200
    assert client.get(
        "/api/v1/admin/referrals/missing", headers=auth_headers(admin_token)
    ).status_code == 404

    created = client.post(
        "/api/v1/manager/matches",
        json={"home_team": "Gamma", "away_team": "Delta", "league": "Manual"},
        headers=auth_headers(mgr_token),
    )
    assert created.status_code == 201
    match_id = created.json()["match_id"]
    assert client.post(
        f"/api/v1/manager/matches/{match_id}/control",
        headers=auth_headers(mgr_token),
    ).status_code == 200
    assert client.delete(
        f"/api/v1/manager/matches/{match_id}/control",
        headers=auth_headers(mgr_token),
    ).status_code == 400
    assert client.get("/api/v1/manager/audit", headers=auth_headers(mgr_token)).status_code == 200
    deleted = client.delete(
        f"/api/v1/manager/matches/{match_id}",
        headers=auth_headers(mgr_token),
    )
    assert deleted.status_code == 200

    assert client.get("/api/v1/manager/matches", headers=auth_headers(user_token)).status_code == 403
    assert client.get("/api/v1/admin/stats", headers=auth_headers(user_token)).status_code == 403
    assert client.get("/api/v1/admin/bets/missing", headers=auth_headers(admin_token)).status_code == 404


def test_legacy_auth_alias(client):
    resp = client.post(
        "/api/auth/register",
        json={"name": "Legacy", "email": "legacy-alias@example.com", "password": "secret1"},
    )
    assert resp.status_code == 201
    login = client.post(
        "/api/auth/login",
        data={"username": "legacy-alias@example.com", "password": "secret1"},
    )
    assert login.status_code == 200
