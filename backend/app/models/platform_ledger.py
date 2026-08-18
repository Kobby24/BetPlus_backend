import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class PlatformLedger(Base):
    """House cash / accounting entries. Sum of cash-affecting types is platform balance."""

    __tablename__ = "platform_ledger"

    id = Column(String(36), primary_key=True, default=new_uuid)
    entry_type = Column(String(32), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(Text, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    bet_id = Column(String(36), ForeignKey("bets.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
