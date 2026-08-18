import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, JSON, Numeric, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=new_uuid)
    name = Column(String(255), nullable=False, default="")
    email = Column(String(255), unique=True, index=True, nullable=False)
    phone = Column(String(32), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    balance = Column(Numeric(12, 2), nullable=False, default=0)
    is_admin = Column(Boolean, default=False, nullable=False)
    is_manager = Column(Boolean, default=False, nullable=False)
    referral_code = Column(String(32), unique=True, index=True, nullable=True)
    referred_by_manager_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    settings = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bets = relationship("Bet", back_populates="user")
    transactions = relationship("Transaction", back_populates="user")
