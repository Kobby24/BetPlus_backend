"""Server-authoritative catalog pricing."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.money import to_decimal
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport

CLOSED_STATUSES = frozenset({"finished", "ft", "completed", "cancelled", "void"})


def _norm(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def default_markets_for_game(game: Game) -> list[dict]:
    outcomes: list[dict] = []
    if game.odds_home is not None:
        outcomes.append(
            {"id": "home", "label": game.home, "odds": float(game.odds_home)}
        )
    if game.odds_draw is not None:
        outcomes.append({"id": "draw", "label": "Draw", "odds": float(game.odds_draw)})
    if game.odds_away is not None:
        outcomes.append(
            {"id": "away", "label": game.away, "odds": float(game.odds_away)}
        )
    markets = [
        {
            "id": "1x2",
            "name": "1X2",
            "category": "main",
            "outcomes": outcomes,
        }
    ]
    extra = game.markets if isinstance(game.markets, list) else None
    if extra:
        known = {_norm(str(m.get("id"))) for m in extra if isinstance(m, dict)}
        if "1x2" not in known:
            return markets + extra
        return extra
    return markets


def build_seed_markets(
    home: str, away: str, odds_home: float, odds_draw: float | None, odds_away: float
) -> list[dict]:
    outcomes: list[dict] = [
        {"id": "home", "label": home, "odds": float(odds_home)},
    ]
    if odds_draw is not None:
        outcomes.append({"id": "draw", "label": "Draw", "odds": float(odds_draw)})
    outcomes.append({"id": "away", "label": away, "odds": float(odds_away)})
    markets: list[dict] = [
        {"id": "1x2", "name": "1X2", "category": "main", "outcomes": outcomes}
    ]
    markets.extend(
        [
            {
                "id": "ou25",
                "name": "Over/Under 2.5",
                "category": "goals",
                "outcomes": [
                    {"id": "over", "label": "Over 2.5", "odds": 1.85},
                    {"id": "under", "label": "Under 2.5", "odds": 1.95},
                ],
            },
            {
                "id": "btts",
                "name": "Both Teams to Score",
                "category": "goals",
                "outcomes": [
                    {"id": "yes", "label": "BTTS Yes", "odds": 1.80},
                    {"id": "no", "label": "BTTS No", "odds": 2.00},
                ],
            },
        ]
    )
    return markets


@dataclass
class PricedSelection:
    match_id: str
    home_team: str
    away_team: str
    selection: str
    selection_label: str
    odds: Decimal
    league: str
    market_id: str
    market_name: str
    kickoff: object | None


def _find_outcome(market: dict, selection: str, selection_label: str) -> dict | None:
    outcomes = market.get("outcomes") or []
    sel_n = _norm(selection)
    label_n = _norm(selection_label)
    for outcome in outcomes:
        if not isinstance(outcome, dict):
            continue
        oid = _norm(str(outcome.get("id", "")))
        olabel = _norm(str(outcome.get("label", "")))
        if sel_n and sel_n in {oid, olabel}:
            return outcome
        if label_n and label_n in {oid, olabel}:
            return outcome
    return None


def price_selection(db: Session, *, match_id: str, selection: str, selection_label: str, market_id: str | None) -> PricedSelection:
    game = (
        db.query(Game)
        .filter(Game.external_id == match_id)
        .with_for_update()
        .first()
    )
    if not game:
        raise ValueError("Unknown match")
    status = (game.status or "").lower()
    if status in CLOSED_STATUSES:
        raise ValueError("Match is closed for betting")

    markets = default_markets_for_game(game)
    market = None
    if market_id:
        wanted = _norm(market_id)
        market = next(
            (
                m
                for m in markets
                if isinstance(m, dict) and _norm(str(m.get("id"))) == wanted
            ),
            None,
        )
        if market is None:
            raise ValueError("Unknown market")
    else:
        market = next(
            (
                m
                for m in markets
                if isinstance(m, dict) and _norm(str(m.get("id"))) == "1x2"
            ),
            markets[0] if markets else None,
        )

    if not market:
        raise ValueError("No catalog markets for this match")

    outcome = _find_outcome(market, selection, selection_label)
    if outcome is None and _norm(str(market.get("id"))) == "1x2":
        sel_n = _norm(selection) or _norm(selection_label)
        if sel_n in {_norm(game.home), "home", "1", "h"} and game.odds_home is not None:
            outcome = {"id": "home", "label": game.home, "odds": float(game.odds_home)}
        elif sel_n in {"draw", "x"} and game.odds_draw is not None:
            outcome = {"id": "draw", "label": "Draw", "odds": float(game.odds_draw)}
        elif sel_n in {_norm(game.away), "away", "2", "a"} and game.odds_away is not None:
            outcome = {"id": "away", "label": game.away, "odds": float(game.odds_away)}

    if outcome is None:
        raise ValueError("Unknown selection for this market")

    odds = to_decimal(outcome.get("odds"))
    if odds <= 0:
        raise ValueError("Catalog odds are invalid")

    league = db.get(League, game.league_id)
    return PricedSelection(
        match_id=game.external_id,
        home_team=game.home,
        away_team=game.away,
        selection=str(outcome.get("id") or selection),
        selection_label=str(outcome.get("label") or selection_label),
        odds=odds,
        league=league.name if league else "",
        market_id=str(market.get("id") or "1x2"),
        market_name=str(market.get("name") or "1X2"),
        kickoff=game.starts_at,
    )


def catalog_game_view(db: Session, game: Game) -> dict:
    league = db.get(League, game.league_id)
    sport = db.get(Sport, league.sport_id) if league else None
    return {
        "id": game.id,
        "external_id": game.external_id,
        "league_id": game.league_id,
        "league_name": league.name if league else "",
        "sport": sport.slug if sport else "football",
        "home": game.home,
        "away": game.away,
        "home_abbr": game.home_abbr,
        "away_abbr": game.away_abbr,
        "starts_at": game.starts_at,
        "status": game.status,
        "is_live": bool(game.is_live),
        "live_minute": game.live_minute,
        "home_score": game.home_score,
        "away_score": game.away_score,
        "odds_home": float(game.odds_home) if game.odds_home is not None else None,
        "odds_draw": float(game.odds_draw) if game.odds_draw is not None else None,
        "odds_away": float(game.odds_away) if game.odds_away is not None else None,
        "markets": default_markets_for_game(game),
    }
