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
    fetch_live_or_prematch_events,
)
from app.services.sportybet_sync import (
    extract_live_minute,
    extract_scores,
    map_status,
    parse_event,
    public_match_id,
    sync_sportybet_payload,
)
from tests.helpers import auth_headers, promote_user, register_and_token

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sportybet_live_or_prematch_events.json"
LIVE_EVENT_ID = "sr:match:72221170"
LIVE_GAME_ID = "38782"
LIVE_PUBLIC_ID = public_match_id(LIVE_EVENT_ID, LIVE_GAME_ID)
PREMATCH_EVENT_ID = "sr:match:72229999"
PREMATCH_GAME_ID = "41000"
LIVE_SYNC_URL = "/api/v1/catalog/sync/sportybet/live"


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


def _live_game(db) -> Game:
    return (
        db.query(Game)
        .filter(
            Game.external_event_id == LIVE_EVENT_ID,
            Game.external_game_id == LIVE_GAME_ID,
        )
        .one()
    )


def _count_live_game() -> int:
    db = SessionLocal()
    try:
        return (
            db.query(Game)
            .filter(
                Game.external_event_id == LIVE_EVENT_ID,
                Game.external_game_id == LIVE_GAME_ID,
            )
            .count()
        )
    finally:
        db.close()


def _payload_with_live(**fields) -> dict:
    payload = load_fixture()
    payload["data"][0]["events"][0].update(fields)
    return payload


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


def _admin_headers(client, email: str) -> dict[str, str]:
    token = register_and_token(client, email, name="Admin")
    promote_user(email, is_admin=True)
    return auth_headers(token)


def _client_settings():
    return type(
        "S",
        (),
        {
            "sportybet_live_url": "https://example.test/live",
            "sportybet_sport_id": "sr:sport:1",
            "sportybet_timeout_seconds": 1.0,
            "sportybet_retry_attempts": 2,
            "sportybet_client_id": "web",
            "sportybet_oper_id": "3",
            "sportybet_referer": "https://www.sportybet.com/gh/",
            "sportybet_user_agent": "pytest",
        },
    )()


def test_live_parser_reads_setscore_clock_and_h2_status():
    raw = load_fixture()["data"][0]["events"][0]
    assert extract_scores(raw) == (1, 0)
    assert extract_live_minute(raw) == 62
    assert map_status(raw) == ("live", 1)
    parsed = parse_event(raw)
    assert parsed.event_id == LIVE_EVENT_ID
    assert parsed.game_id == LIVE_GAME_ID
    assert parsed.status == "live"
    assert parsed.is_live == 1
    assert parsed.home_score == 1
    assert parsed.away_score == 0
    assert parsed.live_minute == 62
    assert parsed.home == "Newcastle"
    assert parsed.away == "Liverpool"


def test_live_parser_ht_and_missing_score_are_not_zero():
    assert map_status({"matchStatus": "HT", "status": 1}) == ("live", 1)
    assert map_status({"matchStatus": "H1", "status": 1}) == ("live", 1)
    assert extract_scores({"matchStatus": "Not start", "status": 0}) == (None, None)
    assert extract_live_minute({"playedSeconds": "45:00"}) == 45
    assert extract_live_minute({"playedSeconds": 2040}) == 34


def test_new_live_game_is_created(clean_imported_games):
    db = SessionLocal()
    try:
        summary = sync_sportybet_payload(
            db, load_fixture(), sync_type="live_or_prematch"
        )
        assert summary["type"] == "live_or_prematch"
        assert summary["fetched"] == 4
        assert summary["created"] == 2
        assert summary["skipped_invalid"] == 2
        game = _live_game(db)
        assert game.external_id == LIVE_PUBLIC_ID
        assert game.home == "Newcastle"
        assert game.away == "Liverpool"
        assert game.status == "live"
        assert game.is_live == 1
        assert game.home_score == 1
        assert game.away_score == 0
        assert game.live_minute == 62
        market_ids = {m["id"] for m in (game.markets or [])}
        assert "1x2" in market_ids
        assert "ou25" in market_ids
    finally:
        db.close()


