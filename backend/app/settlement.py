"""Backward-compatible settlement module."""

from sqlalchemy.orm import Session

from app.services.bet_service import SettlementService


def run_settlement_pass(db: Session, limit: int = 50):
    bets = SettlementService.run_open_bets(db, limit=limit)
    return [
        {"bet_id": bet.id, "status": bet.status, "payout": float(bet.payout or 0)}
        for bet in bets
    ]
