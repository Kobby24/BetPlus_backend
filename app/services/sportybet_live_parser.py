"""Independent parser for SportyBet liveOrPrematchEvents payloads.

Does not call parse_event() from the important-events integration.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from app.core.money import to_decimal

FOOTBALL_SLUG = "football"
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
        "h1",
        "h2",
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


class InvalidSportyBetLiveEvent(ValueError):
    """A single live/prematch upstream event cannot be imported."""


@dataclass
class ParsedLiveMarketSkip:
    market_id: str | None
    name: str
    reason: str


@dataclass
class ParsedLiveGame:
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
    unsupported_markets: list[ParsedLiveMarketSkip] = field(default_factory=list)


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _slugify(value: str) -> str:
    return SLUG_RE.sub("-", value.strip().lower()).strip("-")


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


def public_live_match_id(event_id: str, game_id: str) -> str:
    return f"{event_id}:{game_id}"


def extract_live_raw_events(payload: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for tournament in payload.get("data") or []:
        if not isinstance(tournament, dict):
            continue
        for event in tournament.get("events") or []:
            if isinstance(event, dict):
                events.append(event)
    return events


def parse_live_start_time(raw: dict[str, Any]) -> datetime | None:
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


def map_live_status(raw: dict[str, Any]) -> tuple[str, int]:
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


def _score_from_colon(value: Any) -> tuple[int | None, int | None]:
    if not isinstance(value, str) or ":" not in value:
        return None, None
    left, right = value.split(":", 1)
    home = _int_or_none(left.strip())
    away = _int_or_none(right.strip())
    if home is not None and home < 0:
        home = None
    if away is not None and away < 0:
        away = None
    return home, away


def extract_live_scores(raw: dict[str, Any]) -> tuple[int | None, int | None]:
    """Prefer setScore ("2:1"); fall back to homeScore/awayScore if present."""
    home, away = _score_from_colon(raw.get("setScore"))
    if home is None:
        home = _int_or_none(
            raw.get("homeScore") if "homeScore" in raw else raw.get("home_score")
        )
    if away is None:
        away = _int_or_none(
            raw.get("awayScore") if "awayScore" in raw else raw.get("away_score")
        )
    score = raw.get("score")
    if isinstance(score, dict):
        if home is None:
            home = _int_or_none(score.get("home") or score.get("homeScore"))
        if away is None:
            away = _int_or_none(score.get("away") or score.get("awayScore"))
    elif isinstance(score, str) and ":" in score:
        left, right = _score_from_colon(score)
        if home is None:
            home = left
        if away is None:
            away = right
    return home, away


def _minute_from_played(value: Any) -> int | None:
    if isinstance(value, str) and ":" in value:
        left, right = value.split(":", 1)
        minutes = _int_or_none(left.strip())
        seconds = _int_or_none(right.strip())
        if minutes is None or minutes < 0:
            return None
        if seconds is not None and seconds < 0:
            return None
        return minutes
    seconds = _int_or_none(value)
    if seconds is not None and seconds >= 0:
        return seconds // 60
    return None


def extract_live_clock_minute(raw: dict[str, Any]) -> int | None:
    for key in ("playedSeconds", "elapsedSeconds"):
        minute = _minute_from_played(raw.get(key))
        if minute is not None:
            return minute
    for key in ("liveMinute", "matchTime", "minute"):
        minute = _int_or_none(raw.get(key))
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


def map_live_markets(
    raw_markets: Any, home: str, away: str
) -> tuple[
    list[dict[str, Any]],
    list[ParsedLiveMarketSkip],
    Decimal | None,
    Decimal | None,
    Decimal | None,
]:
    markets: list[dict[str, Any]] = []
    skipped: list[ParsedLiveMarketSkip] = []
    odds_home = odds_draw = odds_away = None
    if not isinstance(raw_markets, list):
        return markets, skipped, odds_home, odds_draw, odds_away

    for raw in raw_markets:
        if not isinstance(raw, dict):
            skipped.append(ParsedLiveMarketSkip(None, "unknown", "market is not an object"))
            continue
        mid = str(raw.get("id") or "")
        name = _norm(raw.get("name") or raw.get("desc") or "Market")
        specifier = _norm(raw.get("specifier"))
        if raw.get("banned") is True:
            skipped.append(ParsedLiveMarketSkip(mid, name, "banned"))
            continue
        if COMBO_NAME_RE.search(name):
            skipped.append(ParsedLiveMarketSkip(mid, name, "unsupported combo market"))
            continue
        lower_name = name.lower()
        if "half" in lower_name and "correct score" in lower_name:
            skipped.append(
                ParsedLiveMarketSkip(mid, name, "half-time markets are not settled")
            )
            continue
        if mid == "1" or lower_name in {"1x2", "1,x,2"}:
            mapped, home_o, draw_o, away_o = _map_1x2(raw, home, away)
            if mapped is None:
                skipped.append(ParsedLiveMarketSkip(mid, name, "1X2 missing outcomes"))
                continue
            markets.append(mapped)
            odds_home = home_o
            odds_draw = draw_o
            odds_away = away_o
            continue
        if mid == "18" or lower_name in {"over/under", "over under"}:
            mapped = _map_over_under(raw, specifier or name)
            if mapped is None:
                skipped.append(ParsedLiveMarketSkip(mid, name, "over/under missing line"))
                continue
            markets.append(mapped)
            continue
        if lower_name in {
            "gg/ng",
            "both teams to score",
            "btts",
            "both teams to score (btts)",
        }:
            mapped = _map_btts(raw)
            if mapped is None:
                skipped.append(ParsedLiveMarketSkip(mid, name, "BTTS missing outcomes"))
                continue
            markets.append(mapped)
            continue
        skipped.append(ParsedLiveMarketSkip(mid, name, "unsupported market"))
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


def parse_live_event(raw: dict[str, Any]) -> ParsedLiveGame:
    if not isinstance(raw, dict):
        raise InvalidSportyBetLiveEvent("event is not an object")
    event_id = _norm(raw.get("eventId"))
    game_id = _norm(raw.get("gameId"))
    if not event_id:
        raise InvalidSportyBetLiveEvent("missing eventId")
    if not game_id:
        raise InvalidSportyBetLiveEvent("missing gameId")
    if raw.get("banned") is True:
        raise InvalidSportyBetLiveEvent("upstream event is banned")
    home = _norm(raw.get("homeTeamName"))
    away = _norm(raw.get("awayTeamName"))
    if not home or not away:
        raise InvalidSportyBetLiveEvent("missing home/away team")
    public_id = public_live_match_id(event_id, game_id)
    if len(public_id) > PUBLIC_ID_MAX:
        raise InvalidSportyBetLiveEvent("composed external_id exceeds 64 characters")

    sport_info = raw.get("sport") if isinstance(raw.get("sport"), dict) else {}
    category = (
        sport_info.get("category") if isinstance(sport_info.get("category"), dict) else {}
    )
    tournament = (
        category.get("tournament") if isinstance(category.get("tournament"), dict) else {}
    )
    sport_name = _norm(sport_info.get("name")) or "Football"
    sport_slug = _slugify(sport_name) or FOOTBALL_SLUG
    if _norm(sport_info.get("id")).lower() in {"sr:sport:1", "1"}:
        sport_slug = FOOTBALL_SLUG
        sport_name = "Football"
    league_name = (
        _norm(tournament.get("name")) or _norm(raw.get("tournamentName")) or sport_name
    )
    tournament_id = _norm(tournament.get("id"))
    country = _norm(category.get("name"))
    slug_base = _slugify(f"{country} {league_name}".strip()) or "league"
    suffix = tournament_id.rsplit(":", 1)[-1] if tournament_id else ""
    league_slug = f"{slug_base}-{suffix}" if suffix else slug_base

    status, is_live = map_live_status(raw)
    home_score, away_score = extract_live_scores(raw)
    markets, unsupported, odds_home, odds_draw, odds_away = map_live_markets(
        raw.get("markets"), home, away
    )
    return ParsedLiveGame(
        event_id=event_id,
        game_id=game_id,
        public_id=public_id,
        home=home,
        away=away,
        home_abbr=_abbr(home),
        away_abbr=_abbr(away),
        starts_at=parse_live_start_time(raw),
        status=status,
        is_live=is_live,
        live_minute=extract_live_clock_minute(raw) if is_live else None,
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
