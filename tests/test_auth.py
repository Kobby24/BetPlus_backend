def test_register_login_and_me(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Test User",
            "email": "testuser@example.com",
            "phone": "+233241234567",
            "password": "secret",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "testuser@example.com"
    assert data["name"] == "Test User"
    assert "hashed_password" not in data
    assert isinstance(data["id"], str)

    resp = client.post(
        "/api/v1/auth/login",
        data={"username": "testuser@example.com", "password": "secret"},
    )
    assert resp.status_code == 200
    token = resp.json().get("access_token")
    assert token

    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "testuser@example.com"


def test_login_with_phone(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Phone User",
            "email": "phoneuser@example.com",
            "phone": "+233209998877",
            "password": "secret",
        },
    )
    resp = client.post(
        "/api/v1/auth/login",
        data={"username": "+233209998877", "password": "secret"},
    )
    assert resp.status_code == 200


def test_update_profile_and_password(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Profile User",
            "email": "profile@example.com",
            "password": "secret",
        },
    )
    token = client.post(
        "/api/v1/auth/login",
        data={"username": "profile@example.com", "password": "secret"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.patch(
        "/api/v1/auth/me",
        json={"name": "Updated Name", "phone": "+233200000111"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"
    assert resp.json()["phone"] == "+233200000111"

    bad = client.post(
        "/api/v1/auth/me/password",
        json={"current_password": "wrong", "new_password": "newsecret"},
        headers=headers,
    )
    assert bad.status_code == 400

    ok = client.post(
        "/api/v1/auth/me/password",
        json={"current_password": "secret", "new_password": "newsecret"},
        headers=headers,
    )
    assert ok.status_code == 200
    assert "hashed_password" not in ok.json()

    relogin = client.post(
        "/api/v1/auth/login",
        data={"username": "profile@example.com", "password": "newsecret"},
    )
    assert relogin.status_code == 200


def test_settings_persist(client):
    client.post(
        "/api/v1/auth/register",
        json={"name": "Settings User", "email": "settings@example.com", "password": "secret"},
    )
    token = client.post(
        "/api/v1/auth/login",
        data={"username": "settings@example.com", "password": "secret"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.patch(
        "/api/v1/auth/me/settings",
        json={"managerMode": True, "oddsFormat": "fractional"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["settings"]["managerMode"] is True
    assert resp.json()["settings"]["oddsFormat"] == "fractional"

    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["settings"]["managerMode"] is True


def test_weak_password_rejected(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Weak", "email": "weak@example.com", "password": "123"},
    )
    assert resp.status_code == 422


def test_invalid_login_rejected(client):
    client.post(
        "/api/v1/auth/register",
        json={"name": "Lock", "email": "lock@example.com", "password": "secret"},
    )
    resp = client.post(
        "/api/v1/auth/login",
        data={"username": "lock@example.com", "password": "wrong"},
    )
    assert resp.status_code == 401
