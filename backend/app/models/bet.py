import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class Bet(Base):
    __tablename__ = "bets"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    booking_code = Column(String(16), unique=True, index=True, nullable=False)
    ticket_id = Column(String(16), nullable=True)
    verify_code = Column(String(32), nullable=True, index=True)
    stake = Column(Numeric(12, 2), nullable=False)
    total_odds = Column(Numeric(12, 4), nullable=False)
    potential_win = Column(Numeric(12, 2), nullable=False)
    bonus = Column(Numeric(12, 2), nullable=False, default=0)
    flex_cut = Column(Integer, nullable=True)
    status = Column(String(16), nullable=False, default="open")
    payout = Column(Numeric(12, 2), nullable=True)
    leg_results = Column(JSON, nullable=True)
    placed_at = Column(DateTime(timezone=True), server_default=func.now())
    settled_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="bets")
    selections = relationship(
        "BetSelection",
        back_populates="bet",
        cascade="all, delete-orphan",
        order_by="BetSelection.leg_index",
    )
    transactions = relationship("Transaction", back_populates="bet")


class BetSelection(Base):
    __tablename__ = "bet_selections"
    __table_args__ = (UniqueConstraint("bet_id", "leg_index", name="uq_bet_leg"),)

    id = Column(String(36), primary_key=True, default=new_uuid)
    bet_id = Column(String(36), ForeignKey("bets.id", ondelete="CASCADE"), nullable=False)
    leg_index = Column(Integer, nullable=False)
    match_id = Column(String(64), nullable=False, index=True)
    home_team = Column(String(255), nullable=False)
    away_team = Column(String(255), nullable=False)
    selection = Column(String(64), nullable=False)
    selection_label = Column(String(255), nullable=False)
    odds = Column(Numeric(12, 4), nullable=False)
    league = Column(String(255), nullable=False, default="")
    market_id = Column(String(64), nullable=True)
    market_name = Column(String(255), nullable=True)
    outcome_label = Column(String(255), nullable=True)
    manager_ft_score = Column(JSON, nullable=True)
    kickoff = Column(DateTime(timezone=True), nullable=True)
    original_snapshot = Column(JSON, nullable=True)

    bet = relationship("Bet", back_populates="selections")
