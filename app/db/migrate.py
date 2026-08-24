"""Run Alembic upgrades even when a leftover branch creates multiple heads.

Heroku still has the first 006 revision file whose id is longer than
alembic_version.version_num (varchar 32). That file and 006_live_sync_job_idx
are sibling heads, so `alembic upgrade head` refuses to run.

This entrypoint upgrades the newest stampable head (id length <= 32) instead.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

logger = logging.getLogger("app.db.migrate")

VERSION_NUM_MAX = 32
BACKEND_ROOT = Path(__file__).resolve().parents[2]


def choose_upgrade_target(script: ScriptDirectory) -> str:
    heads = list(script.get_heads())
    usable = [head for head in heads if len(head) <= VERSION_NUM_MAX]
    skipped = [head for head in heads if head not in usable]
    if skipped:
        logger.warning(
            "Ignoring Alembic heads with version_num longer than %s: %s",
            VERSION_NUM_MAX,
            skipped,
        )
    if len(heads) == 1 and usable:
        return "head"
    if len(usable) == 1:
        return usable[0]
    if not usable:
        raise RuntimeError(
            "No stampable Alembic head (revision ids must be "
            f"{VERSION_NUM_MAX} characters or fewer); heads={heads}"
        )

    def depth(rev_id: str) -> int:
        count = 0
        rev = script.get_revision(rev_id)
        seen: set[str] = set()
        while rev is not None and rev.revision not in seen:
            seen.add(rev.revision)
            down = rev.down_revision
            if not down or isinstance(down, tuple):
                break
            count += 1
            rev = script.get_revision(down)
        return count

    return max(usable, key=depth)


def alembic_config() -> Config:
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    return cfg


def run_upgrade() -> str:
    cfg = alembic_config()
    script = ScriptDirectory.from_config(cfg)
    target = choose_upgrade_target(script)
    logger.info("Alembic heads=%s target=%s", script.get_heads(), target)
    command.upgrade(cfg, target)
    return target


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    run_upgrade()


if __name__ == "__main__":
    main()
