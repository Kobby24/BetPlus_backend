from datetime import datetime, timedelta, timezone

from jose import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

from app.core.config import get_settings

# New passwords are hashed with argon2id. Existing bcrypt hashes (from the
# previous passlib backend) still verify, then upgrade on login.
#
# Do not use passlib CryptContext(schemes=["bcrypt"]) with bcrypt>=4.1: passlib
# 1.7.4 probes a 72+ byte password during wrap-bug detection, bcrypt 4.1+/5.x
# raises ValueError, and hashing fails even for short passwords.
_password_hash = PasswordHash((Argon2Hasher(), BcryptHasher()))


def get_password_hash(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _password_hash.verify(plain, hashed)
    except (UnknownHashError, ValueError, TypeError):
        return False


def verify_and_update_password(plain: str, hashed: str) -> tuple[bool, str | None]:
    """Return (ok, new_hash_or_None). new_hash is set when a legacy hash should be upgraded."""
    try:
        return _password_hash.verify_and_update(plain, hashed)
    except (UnknownHashError, ValueError, TypeError):
        return False, None


def create_access_token(
    data: dict,
    expires_delta: int | None = None,
) -> str:
    settings = get_settings()
    to_encode = data.copy()
    expire_minutes = expires_delta or settings.access_token_expire_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.jwt_algorithm],
    )
