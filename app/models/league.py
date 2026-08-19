from sqlalchemy import Column, Integer, String, ForeignKey

from app.db.base import Base


class League(Base):
    __tablename__ = "leagues"

    id = Column(Integer, primary_key=True, index=True)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=False)
    name = Column(String, nullable=False)
    slug = Column(String, index=True, nullable=False)
