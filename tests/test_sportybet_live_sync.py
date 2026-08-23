"""Independent tests for the SportyBet live/prematch integration.

Does not import or call sync_sportybet_payload / parse_event / fetch_important_events
except where verifying the important-events path remains unused.
"""

from __future__ import annotations

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
from app.services.sportybet_live_client import (
    SportyBetLiveUpstreamError,
    fetch_live_or_prematch_events,
    validate_live_payload,
)
from app.services.sportybet_live_parser import (
    InvalidSportyBetLiveEvent,
    extract_live_clock_minute,
    extract_live_scores,
    map_live_status,
    parse_live_event,
    public_live_match_id,
)
from app.services.sportybet_live_sync import sync_sportybet_live_games
from tests.helpers import auth_headers, register_and_token

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sportybet_live_or_prematch_events.json"
PREMATCH_EVENT_ID = "sr:match:80000001"
PREMATCH_GAME_ID = "55001"
PREMATCH_PUBLIC_ID = public_live_match_id(PREMATCH_EVENT_ID, PREMATCH_GAME_ID)
LIVE_EVENT_ID = "sr:match:80000002"
LIVE_GAME_ID = "55002"
LIVE_PUBLIC_ID = public_live_match_id(LIVE_EVENT_ID, LIVE_GAME_ID)
ENDED_EVENT_ID = "sr:match:80000003"
ENDED_GAME_ID = "55003"
ENDED_PUBLIC_ID = public_live_match_id(ENDED_EVENT_ID, ENDED_GAME_ID)
LIVE_SYNC_URL = "/api/v1/catalog/sync/sportybet/live"
LEGACY_LIVE_SYNC_URL = "/api/catalog/sync/sportybet/live"


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


