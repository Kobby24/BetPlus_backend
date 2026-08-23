import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path

import httpx
import pytest

from app.db.session import SessionLocal
from app.models.game import Game
from app.services.bet_service import SettlementService
from app.services.sportybet_client import (
    SportyBetUpstreamError,
    fetch_important_events,
    sportybet_headers,
    validate_facts_payload,
)
from app.services.sportybet_sync import (
    parse_event,
    parse_start_time,
    public_match_id,
    sync_sportybet_payload,
)
from tests.helpers import auth_headers, register_and_token

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sportybet_important_events.json"
EXAMPLE_EVENT_ID = "sr:match:73761144"
EXAMPLE_GAME_ID = "33400"
EXAMPLE_PUBLIC_ID = public_match_id(EXAMPLE_EVENT_ID, EXAMPLE_GAME_ID)
SYNC_URL = "/api/v1/catalog/sync/sportybet"


def load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def reset_imported_games() -> None:
    db = SessionLocal()
    try:
        db.query(Game).filter(Game.external_event_id.isnot(None)).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture
def clean_imported_games():
    reset_imported_games()
    yield
    reset_imported_games()


def _count_example_games() -> int:
    db = SessionLocal()
    try:
        return (
            db.query(Game)
            .filter(
                Game.external_event_id == EXAMPLE_EVENT_ID,
                Game.external_game_id == EXAMPLE_GAME_ID,
            )
            .count()
        )
    finally:
        db.close()


class DummyResponse:
    def __init__(self, status_code: int, payload=None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or ("" if payload is None else json.dumps(payload))

    def json(self):
        if self._payload is None:
            raise json.JSONDecodeError("Expecting value", self.text or "x", 0)
        return self._payload


class DummyAsyncClient:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    async def get(self, *args, **kwargs):
        self.calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        if callable(self.result):
            return self.result(self.calls)
        return self.result


def test_parse_start_time_is_timezone_aware():
    starts = parse_start_time({"estimateStartTime": 1787479200000})
    assert starts is not None
    assert starts.tzinfo is not None
    assert starts.year >= 2026


def test_validate_payload_rejects_invalid_json_shape():
    with pytest.raises(SportyBetUpstreamError, match="not an object"):
        validate_facts_payload([])
    with pytest.raises(SportyBetUpstreamError, match="missing data"):
        validate_facts_payload({"bizCode": 10000})
    with pytest.raises(SportyBetUpstreamError, match="bizCode"):
        validate_facts_payload({"bizCode": 500, "data": []})


def test_parse_event_requires_identifiers():
    with pytest.raises(Exception, match="eventId"):
        parse_event({"gameId": "33400", "homeTeamName": "A", "awayTeamName": "B"})
    with pytest.raises(Exception, match="gameId"):
        parse_event({"eventId": "sr:match:1", "homeTeamName": "A", "awayTeamName": "B"})


def test_headers_work_when_settings_lack_sportybet_fields():
    headers = sportybet_headers(object())
    assert headers["Clientid"] == "web"
    assert headers["Operid"] == "3"
    assert headers["Platform"] == "web"
    assert "Mozilla" in headers["User-Agent"]


def test_fetch_uses_defaults_when_settings_lack_sportybet_fields():
    dummy = DummyAsyncClient(DummyResponse(200, payload={"bizCode": 10000, "data": []}))
    payload = asyncio.run(fetch_important_events(settings=object(), client=dummy))
    assert payload["bizCode"] == 10000
    assert dummy.calls == 1


def test_client_timeout(monkeypatch):
    monkeypatch.setattr(
        "app.services.sportybet_client.get_settings",
        lambda: type(
            "S",
            (),
            {
                "sportybet_facts_url": "https://example.test/facts",
                "sportybet_sport_id": "sr:sport:1",
                "sportybet_timeout_seconds": 1.0,
                "sportybet_retry_attempts": 2,
                "sportybet_client_id": "web",
                "sportybet_oper_id": "3",
                "sportybet_referer": "https://www.sportybet.com/gh/",
                "sportybet_user_agent": "pytest",
            },
        )(),
    )
    dummy = DummyAsyncClient(httpx.TimeoutException("slow"))
    with pytest.raises(SportyBetUpstreamError, match="timed out") as exc:
        asyncio.run(fetch_important_events(client=dummy))
    assert exc.value.status_code == 504
    assert dummy.calls == 2


def _client_settings():
    return type(
        "S",
        (),
        {
            "sportybet_facts_url": "https://example.test/facts",
            "sportybet_sport_id": "sr:sport:1",
            "sportybet_timeout_seconds": 1.0,
            "sportybet_retry_attempts": 2,
            "sportybet_client_id": "web",
            "sportybet_oper_id": "3",
            "sportybet_referer": "https://www.sportybet.com/gh/",
            "sportybet_user_agent": "pytest",
        },
    )()


def test_client_http_errors_and_invalid_json():
    dummy_500 = DummyAsyncClient(DummyResponse(503, text="nope"))
    with pytest.raises(SportyBetUpstreamError, match="HTTP 503"):
        asyncio.run(fetch_important_events(settings=_client_settings(), client=dummy_500))

    dummy_400 = DummyAsyncClient(DummyResponse(403, text="denied"))
    with pytest.raises(SportyBetUpstreamError, match="HTTP 403"):
        asyncio.run(fetch_important_events(settings=_client_settings(), client=dummy_400))
    assert dummy_400.calls == 1

    dummy_json = DummyAsyncClient(DummyResponse(200, payload=None, text="<html>"))
    with pytest.raises(SportyBetUpstreamError, match="invalid JSON"):
        asyncio.run(fetch_important_events(settings=_client_settings(), client=dummy_json))


def test_successful_import_and_catalog_shape(clean_imported_games):
    payload = load_fixture()
    db = SessionLocal()
    try:
        summary = sync_sportybet_payload(db, payload)
        assert summary["fetched"] == 4
        assert summary["created"] >= 2
        assert summary["skipped_invalid"] == 2
        reasons = {item["reason"] for item in summary["skipped"]}
        assert "missing eventId" in reasons
        assert "missing gameId" in reasons

        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == EXAMPLE_EVENT_ID,
                Game.external_game_id == EXAMPLE_GAME_ID,
            )
            .one()
        )
        assert game.external_id == EXAMPLE_PUBLIC_ID
        assert game.home == "Arsenal"
        assert game.away == "Chelsea"
        assert game.status == "scheduled"
        assert float(game.odds_home) == 2.15
        market_ids = {m["id"] for m in (game.markets or [])}
        assert "1x2" in market_ids
        assert "ou25" in market_ids
        assert not any("Correct Score" in (m.get("name") or "") for m in game.markets or [])

        live = (
            db.query(Game)
            .filter(Game.external_event_id == "sr:match:73761145")
            .one()
        )
        assert live.status == "live"
        assert live.is_live == 1
        assert live.home_score == 1
        assert live.away_score == 0
        assert live.live_minute == 34
    finally:
        db.close()


