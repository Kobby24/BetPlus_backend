from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (
        Index("ix_games_status", "status"),
        Index("ix_games_starts_at", "starts_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String(64), unique=True, index=True, nullable=False)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False, index=True)
    home = Column(String, nullable=False)
    away = Column(String, nullable=False)
    home_abbr = Column(String(8), nullable=True)
    away_abbr = Column(String(8), nullable=True)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="scheduled")
    is_live = Column(Integer, default=0)
    live_minute = Column(Integer, nullable=True)
    home_score = Column(Integer, nullable=True)
    away_score = Column(Integer, nullable=True)
    odds_home = Column(Numeric(12, 4), nullable=True)
    odds_draw = Column(Numeric(12, 4), nullable=True)
    odds_away = Column(Numeric(12, 4), nullable=True)
    manager_status = Column(String(32), nullable=True)
    manager_controlled = Column(Boolean, default=False, nullable=False)
    manager_note = Column(Text, nullable=True)
    is_manual = Column(Boolean, default=False, nullable=False)
    markets = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