def _count_games(event_id: str, game_id: str) -> int:
    db = SessionLocal()
    try:
        return (
            db.query(Game)
            .filter(
                Game.external_event_id == event_id,
                Game.external_game_id == game_id,
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
        self.headers = {
            "content-type": "application/json" if payload is not None else "text/html"
        }

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


def _live_settings():
    return type(
        "S",
        (),
        {
            "sportybet_live_url": "https://example.test/liveOrPrematchEvents",
            "sportybet_live_sport_id": "sr:sport:1",
            "sportybet_live_timeout_seconds": 1.0,
            "sportybet_live_retry_attempts": 2,
        },
    )()


def _payload_with_event(**overrides) -> dict:
    payload = load_fixture()
    event = payload["data"][0]["events"][0]
    event.update(overrides)
    payload["data"][0]["events"] = [event]
    return payload


# --- parser ---


def test_parse_live_event_requires_identifiers():
    with pytest.raises(InvalidSportyBetLiveEvent, match="eventId"):
        parse_live_event(
            {"gameId": "55001", "homeTeamName": "A", "awayTeamName": "B"}
        )
    with pytest.raises(InvalidSportyBetLiveEvent, match="gameId"):
        parse_live_event(
            {"eventId": "sr:match:1", "homeTeamName": "A", "awayTeamName": "B"}
        )


def test_set_score_maps_to_home_and_away():
    home, away = extract_live_scores({"setScore": "2:1"})
    assert home == 2
    assert away == 1


def test_played_seconds_clock_becomes_integer_minute():
    assert extract_live_clock_minute({"playedSeconds": "62:44"}) == 62
    assert extract_live_clock_minute({"playedSeconds": "0:15"}) == 0
    assert extract_live_clock_minute({}) is None


def test_status_mapping_live_and_finished():
    assert map_live_status({"matchStatus": "H1", "status": 1}) == ("live", 1)
    assert map_live_status({"matchStatus": "H2", "status": 1}) == ("live", 1)
    assert map_live_status({"matchStatus": "HT", "status": 1}) == ("live", 1)
    assert map_live_status({"matchStatus": "Ended", "status": 3}) == ("finished", 0)
    assert map_live_status({"matchStatus": "Finished", "status": 3}) == ("finished", 0)
    assert map_live_status({"matchStatus": "Not start", "status": 0}) == (
        "scheduled",
        0,
    )
    assert map_live_status({"matchStatus": "Cancelled"}) == ("cancelled", 0)
    assert map_live_status({"matchStatus": "Postponed"}) == ("postponed", 0)
    assert map_live_status({"matchStatus": "Suspended"}) == ("suspended", 0)


def test_parse_live_event_from_fixture():
    event = load_fixture()["data"][0]["events"][1]
    parsed = parse_live_event(event)
    assert parsed.event_id == LIVE_EVENT_ID
    assert parsed.game_id == LIVE_GAME_ID
    assert parsed.status == "live"
    assert parsed.is_live == 1
    assert parsed.home_score == 1
    assert parsed.away_score == 0
    assert parsed.live_minute == 32
    assert parsed.home == "Hearts of Oak"


# --- client ---


def test_validate_live_payload_rejects_invalid_json_shape():
    with pytest.raises(SportyBetLiveUpstreamError, match="not an object"):
        validate_live_payload([])
    with pytest.raises(SportyBetLiveUpstreamError, match="missing data"):
        validate_live_payload({"bizCode": 10000})
    with pytest.raises(SportyBetLiveUpstreamError, match="bizCode"):
        validate_live_payload({"bizCode": 500, "data": []})


def test_live_client_timeout():
    dummy = DummyAsyncClient(httpx.TimeoutException("slow"))
    with pytest.raises(SportyBetLiveUpstreamError, match="timed out") as exc:
        asyncio.run(
            fetch_live_or_prematch_events(settings=_live_settings(), client=dummy)
        )
    assert exc.value.status_code == 504
    assert dummy.calls == 2


def test_live_client_http_failure_and_invalid_json():
    dummy_500 = DummyAsyncClient(DummyResponse(503, text="nope"))
    with pytest.raises(SportyBetLiveUpstreamError, match="HTTP 503"):
        asyncio.run(
            fetch_live_or_prematch_events(
                settings=_live_settings(), client=dummy_500
            )
        )

    dummy_json = DummyAsyncClient(
        DummyResponse(200, payload=None, text="<html>challenge</html>")
    )
    with pytest.raises(SportyBetLiveUpstreamError, match="invalid JSON"):
        asyncio.run(
            fetch_live_or_prematch_events(
                settings=_live_settings(), client=dummy_json
            )
        )


def test_live_client_uses_dedicated_url_setting():
    dummy = DummyAsyncClient(DummyResponse(200, payload={"bizCode": 10000, "data": []}))
    payload = asyncio.run(
        fetch_live_or_prematch_events(settings=_live_settings(), client=dummy)
    )
    assert payload["bizCode"] == 10000
    assert dummy.calls == 1


# --- service create/update ---


def test_creates_missing_game(clean_imported_games):
    db = SessionLocal()
    try:
        summary = sync_sportybet_live_games(db, load_fixture())
        assert summary["created"] >= 3
        assert summary["skipped_invalid"] == 2
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == PREMATCH_EVENT_ID,
                Game.external_game_id == PREMATCH_GAME_ID,
            )
            .one()
        )
        assert game.external_id == PREMATCH_PUBLIC_ID
        assert game.home == "Arsenal"
        assert game.status == "scheduled"
        assert game.is_live == 0
    finally:
        db.close()


def test_updates_existing_game(clean_imported_games):
    db = SessionLocal()
    try:
        sync_sportybet_live_games(db, load_fixture())
        changed = _payload_with_event(matchStatus="H1", status=1, setScore="0:0")
        summary = sync_sportybet_live_games(db, changed)
        assert summary["created"] == 0
        assert summary["updated"] >= 1
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == PREMATCH_EVENT_ID,
                Game.external_game_id == PREMATCH_GAME_ID,
            )
            .one()
        )
        assert game.status == "live"
        assert game.is_live == 1
    finally:
        db.close()


def test_updates_live_score(clean_imported_games):
    db = SessionLocal()
    try:
        sync_sportybet_live_games(db, load_fixture())
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == LIVE_EVENT_ID,
                Game.external_game_id == LIVE_GAME_ID,
            )
            .one()
        )
        assert game.home_score == 1
        assert game.away_score == 0
        assert game.live_minute == 32

        payload = load_fixture()
        live = payload["data"][0]["events"][1]
        live["setScore"] = "2:1"
        live["playedSeconds"] = "62:44"
        live["matchStatus"] = "H2"
        summary = sync_sportybet_live_games(db, payload)
        assert summary["updated"] >= 1
        db.refresh(game)
        assert game.home_score == 2
        assert game.away_score == 1
        assert game.live_minute == 62
        assert game.status == "live"
        assert _count_games(LIVE_EVENT_ID, LIVE_GAME_ID) == 1
    finally:
        db.close()


