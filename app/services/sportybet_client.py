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


class SportyBetUpstreamError(Exception):
    """Upstream SportyBet request failed in a way the API should surface."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def sportybet_headers(settings: Settings) -> dict[str, str]:
    return {
        "Accept": "*/*",
        "Accept-Language": "en",
        "Clientid": settings.sportybet_client_id,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Operid": settings.sportybet_oper_id,
        "Platform": "web",
        "Referer": settings.sportybet_referer,
        "User-Agent": settings.sportybet_user_agent,
    }


def _request_timeout(settings: Settings) -> httpx.Timeout:
    total = settings.sportybet_timeout_seconds
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
        "sportId": settings.sportybet_sport_id,
        "_t": str(int(time.time() * 1000)),
    }
    url = settings.sportybet_facts_url
    attempts = settings.sportybet_retry_attempts
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
