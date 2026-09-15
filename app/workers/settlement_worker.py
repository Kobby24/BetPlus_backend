"""Durable settlement worker for open sports bets."""

from __future__ import annotations

import logging
import time

from app.core.config import get_settings
from app.core.logging import init_logging
from app.db.session import SessionLocal
from app.services.bet_service import SettlementService

logger = logging.getLogger("app.workers.settlement")


def process_settlement_cycle() -> int:
    with SessionLocal() as db:
        settled = SettlementService.run_open_bets(db)
        return len([bet for bet in settled if bet.status != "open"])


def run_forever() -> None:
    init_logging()
    settings = get_settings()
    settings.validate_for_runtime()
    poll = settings.settlement_poll_seconds
    logger.info("Settlement worker started poll=%.2fs", poll)
    while True:
        try:
            settled = process_settlement_cycle()
            if settled:
                logger.info("Settled %s bets", settled)
        except Exception:
            logger.exception("Settlement worker loop error")
        time.sleep(poll)


if __name__ == "__main__":
    run_forever()
