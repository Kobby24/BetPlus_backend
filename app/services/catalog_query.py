"""SQL filters for catalog list queries (Live / Today / All / sport / league)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import func, or_
from sqlalchemy.orm import Query, Session, load_only

from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.services.catalog_service import CLOSED_STATUSES

CatalogStatus = Literal["live", "upcoming", "all"]
DEFAULT_ALL_WINDOW_DAYS = 7
LIST_CLOSED_STATUSES = frozenset(CLOSED_STATUSES) | {
    "ended",
    "closed",
    "complete",
    "fulltime",
}

GAME_LIST_COLUMNS = (
    Game.id,
    Game.external_id,
    Game.league_id,
    Game.home,
    Game.away,
    Game.home_abbr,
    Game.away_abbr,
    Game.starts_at,
    Game.status,
    Game.is_live,
    Game.live_minute,
    Game.home_score,
    Game.away_score,
    Game.odds_home,
    Game.odds_draw,
    Game.odds_away,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def exclude_closed(query: Query) -> Query:
    lowered = func.lower(Game.status)
    return query.filter(
        or_(Game.status.is_(None), ~lowered.in_(tuple(LIST_CLOSED_STATUSES)))
    )


def catalog_games_query(
    db: Session,
    *,
    live: bool | None = None,
    date: date | None = None,
    league_id: int | None = None,
    sport: str | None = None,
    status: CatalogStatus | None = None,
    search: str | None = None,
    window_days: int = DEFAULT_ALL_WINDOW_DAYS,
    now: datetime | None = None,
) -> Query:
    """Indexed list query: no markets JSON, closed events dropped."""
    moment = now or utc_now()
    query = db.query(Game).options(load_only(*GAME_LIST_COLUMNS))
    query = exclude_closed(query)

    want_live = live is True or status == "live"
    if want_live:
        query = query.filter(Game.is_live == 1)
    elif status in {"upcoming", "all"}:
        query = query.filter(or_(Game.is_live == 0, Game.is_live.is_(None)))

    if date is not None:
        start_of_day = datetime.combine(date, datetime.min.time(), tzinfo=timezone.utc)
        query = query.filter(
            Game.starts_at >= start_of_day,
            Game.starts_at < start_of_day + timedelta(days=1),
        )
    elif status == "all":
        start = datetime.combine(moment.date(), datetime.min.time(), tzinfo=timezone.utc)
        end = start + timedelta(days=max(window_days, 1) + 1)
        query = query.filter(
            or_(
                Game.starts_at.is_(None),
                (Game.starts_at >= start) & (Game.starts_at < end),
            )
        )
    elif status == "upcoming":
        query = query.filter(
            or_(Game.starts_at.is_(None), Game.starts_at >= moment)
        )

    if league_id is not None:
        query = query.filter(Game.league_id == league_id)

    term = (search or "").strip()
    if sport is not None or term:
        query = query.join(League, League.id == Game.league_id)
    if sport is not None:
        query = query.join(Sport, Sport.id == League.sport_id).filter(
            Sport.slug == sport
        )

    if term:
        like = f"%{term}%"
        query = query.filter(
            or_(
                Game.home.ilike(like),
                Game.away.ilike(like),
                Game.home_abbr.ilike(like),
                Game.away_abbr.ilike(like),
                Game.external_id.ilike(like),
                League.name.ilike(like),
            )
        )

    return query.order_by(Game.starts_at.asc())
