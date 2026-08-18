import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("POSTGRES_TEST_URL"),
    reason="PostgreSQL concurrency tests require POSTGRES_TEST_URL",
)


def test_postgres_url_configured():
    assert os.environ["POSTGRES_TEST_URL"].startswith("postgresql")
