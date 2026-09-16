"""Heroku worker process for SportyBet sync jobs (live/prematch and important events).

Does not serve HTTP. Claims durable jobs from PostgreSQL and executes them.
"""

from __future__ import annotations

import logging
import time

from app.core.config import get_settings
from app.core.logging import init_logging
from app.services.sportybet_live_job import process_one_sync_job

logger = logging.getLogger("app.workers.live_sync")


def run_forever() -> None:
    init_logging()
    settings = get_settings()
    settings.validate_for_runtime()
    poll = float(getattr(settings, "sportybet_live_sync_poll_seconds", 2.0))
    poll = min(max(poll, 0.25), 30.0)
    logger.info("SportyBet sync worker started poll=%.2fs", poll)
    while True:
        try:
            job_id = process_one_sync_job()
            if job_id:
                logger.info("Processed sync job %s", job_id)
                continue
        except Exception:
            logger.exception("Live-sync worker loop error")
        time.sleep(poll)


if __name__ == "__main__":
    run_forever()
