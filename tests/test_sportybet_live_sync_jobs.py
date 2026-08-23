"""Durable job-queue tests for SportyBet live sync (Heroku H12 fix)."""

from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.db.session import SessionLocal
from app.models.game import Game
from app.models.sportybet_sync_job import SportyBetSyncJob, new_uuid
from app.services.sportybet_live_client import SportyBetLiveUpstreamError
from app.services.sportybet_live_job import (
    claim_next_live_sync_job,
    enqueue_live_sync_job,
    execute_live_sync_job,
    process_one_live_sync_job,
    recover_stale_live_sync_jobs,
)
from app.services.sportybet_live_parser import public_live_match_id
from tests.helpers import auth_headers, promote_user, register_and_token

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sportybet_live_or_prematch_events.json"
LIVE_EVENT_ID = "sr:match:80000002"
LIVE_GAME_ID = "55002"
LIVE_PUBLIC_ID = public_live_match_id(LIVE_EVENT_ID, LIVE_GAME_ID)
PREMATCH_EVENT_ID = "sr:match:80000001"
PREMATCH_GAME_ID = "55001"
LIVE_SYNC_URL = "/api/v1/catalog/sync/sportybet/live"
LEGACY_LIVE_SYNC_URL = "/api/catalog/sync/sportybet/live"


def load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def reset_jobs_and_games() -> None:
    db = SessionLocal()
    try:
        db.query(SportyBetSyncJob).delete(synchronize_session=False)
        db.query(Game).filter(Game.external_event_id.isnot(None)).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture
def clean_jobs():
    reset_jobs_and_games()
    yield
    reset_jobs_and_games()


def _admin_headers(client, email: str) -> dict[str, str]:
    token = register_and_token(client, email)
    promote_user(email, is_admin=True)
    return auth_headers(token)


def _user_headers(client, email: str) -> dict[str, str]:
    token = register_and_token(client, email)
    return auth_headers(token)


def _status_url(job_id: str) -> str:
    return f"{LIVE_SYNC_URL}/{job_id}"


def _count(event_id: str, game_id: str) -> int:
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


def test_post_unauthorized(client):
    assert client.post(LIVE_SYNC_URL).status_code == 401
    assert client.get(_status_url("missing")).status_code == 401


def test_post_and_status_non_admin_forbidden(client):
    headers = _user_headers(client, "live-job-user@example.com")
    assert client.post(LIVE_SYNC_URL, headers=headers).status_code == 403
    assert client.get(_status_url("missing"), headers=headers).status_code == 403


def test_post_returns_202_without_waiting_for_slow_sync(
    client, monkeypatch, clean_jobs
):
    fetch_calls: list[str] = []

    async def slow_fetch(*args, **kwargs):
        fetch_calls.append("started")
        time.sleep(35)
        return load_fixture()

    monkeypatch.setattr(
        "app.services.sportybet_live_job.fetch_live_or_prematch_events",
        slow_fetch,
    )
    headers = _admin_headers(client, "live-job-fast@example.com")
    started = time.monotonic()
    resp = client.post(LIVE_SYNC_URL, headers=headers)
    elapsed = time.monotonic() - started
    assert resp.status_code == 202
    body = resp.json()
    assert body["success"] is True
    assert body["status"] == "queued"
    assert body["job_id"]
    assert elapsed < 2.0
    assert fetch_calls == []

    status = client.get(_status_url(body["job_id"]), headers=headers)
    assert status.status_code == 200
    assert status.json()["status"] == "queued"
    assert status.json()["completed_at"] is None


def test_duplicate_post_reuses_active_job(client, clean_jobs):
    headers = _admin_headers(client, "live-job-dup@example.com")
    first = client.post(LIVE_SYNC_URL, headers=headers)
    second = client.post(LIVE_SYNC_URL, headers=headers)
    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["job_id"] == second.json()["job_id"]
    db = SessionLocal()
    try:
        assert db.query(SportyBetSyncJob).count() == 1
    finally:
        db.close()


def test_worker_completes_job_and_updates_catalog(client, clean_jobs):
    headers = _admin_headers(client, "live-job-run@example.com")
    queued = client.post(LIVE_SYNC_URL, headers=headers)
    assert queued.status_code == 202
    job_id = queued.json()["job_id"]

    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    processed = process_one_live_sync_job(fetch=fake_fetch)
    assert processed == job_id

    status = client.get(_status_url(job_id), headers=headers)
    assert status.status_code == 200
    body = status.json()
    assert body["status"] == "completed"
    assert body["fetched"] == 5
    assert body["created"] >= 3
    assert body["skipped"] >= 2
    assert body["completed_at"] is not None

    catalog = client.get("/api/v1/catalog/games")
    match = next(g for g in catalog.json() if g["external_id"] == LIVE_PUBLIC_ID)
    assert match["status"] == "live"
    assert match["home_score"] == 1
    assert match["live_minute"] == 32
    assert _count(LIVE_EVENT_ID, LIVE_GAME_ID) == 1
    assert _count(PREMATCH_EVENT_ID, PREMATCH_GAME_ID) == 1

    legacy = client.post(LEGACY_LIVE_SYNC_URL, headers=headers)
    assert legacy.status_code == 202
    assert legacy.json()["status"] == "queued"
    assert legacy.json()["job_id"] != job_id


