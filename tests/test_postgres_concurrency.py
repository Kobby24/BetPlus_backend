import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db_url import normalize_database_url
from app.db.base import Base
from app.db.session import get_db
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.services.catalog_service import build_seed_markets

pytestmark = pytest.mark.skipif(
    not os.environ.get("POSTGRES_TEST_URL"),
    reason="PostgreSQL concurrency tests require POSTGRES_TEST_URL",
)


def _make_client():
    url = normalize_database_url(os.environ["POSTGRES_TEST_URL"], environment="test")
    engine = create_engine(url, pool_pre_ping=True)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    from app.main import app

    app.dependency_overrides[get_db] = override_get_db
    return engine, app, TestingSession


def _register(client: TestClient, email: str) -> str:
    client.post(
        "/api/v1/auth/register",
        json={"name": "PG User", "email": email, "password": "secret"},
    )
    token = client.post(
        "/api/v1/auth/login", data={"username": email, "password": "secret"}
    ).json()["access_token"]
    return token


def _seed_game(TestingSession, external_id: str = "pg-m1"):
    db = TestingSession()
    try:
        sport = Sport(name="Football", slug="football")
        db.add(sport)
        db.flush()
        league = League(sport_id=sport.id, name="Premier League", slug="epl")
        db.add(league)
        db.flush()
        db.add(
            Game(
                external_id=external_id,
                league_id=league.id,
                home="Arsenal",
                away="Chelsea",
                status="scheduled",
                odds_home=2.0,
                odds_draw=3.4,
                odds_away=3.2,
                markets=build_seed_markets("Arsenal", "Chelsea", 2.0, 3.4, 3.2),
            )
        )
        db.commit()
    finally:
        db.close()


def test_concurrent_withdrawals_do_not_overdraft():
    engine, app, _ = _make_client()
    try:
        with TestClient(app) as client:
            token = _register(client, "pg-withdraw@example.com")
            headers = {"Authorization": f"Bearer {token}"}
            client.post(
                "/api/v1/wallet/deposit",
                json={"amount": 100, "description": "seed"},
                headers=headers,
            )

            def withdraw():
                with TestClient(app) as inner:
                    return inner.post(
                        "/api/v1/wallet/withdraw",
                        json={"amount": 80, "description": "race"},
                        headers=headers,
                    ).status_code

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: withdraw(), range(2)))

            assert sorted(results) == [200, 400]
            me = client.get("/api/v1/auth/me", headers=headers).json()
            assert me["balance"] == 20
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_concurrent_bets_do_not_overdraft():
    engine, app, TestingSession = _make_client()
    try:
        _seed_game(TestingSession)
        with TestClient(app) as client:
            token = _register(client, "pg-bet@example.com")
            headers = {"Authorization": f"Bearer {token}"}
            client.post(
                "/api/v1/wallet/deposit",
                json={"amount": 100, "description": "seed"},
                headers=headers,
            )

            payload = {
                "stake": 80,
                "selections": [
                    {
                        "match_id": "pg-m1",
                        "home_team": "Arsenal",
                        "away_team": "Chelsea",
                        "selection": "home",
                        "selection_label": "Home",
                        "odds": 2.0,
                    }
                ],
            }

            def place():
                with TestClient(app) as inner:
                    return inner.post(
                        "/api/v1/bets/place", json=payload, headers=headers
                    ).status_code

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: place(), range(2)))

            assert 201 in results
            assert 400 in results
            me = client.get("/api/v1/auth/me", headers=headers).json()
            assert me["balance"] == 20
            bets = client.get("/api/v1/bets/my", headers=headers).json()
            assert len(bets) == 1
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
