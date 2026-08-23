from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from app.db.base import Base


class League(Base):
    __tablename__ = "leagues"
    __table_args__ = (
        UniqueConstraint("sport_id", "slug", name="uq_leagues_sport_slug"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=False)
    name = Column(String, nullable=False)
    slug = Column(String, index=True, nullable=False)
