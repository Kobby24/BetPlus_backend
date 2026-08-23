import bcrypt

from app.core.security import (
    get_password_hash,
    verify_and_update_password,
    verify_password,
)


def test_short_password_hashes_with_argon2():
    hashed = get_password_hash("secret1")
    assert hashed.startswith("$argon2")
    assert len(hashed) < 255
    assert verify_password("secret1", hashed)
    assert not verify_password("wrong", hashed)


def test_unicode_password_hashes_and_verifies():
    password = "pässwörd-测试-🔐"
    hashed = get_password_hash(password)
    assert verify_password(password, hashed)
    assert not verify_password("pässwörd", hashed)


def test_long_password_hashes_without_truncation():
    password = "A" * 200
    hashed = get_password_hash(password)
    assert verify_password(password, hashed)
    assert not verify_password("A" * 72, hashed)
    assert not verify_password("A" * 199, hashed)


def test_legacy_bcrypt_hashes_verify_and_upgrade():
    legacy = bcrypt.hashpw(b"secret1", bcrypt.gensalt()).decode()
    assert legacy.startswith("$2")
    assert verify_password("secret1", legacy)
    ok, updated = verify_and_update_password("secret1", legacy)
    assert ok is True
    assert updated is not None
    assert updated.startswith("$argon2")
    assert verify_password("secret1", updated)


def test_unknown_hash_does_not_raise():
    assert verify_password("secret1", "not-a-real-hash") is False
    ok, updated = verify_and_update_password("secret1", "not-a-real-hash")
    assert ok is False
    assert updated is None
