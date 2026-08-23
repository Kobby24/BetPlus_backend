"""Async SportyBet facts-center client.

Uses one HTTP client per synchronization fetch. Does not log request headers.
Production fetches use curl_cffi Chrome impersonation because datacenter
httpx requests are often served an HTML challenge instead of JSON.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
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
CURL_IMPERSONATE = "chrome124"


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


def _body_snippet(text: str) -> str:
    compact = re.sub(r"\s+", " ", text or "").strip()
    return compact[:160]


def parse_response_body(status_code: int, content_type: str | None, text: str) -> dict[str, Any]:
    if status_code in TRANSIENT_STATUS_CODES:
        raise SportyBetUpstreamError(f"Upstream returned HTTP {status_code}")
    if status_code >= 400:
        raise SportyBetUpstreamError(f"Upstream returned HTTP {status_code}")
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        snippet = _body_snippet(text)
        raise SportyBetUpstreamError(
            "Upstream returned invalid JSON "
            f"(status={status_code} content-type={content_type or 'unknown'} "
            f"body={snippet!r})"
        ) from exc
    return validate_facts_payload(payload)


def _fetch_with_curl_cffi(
    url: str,
    params: dict[str, str],
    headers: dict[str, str],
    timeout_seconds: float,
) -> tuple[int, str | None, str]:
    from curl_cffi import requests as cffi_requests

    response = cffi_requests.get(
        url,
        params=params,
        headers=headers,
        impersonate=CURL_IMPERSONATE,
        timeout=timeout_seconds,
        allow_redirects=True,
    )
    content_type = None
    if getattr(response, "headers", None):
        content_type = response.headers.get("content-type") or response.headers.get(
            "Content-Type"
        )
    return response.status_code, content_type, response.text or ""


async def fetch_facts_center(
    url: str,
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    headers = sportybet_headers(settings)
    params = {
        "sportId": str(_setting(settings, "sportybet_sport_id", DEFAULT_SPORT_ID)),
        "_t": str(int(time.time() * 1000)),
    }
    attempts = int(_setting(settings, "sportybet_retry_attempts", DEFAULT_RETRY_ATTEMPTS))
    attempts = min(max(attempts, 1), 3)
    timeout = _request_timeout(settings)
    timeout_seconds = float(timeout.read)

    async def _from_httpx(http: httpx.AsyncClient) -> dict[str, Any]:
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
            content_type = None
            if getattr(response, "headers", None):
                content_type = response.headers.get("content-type")
            try:
                return parse_response_body(
                    response.status_code, content_type, response.text or ""
                )
            except SportyBetUpstreamError as exc:
                last_error = exc
                if response.status_code in TRANSIENT_STATUS_CODES and attempt < attempts:
                    continue
                raise
        raise SportyBetUpstreamError("Upstream request failed") from last_error

    async def _from_curl_cffi() -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                status, content_type, text = await asyncio.to_thread(
                    _fetch_with_curl_cffi,
                    url,
                    params,
                    headers,
                    timeout_seconds,
                )
            except ImportError:
                raise
            except TimeoutError as exc:
                last_error = exc
                logger.warning(
                    "SportyBet curl_cffi timeout on attempt %s/%s", attempt, attempts
                )
                if attempt >= attempts:
                    raise SportyBetUpstreamError(
                        "Upstream request timed out", status_code=504
                    ) from exc
                continue
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "SportyBet curl_cffi error on attempt %s/%s: %s",
                    attempt,
                    attempts,
                    type(exc).__name__,
                )
                if attempt >= attempts:
                    raise SportyBetUpstreamError("Upstream connection failed") from exc
                continue

            logger.info(
                "SportyBet facts-center HTTP %s attempt %s/%s via curl_cffi",
                status,
                attempt,
                attempts,
            )
            try:
                return parse_response_body(status, content_type, text)
            except SportyBetUpstreamError as exc:
                last_error = exc
                if status in TRANSIENT_STATUS_CODES and attempt < attempts:
                    continue
                raise
        raise SportyBetUpstreamError("Upstream request failed") from last_error

    if client is not None:
        return await _from_httpx(client)

    try:
        return await _from_curl_cffi()
    except ImportError:
        logger.warning("curl_cffi is not installed; falling back to httpx")
        async with httpx.AsyncClient(
            timeout=timeout, follow_redirects=True
        ) as owned:
            return await _from_httpx(owned)


async def fetch_important_events(
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    url = str(_setting(settings, "sportybet_facts_url", DEFAULT_FACTS_URL))
    return await fetch_facts_center(url, settings=settings, client=client)
