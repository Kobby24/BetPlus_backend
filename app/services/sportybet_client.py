"""Async SportyBet facts-center client.

Uses one HTTP client per synchronization fetch. Does not log request headers.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger("app.services.sportybet")

TRANSIENT_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

DEFAULT_FACTS_URL = "https://www.sportybet.com/api/gh/factsCenter/importantEvents"
DEFAULT_SPORT_ID = "sr:sport:1"
DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_RETRY_ATTEMPTS = 2
DEFAULT_CLIENT_ID = "web"
DEFAULT_OPER_ID = "3"
DEFAULT_REFERER = "https://www.sportybet.com/gh/"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)


def _setting(settings: object, name: str, default: Any) -> Any:
    value = getattr(settings, name, default)
    if value is None or value == "":
        return default
    return value


class SportyBetUpstreamError(Exception):
    """Upstream SportyBet request failed in a way the API should surface."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def sportybet_headers(settings: object) -> dict[str, str]:
    return {
        "Accept": "*/*",
        "Accept-Language": "en",
        "Clientid": str(_setting(settings, "sportybet_client_id", DEFAULT_CLIENT_ID)),
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Operid": str(_setting(settings, "sportybet_oper_id", DEFAULT_OPER_ID)),
        "Platform": "web",
        "Referer": str(_setting(settings, "sportybet_referer", DEFAULT_REFERER)),
        "User-Agent": str(_setting(settings, "sportybet_user_agent", DEFAULT_USER_AGENT)),
    }


def _request_timeout(settings: object) -> httpx.Timeout:
    total = float(_setting(settings, "sportybet_timeout_seconds", DEFAULT_TIMEOUT_SECONDS))
    total = min(max(total, 1.0), 60.0)
    return httpx.Timeout(
        connect=min(5.0, total),
        read=total,
        write=total,
        pool=total,
    )


def validate_facts_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SportyBetUpstreamError("Upstream JSON is not an object")
    if "data" not in payload:
        raise SportyBetUpstreamError("Upstream JSON missing data")
    if not isinstance(payload.get("data"), list):
        raise SportyBetUpstreamError("Upstream data is not a list")
    biz = payload.get("bizCode")
    if biz not in (10000, "10000"):
        raise SportyBetUpstreamError(f"Upstream rejected request (bizCode={biz})")
    return payload


async def fetch_important_events(
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    headers = sportybet_headers(settings)
    params = {
        "sportId": str(_setting(settings, "sportybet_sport_id", DEFAULT_SPORT_ID)),
        "_t": str(int(time.time() * 1000)),
    }
    url = str(_setting(settings, "sportybet_facts_url", DEFAULT_FACTS_URL))
    attempts = int(_setting(settings, "sportybet_retry_attempts", DEFAULT_RETRY_ATTEMPTS))
    attempts = min(max(attempts, 1), 3)
    timeout = _request_timeout(settings)

    async def _get(http: httpx.AsyncClient) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                response = await http.get(url, params=params, headers=headers)
            except httpx.TimeoutException as exc:
                last_error = exc
                logger.warning(
                    "SportyBet timeout on attempt %s/%s", attempt, attempts
                )
                if attempt >= attempts:
                    raise SportyBetUpstreamError(
                        "Upstream request timed out", status_code=504
                    ) from exc
                continue
            except httpx.RequestError as exc:
                last_error = exc
                logger.warning(
                    "SportyBet connection error on attempt %s/%s",
                    attempt,
                    attempts,
                )
                if attempt >= attempts:
                    raise SportyBetUpstreamError(
                        "Upstream connection failed"
                    ) from exc
                continue

            logger.info(
                "SportyBet facts-center HTTP %s attempt %s/%s",
                response.status_code,
                attempt,
                attempts,
            )
            if response.status_code in TRANSIENT_STATUS_CODES:
                if attempt < attempts:
                    continue
                raise SportyBetUpstreamError(
                    f"Upstream returned HTTP {response.status_code}"
                )
            if response.status_code >= 400:
                raise SportyBetUpstreamError(
                    f"Upstream returned HTTP {response.status_code}"
                )
            try:
                payload = response.json()
            except json.JSONDecodeError as exc:
                raise SportyBetUpstreamError(
                    "Upstream returned invalid JSON"
                ) from exc
            return validate_facts_payload(payload)

        raise SportyBetUpstreamError("Upstream request failed") from last_error

    if client is not None:
        return await _get(client)

    async with httpx.AsyncClient(
        timeout=timeout, follow_redirects=True
    ) as owned:
        return await _get(owned)