def test_duplicate_detection_does_not_insert_second_row(clean_imported_games):
    db = SessionLocal()
    try:
        from app.models.league import League
        from app.models.sport import Sport

        sport = db.query(Sport).filter(Sport.slug == "football").first()
        if not sport:
            sport = Sport(name="Football", slug="football")
            db.add(sport)
            db.flush()
        league = db.query(League).filter(League.slug == "epl").first()
        if not league:
            league = League(sport_id=sport.id, name="Premier League", slug="epl")
            db.add(league)
            db.flush()
        db.add(
            Game(
                external_id="preexisting-sporty",
                external_event_id=EXAMPLE_EVENT_ID,
                external_game_id=EXAMPLE_GAME_ID,
                league_id=league.id,
                home="Arsenal",
                away="Chelsea",
                status="scheduled",
                odds_home=9.99,
            )
        )
        db.commit()
    finally:
        db.close()

    db = SessionLocal()
    try:
        summary = sync_sportybet_payload(db, load_fixture())
        assert summary["created"] >= 1
        assert _count_example_games() == 1
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == EXAMPLE_EVENT_ID,
                Game.external_game_id == EXAMPLE_GAME_ID,
            )
            .one()
        )
        assert game.external_id == "preexisting-sporty"
        assert float(game.odds_home) == 2.15
    finally:
        db.close()


def test_idempotent_second_sync_creates_zero(clean_imported_games):
    payload = load_fixture()
    db = SessionLocal()
    try:
        first = sync_sportybet_payload(db, payload)
        second = sync_sportybet_payload(db, payload)
        assert first["created"] >= 2
        assert second["created"] == 0
        assert second["skipped_existing"] + second["updated"] >= first["created"]
        assert _count_example_games() == 1
        assert (
            db.query(Game)
            .filter(Game.external_event_id.isnot(None))
            .count()
            == db.query(Game.external_event_id, Game.external_game_id)
            .filter(Game.external_event_id.isnot(None))
            .distinct()
            .count()
        )
    finally:
        db.close()


def test_existing_game_status_and_score_update(clean_imported_games):
    payload = load_fixture()
    db = SessionLocal()
    try:
        sync_sportybet_payload(db, payload)
        updated_payload = deepcopy(payload)
        event = updated_payload["data"][0]["events"][0]
        event["matchStatus"] = "Ended"
        event["status"] = 3
        event["homeScore"] = 2
        event["awayScore"] = 1
        event["markets"][0]["outcomes"][0]["odds"] = "2.40"
        summary = sync_sportybet_payload(db, updated_payload)
        assert summary["created"] == 0
        assert summary["updated"] >= 1
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == EXAMPLE_EVENT_ID,
                Game.external_game_id == EXAMPLE_GAME_ID,
            )
            .one()
        )
        assert game.external_event_id == EXAMPLE_EVENT_ID
        assert game.external_game_id == EXAMPLE_GAME_ID
        assert game.status == "finished"
        assert game.home_score == 2
        assert game.away_score == 1
        assert float(game.odds_home) == 2.40
    finally:
        db.close()


