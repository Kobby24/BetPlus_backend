from tests.helpers import auth_headers, promote_user, register_and_token


def test_normal_user_cannot_access_manager(client):
    token = register_and_token(client, "user-mgr-deny@example.com")
    resp = client.get("/api/v1/manager/matches", headers=auth_headers(token))
    assert resp.status_code == 403


def test_manager_can_create_and_update_match(client):
    token = register_and_token(client, "match-manager@example.com", name="Match Mgr")
    promote_user("match-manager@example.com", is_manager=True)

    created = client.post(
        "/api/v1/manager/matches",
        json={
            "home_team": "Alpha FC",
            "away_team": "Beta FC",
            "league": "Manual League",
            "sport": "football",
        },
        headers=auth_headers(token),
    )
    assert created.status_code == 201
    match_id = created.json()["match_id"]
    assert created.json()["managed"] is True

    updated = client.patch(
        f"/api/v1/manager/matches/{match_id}",
        json={"status": "won", "home_score": 2, "away_score": 1},
        headers=auth_headers(token),
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "won"
    assert updated.json()["home_score"] == 2

    listing = client.get("/api/v1/manager/matches", headers=auth_headers(token))
    assert listing.status_code == 200
    assert any(m["match_id"] == match_id for m in listing.json())


def test_admin_can_access_manager_endpoints(client):
    token = register_and_token(client, "admin-as-mgr@example.com")
    promote_user("admin-as-mgr@example.com", is_admin=True)
    resp = client.get("/api/v1/manager/matches", headers=auth_headers(token))
    assert resp.status_code == 200


def test_referral_tracking_on_deposit(client):
    mgr_token = register_and_token(client, "ref-manager@example.com", name="Ref Manager")
    promote_user("ref-manager@example.com", is_manager=True)

    me = client.get("/api/v1/auth/me", headers=auth_headers(mgr_token)).json()
    stats = client.get("/api/v1/manager/referrals", headers=auth_headers(mgr_token))
    assert stats.status_code == 200
    code = stats.json()["referral_code"]
    assert code

    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Referred",
            "email": "referred-user@example.com",
            "password": "secret",
            "referral_code": code,
        },
    )
    referred_token = client.post(
        "/api/v1/auth/login",
        data={"username": "referred-user@example.com", "password": "secret"},
    ).json()["access_token"]

    referred_me = client.get(
        "/api/v1/auth/me", headers=auth_headers(referred_token)
    ).json()
    assert referred_me["referred_by_manager_id"] == me["id"]

    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 100, "description": "referred deposit"},
        headers=auth_headers(referred_token),
    )

    after = client.get("/api/v1/manager/referrals", headers=auth_headers(mgr_token))
    assert after.status_code == 200
    body = after.json()
    assert body["signup_count"] == 1
    assert body["total_deposits"] == 100
    assert body["gross_revenue"] == 5
    assert body["manager_earnings"] == 2.5
