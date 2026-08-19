import secrets
import string

BOOKING_PREFIX = "BP"
VERIFY_PREFIX = "GH"
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _random_code(length: int) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def generate_booking_code(existing: set[str]) -> str:
    for _ in range(50):
        code = BOOKING_PREFIX + _random_code(6)
        if code not in existing:
            return code
    raise RuntimeError("Unable to generate unique booking code")


def generate_ticket_id() -> str:
    return str(secrets.randbelow(900000) + 100000)


def generate_verify_code() -> str:
    return VERIFY_PREFIX + _random_code(16)
