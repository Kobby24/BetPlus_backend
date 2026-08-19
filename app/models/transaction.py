import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    bet_id = Column(String(36), ForeignKey("bets.id"), nullable=True, index=True)
    type = Column(String(32), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="transactions")
    bet = relationship("Bet", back_populates="transactions")
