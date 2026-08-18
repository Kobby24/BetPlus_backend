from app.db.session import SessionLocal
from app.models.game import Game
from app.models.league import League
from app.models.sport import Sport
from app.models.user import User
from app.services.referral_service import ReferralService


def register_and_token(client, email: str, password: str = "secret", name: str = "User"):
    client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    resp = client.post(
        "/api/v1/auth/login", data={"username": email, "password": password}
    )
    return resp.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def promote_user(email: str, *, is_admin: bool = False, is_manager: bool = False):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        assert user is not None
        user.is_admin = is_admin
        user.is_manager = is_manager
        if is_manager:
            ReferralService.ensure_manager_referral_code(db, user)
        db.add(user)
        db.commit()
        return user.id
    finally:
        db.close()


def ensure_finished_game(
    external_id: str = "m1",
    home: str = "Arsenal",
    away: str = "Chelsea",
    home_score: int = 2,
    away_score: int = 1,
):
    db = SessionLocal()
    try:
        sport = db.query(Sport).filter(Sport.slug == "football").first()
        if not sport:
            sport = Sport(name="Football", slug="football")
            db.add(sport)
            db.flush()
        league = db.query(League).filter(League.slug == "epl").first()
        if not league:
            league = League(sport_id=sport.id, name="Premier League", slug="epl")
            db.add(league)
            db.flush()
        game = db.query(Game).filter(Game.external_id == external_id).first()
        if not game:
            game = Game(
                external_id=external_id,
                league_id=league.id,
                home=home,
                away=away,
                home_abbr=home[:3].upper(),
                away_abbr=away[:3].upper(),
                status="finished",
                home_score=home_score,
                away_score=away_score,
            )
            db.add(game)
        else:
            game.status = "finished"
            game.home_score = home_score
            game.away_score = away_score
        db.commit()
    finally:
        db.close()
