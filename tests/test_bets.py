from tests.helpers import ensure_open_game


def register_and_token(client, email: str = "buser@example.com"):
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Bet User",
            "email": email,
            "password": "secret",
        },
    )
    resp = client.post(
        "/api/v1/auth/login", data={"username": email, "password": "secret"}
    )
    return resp.json().get("access_token")


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def seed_wallet(client, token: str, amount: float = 100):
    resp = client.post(
        "/api/v1/wallet/deposit",
        json={"amount": amount, "description": "seed"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200


def test_place_bet_and_list(client):
    token = register_and_token(client)
    seed_wallet(client, token)
    ensure_open_game("m1", odds_home=2.5)

    resp = client.post(
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
                    "odds": 2.5,
                    "league": "Premier League",
                }
            ],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    bet = resp.json()
    assert bet["stake"] == 10 or bet["stake"] == 10.0
    assert bet["booking_code"].startswith("BP")
    assert bet["ticket_id"]
    assert bet["verify_code"]
    assert "placed_at" in bet

    resp = client.get("/api/v1/bets/my", headers=auth_headers(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


def test_place_multi_leg_bet(client):
    token = register_and_token(client, "multi@example.com")
    seed_wallet(client, token, 200)
    ensure_open_game("m1", odds_home=2.1)
    ensure_open_game("m2", home="Liverpool", away="Manchester City", odds_home=2.8, odds_draw=3.5, odds_away=2.45)
    ensure_open_game("m3", home="Real Madrid", away="Barcelona", odds_home=2.1, odds_draw=3.6, odds_away=2.8)
    resp = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 25,
            "selections": [
                {
                    "match_id": "m1",
                    "home_team": "Arsenal",
                    "away_team": "Chelsea",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 2.1,
                    "league": "Premier League",
                },
                {
                    "match_id": "m2",
                    "home_team": "Liverpool",
                    "away_team": "Manchester City",
                    "selection": "draw",
                    "selection_label": "Draw",
                    "odds": 3.5,
                    "league": "Premier League",
                },
                {
                    "match_id": "m3",
                    "home_team": "Real Madrid",
                    "away_team": "Barcelona",
                    "selection": "away",
                    "selection_label": "Away",
                    "odds": 2.8,
                    "league": "La Liga",
                },
            ],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    bet = resp.json()
    assert len(bet["selections"]) == 3
    assert bet["bonus"] > 0
    expected_odds = 2.1 * 3.5 * 2.8
    assert abs(bet["total_odds"] - expected_odds) < 0.01


def test_place_bet_debits_balance_and_creates_transaction(client):
    token = register_and_token(client, "debit@example.com")
    seed_wallet(client, token, 100)
    ensure_open_game("m1", odds_home=2.0)

    me_before = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me_before["balance"] == 100

    resp = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 15,
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
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    booking_code = resp.json()["booking_code"]

    me_after = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me_after["balance"] == 85

    txs = client.get(
        "/api/v1/wallet/transactions", headers=auth_headers(token)
    ).json()
    bet_txs = [t for t in txs if t["type"] == "bet"]
    assert len(bet_txs) == 1
    assert bet_txs[0]["amount"] == -15 or bet_txs[0]["amount"] == -15.0
    assert booking_code in bet_txs[0]["description"]


def test_insufficient_balance_rejected(client):
    token = register_and_token(client, "nobalance@example.com")
    ensure_open_game("m1", odds_home=2.0)
    resp = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 50,
            "selections": [
                {
                    "match_id": "m1",
                    "home_team": "A",
                    "away_team": "B",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 2.0,
                    "league": "EPL",
                }
            ],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "Insufficient" in resp.json()["detail"]

    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 0

    bets = client.get("/api/v1/bets/my", headers=auth_headers(token)).json()
    assert len(bets) == 0


def test_invalid_selection_rejected(client):
    token = register_and_token(client, "invalidsel@example.com")
    seed_wallet(client, token)

    resp = client.post(
        "/api/v1/bets/place",
        json={"stake": 10, "selections": []},
        headers=auth_headers(token),
    )
    assert resp.status_code == 422

    bets = client.get("/api/v1/bets/my", headers=auth_headers(token)).json()
    assert len(bets) == 0


def test_unauthorized_bet_placement(client):
    resp = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 10,
            "selections": [
                {
                    "match_id": "m1",
                    "home_team": "A",
                    "away_team": "B",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 2.0,
                    "league": "EPL",
                }
            ],
        },
    )
    assert resp.status_code == 401


def test_get_bet_by_booking_code(client):
    token = register_and_token(client, "lookup@example.com")
    seed_wallet(client, token)
    ensure_open_game("m1", odds_home=1.5)
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
                    "odds": 1.5,
                    "league": "EPL",
                }
            ],
        },
        headers=auth_headers(token),
    ).json()

    resp = client.get(f"/api/v1/bets/code/{placed['booking_code']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == placed["id"]


def test_get_bet_by_verify_code(client):
    token = register_and_token(client, "verify@example.com")
    seed_wallet(client, token)
    ensure_open_game("m1", odds_home=1.5)
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
                    "odds": 1.5,
                    "league": "EPL",
                }
            ],
        },
        headers=auth_headers(token),
    ).json()

    resp = client.get(f"/api/v1/bets/verify/{placed['verify_code']}")
    assert resp.status_code == 200
    assert resp.json()["booking_code"] == placed["booking_code"]