def test_protected_manual_fields_are_not_overwritten(clean_imported_games):
    payload = load_fixture()
    db = SessionLocal()
    try:
        sync_sportybet_payload(db, payload)
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == EXAMPLE_EVENT_ID,
                Game.external_game_id == EXAMPLE_GAME_ID,
            )
            .one()
        )
        game.manager_controlled = True
        game.manager_note = "keep this"
        game.odds_home = 9.99
        game.status = "scheduled"
        db.add(game)
        db.commit()

        changed = deepcopy(payload)
        changed["data"][0]["events"][0]["matchStatus"] = "Ended"
        changed["data"][0]["events"][0]["markets"][0]["outcomes"][0]["odds"] = "1.11"
        summary = sync_sportybet_payload(db, changed)
        assert summary["skipped_protected"] >= 1
        db.refresh(game)
        assert float(game.odds_home) == 9.99
        assert game.manager_note == "keep this"
        assert game.status == "scheduled"
        assert game.external_id == EXAMPLE_PUBLIC_ID
    finally:
        db.close()


def test_concurrent_sync_does_not_duplicate(clean_imported_games):
    payload = load_fixture()

    def _run():
        db = SessionLocal()
        try:
            return sync_sportybet_payload(db, deepcopy(payload))
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(_run)
        second = pool.submit(_run)
        first.result()
        second.result()

    assert _count_example_games() == 1
    db = SessionLocal()
    try:
        imported = (
            db.query(Game)
            .filter(Game.external_event_id.in_([EXAMPLE_EVENT_ID, "sr:match:73761145"]))
            .count()
        )
        assert imported == 2
    finally:
        db.close()


def test_endpoint_is_public(client, monkeypatch, clean_imported_games):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_important_events", fake_fetch)
    resp = client.post(SYNC_URL)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_endpoint_success_and_catalog_read(client, monkeypatch, clean_imported_games):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_important_events", fake_fetch)

    resp = client.post(SYNC_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["source"] == "sportybet"
    assert body["fetched"] == 4
    assert body["created"] >= 2
    assert body["skipped_invalid"] == 2

    catalog = client.get("/api/v1/catalog/games")
    assert catalog.status_code == 200
    games = catalog.json()
    match = next(g for g in games if g["external_id"] == EXAMPLE_PUBLIC_ID)
    assert match["home"] == "Arsenal"
    assert match["away"] == "Chelsea"
    assert match["sport"] == "football"
    assert match["league_name"] == "Premier League"
    assert any(m["id"] == "1x2" for m in match["markets"])

    one = client.get(f"/api/v1/catalog/games/{EXAMPLE_PUBLIC_ID}")
    assert one.status_code == 200
    assert one.json()["odds_home"] == 2.15


def test_endpoint_upstream_errors(client, monkeypatch):
    async def timeout(*args, **kwargs):
        raise SportyBetUpstreamError("Upstream request timed out", status_code=504)

    monkeypatch.setattr("app.api.v1.catalog.fetch_important_events", timeout)
    assert client.post(SYNC_URL).status_code == 504

    async def bad_json(*args, **kwargs):
        raise SportyBetUpstreamError("Upstream returned invalid JSON")

    monkeypatch.setattr("app.api.v1.catalog.fetch_important_events", bad_json)
    assert client.post(SYNC_URL).status_code == 502

    async def upstream_500(*args, **kwargs):
        raise SportyBetUpstreamError("Upstream returned HTTP 500")

    monkeypatch.setattr("app.api.v1.catalog.fetch_important_events", upstream_500)
    assert client.post(SYNC_URL).status_code == 502


def test_imported_game_settlement_compatibility(client, monkeypatch, clean_imported_games):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_important_events", fake_fetch)
    user_token = register_and_token(client, "sync-settle-user@example.com")

    synced = client.post(SYNC_URL)
    assert synced.status_code == 200

    client.post(
        "/api/v1/wallet/deposit",
        json={"amount": 20, "description": "seed"},
        headers=auth_headers(user_token),
    )
    placed = client.post(
        "/api/v1/bets/place",
        json={
            "stake": 10,
            "selections": [
                {
                    "match_id": EXAMPLE_PUBLIC_ID,
                    "home_team": "Arsenal",
                    "away_team": "Chelsea",
                    "selection": "home",
                    "selection_label": "Arsenal",
                    "odds": 99.0,
                    "league": "Premier League",
                    "market_id": "1x2",
                }
            ],
        },
        headers=auth_headers(user_token),
    )
    assert placed.status_code == 201
    assert placed.json()["total_odds"] == 2.15

    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.external_id == EXAMPLE_PUBLIC_ID).one()
        game.status = "finished"
        game.home_score = 3
        game.away_score = 0
        db.add(game)
        db.commit()
        SettlementService.run_open_bets(db, match_id=EXAMPLE_PUBLIC_ID)
    finally:
        db.close()

    bets = client.get("/api/v1/bets/my", headers=auth_headers(user_token)).json()
    assert bets[0]["status"] == "won"
    me = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()
    assert me["balance"] == 31.5