def test_live_to_finished_preserves_one_row(clean_imported_games):
    db = SessionLocal()
    try:
        payload = load_fixture()
        live = payload["data"][0]["events"][1]
        live["setScore"] = "0:0"
        live["matchStatus"] = "H1"
        live["status"] = 1
        sync_sportybet_live_games(db, payload)

        live["setScore"] = "1:0"
        sync_sportybet_live_games(db, payload)

        live["setScore"] = "2:0"
        sync_sportybet_live_games(db, payload)

        live["setScore"] = "2:0"
        live["matchStatus"] = "Ended"
        live["status"] = 3
        summary = sync_sportybet_live_games(db, payload)
        assert summary["updated"] >= 1
        assert summary["ended_updated"] >= 1
        assert _count_games(LIVE_EVENT_ID, LIVE_GAME_ID) == 1
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == LIVE_EVENT_ID,
                Game.external_game_id == LIVE_GAME_ID,
            )
            .one()
        )
        assert game.status == "finished"
        assert game.is_live == 0
        assert game.home_score == 2
        assert game.away_score == 0
        assert game.live_minute is None
    finally:
        db.close()


def test_repeated_synchronization_is_idempotent(clean_imported_games):
    payload = load_fixture()
    db = SessionLocal()
    try:
        first = sync_sportybet_live_games(db, payload)
        second = sync_sportybet_live_games(db, payload)
        assert first["created"] >= 3
        assert second["created"] == 0
        assert second["unchanged"] + second["updated"] >= first["created"]
        assert _count_games(PREMATCH_EVENT_ID, PREMATCH_GAME_ID) == 1
        assert _count_games(LIVE_EVENT_ID, LIVE_GAME_ID) == 1
        assert _count_games(ENDED_EVENT_ID, ENDED_GAME_ID) == 1
    finally:
        db.close()


def test_missing_event_id_and_game_id_are_skipped(clean_imported_games):
    db = SessionLocal()
    try:
        summary = sync_sportybet_live_games(db, load_fixture())
        reasons = {item["reason"] for item in summary["skipped"]}
        assert "missing eventId" in reasons
        assert "missing gameId" in reasons
        assert summary["skipped_invalid"] == 2
    finally:
        db.close()


def test_missing_score_does_not_erase_existing_score(clean_imported_games):
    db = SessionLocal()
    try:
        sync_sportybet_live_games(db, load_fixture())
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == LIVE_EVENT_ID,
                Game.external_game_id == LIVE_GAME_ID,
            )
            .one()
        )
        assert game.home_score == 1
        assert game.away_score == 0

        payload = load_fixture()
        live = payload["data"][0]["events"][1]
        live["setScore"] = None
        live.pop("homeScore", None)
        live.pop("awayScore", None)
        sync_sportybet_live_games(db, payload)
        db.refresh(game)
        assert game.home_score == 1
        assert game.away_score == 0
    finally:
        db.close()


def test_manual_game_protection(clean_imported_games):
    payload = load_fixture()
    db = SessionLocal()
    try:
        sync_sportybet_live_games(db, payload)
        game = (
            db.query(Game)
            .filter(
                Game.external_event_id == PREMATCH_EVENT_ID,
                Game.external_game_id == PREMATCH_GAME_ID,
            )
            .one()
        )
        game.is_manual = True
        game.manager_note = "keep this"
        game.odds_home = 9.99
        game.status = "scheduled"
        db.add(game)
        db.commit()

        changed = deepcopy(payload)
        changed["data"][0]["events"][0]["matchStatus"] = "Ended"
        changed["data"][0]["events"][0]["setScore"] = "4:0"
        changed["data"][0]["events"][0]["markets"][0]["outcomes"][0]["odds"] = "1.11"
        summary = sync_sportybet_live_games(db, changed)
        assert summary["skipped_protected"] >= 1
        db.refresh(game)
        assert float(game.odds_home) == 9.99
        assert game.manager_note == "keep this"
        assert game.status == "scheduled"
        assert game.external_id == PREMATCH_PUBLIC_ID
        assert game.external_event_id == PREMATCH_EVENT_ID
        assert game.external_game_id == PREMATCH_GAME_ID
    finally:
        db.close()


