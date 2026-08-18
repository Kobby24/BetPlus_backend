import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=new_uuid)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    role = Column(String(16), nullable=False, index=True)
    action = Column(String(64), nullable=False)
    detail = Column(Text, nullable=False, default="")
    bet_id = Column(String(36), nullable=True)
    match_id = Column(String(64), nullable=True)
    booking_code = Column(String(16), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
