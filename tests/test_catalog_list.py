"""Catalog list filters used by the Live / Today / All betting tabs."""

from datetime import datetime, timedelta, timezone

from tests.helpers import ensure_finished_game, ensure_open_game


def test_status_live_excludes_upcoming_and_finished(client):
    ensure_open_game("upcoming-1")
    ensure_open_game("live-1", is_live=1, status="live")
    ensure_finished_game("done-1")

    live = client.get("/api/v1/catalog/games", params={"status": "live"})
    assert live.status_code == 200
    ids = {row["external_id"] for row in live.json()}
    assert "live-1" in ids
    assert "upcoming-1" not in ids
    assert "done-1" not in ids
    assert all(row["is_live"] for row in live.json())


def test_status_upcoming_excludes_live_and_finished(client):
    ensure_open_game("upcoming-2")
    ensure_open_game("live-2", is_live=1, status="live")
    ensure_finished_game("done-2")

    upcoming = client.get("/api/v1/catalog/games", params={"status": "upcoming"})
    assert upcoming.status_code == 200
    ids = {row["external_id"] for row in upcoming.json()}
    assert "upcoming-2" in ids
    assert "live-2" not in ids
    assert "done-2" not in ids


def test_status_all_is_upcoming_window(client):
    ensure_open_game("soon-1")
    far = datetime.now(timezone.utc) + timedelta(days=20)
    ensure_open_game("far-1", starts_at=far)
    ensure_open_game("live-3", is_live=1, status="live")

    catalog = client.get(
        "/api/v1/catalog/games", params={"status": "all", "window_days": 7}
    )
    assert catalog.status_code == 200
    ids = {row["external_id"] for row in catalog.json()}
    assert "soon-1" in ids
    assert "far-1" not in ids
    assert "live-3" not in ids


def test_sport_and_league_filters(client):
    ensure_open_game("m-sport")
    games = client.get("/api/v1/catalog/games", params={"sport": "football"})
    assert games.status_code == 200
    match = next(g for g in games.json() if g["external_id"] == "m-sport")
    by_league = client.get(
        "/api/v1/catalog/games",
        params={"league_id": match["league_id"], "status": "upcoming"},
    )
    assert any(g["external_id"] == "m-sport" for g in by_league.json())

    hockey = client.get("/api/v1/catalog/games", params={"sport": "hockey"})
    assert hockey.status_code == 200
    assert all(g["sport"] == "hockey" for g in hockey.json())


def test_search_filters_home_team(client):
    ensure_open_game("search-1", home="Kumasi Asante", away="Accra Hearts")
    found = client.get("/api/v1/catalog/games", params={"search": "Asante"})
    assert found.status_code == 200
    assert any(g["external_id"] == "search-1" for g in found.json())
    missed = client.get("/api/v1/catalog/games", params={"search": "zzzz-nope"})
    assert missed.json() == []


def test_pagination_does_not_duplicate(client):
    for i in range(4):
        ensure_open_game(f"page-{i}", home=f"Home {i}", away=f"Away {i}")

    first = client.get("/api/v1/catalog/games", params={"limit": 2, "offset": 0})
    second = client.get("/api/v1/catalog/games", params={"limit": 2, "offset": 2})
    assert first.status_code == 200
    assert second.status_code == 200
    ids = [row["external_id"] for row in first.json() + second.json()]
    assert len(ids) == len(set(ids))


def test_empty_live_catalog(client):
    ensure_open_game("only-upcoming")
    live = client.get("/api/v1/catalog/games", params={"status": "live"})
    assert live.status_code == 200
    ids = {g["external_id"] for g in live.json()}
    assert "only-upcoming" not in ids


def test_invalid_status_rejected(client):
    resp = client.get("/api/v1/catalog/games", params={"status": "nope"})
    assert resp.status_code == 422


def test_list_omits_markets(client):
    ensure_open_game("no-mkts")
    row = next(
        g
        for g in client.get("/api/v1/catalog/games").json()
        if g["external_id"] == "no-mkts"
    )
    assert "markets" not in row
    detail = client.get("/api/v1/catalog/games/no-mkts")
    assert any(m["id"] == "1x2" for m in detail.json()["markets"])