def test_concurrent_sync_does_not_duplicate(clean_imported_games):
    payload = load_fixture()

    def _run():
        db = SessionLocal()
        try:
            return sync_sportybet_live_games(db, deepcopy(payload))
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(_run)
        second = pool.submit(_run)
        first.result()
        second.result()

    assert _count_games(PREMATCH_EVENT_ID, PREMATCH_GAME_ID) == 1
    assert _count_games(LIVE_EVENT_ID, LIVE_GAME_ID) == 1
    assert _count_games(ENDED_EVENT_ID, ENDED_GAME_ID) == 1


# --- endpoint HTTP ---


def test_live_endpoint_is_public(client, monkeypatch, clean_imported_games):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fake_fetch)
    resp = client.post(LIVE_SYNC_URL)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_live_endpoint_success_and_catalog_read(
    client, monkeypatch, clean_imported_games
):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fake_fetch)
    resp = client.post(LIVE_SYNC_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["source"] == "sportybet"
    assert body["type"] == "live_or_prematch"
    assert body["fetched"] == 5
    assert body["created"] >= 3
    assert body["skipped_invalid"] == 2
    assert "live_updated" in body
    assert "ended_updated" in body
    assert "unchanged" in body
    assert "setScore" not in json.dumps(body)

    catalog = client.get("/api/v1/catalog/games")
    assert catalog.status_code == 200
    games = catalog.json()
    match = next(g for g in games if g["external_id"] == LIVE_PUBLIC_ID)
    assert match["home"] == "Hearts of Oak"
    assert match["away"] == "Asante Kotoko"
    assert match["status"] == "live"
    assert match["is_live"] is True
    assert match["home_score"] == 1
    assert match["away_score"] == 0
    assert match["live_minute"] == 32

    one = client.get(f"/api/v1/catalog/games/{LIVE_PUBLIC_ID}")
    assert one.status_code == 200
    assert one.json()["odds_home"] == 1.70

    legacy = client.post(LEGACY_LIVE_SYNC_URL)
    assert legacy.status_code == 200
    assert legacy.json()["created"] == 0


def test_live_endpoint_upstream_errors(client, monkeypatch):
    async def timeout(*args, **kwargs):
        raise SportyBetLiveUpstreamError(
            "Upstream request timed out", status_code=504
        )

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", timeout)
    assert client.post(LIVE_SYNC_URL).status_code == 504

    async def bad_json(*args, **kwargs):
        raise SportyBetLiveUpstreamError("Upstream returned invalid JSON")

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", bad_json)
    assert client.post(LIVE_SYNC_URL).status_code == 502

    async def upstream_500(*args, **kwargs):
        raise SportyBetLiveUpstreamError("Upstream returned HTTP 500")

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", upstream_500)
    assert client.post(LIVE_SYNC_URL).status_code == 502


def test_live_endpoint_does_not_call_important_events(
    client, monkeypatch, clean_imported_games
):
    called = {"important": False, "live": False}

    async def fake_important(*args, **kwargs):
        called["important"] = True
        return load_fixture()

    async def fake_live(*args, **kwargs):
        called["live"] = True
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_important_events", fake_important)
    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fake_live)
    resp = client.post(LIVE_SYNC_URL)
    assert resp.status_code == 200
    assert called["live"] is True
    assert called["important"] is False


def test_finished_game_settlement_compatibility(
    client, monkeypatch, clean_imported_games
):
    async def fake_fetch(*args, **kwargs):
        payload = load_fixture()
        payload["data"][0]["events"] = [payload["data"][0]["events"][0]]
        return payload

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fake_fetch)
    user_token = register_and_token(client, "live-settle-user@example.com")

    synced = client.post(LIVE_SYNC_URL)
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
                    "match_id": PREMATCH_PUBLIC_ID,
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
        ended = _payload_with_event(
            matchStatus="Ended",
            status=3,
            setScore="3:0",
        )
        summary = sync_sportybet_live_games(db, ended)
        assert summary["updated"] >= 1
        game = db.query(Game).filter(Game.external_id == PREMATCH_PUBLIC_ID).one()
        assert game.status == "finished"
        assert game.home_score == 3
        assert game.away_score == 0
        SettlementService.run_open_bets(db, match_id=PREMATCH_PUBLIC_ID)
    finally:
        db.close()

    bets = client.get("/api/v1/bets/my", headers=auth_headers(user_token)).json()
    assert bets[0]["status"] == "won"
    me = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()
    assert me["balance"] == 31.5