def test_existing_live_game_score_update_keeps_same_row(clean_imported_games):
    db = SessionLocal()
    try:
        sync_sportybet_payload(db, load_fixture(), sync_type="live_or_prematch")
        game = _live_game(db)
        original_id = game.id
        summary = sync_sportybet_payload(
            db, _payload_with_live(setScore="2:0"), sync_type="live_or_prematch"
        )
        assert summary["created"] == 0
        assert summary["updated"] >= 1
        db.refresh(game)
        assert game.id == original_id
        assert _count_live_game() == 1
        assert game.home_score == 2
        assert game.away_score == 0
        assert game.status == "live"
        assert game.external_event_id == LIVE_EVENT_ID
        assert game.external_game_id == LIVE_GAME_ID
    finally:
        db.close()


def test_live_to_ended_updates_same_game(clean_imported_games):
    db = SessionLocal()
    try:
        sync_sportybet_payload(
            db, _payload_with_live(setScore="2:1"), sync_type="live_or_prematch"
        )
        game = _live_game(db)
        original_id = game.id
        assert game.status == "live"
        ended = _payload_with_live(
            matchStatus="Ended",
            status=3,
            setScore="2:1",
            playedSeconds="90:00",
        )
        summary = sync_sportybet_payload(db, ended, sync_type="live_or_prematch")
        assert summary["created"] == 0
        assert summary["ended_updated"] >= 1
        db.refresh(game)
        assert game.id == original_id
        assert game.status == "finished"
        assert game.is_live == 0
        assert game.home_score == 2
        assert game.away_score == 1
        assert game.live_minute is None
        assert game.external_id == LIVE_PUBLIC_ID
    finally:
        db.close()


def test_repeated_live_sync_does_not_duplicate(clean_imported_games):
    payload = load_fixture()
    db = SessionLocal()
    try:
        first = sync_sportybet_payload(db, payload, sync_type="live_or_prematch")
        second = sync_sportybet_payload(db, payload, sync_type="live_or_prematch")
        assert first["created"] == 2
        assert second["created"] == 0
        assert second["skipped_existing"] + second["updated"] >= first["created"]
        assert _count_live_game() == 1
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


def test_multiple_score_changes_update_one_game(clean_imported_games):
    db = SessionLocal()
    try:
        sequence = ["0:0", "1:0", "1:1", "2:1"]
        original_id = None
        for score in sequence:
            summary = sync_sportybet_payload(
                db, _payload_with_live(setScore=score), sync_type="live_or_prematch"
            )
            game = _live_game(db)
            if original_id is None:
                original_id = game.id
                assert summary["created"] >= 1
            else:
                assert summary["created"] == 0
                assert game.id == original_id
            home, away = (int(part) for part in score.split(":"))
            assert game.home_score == home
            assert game.away_score == away
            assert game.status == "live"
            assert _count_live_game() == 1

        ended = _payload_with_live(matchStatus="Ended", status=3, setScore="2:1")
        sync_sportybet_payload(db, ended, sync_type="live_or_prematch")
        game = _live_game(db)
        assert game.id == original_id
        assert game.status == "finished"
        assert game.home_score == 2
        assert game.away_score == 1
        assert _count_live_game() == 1
    finally:
        db.close()


def test_missing_event_id_and_game_id_are_skipped(clean_imported_games):
    db = SessionLocal()
    try:
        summary = sync_sportybet_payload(
            db, load_fixture(), sync_type="live_or_prematch"
        )
        reasons = {item["reason"] for item in summary["skipped"]}
        assert "missing eventId" in reasons
        assert "missing gameId" in reasons
        assert summary["skipped_invalid"] == 2
    finally:
        db.close()


def test_missing_score_does_not_overwrite_known_score(clean_imported_games):
    db = SessionLocal()
    try:
        sync_sportybet_payload(db, load_fixture(), sync_type="live_or_prematch")
        game = _live_game(db)
        assert game.home_score == 1
        without_score = deepcopy(load_fixture())
        live = without_score["data"][0]["events"][0]
        live.pop("setScore", None)
        live.pop("gameScore", None)
        summary = sync_sportybet_payload(
            db, without_score, sync_type="live_or_prematch"
        )
        assert summary["created"] == 0
        db.refresh(game)
        assert game.home_score == 1
        assert game.away_score == 0
    finally:
        db.close()