def test_worker_live_score_and_finished_transition(clean_jobs):
    async def first_fetch(*args, **kwargs):
        payload = load_fixture()
        live = payload["data"][0]["events"][1]
        live["setScore"] = "0:0"
        live["matchStatus"] = "H1"
        live["status"] = 1
        payload["data"][0]["events"] = [live]
        return payload

    db = SessionLocal()
    try:
        job, _ = enqueue_live_sync_job(db)
        db.commit()
        job_id = job.id
    finally:
        db.close()
    execute_live_sync_job(job_id, fetch=first_fetch)

    async def later_fetch(*args, **kwargs):
        payload = load_fixture()
        live = payload["data"][0]["events"][1]
        live["setScore"] = "2:0"
        live["matchStatus"] = "Ended"
        live["status"] = 3
        payload["data"][0]["events"] = [live]
        return payload

    db = SessionLocal()
    try:
        job, created = enqueue_live_sync_job(db)
        db.commit()
        second_id = job.id
        assert created is True
    finally:
        db.close()
    execute_live_sync_job(second_id, fetch=later_fetch)
    assert _count(LIVE_EVENT_ID, LIVE_GAME_ID) == 1
    db = SessionLocal()
    try:
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
    finally:
        db.close()


def test_worker_upstream_timeout_marks_job_failed(clean_jobs):
    db = SessionLocal()
    try:
        job, _ = enqueue_live_sync_job(db)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    async def timeout(*args, **kwargs):
        raise SportyBetLiveUpstreamError(
            "Upstream request timed out", status_code=504
        )

    execute_live_sync_job(job_id, fetch=timeout)
    db = SessionLocal()
    try:
        stored = db.get(SportyBetSyncJob, job_id)
        assert stored.status == "failed"
        assert "timed out" in (stored.error_message or "")
        assert stored.completed_at is not None
    finally:
        db.close()


def test_worker_http_500_and_invalid_payload_fail_job(clean_jobs):
    db = SessionLocal()
    try:
        job, _ = enqueue_live_sync_job(db)
        db.commit()
        first_id = job.id
    finally:
        db.close()

    async def http_500(*args, **kwargs):
        raise SportyBetLiveUpstreamError("Upstream returned HTTP 500")

    execute_live_sync_job(first_id, fetch=http_500)

    db = SessionLocal()
    try:
        assert db.get(SportyBetSyncJob, first_id).status == "failed"
        job, _ = enqueue_live_sync_job(db)
        db.commit()
        second_id = job.id
    finally:
        db.close()

    async def invalid(*args, **kwargs):
        raise SportyBetLiveUpstreamError("Upstream returned invalid JSON")

    execute_live_sync_job(second_id, fetch=invalid)
    db = SessionLocal()
    try:
        stored = db.get(SportyBetSyncJob, second_id)
        assert stored.status == "failed"
        assert "invalid JSON" in (stored.error_message or "")
    finally:
        db.close()


def test_stale_running_job_is_requeued_then_failed(clean_jobs):
    db = SessionLocal()
    try:
        job = SportyBetSyncJob(
            id=new_uuid(),
            sync_type="live_or_prematch",
            status="running",
            started_at=datetime.now(timezone.utc) - timedelta(minutes=20),
            attempt_count=1,
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    db = SessionLocal()
    try:
        recovered = recover_stale_live_sync_jobs(db, stale_seconds=60, max_attempts=3)
        assert recovered == 1
        stored = db.get(SportyBetSyncJob, job_id)
        assert stored.status == "queued"
        stored.status = "running"
        stored.started_at = datetime.now(timezone.utc) - timedelta(minutes=20)
        stored.attempt_count = 3
        db.add(stored)
        db.commit()
        recover_stale_live_sync_jobs(db, stale_seconds=60, max_attempts=3)
        stored = db.get(SportyBetSyncJob, job_id)
        assert stored.status == "failed"
    finally:
        db.close()


def test_two_workers_cannot_claim_same_job(clean_jobs):
    db = SessionLocal()
    try:
        job, _ = enqueue_live_sync_job(db)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    claimed: list[str | None] = []

    def _claim():
        session = SessionLocal()
        try:
            found = claim_next_live_sync_job(session)
            claimed.append(found.id if found else None)
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(_claim)
        second = pool.submit(_claim)
        first.result()
        second.result()

    assert claimed.count(job_id) == 1
    assert claimed.count(None) == 1


def test_post_does_not_call_important_events(client, monkeypatch, clean_jobs):
    called = {"important": False}

    async def fake_important(*args, **kwargs):
        called["important"] = True
        return load_fixture()

    monkeypatch.setattr("app.api.v1.catalog.fetch_important_events", fake_important)
    headers = _admin_headers(client, "live-job-iso@example.com")
    resp = client.post(LIVE_SYNC_URL, headers=headers)
    assert resp.status_code == 202
    assert called["important"] is False


def test_missing_job_status_is_404(client):
    headers = _admin_headers(client, "live-job-404@example.com")
    resp = client.get(_status_url("00000000-0000-0000-0000-000000000000"), headers=headers)
    assert resp.status_code == 404


def test_idempotent_worker_rerun_does_not_duplicate_games(clean_jobs):
    async def fake_fetch(*args, **kwargs):
        return load_fixture()

    db = SessionLocal()
    try:
        job, _ = enqueue_live_sync_job(db)
        db.commit()
        job_id = job.id
    finally:
        db.close()
    execute_live_sync_job(job_id, fetch=fake_fetch)
    execute_live_sync_job(job_id, fetch=fake_fetch)
    assert _count(LIVE_EVENT_ID, LIVE_GAME_ID) == 1
    db = SessionLocal()
    try:
        stored = db.get(SportyBetSyncJob, job_id)
        assert stored.status == "completed"
    finally:
        db.close()
