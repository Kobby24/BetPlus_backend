"""Validate Alembic logging config and a single linear migration head."""

from __future__ import annotations

import configparser
from logging.config import fileConfig
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"

EXPECTED_REVISIONS = (
    "001_initial",
    "002_ops_ledger",
    "003_production_hardening",
)


def test_alembic_ini_logger_sections_are_complete():
    parser = configparser.ConfigParser()
    read = parser.read(ALEMBIC_INI)
    assert read, f"Could not read {ALEMBIC_INI}"

    logger_keys = [key.strip() for key in parser.get("loggers", "keys").split(",") if key.strip()]
    assert "root" in logger_keys
    assert "sqlalchemy" in logger_keys
    assert "alembic" in logger_keys
    for key in logger_keys:
        assert parser.has_section(f"logger_{key}"), f"missing [logger_{key}]"

    handler_keys = [key.strip() for key in parser.get("handlers", "keys").split(",") if key.strip()]
    for key in handler_keys:
        assert parser.has_section(f"handler_{key}"), f"missing [handler_{key}]"

    formatter_keys = [
        key.strip() for key in parser.get("formatters", "keys").split(",") if key.strip()
    ]
    for key in formatter_keys:
        assert parser.has_section(f"formatter_{key}"), f"missing [formatter_{key}]"


def test_alembic_fileconfig_does_not_raise():
    fileConfig(str(ALEMBIC_INI), disable_existing_loggers=False)


def test_alembic_env_reads_database_url_from_environment():
    source = (BACKEND_ROOT / "alembic" / "env.py").read_text(encoding="utf-8")
    assert 'os.environ.get("DATABASE_URL")' in source
    assert "reject_sqlite_if_hosted" in source
    assert "prepare_database" in source
    assert "disable_existing_loggers=False" in source


def test_alembic_has_single_expected_head():
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert heads == ["003_production_hardening"]

    revisions = list(script.walk_revisions())
    ids = [rev.revision for rev in reversed(revisions)]
    assert ids == list(EXPECTED_REVISIONS)

    current = None
    for revision_id in EXPECTED_REVISIONS:
        rev = script.get_revision(revision_id)
        assert rev.down_revision == current
        current = revision_id