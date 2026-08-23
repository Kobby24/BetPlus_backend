"""Independent live/prematch SportyBet → Game synchronization.

Writes to the existing Game table. Does not call sync_sportybet_payload()
or any important-events parser/client helpers.
Does not settle bets.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from collections.abc import Callable
from typing import Any

from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.money import to_decimal
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.services.sportybet_live_parser import (
    InvalidSportyBetLiveEvent,
    ParsedLiveGame,
    extract_live_raw_events,
    parse_live_event,
)

logger = logging.getLogger("app.services.sportybet_live")

BATCH_SIZE = 100
SKIP_DETAILS_LIMIT = 50


class LiveCatalogSchemaError(RuntimeError):
    """Database schema cannot store SportyBet identifiers."""


@dataclass
class LiveSyncSkip:
    event_id: str | None
    game_id: str | None
    reason: str


@dataclass
class LiveSyncSummary:
    success: bool
    source: str
    type: str
    fetched: int
    created: int
    updated: int
    unchanged: int
    skipped_invalid: int
    skipped_protected: int
    failed: int
    live_updated: int
    ended_updated: int
    skipped: list[LiveSyncSkip]

    def as_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "source": self.source,
            "type": self.type,
            "fetched": self.fetched,
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "skipped_invalid": self.skipped_invalid,
            "skipped_protected": self.skipped_protected,
            "failed": self.failed,
            "live_updated": self.live_updated,
            "ended_updated": self.ended_updated,
            "skipped": [
                {
                    "event_id": item.event_id,
                    "game_id": item.game_id,
                    "reason": item.reason,
                }
                for item in self.skipped[:SKIP_DETAILS_LIMIT]
            ],
        }


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def find_live_game(db: Session, event_id: str, game_id: str) -> Game | None:
    return (
        db.query(Game)
        .filter(
            Game.external_event_id == event_id,
            Game.external_game_id == game_id,
        )
        .first()
    )


def _is_protected(game: Game) -> bool:
    return bool(game.is_manual or game.manager_controlled)


def _get_or_create_sport(db: Session, slug: str, name: str) -> Sport:
    sport = db.query(Sport).filter(Sport.slug == slug).first()
    if sport:
        return sport
    sport = Sport(name=name, slug=slug)
    try:
        with db.begin_nested():
            db.add(sport)
            db.flush()
        return sport
    except IntegrityError:
        existing = db.query(Sport).filter(Sport.slug == slug).first()
        if existing:
            return existing
        raise


def _get_or_create_league(db: Session, sport: Sport, name: str, slug: str) -> League:
    league = (
        db.query(League)
        .filter(League.sport_id == sport.id, League.slug == slug)
        .first()
    )
    if league:
        if league.name != name:
            league.name = name
        return league
    league = League(sport_id=sport.id, name=name, slug=slug)
    try:
        with db.begin_nested():
            db.add(league)
            db.flush()
        return league
    except IntegrityError:
        existing = (
            db.query(League)
            .filter(League.sport_id == sport.id, League.slug == slug)
            .first()
        )
        if existing:
            return existing
        raise


def _same_decimal(left: Any, right: Any) -> bool:
    if left is None and right is None:
        return True
    if left is None or right is None:
        return False
    return to_decimal(left) == to_decimal(right)


def apply_live_fields(game: Game, parsed: ParsedLiveGame, league_id: int) -> bool:
    """Update mutable live-state fields. Never overwrite with null."""
    changed = False
    assignments = (
        ("league_id", league_id),
        ("home", parsed.home),
        ("away", parsed.away),
        ("home_abbr", parsed.home_abbr),
        ("away_abbr", parsed.away_abbr),
        ("status", parsed.status),
        ("is_live", parsed.is_live),
    )
    for field_name, value in assignments:
        if getattr(game, field_name) != value:
            setattr(game, field_name, value)
            changed = True
    if parsed.starts_at is not None and game.starts_at != parsed.starts_at:
        game.starts_at = parsed.starts_at
        changed = True
    if parsed.is_live:
        if parsed.live_minute is not None and game.live_minute != parsed.live_minute:
            game.live_minute = parsed.live_minute
            changed = True
    elif game.live_minute is not None:
        game.live_minute = None
        changed = True
    if parsed.home_score is not None and game.home_score != parsed.home_score:
        game.home_score = parsed.home_score
        changed = True
    if parsed.away_score is not None and game.away_score != parsed.away_score:
        game.away_score = parsed.away_score
        changed = True
    if parsed.markets and game.markets != parsed.markets:
        game.markets = parsed.markets
        changed = True
    if parsed.odds_home is not None and not _same_decimal(game.odds_home, parsed.odds_home):
        game.odds_home = parsed.odds_home
        changed = True
    if parsed.odds_draw is not None and not _same_decimal(game.odds_draw, parsed.odds_draw):
        game.odds_draw = parsed.odds_draw
        changed = True
    if parsed.odds_away is not None and not _same_decimal(game.odds_away, parsed.odds_away):
        game.odds_away = parsed.odds_away
        changed = True
    return changed


def _create_live_game(db: Session, parsed: ParsedLiveGame, league_id: int) -> Game:
    game = Game(
        external_id=parsed.public_id,
        external_event_id=parsed.event_id,
        external_game_id=parsed.game_id,
        league_id=league_id,
        home=parsed.home,
        away=parsed.away,
        home_abbr=parsed.home_abbr,
        away_abbr=parsed.away_abbr,
        starts_at=parsed.starts_at,
        status=parsed.status,
        is_live=parsed.is_live,
        live_minute=parsed.live_minute,
        home_score=parsed.home_score,
        away_score=parsed.away_score,
        odds_home=parsed.odds_home,
        odds_draw=parsed.odds_draw,
        odds_away=parsed.odds_away,
        markets=parsed.markets or None,
        manager_controlled=False,
        is_manual=False,
    )
    db.add(game)
    db.flush()
    return game


def _cached_sport(
    db: Session, parsed: ParsedLiveGame, sport_cache: dict[str, Sport]
) -> Sport:
    sport = sport_cache.get(parsed.sport_slug)
    if sport is None:
        sport = _get_or_create_sport(db, parsed.sport_slug, parsed.sport_name)
        sport_cache[parsed.sport_slug] = sport
    return sport


def _cached_league(
    db: Session,
    parsed: ParsedLiveGame,
    sport: Sport,
    league_cache: dict[tuple[int, str], League],
) -> League:
    key = (sport.id, parsed.league_slug)
    league = league_cache.get(key)
    if league is None:
        league = _get_or_create_league(db, sport, parsed.league_name, parsed.league_slug)
        league_cache[key] = league
    return league


def upsert_live_game(
    db: Session,
    parsed: ParsedLiveGame,
    *,
    existing_map: dict[tuple[str, str], Game] | None = None,
    sport_cache: dict[str, Sport] | None = None,
    league_cache: dict[tuple[int, str], League] | None = None,
    prefetched: bool = False,
) -> str:
    existing_map = existing_map if existing_map is not None else {}
    sport_cache = sport_cache if sport_cache is not None else {}
    league_cache = league_cache if league_cache is not None else {}
    key = (parsed.event_id, parsed.game_id)
    if prefetched:
        existing = existing_map.get(key)
    else:
        existing = existing_map.get(key)
        if existing is None:
            existing = find_live_game(db, parsed.event_id, parsed.game_id)
            if existing is not None:
                existing_map[key] = existing
    sport = _cached_sport(db, parsed, sport_cache)
    league = _cached_league(db, parsed, sport, league_cache)
    if existing:
        if _is_protected(existing):
            return "skipped_protected"
        if apply_live_fields(existing, parsed, league.id):
            existing.updated_at = datetime.now(timezone.utc)
            db.add(existing)
            db.flush()
            return "updated"
        return "unchanged"
    try:
        with db.begin_nested():
            game = _create_live_game(db, parsed, league.id)
        existing_map[key] = game
        return "created"
    except IntegrityError:
        raced = find_live_game(db, parsed.event_id, parsed.game_id)
        if raced is None:
            raced = (
                db.query(Game)
                .filter(Game.external_id == parsed.public_id)
                .first()
            )
        if raced is None:
            raise
        existing_map[key] = raced
        if _is_protected(raced):
            return "skipped_protected"
        if apply_live_fields(raced, parsed, league.id):
            raced.updated_at = datetime.now(timezone.utc)
            db.add(raced)
            db.flush()
            return "updated"
        return "unchanged"


def _load_existing_games(db: Session, parsed_games: list[ParsedLiveGame]) -> dict[tuple[str, str], Game]:
    event_ids = list({item.event_id for item in parsed_games})
    if not event_ids:
        return {}
    rows = (
        db.query(Game)
        .filter(Game.external_event_id.in_(event_ids))
        .all()
    )
    return {
        (row.external_event_id, row.external_game_id): row
        for row in rows
        if row.external_event_id and row.external_game_id
    }


def _record_status_counters(summary: LiveSyncSummary, parsed: ParsedLiveGame, result: str) -> None:
    if result not in {"created", "updated"}:
        return
    if parsed.status == "live":
        summary.live_updated += 1
    elif parsed.status == "finished":
        summary.ended_updated += 1


class SportyBetLiveSyncService:
    """Owns the live/prematch synchronization workflow."""

    def sync(self, db: Session, payload: dict[str, Any]) -> dict[str, Any]:
        return sync_sportybet_live_games(db, payload)


def sync_sportybet_live_games(
    db: Session,
    payload: dict[str, Any],
    *,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    raw_events = extract_live_raw_events(payload)
    summary = LiveSyncSummary(
        success=True,
        source="sportybet",
        type="live_or_prematch",
        fetched=len(raw_events),
        created=0,
        updated=0,
        unchanged=0,
        skipped_invalid=0,
        skipped_protected=0,
        failed=0,
        live_updated=0,
        ended_updated=0,
        skipped=[],
    )
    parsed_ok: list[tuple[dict[str, Any], ParsedLiveGame]] = []
    for raw in raw_events:
        event_id = _norm(raw.get("eventId")) if isinstance(raw, dict) else None
        game_id = _norm(raw.get("gameId")) if isinstance(raw, dict) else None
        try:
            parsed_ok.append((raw if isinstance(raw, dict) else {}, parse_live_event(raw)))
        except InvalidSportyBetLiveEvent as exc:
            summary.skipped_invalid += 1
            summary.skipped.append(
                LiveSyncSkip(
                    event_id=event_id or None,
                    game_id=game_id or None,
                    reason=str(exc),
                )
            )
            logger.info(
                "Skipping invalid SportyBet live event eventId=%s gameId=%s reason=%s",
                event_id,
                game_id,
                exc,
            )

    existing_map = _load_existing_games(db, [item[1] for item in parsed_ok])
    sport_cache: dict[str, Sport] = {}
    league_cache: dict[tuple[int, str], League] = {}
    pending = 0

    def _flush_progress() -> None:
        nonlocal pending
        db.commit()
        pending = 0
        if on_progress is not None:
            on_progress(summary.as_dict())

    for raw, parsed in parsed_ok:
        event_id = parsed.event_id
        game_id = parsed.game_id
        try:
            with db.begin_nested():
                result = upsert_live_game(
                    db,
                    parsed,
                    existing_map=existing_map,
                    sport_cache=sport_cache,
                    league_cache=league_cache,
                    prefetched=True,
                )
            setattr(summary, result, getattr(summary, result) + 1)
            _record_status_counters(summary, parsed, result)
            pending += 1
            if pending >= BATCH_SIZE:
                _flush_progress()
        except ProgrammingError as exc:
            db.rollback()
            pending = 0
            orig = str(getattr(exc, "orig", exc))
            if "external_event_id" in orig or "external_game_id" in orig:
                raise LiveCatalogSchemaError(
                    "database schema is not migrated (missing "
                    "games.external_event_id / games.external_game_id); "
                    "run alembic upgrade head"
                ) from exc
            summary.failed += 1
            summary.skipped.append(
                LiveSyncSkip(
                    event_id=event_id or None,
                    game_id=game_id or None,
                    reason=orig.split("\n", 1)[0][:180] or "database error",
                )
            )
            logger.exception(
                "Failed to import SportyBet live event eventId=%s gameId=%s",
                event_id,
                game_id,
            )
        except Exception as exc:
            db.rollback()
            pending = 0
            summary.failed += 1
            summary.skipped.append(
                LiveSyncSkip(
                    event_id=event_id or None,
                    game_id=game_id or None,
                    reason=str(exc).split("\n", 1)[0][:180]
                    or "unexpected error while importing live event",
                )
            )
            logger.exception(
                "Failed to import SportyBet live event eventId=%s gameId=%s",
                event_id,
                game_id,
            )
    if pending:
        _flush_progress()
    elif on_progress is not None:
        on_progress(summary.as_dict())
    if summary.failed and not (
        summary.created or summary.updated or summary.unchanged
    ):
        summary.success = False
    return summary.as_dict()