def test_protected_manual_live_fields_are_not_overwritten(clean_imported_games):
    payload = load_fixture()
    db = SessionLocal()
    try:
        sync_sportybet_payload(db, payload, sync_type="live_or_prematch")
        game = _live_game(db)
        game.manager_controlled = True
        game.manager_note = "keep this"
        game.home_score = 9
        game.away_score = 9
        game.status = "live"
        db.add(game)
        db.commit()

        changed = _payload_with_live(setScore="4:0", matchStatus="Ended", status=3)
        summary = sync_sportybet_payload(db, changed, sync_type="live_or_prematch")
        assert summary["skipped_protected"] >= 1
        db.refresh(game)
        assert game.home_score == 9
        assert game.away_score == 9
        assert game.manager_note == "keep this"
        assert game.status == "live"
        assert game.external_id == LIVE_PUBLIC_ID
    finally:
        db.close()


def test_concurrent_live_sync_does_not_duplicate(clean_imported_games):
    payload = load_fixture()

    def _run():
        db = SessionLocal()
        try:
            return sync_sportybet_payload(
                db, deepcopy(payload), sync_type="live_or_prematch"
            )
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(_run)
        second = pool.submit(_run)
        first.result()
        second.result()

    assert _count_live_game() == 1
    db = SessionLocal()
    try:
        imported = (
            db.query(Game)
            .filter(Game.external_event_id.in_([LIVE_EVENT_ID, PREMATCH_EVENT_ID]))
            .count()
        )
        assert imported == 2
    finally:
        db.close()


def test_live_client_timeout_and_http_errors():
    dummy = DummyAsyncClient(httpx.TimeoutException("slow"))
    with pytest.raises(SportyBetUpstreamError, match="timed out") as exc:
        asyncio.run(fetch_live_or_prematch_events(settings=_client_settings(), client=dummy))
    assert exc.value.status_code == 504
    assert dummy.calls == 2

    dummy_500 = DummyAsyncClient(DummyResponse(503, text="nope"))
    with pytest.raises(SportyBetUpstreamError, match="HTTP 503"):
        asyncio.run(
            fetch_live_or_prematch_events(settings=_client_settings(), client=dummy_500)
        )

    dummy_json = DummyAsyncClient(
        DummyResponse(200, payload=None, text="<html>challenge</html>")
    )
    with pytest.raises(SportyBetUpstreamError, match="invalid JSON"):
        asyncio.run(
            fetch_live_or_prematch_events(settings=_client_settings(), client=dummy_json)
        )


def test_live_endpoint_schema_missing_does_not_fetch(client, monkeypatch):
    monkeypatch.setattr(
        "app.api.v1.catalog.missing_required_columns",
        lambda _bind: ["games.external_event_id", "games.external_game_id"],
    )
    called = {"fetch": False}

    async def fake_fetch(*args, **kwargs):
        called["fetch"] = True
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fake_fetch)
    resp = client.post(
        LIVE_SYNC_URL, headers=_admin_headers(client, "live-schema-admin@example.com")
    )
    assert resp.status_code == 503
    assert called["fetch"] is False


def test_live_endpoint_rejects_anonymous_and_non_admin(client, monkeypatch):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fake_fetch)
    assert client.post(LIVE_SYNC_URL).status_code == 401

    user_token = register_and_token(client, "live-sync-user@example.com")
    denied = client.post(LIVE_SYNC_URL, headers=auth_headers(user_token))
    assert denied.status_code == 403


