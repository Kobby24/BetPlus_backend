"""Live verification against the configured DATABASE_URL.

Creates one timestamped user only. Does not truncate or reset existing data.
Run from backend/:  py -m scripts.live_verify
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["SEED_DEMO_USERS"] = "false"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import inspect, text  # noqa: E402

from app.core.config import get_settings, reset_settings_cache  # noqa: E402
from app.db.session import engine, reconfigure_engine  # noqa: E402

reset_settings_cache()
reconfigure_engine()

from app.main import app  # noqa: E402


def _redact_url(url: str) -> str:
    if "@" not in url:
        return url.split("?")[0]
    scheme, rest = url.split("://", 1)
    host = rest.split("@", 1)[-1].split("?")[0]
    return f"{scheme}://***@{host}"


def main() -> int:
    reset_settings_cache()
    reconfigure_engine()
    settings = get_settings()
    url = settings.sqlalchemy_database_url
    print("environment:", settings.environment)
    print("database:", _redact_url(url))
    print("payments_mode:", settings.payments_mode)
    dialect = engine.dialect.name
    print("dialect:", dialect)

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        inspector = inspect(conn)
        tables = sorted(inspector.get_table_names())
        print("tables:", ", ".join(tables))
        try:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            print("alembic_version:", version)
        except Exception as exc:
            print("alembic_version: unavailable", type(exc).__name__)
        if "users" in tables:
            users = conn.execute(text("SELECT count(*) FROM users")).scalar()
            print("users:", users)

    stamp = int(time.time())
    email = f"live-verify-{stamp}@example.com"
    password = "secret1"
    results: list[tuple[str, str, int]] = []

    with TestClient(app) as client:
        health = client.get("/health/")
        results.append(("health", "GET /health/", health.status_code))
        ready = client.get("/health/ready")
        results.append(("ready", "GET /health/ready", ready.status_code))

        register = client.post(
            "/api/v1/auth/register",
            json={"name": "Live Verify", "email": email, "password": password, "phone": f"+23320{stamp % 10000000:07d}"},
        )
        results.append(("register", "POST /api/v1/auth/register", register.status_code))
        if register.status_code != 201:
            print("register body:", register.text[:500])

        login = client.post(
            "/api/v1/auth/login",
            data={"username": email, "password": password},
        )
        results.append(("login", "POST /api/v1/auth/login", login.status_code))
        token = (login.json() or {}).get("access_token") if login.status_code == 200 else None
        headers = {"Authorization": f"Bearer {token}"} if token else {}

        me = client.get("/api/v1/auth/me", headers=headers)
        results.append(("me", "GET /api/v1/auth/me", me.status_code))

        deposit = client.post(
            "/api/v1/payments/deposits",
            json={"amount": 20, "channel": "mobile_money"},
            headers=headers,
        )
        results.append(("deposit", "POST /api/v1/payments/deposits", deposit.status_code))

        me_after = client.get("/api/v1/auth/me", headers=headers)
        results.append(("me_after_deposit", "GET /api/v1/auth/me", me_after.status_code))
        if me_after.status_code == 200:
            print("balance_after_deposit:", me_after.json().get("balance"))

        catalog = client.get("/api/v1/catalog/games")
        results.append(("catalog", "GET /api/v1/catalog/games", catalog.status_code))

        games = catalog.json() if catalog.status_code == 200 else []
        if games:
            game = games[0]
            bet = client.post(
                "/api/v1/bets/place",
                json={
                    "stake": 5,
                    "selections": [
                        {
                            "match_id": game.get("external_id"),
                            "home_team": game.get("home"),
                            "away_team": game.get("away"),
                            "selection": "home",
                            "selection_label": game.get("home") or "Home",
                            "odds": game.get("odds_home") or 2.0,
                            "league": game.get("league_name") or "",
                        }
                    ],
                },
                headers=headers,
            )
            results.append(("place_bet", "POST /api/v1/bets/place", bet.status_code))
            if bet.status_code not in {201, 400}:
                print("place_bet body:", bet.text[:500])
        else:
            results.append(("place_bet", "POST /api/v1/bets/place", 0))

        txs = client.get("/api/v1/wallet/transactions", headers=headers)
        results.append(("transactions", "GET /api/v1/wallet/transactions", txs.status_code))

        duplicate = client.post(
            "/api/v1/auth/register",
            json={"name": "Live Verify", "email": email, "password": password},
        )
        results.append(("duplicate_register", "POST /api/v1/auth/register", duplicate.status_code))

        bad_login = client.post(
            "/api/v1/auth/login",
            data={"username": email, "password": "wrong-password"},
        )
        results.append(("bad_login", "POST /api/v1/auth/login", bad_login.status_code))

        unauth = client.get("/api/v1/auth/me")
        results.append(("unauth_me", "GET /api/v1/auth/me", unauth.status_code))

    print(json.dumps([{"name": n, "endpoint": e, "status": s} for n, e, s in results], indent=2))
    expected = {
        "health": 200,
        "ready": 200,
        "register": 201,
        "login": 200,
        "me": 200,
        "deposit": 201,
        "me_after_deposit": 200,
        "catalog": 200,
        "transactions": 200,
        "duplicate_register": 400,
        "bad_login": 401,
        "unauth_me": 401,
    }
    failed = [
        name
        for name, _endpoint, status in results
        if name in expected and status != expected[name]
    ]
    if failed:
        print("FAILED:", ", ".join(failed))
        return 1
    print("LIVE_VERIFY_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
