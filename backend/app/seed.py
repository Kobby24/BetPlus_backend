from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.models.user import User
from app.services.referral_service import ReferralService


def _ensure_user(
    db: Session,
    *,
    name: str,
    email: str,
    phone: str,
    password: str,
    is_admin: bool = False,
    is_manager: bool = False,
    balance: float = 100.0,
) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        name=name,
        email=email,
        phone=phone,
        hashed_password=get_password_hash(password),
        balance=balance,
        is_admin=is_admin,
        is_manager=is_manager,
        settings={
            "notifications": True,
            "oddsFormat": "decimal",
            "language": "en",
            "managerMode": is_manager,
        },
    )
    db.add(user)
    db.flush()
    if is_manager:
        ReferralService.ensure_manager_referral_code(db, user)
    return user


def seed_demo_data():
    db: Session = SessionLocal()
    try:
        if db.query(Sport).count() == 0:
            football = Sport(name="Football", slug="football")
            basketball = Sport(name="Basketball", slug="basketball")
            baseball = Sport(name="Baseball", slug="baseball")
            hockey = Sport(name="Hockey", slug="hockey")
            db.add_all([football, basketball, baseball, hockey])
            db.commit()
            db.refresh(football)
            db.refresh(basketball)
            db.refresh(baseball)
            db.refresh(hockey)

            epl = League(sport_id=football.id, name="Premier League", slug="epl")
            laliga = League(sport_id=football.id, name="La Liga", slug="la-liga")
            serie_a = League(sport_id=football.id, name="Serie A", slug="serie-a")
            bundesliga = League(sport_id=football.id, name="Bundesliga", slug="bundesliga")
            nba = League(sport_id=basketball.id, name="NBA", slug="nba")
            mlb = League(sport_id=baseball.id, name="MLB", slug="mlb")
            nhl = League(sport_id=hockey.id, name="NHL", slug="nhl")
            db.add_all([epl, laliga, serie_a, bundesliga, nba, mlb, nhl])
            db.commit()
            db.refresh(epl)
            db.refresh(laliga)
            db.refresh(serie_a)
            db.refresh(bundesliga)
            db.refresh(nba)

            now = datetime.now(timezone.utc)
            fixtures = [
                ("m1", epl.id, "Arsenal", "Chelsea", "ARS", "CHE", 2, 2.15, 3.40, 3.20),
                ("m2", epl.id, "Liverpool", "Manchester City", "LIV", "MCI", 4, 2.80, 3.50, 2.45),
                ("m3", laliga.id, "Real Madrid", "Barcelona", "RMA", "BAR", 6, 2.10, 3.60, 3.30),
                ("m4", serie_a.id, "Inter Milan", "AC Milan", "INT", "MIL", 8, 1.95, 3.50, 3.80),
                ("m5", bundesliga.id, "Bayern Munich", "Borussia Dortmund", "BAY", "BVB", 10, 1.72, 4.00, 4.50),
            ]
            games = [
                Game(
                    external_id=fid,
                    league_id=league_id,
                    home=home,
                    away=away,
                    home_abbr=home_abbr,
                    away_abbr=away_abbr,
                    starts_at=now + timedelta(hours=hours),
                    status="scheduled",
                    odds_home=oh,
                    odds_draw=od,
                    odds_away=oa,
                )
                for fid, league_id, home, away, home_abbr, away_abbr, hours, oh, od, oa in fixtures
            ]
            games.append(
                Game(
                    external_id="live1",
                    league_id=epl.id,
                    home="Manchester United",
                    away="Tottenham",
                    home_abbr="MUN",
                    away_abbr="TOT",
                    starts_at=now - timedelta(hours=1),
                    status="live",
                    is_live=1,
                    live_minute=67,
                    home_score=1,
                    away_score=1,
                    odds_home=2.40,
                    odds_draw=2.80,
                    odds_away=3.10,
                )
            )
            games.append(
                Game(
                    external_id="b1",
                    league_id=nba.id,
                    home="Los Angeles Lakers",
                    away="Boston Celtics",
                    home_abbr="LAL",
                    away_abbr="BOS",
                    starts_at=now + timedelta(hours=12),
                    status="scheduled",
                    odds_home=1.90,
                    odds_draw=None,
                    odds_away=1.95,
                )
            )
            db.add_all(games)
            db.commit()

        _ensure_user(
            db,
            name="Demo Admin",
            email="demo@betplus.local",
            phone="+10000000001",
            password="demo123",
            is_admin=True,
        )
        _ensure_user(
            db,
            name="Platform Admin",
            email="admin@betplus.com",
            phone="+10000000002",
            password="admin123",
            is_admin=True,
        )
        _ensure_user(
            db,
            name="Demo Manager",
            email="manager@betplus.local",
            phone="+10000000003",
            password="manager123",
            is_manager=True,
        )
        db.commit()
    finally:
        db.close()