def test_live_endpoint_admin_success_and_catalog_read(
    client, monkeypatch, clean_imported_games
):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fake_fetch)
    resp = client.post(
        LIVE_SYNC_URL, headers=_admin_headers(client, "live-success-admin@example.com")
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["source"] == "sportybet"
    assert body["type"] == "live_or_prematch"
    assert body["fetched"] == 4
    assert body["created"] == 2
    assert body["skipped_invalid"] == 2
    assert body["live_updated"] >= 1

    catalog = client.get("/api/v1/catalog/games")
    assert catalog.status_code == 200
    match = next(g for g in catalog.json() if g["external_id"] == LIVE_PUBLIC_ID)
    assert match["home"] == "Newcastle"
    assert match["away"] == "Liverpool"
    assert match["status"] == "live"
    assert match["is_live"] is True
    assert match["home_score"] == 1
    assert match["away_score"] == 0
    assert match["live_minute"] == 62
    assert match["sport"] == "football"
    assert match["league_name"] == "Premier League"

    live_only = client.get("/api/v1/catalog/games", params={"live": True})
    assert live_only.status_code == 200
    assert any(g["external_id"] == LIVE_PUBLIC_ID for g in live_only.json())

    one = client.get(f"/api/v1/catalog/games/{LIVE_PUBLIC_ID}")
    assert one.status_code == 200
    assert one.json()["odds_home"] == 1.75


def test_live_endpoint_upstream_errors(client, monkeypatch):
    headers = _admin_headers(client, "live-upstream-admin@example.com")

    async def timeout(*args, **kwargs):
        raise SportyBetUpstreamError("Upstream request timed out", status_code=504)

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", timeout)
    assert client.post(LIVE_SYNC_URL, headers=headers).status_code == 504

    async def bad_json(*args, **kwargs):
        raise SportyBetUpstreamError("Upstream returned invalid JSON")

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", bad_json)
    assert client.post(LIVE_SYNC_URL, headers=headers).status_code == 502

    async def upstream_500(*args, **kwargs):
        raise SportyBetUpstreamError("Upstream returned HTTP 500")

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", upstream_500)
    assert client.post(LIVE_SYNC_URL, headers=headers).status_code == 502


def test_ended_live_sync_is_settlement_compatible_without_auto_settle(
    client, monkeypatch, clean_imported_games
):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fake_fetch)
    admin = _admin_headers(client, "live-settle-admin@example.com")
    user_token = register_and_token(client, "live-settle-user@example.com")

    synced = client.post(LIVE_SYNC_URL, headers=admin)
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
                    "match_id": LIVE_PUBLIC_ID,
                    "home_team": "Newcastle",
                    "away_team": "Liverpool",
                    "selection": "home",
                    "selection_label": "Newcastle",
                    "odds": 99.0,
                    "league": "Premier League",
                    "market_id": "1x2",
                }
            ],
        },
        headers=auth_headers(user_token),
    )
    assert placed.status_code == 201
    assert placed.json()["total_odds"] == 1.75
    bet_id = placed.json()["id"]

    async def fetch_ended(*args, **kwargs):
        return _payload_with_live(matchStatus="Ended", status=3, setScore="2:1")

    monkeypatch.setattr("app.api.v1.catalog.fetch_live_or_prematch_events", fetch_ended)
    ended = client.post(LIVE_SYNC_URL, headers=admin)
    assert ended.status_code == 200
    assert ended.json()["created"] == 0

    still_open = client.get("/api/v1/bets/my", headers=auth_headers(user_token)).json()
    assert still_open[0]["status"] == "open"

    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.external_id == LIVE_PUBLIC_ID).one()
        assert game.status == "finished"
        assert game.home_score == 2
        assert game.away_score == 1
        first = SettlementService.run_open_bets(db, match_id=LIVE_PUBLIC_ID)
        second = SettlementService.run_open_bets(db, match_id=LIVE_PUBLIC_ID)
        assert any(b.id == bet_id and b.status == "won" for b in first)
        assert all(b.status != "open" for b in second) or second == []
    finally:
        db.close()

    bets = client.get("/api/v1/bets/my", headers=auth_headers(user_token)).json()
    assert bets[0]["status"] == "won"
    me = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()
    assert me["balance"] == 27.5
    after = client.get("/api/v1/auth/me", headers=auth_headers(user_token)).json()
    assert after["balance"] == 27.5
