import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Numeric, String
from sqlalchemy.sql import func

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class ReferralDeposit(Base):
    """Commission tracking for deposits made by users referred by a manager.

    Does not credit the manager wallet; this is an audit/reporting ledger.
    Gross commission = amount * 5%. Manager share = 50% of gross.
    """

    __tablename__ = "referral_deposits"

    id = Column(String(36), primary_key=True, default=new_uuid)
    manager_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    referred_user_id = Column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    amount = Column(Numeric(12, 2), nullable=False)
    commission = Column(Numeric(12, 2), nullable=False)
    transaction_id = Column(String(36), ForeignKey("transactions.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
