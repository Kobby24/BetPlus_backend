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


def test_duplicate_email_rejected(client):
    payload = {"name": "Dup", "email": "dup@example.com", "password": "secret1"}
    first = client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 201
    second = client.post("/api/v1/auth/register", json=payload)
    assert second.status_code == 400
    assert "already" in second.json()["detail"].lower()


def test_missing_and_invalid_registration_rejected(client):
    missing = client.post("/api/v1/auth/register", json={"name": "X", "password": "secret1"})
    assert missing.status_code == 422

    invalid_email = client.post(
        "/api/v1/auth/register",
        json={"name": "X", "email": "not-an-email", "password": "secret1"},
    )
    assert invalid_email.status_code == 422


def test_unicode_and_long_passwords_register_and_login(client):
    unicode_email = "unicode-user@example.com"
    unicode_password = "pässwörd-测试-🔐"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Unicode", "email": unicode_email, "password": unicode_password},
    )
    assert resp.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        data={"username": unicode_email, "password": unicode_password},
    )
    assert login.status_code == 200
    assert login.json()["access_token"]

    long_email = "long-pass@example.com"
    long_password = "L" * 200
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Long", "email": long_email, "password": long_password},
    )
    assert resp.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        data={"username": long_email, "password": long_password},
    )
    assert login.status_code == 200

    too_long = client.post(
        "/api/v1/auth/register",
        json={"name": "TooLong", "email": "toolong@example.com", "password": "L" * 300},
    )
    assert too_long.status_code == 422


def test_login_requires_form_urlencoded_not_json(client):
    client.post(
        "/api/v1/auth/register",
        json={"name": "Form", "email": "form@example.com", "password": "secret1"},
    )
    json_login = client.post(
        "/api/v1/auth/login",
        json={"username": "form@example.com", "password": "secret1"},
    )
    assert json_login.status_code == 422

    form_login = client.post(
        "/api/v1/auth/login",
        data={"username": "form@example.com", "password": "secret1"},
    )
    assert form_login.status_code == 200


def test_me_rejects_missing_and_invalid_tokens(client):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"}
    ).status_code == 401


def test_legacy_bcrypt_user_can_login_and_hash_is_upgraded(client):
    import bcrypt
    from app.db.session import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        user = User(
            name="Legacy",
            email="legacy-hash@example.com",
            hashed_password=bcrypt.hashpw(b"secret1", bcrypt.gensalt()).decode(),
        )
        db.add(user)
        db.commit()
        user_id = user.id
    finally:
        db.close()

    login = client.post(
        "/api/v1/auth/login",
        data={"username": "legacy-hash@example.com", "password": "secret1"},
    )
    assert login.status_code == 200

    db = SessionLocal()
    try:
        stored = db.get(User, user_id)
        assert stored is not None
        assert stored.hashed_password.startswith("$argon2")
    finally:
        db.close()

