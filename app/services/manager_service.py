import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.services.catalog_service import build_seed_markets
from app.services.bet_service import SettlementService

VALID_MANAGER_STATUSES = frozenset({"not_started", "won", "lost", "void"})


class ManagerService:
    @staticmethod
    def _sport_slug(sport: Sport) -> str:
        return sport.slug

    @staticmethod
    def _get_or_create_league(
        db: Session, name: str, sport_slug: str = "football"
    ) -> League:
        sport = db.query(Sport).filter(Sport.slug == sport_slug).first()
        if not sport:
            sport = Sport(
                name=sport_slug.replace("-", " ").title(),
                slug=sport_slug,
            )
            try:
                with db.begin_nested():
                    db.add(sport)
                    db.flush()
            except IntegrityError:
                sport = db.query(Sport).filter(Sport.slug == sport_slug).one()

        slug = name.lower().replace(" ", "-")[:64] or "manual"
        league = (
            db.query(League)
            .filter(League.slug == slug, League.sport_id == sport.id)
            .first()
        )
        if league:
            return league
        league = League(sport_id=sport.id, name=name, slug=slug)
        try:
            with db.begin_nested():
                db.add(league)
                db.flush()
            return league
        except IntegrityError:
            return (
                db.query(League)
                .filter(League.slug == slug, League.sport_id == sport.id)
                .one()
            )

    @staticmethod
    def _to_view(db: Session, game: Game) -> dict:
        league = db.get(League, game.league_id)
        sport = db.get(Sport, league.sport_id) if league else None
        status = game.manager_status or "not_started"
        return {
            "id": game.id,
            "match_id": game.external_id,
            "home_team": game.home,
            "away_team": game.away,
            "home_abbr": game.home_abbr,
            "away_abbr": game.away_abbr,
            "league": league.name if league else "",
            "sport": sport.slug if sport else "football",
            "kickoff": game.starts_at,
            "status": status,
            "home_score": game.home_score or 0,
            "away_score": game.away_score or 0,
            "is_manual": bool(game.is_manual),
            "managed": bool(game.manager_controlled or game.is_manual),
            "note": game.manager_note,
            "game_status": game.status,
            "is_live": bool(game.is_live),
            "updated_at": game.updated_at,
        }

    @staticmethod
    def list_matches(db: Session) -> list[dict]:
        games = db.query(Game).order_by(Game.starts_at.asc()).all()
        return [ManagerService._to_view(db, g) for g in games]

    @staticmethod
    def get_match(db: Session, match_id: str) -> Game | None:
        return db.query(Game).filter(Game.external_id == match_id).first()

    @staticmethod
    def take_control(db: Session, match_id: str) -> Game | None:
        game = ManagerService.get_match(db, match_id)
        if not game:
            return None
        game.manager_controlled = True
        if not game.manager_status:
            game.manager_status = "not_started"
        db.add(game)
        db.commit()
        db.refresh(game)
        return game

    @staticmethod
    def release_control(db: Session, match_id: str) -> bool:
        game = ManagerService.get_match(db, match_id)
        if not game or game.is_manual:
            return False
        game.manager_controlled = False
        game.manager_status = None
        db.add(game)
        db.commit()
        return True

    @staticmethod
    def create_manual_match(
        db: Session,
        *,
        home_team: str,
        away_team: str,
        league: str,
        sport: str = "football",
        kickoff: datetime | None = None,
        note: str | None = None,
    ) -> Game:
        league_row = ManagerService._get_or_create_league(db, league, sport)
        match_id = f"mgr-{uuid.uuid4().hex[:8]}"
        game = Game(
            external_id=match_id,
            league_id=league_row.id,
            home=home_team.strip(),
            away=away_team.strip(),
            home_abbr=home_team.strip()[:3].upper(),
            away_abbr=away_team.strip()[:3].upper(),
            starts_at=kickoff,
            status="scheduled",
            manager_status="not_started",
            manager_controlled=True,
            manager_note=note,
            is_manual=True,
            home_score=0,
            away_score=0,
            odds_home=1.85,
            odds_draw=3.20,
            odds_away=2.10,
            markets=build_seed_markets(home_team.strip(), away_team.strip(), 1.85, 3.20, 2.10),
        )
        db.add(game)
        db.commit()
        db.refresh(game)
        return game

    @staticmethod
    def update_match(
        db: Session,
        match_id: str,
        *,
        status: str | None = None,
        home_score: int | None = None,
        away_score: int | None = None,
        home_team: str | None = None,
        away_team: str | None = None,
        league: str | None = None,
        kickoff: datetime | None = None,
        note: str | None = None,
        take_control: bool = True,
    ) -> Game | None:
        game = ManagerService.get_match(db, match_id)
        if not game:
            return None

        if take_control:
            game.manager_controlled = True

        if status is not None:
            if status not in VALID_MANAGER_STATUSES:
                raise ValueError("Invalid manager status")
            game.manager_status = None if status == "not_started" else status
            if status in ("won", "lost", "void"):
                game.status = "finished"
            elif status == "not_started":
                game.status = "scheduled"

        if home_score is not None:
            if home_score < 0:
                raise ValueError("Score cannot be negative")
            game.home_score = home_score
        if away_score is not None:
            if away_score < 0:
                raise ValueError("Score cannot be negative")
            game.away_score = away_score
        if home_team is not None:
            game.home = home_team.strip()
        if away_team is not None:
            game.away = away_team.strip()
        if league is not None and league.strip():
            sport = db.get(League, game.league_id)
            slug = "football"
            if sport:
                sport_row = db.get(Sport, sport.sport_id)
                slug = sport_row.slug if sport_row else "football"
            game.league_id = ManagerService._get_or_create_league(
                db, league.strip(), slug
            ).id
        if kickoff is not None:
            game.starts_at = kickoff
        if note is not None:
            game.manager_note = note

        game.updated_at = datetime.now(timezone.utc)
        db.add(game)
        db.commit()
        db.refresh(game)

        SettlementService.run_open_bets(db, match_id=match_id)
        db.refresh(game)
        return game

    @staticmethod
    def delete_manual_match(db: Session, match_id: str) -> bool:
        game = ManagerService.get_match(db, match_id)
        if not game or not game.is_manual:
            return False
        db.delete(game)
        db.commit()
        return True
