"""Transform SportyBet facts-center events into existing Game rows."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.money import to_decimal
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport

logger = logging.getLogger("app.services.sportybet")

FOOTBALL_SLUG = "football"
BATCH_SIZE = 50
SKIP_DETAILS_LIMIT = 50
PUBLIC_ID_MAX = 64

LIVE_STATUSES = frozenset(
    {
        "live",
        "1st half",
        "2nd half",
        "first half",
        "second half",
        "halftime",
        "half time",
        "ht",
        "1h",
        "2h",
        "in progress",
        "started",
    }
)
FINISHED_STATUSES = frozenset(
    {
        "ended",
        "finished",
        "ft",
        "full time",
        "completed",
        "aet",
        "ap",
        "after extra time",
        "after penalties",
    }
)
CANCELLED_STATUSES = frozenset({"cancelled", "canceled", "abandoned"})
POSTPONED_STATUSES = frozenset({"postponed"})
SUSPENDED_STATUSES = frozenset({"suspended", "interrupted"})
SCHEDULED_STATUSES = frozenset({"not start", "not started", "scheduled", "ns"})

COMBO_NAME_RE = re.compile(r"\s+&\s+")
TOTAL_SPEC_RE = re.compile(r"total\s*=\s*([\d.]+)", re.I)
OVER_UNDER_RE = re.compile(r"^(over|under)\s+([\d.]+)$", re.I)
SLUG_RE = re.compile(r"[^a-z0-9]+")


class InvalidSportyBetEvent(ValueError):
    """A single upstream event cannot be imported."""


class CatalogSchemaError(RuntimeError):
    """Database schema cannot store SportyBet identifiers."""


@dataclass
class ParsedMarketSkip:
    market_id: str | None
    name: str
    reason: str


@dataclass
class ParsedGame:
    event_id: str
    game_id: str
    public_id: str
    home: str
    away: str
    home_abbr: str
    away_abbr: str
    starts_at: datetime | None
    status: str
    is_live: int
    live_minute: int | None
    home_score: int | None
    away_score: int | None
    odds_home: Decimal | None
    odds_draw: Decimal | None
    odds_away: Decimal | None
    league_name: str
    league_slug: str
    sport_name: str
    sport_slug: str
    markets: list[dict[str, Any]]
    unsupported_markets: list[ParsedMarketSkip] = field(default_factory=list)


@dataclass
class SyncSkip:
    event_id: str | None
    game_id: str | None
    reason: str


@dataclass
class SyncSummary:
    success: bool
    source: str
    fetched: int
    created: int
    updated: int
    skipped_existing: int
    skipped_invalid: int
    skipped_protected: int
    failed: int
    unsupported_markets: int
    skipped: list[SyncSkip]

    def as_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "source": self.source,
            "fetched": self.fetched,
            "created": self.created,
            "updated": self.updated,
            "skipped_existing": self.skipped_existing,
            "skipped_invalid": self.skipped_invalid,
            "skipped_protected": self.skipped_protected,
            "failed": self.failed,
            "unsupported_markets": self.unsupported_markets,
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
    return re.sub(r"\s+", " ", str(value or "").strip())


def _slugify(value: str) -> str:
    slug = SLUG_RE.sub("-", value.strip().lower()).strip("-")
    return slug


def _abbr(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", name)
    return (cleaned[:3] or name[:3] or "UNK").upper()[:8]


def _decimal_or_none(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        parsed = to_decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        return None
    if parsed <= 0:
        return None
    return parsed


def _int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def public_match_id(event_id: str, game_id: str) -> str:
    return f"{event_id}:{game_id}"


def extract_raw_events(payload: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for tournament in payload.get("data") or []:
        if not isinstance(tournament, dict):
            continue
        for event in tournament.get("events") or []:
            if isinstance(event, dict):
                events.append(event)
    return events


def parse_start_time(raw: dict[str, Any]) -> datetime | None:
    value = raw.get("estimateStartTime")
    if value is None:
        return None
    try:
        millis = int(value)
    except (TypeError, ValueError):
        return None
    if millis <= 0:
        return None
    if millis > 10**12:
        millis = millis / 1000
    return datetime.fromtimestamp(millis, tz=timezone.utc)


def map_status(raw: dict[str, Any]) -> tuple[str, int]:
    match_status = _norm(raw.get("matchStatus")).lower()
    numeric = raw.get("status")
    if match_status in FINISHED_STATUSES:
        return "finished", 0
    if match_status in CANCELLED_STATUSES:
        return "cancelled", 0
    if match_status in POSTPONED_STATUSES:
        return "postponed", 0
    if match_status in SUSPENDED_STATUSES:
        return "suspended", 0
    if match_status in LIVE_STATUSES:
        return "live", 1
    if match_status in SCHEDULED_STATUSES or match_status == "":
        if numeric == 1:
            return "live", 1
        if numeric in (3, 4):
            return "finished", 0
        return "scheduled", 0
    if numeric == 1:
        return "live", 1
    if numeric in (3, 4):
        return "finished", 0
    return "scheduled", 0


def extract_scores(raw: dict[str, Any]) -> tuple[int | None, int | None]:
    home = _int_or_none(raw.get("homeScore") if "homeScore" in raw else raw.get("home_score"))
    away = _int_or_none(raw.get("awayScore") if "awayScore" in raw else raw.get("away_score"))
    score = raw.get("score")
    if isinstance(score, dict):
        if home is None:
            home = _int_or_none(score.get("home") or score.get("homeScore"))
        if away is None:
            away = _int_or_none(score.get("away") or score.get("awayScore"))
    elif isinstance(score, str) and ":" in score:
        left, right = score.split(":", 1)
        if home is None:
            home = _int_or_none(left)
        if away is None:
            away = _int_or_none(right)
    live = raw.get("liveData")
    if isinstance(live, dict):
        if home is None:
            home = _int_or_none(live.get("homeScore") or live.get("home"))
        if away is None:
            away = _int_or_none(live.get("awayScore") or live.get("away"))
    return home, away


def extract_live_minute(raw: dict[str, Any]) -> int | None:
    for key in ("playedSeconds", "elapsedSeconds"):
        seconds = _int_or_none(raw.get(key))
        if seconds is not None and seconds >= 0:
            return seconds // 60
    for key in ("liveMinute", "matchTime", "minute"):
        minute = _int_or_none(raw.get(key))
        if minute is not None and minute >= 0:
            return minute
    live = raw.get("liveData")
    if isinstance(live, dict):
        seconds = _int_or_none(live.get("playedSeconds"))
        if seconds is not None and seconds >= 0:
            return seconds // 60
        minute = _int_or_none(live.get("minute") or live.get("matchTime"))
        if minute is not None and minute >= 0:
            return minute
    return None


def _outcome_odds(outcome: dict[str, Any]) -> Decimal | None:
    if not isinstance(outcome, dict):
        return None
    if outcome.get("isActive") not in (1, "1", True, None):
        return None
    return _decimal_or_none(outcome.get("odds"))


def _ou_market_id(line: str) -> str:
    if line.endswith(".5"):
        return "ou" + line.replace(".", "")
    if line.endswith(".0"):
        return "ou" + line[:-2]
    return "ou" + line.replace(".", "")


def map_markets(
    raw_markets: Any, home: str, away: str
) -> tuple[list[dict[str, Any]], list[ParsedMarketSkip], Decimal | None, Decimal | None, Decimal | None]:
    markets: list[dict[str, Any]] = []
    skipped: list[ParsedMarketSkip] = []
    odds_home = odds_draw = odds_away = None
    if not isinstance(raw_markets, list):
        return markets, skipped, odds_home, odds_draw, odds_away

    for raw in raw_markets:
        if not isinstance(raw, dict):
            skipped.append(ParsedMarketSkip(None, "unknown", "market is not an object"))
            continue
        mid = str(raw.get("id") or "")
        name = _norm(raw.get("name") or raw.get("desc") or "Market")
        specifier = _norm(raw.get("specifier"))
        if raw.get("banned") is True:
            skipped.append(ParsedMarketSkip(mid, name, "banned"))
            continue
        if COMBO_NAME_RE.search(name):
            skipped.append(ParsedMarketSkip(mid, name, "unsupported combo market"))
            continue
        lower_name = name.lower()
        if "half" in lower_name and "correct score" in lower_name:
            skipped.append(
                ParsedMarketSkip(mid, name, "half-time markets are not settled")
            )
            continue
        if mid == "1" or lower_name in {"1x2", "1,x,2"}:
            mapped, home_o, draw_o, away_o = _map_1x2(raw, home, away)
            if mapped is None:
                skipped.append(ParsedMarketSkip(mid, name, "1X2 missing outcomes"))
                continue
            markets.append(mapped)
            odds_home = home_o
            odds_draw = draw_o
            odds_away = away_o
            continue
        if mid == "18" or lower_name in {"over/under", "over under"}:
            mapped = _map_over_under(raw, specifier or name)
            if mapped is None:
                skipped.append(ParsedMarketSkip(mid, name, "over/under missing line"))
                continue
            markets.append(mapped)
            continue
        if lower_name in {"gg/ng", "both teams to score", "btts", "both teams to score (btts)"}:
            mapped = _map_btts(raw)
            if mapped is None:
                skipped.append(ParsedMarketSkip(mid, name, "BTTS missing outcomes"))
                continue
            markets.append(mapped)
            continue
        skipped.append(ParsedMarketSkip(mid, name, "unsupported market"))
    return markets, skipped, odds_home, odds_draw, odds_away


def _map_1x2(
    raw: dict[str, Any], home: str, away: str
) -> tuple[dict[str, Any] | None, Decimal | None, Decimal | None, Decimal | None]:
    outcomes: list[dict[str, Any]] = []
    odds_home = odds_draw = odds_away = None
    for outcome in raw.get("outcomes") or []:
        if not isinstance(outcome, dict):
            continue
        odds = _outcome_odds(outcome)
        if odds is None:
            continue
        desc = _norm(outcome.get("desc")).lower()
        oid = str(outcome.get("id") or "")
        if desc in {"home", "1"} or oid == "1":
            outcomes.append(
                {
                    "id": "home",
                    "label": home,
                    "odds": float(odds),
                    "external_outcome_id": oid,
                }
            )
            odds_home = odds
        elif desc in {"draw", "x"} or oid == "2":
            outcomes.append(
                {
                    "id": "draw",
                    "label": "Draw",
                    "odds": float(odds),
                    "external_outcome_id": oid,
                }
            )
            odds_draw = odds
        elif desc in {"away", "2"} or oid == "3":
            outcomes.append(
                {
                    "id": "away",
                    "label": away,
                    "odds": float(odds),
                    "external_outcome_id": oid,
                }
            )
            odds_away = odds
    if not outcomes:
        return None, None, None, None
    return (
        {
            "id": "1x2",
            "name": "1X2",
            "category": "main",
            "external_market_id": str(raw.get("id") or "1"),
            "outcomes": outcomes,
        },
        odds_home,
        odds_draw,
        odds_away,
    )


def _map_over_under(raw: dict[str, Any], specifier: str) -> dict[str, Any] | None:
    line = None
    match = TOTAL_SPEC_RE.search(specifier)
    if match:
        line = match.group(1)
    outcomes: list[dict[str, Any]] = []
    for outcome in raw.get("outcomes") or []:
        if not isinstance(outcome, dict):
            continue
        odds = _outcome_odds(outcome)
        if odds is None:
            continue
        desc = _norm(outcome.get("desc"))
        parsed = OVER_UNDER_RE.match(desc)
        if not parsed:
            continue
        side = parsed.group(1).lower()
        if line is None:
            line = parsed.group(2)
        oid = "over" if side == "over" else "under"
        outcomes.append(
            {
                "id": oid,
                "label": f"{side.title()} {line}",
                "odds": float(odds),
                "external_outcome_id": str(outcome.get("id") or ""),
            }
        )
    if not line or not outcomes:
        return None
    return {
        "id": _ou_market_id(line),
        "name": f"Over/Under {line}",
        "category": "goals",
        "external_market_id": str(raw.get("id") or "18"),
        "external_specifier": specifier,
        "outcomes": outcomes,
    }


def _map_btts(raw: dict[str, Any]) -> dict[str, Any] | None:
    outcomes: list[dict[str, Any]] = []
    for outcome in raw.get("outcomes") or []:
        if not isinstance(outcome, dict):
            continue
        odds = _outcome_odds(outcome)
        if odds is None:
            continue
        desc = _norm(outcome.get("desc")).lower()
        if desc in {"yes", "gg", "btts yes"}:
            oid, label = "yes", "BTTS Yes"
        elif desc in {"no", "ng", "btts no"}:
            oid, label = "no", "BTTS No"
        else:
            continue
        outcomes.append(
            {
                "id": oid,
                "label": label,
                "odds": float(odds),
                "external_outcome_id": str(outcome.get("id") or ""),
            }
        )
    if len(outcomes) < 2:
        return None
    return {
        "id": "btts",
        "name": "Both Teams to Score",
        "category": "goals",
        "external_market_id": str(raw.get("id") or ""),
        "outcomes": outcomes,
    }


def parse_event(raw: dict[str, Any]) -> ParsedGame:
    event_id = _norm(raw.get("eventId"))
    game_id = _norm(raw.get("gameId"))
    if not event_id:
        raise InvalidSportyBetEvent("missing eventId")
    if not game_id:
        raise InvalidSportyBetEvent("missing gameId")
    if raw.get("banned") is True:
        raise InvalidSportyBetEvent("upstream event is banned")
    home = _norm(raw.get("homeTeamName"))
    away = _norm(raw.get("awayTeamName"))
    if not home or not away:
        raise InvalidSportyBetEvent("missing home/away team")
    public_id = public_match_id(event_id, game_id)
    if len(public_id) > PUBLIC_ID_MAX:
        raise InvalidSportyBetEvent("composed external_id exceeds 64 characters")

    sport_info = raw.get("sport") if isinstance(raw.get("sport"), dict) else {}
    category = sport_info.get("category") if isinstance(sport_info.get("category"), dict) else {}
    tournament = (
        category.get("tournament") if isinstance(category.get("tournament"), dict) else {}
    )
    sport_name = _norm(sport_info.get("name")) or "Football"
    sport_slug = _slugify(sport_name) or FOOTBALL_SLUG
    if _norm(sport_info.get("id")).lower() in {"sr:sport:1", "1"}:
        sport_slug = FOOTBALL_SLUG
        sport_name = "Football"
    league_name = _norm(tournament.get("name")) or _norm(raw.get("tournamentName")) or sport_name
    tournament_id = _norm(tournament.get("id"))
    country = _norm(category.get("name"))
    slug_base = _slugify(f"{country} {league_name}".strip()) or "league"
    suffix = tournament_id.rsplit(":", 1)[-1] if tournament_id else ""
    league_slug = f"{slug_base}-{suffix}" if suffix else slug_base

    status, is_live = map_status(raw)
    home_score, away_score = extract_scores(raw)
    markets, unsupported, odds_home, odds_draw, odds_away = map_markets(
        raw.get("markets"), home, away
    )
    return ParsedGame(
        event_id=event_id,
        game_id=game_id,
        public_id=public_id,
        home=home,
        away=away,
        home_abbr=_abbr(home),
        away_abbr=_abbr(away),
        starts_at=parse_start_time(raw),
        status=status,
        is_live=is_live,
        live_minute=extract_live_minute(raw) if is_live else None,
        home_score=home_score,
        away_score=away_score,
        odds_home=odds_home,
        odds_draw=odds_draw,
        odds_away=odds_away,
        league_name=league_name,
        league_slug=league_slug[:128],
        sport_name=sport_name,
        sport_slug=sport_slug,
        markets=markets,
        unsupported_markets=unsupported,
    )


def get_or_create_sport(db: Session, slug: str, name: str) -> Sport:
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


def get_or_create_league(db: Session, sport: Sport, name: str, slug: str) -> League:
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


def find_existing_game(db: Session, event_id: str, game_id: str) -> Game | None:
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


def _same_decimal(left: Any, right: Decimal | None) -> bool:
    if left is None and right is None:
        return True
    if left is None or right is None:
        return False
    return to_decimal(left) == right


def apply_mutable_fields(game: Game, parsed: ParsedGame, league_id: int) -> bool:
    changed = False
    assignments = (
        ("league_id", league_id),
        ("home", parsed.home),
        ("away", parsed.away),
        ("home_abbr", parsed.home_abbr),
        ("away_abbr", parsed.away_abbr),
        ("starts_at", parsed.starts_at),
        ("status", parsed.status),
        ("is_live", parsed.is_live),
        ("live_minute", parsed.live_minute),
        ("home_score", parsed.home_score),
        ("away_score", parsed.away_score),
        ("markets", parsed.markets or None),
    )
    for field_name, value in assignments:
        if getattr(game, field_name) != value:
            setattr(game, field_name, value)
            changed = True
    if not _same_decimal(game.odds_home, parsed.odds_home):
        game.odds_home = parsed.odds_home
        changed = True
    if not _same_decimal(game.odds_draw, parsed.odds_draw):
        game.odds_draw = parsed.odds_draw
        changed = True
    if not _same_decimal(game.odds_away, parsed.odds_away):
        game.odds_away = parsed.odds_away
        changed = True
    return changed


def _create_game(db: Session, parsed: ParsedGame, league_id: int) -> Game:
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


def upsert_parsed_game(db: Session, parsed: ParsedGame) -> str:
    existing = find_existing_game(db, parsed.event_id, parsed.game_id)
    sport = get_or_create_sport(db, parsed.sport_slug, parsed.sport_name)
    league = get_or_create_league(db, sport, parsed.league_name, parsed.league_slug)
    if existing:
        if _is_protected(existing):
            return "skipped_protected"
        if apply_mutable_fields(existing, parsed, league.id):
            existing.updated_at = datetime.now(timezone.utc)
            db.add(existing)
            db.flush()
            return "updated"
        return "skipped_existing"
    try:
        with db.begin_nested():
            _create_game(db, parsed, league.id)
        return "created"
    except IntegrityError:
        raced = find_existing_game(db, parsed.event_id, parsed.game_id)
        if raced is None:
            raced = (
                db.query(Game)
                .filter(Game.external_id == parsed.public_id)
                .first()
            )
        if raced is None:
            raise
        if _is_protected(raced):
            return "skipped_protected"
        if apply_mutable_fields(raced, parsed, league.id):
            raced.updated_at = datetime.now(timezone.utc)
            db.add(raced)
            db.flush()
            return "updated"
        return "skipped_existing"


def sync_sportybet_payload(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    raw_events = extract_raw_events(payload)
    summary = SyncSummary(
        success=True,
        source="sportybet",
        fetched=len(raw_events),
        created=0,
        updated=0,
        skipped_existing=0,
        skipped_invalid=0,
        skipped_protected=0,
        failed=0,
        unsupported_markets=0,
        skipped=[],
    )
    pending = 0
    for raw in raw_events:
        event_id = _norm(raw.get("eventId")) if isinstance(raw, dict) else None
        game_id = _norm(raw.get("gameId")) if isinstance(raw, dict) else None
        try:
            with db.begin_nested():
                parsed = parse_event(raw)
                unsupported = len(parsed.unsupported_markets)
                result = upsert_parsed_game(db, parsed)
            summary.unsupported_markets += unsupported
            setattr(summary, result, getattr(summary, result) + 1)
            pending += 1
            if pending >= BATCH_SIZE:
                db.commit()
                pending = 0
        except InvalidSportyBetEvent as exc:
            summary.skipped_invalid += 1
            summary.skipped.append(
                SyncSkip(event_id=event_id or None, game_id=game_id or None, reason=str(exc))
            )
            logger.info(
                "Skipping invalid SportyBet event eventId=%s gameId=%s reason=%s",
                event_id,
                game_id,
                exc,
            )
        except ProgrammingError as exc:
            db.rollback()
            pending = 0
            orig = str(getattr(exc, "orig", exc))
            if "external_event_id" in orig or "external_game_id" in orig:
                raise CatalogSchemaError(
                    "database schema is not migrated (missing "
                    "games.external_event_id / games.external_game_id); "
                    "run alembic upgrade head"
                ) from exc
            summary.failed += 1
            summary.skipped.append(
                SyncSkip(
                    event_id=event_id or None,
                    game_id=game_id or None,
                    reason=orig.split("\n", 1)[0][:180] or "database error",
                )
            )
            logger.exception(
                "Failed to import SportyBet event eventId=%s gameId=%s",
                event_id,
                game_id,
            )
        except Exception as exc:
            db.rollback()
            pending = 0
            summary.failed += 1
            summary.skipped.append(
                SyncSkip(
                    event_id=event_id or None,
                    game_id=game_id or None,
                    reason=str(exc).split("\n", 1)[0][:180]
                    or "unexpected error while importing event",
                )
            )
            logger.exception(
                "Failed to import SportyBet event eventId=%s gameId=%s",
                event_id,
                game_id,
            )
    if pending:
        db.commit()
    if summary.failed and not (summary.created or summary.updated or summary.skipped_existing):
        summary.success = False
    return summary.as_dict()