def test_client_odds_are_ignored(client):
    token = register_and_token(client, "tamper@example.com")
    seed_wallet(client, token, 100)
    ensure_open_game("m1", odds_home=2.0)

    resp = client.post(
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
                    "odds": 99.0,
                    "league": "EPL",
                }
            ],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    bet = resp.json()
    assert abs(bet["total_odds"] - 2.0) < 0.001
    assert abs(bet["potential_win"] - 20.0) < 0.001
    assert abs(bet["selections"][0]["odds"] - 2.0) < 0.001


def test_unknown_match_rejected(client):
    token = register_and_token(client, "unknown-match@example.com")
    seed_wallet(client, token)
    resp = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 10,
            "selections": [
                {
                    "match_id": "does-not-exist",
                    "home_team": "A",
                    "away_team": "B",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 2.0,
                    "league": "EPL",
                }
            ],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 100


def test_closed_match_rejected(client):
    token = register_and_token(client, "closed-match@example.com")
    seed_wallet(client, token)
    from tests.helpers import ensure_finished_game

    ensure_finished_game("closed-m1", odds_home=2.0)
    resp = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 10,
            "selections": [
                {
                    "match_id": "closed-m1",
                    "home_team": "Arsenal",
                    "away_team": "Chelsea",
                    "selection": "home",
                    "selection_label": "Home",
                    "odds": 2.0,
                    "league": "EPL",
                }
            ],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


def test_idempotent_bet_placement(client):
    token = register_and_token(client, "idem@example.com")
    seed_wallet(client, token, 100)
    ensure_open_game("m1", odds_home=2.0)
    payload = {
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
    }
    headers = {**auth_headers(token), "Idempotency-Key": "same-click-1"}
    first = client.post("/api/v1/bets/place", json=payload, headers=headers)
    second = client.post("/api/v1/bets/place", json=payload, headers=headers)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    bets = client.get("/api/v1/bets/my", headers=auth_headers(token)).json()
    assert len(bets) == 1
    me = client.get("/api/v1/auth/me", headers=auth_headers(token)).json()
    assert me["balance"] == 90


def test_idempotency_key_conflict(client):
    token = register_and_token(client, "idem-conflict@example.com")
    seed_wallet(client, token, 100)
    ensure_open_game("m1", odds_home=2.0)
    headers = {**auth_headers(token), "Idempotency-Key": "same-click-2"}
    first = client.post(
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
                }
            ],
        },
        headers=headers,
    )
    assert first.status_code == 201
    conflict = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 20,
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
        headers=headers,
    )
    assert conflict.status_code == 409
