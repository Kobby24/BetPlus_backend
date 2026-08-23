"""Independent HTTP client for SportyBet liveOrPrematchEvents.

This module is intentionally separate from the important-events client.
It does not call fetch_important_events() or fetch_facts_center().
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

logger = logging.getLogger("app.services.sportybet_live")

TRANSIENT_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

DEFAULT_LIVE_URL = (
    "https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents"
)
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


class SportyBetLiveUpstreamError(Exception):
    """Live/prematch upstream request failed in a way the API should surface."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def live_request_headers() -> dict[str, str]:
    return {
        "Accept": "*/*",
        "Accept-Language": "en",
        "Clientid": DEFAULT_CLIENT_ID,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Operid": DEFAULT_OPER_ID,
        "Platform": "web",
        "Referer": DEFAULT_REFERER,
        "User-Agent": DEFAULT_USER_AGENT,
    }


def _request_timeout(settings: object) -> httpx.Timeout:
    total = float(
        _setting(settings, "sportybet_live_timeout_seconds", DEFAULT_TIMEOUT_SECONDS)
    )
    total = min(max(total, 1.0), 60.0)
    return httpx.Timeout(
        connect=min(5.0, total),
        read=total,
        write=total,
        pool=total,
    )


def validate_live_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SportyBetLiveUpstreamError("Upstream JSON is not an object")
    if "data" not in payload:
        raise SportyBetLiveUpstreamError("Upstream JSON missing data")
    if not isinstance(payload.get("data"), list):
        raise SportyBetLiveUpstreamError("Upstream data is not a list")
    biz = payload.get("bizCode")
    if biz not in (10000, "10000"):
        raise SportyBetLiveUpstreamError(f"Upstream rejected request (bizCode={biz})")
    return payload


def _body_snippet(text: str) -> str:
    compact = re.sub(r"\s+", " ", text or "").strip()
    return compact[:160]


def parse_live_response_body(
    status_code: int, content_type: str | None, text: str
) -> dict[str, Any]:
    if status_code in TRANSIENT_STATUS_CODES:
        raise SportyBetLiveUpstreamError(f"Upstream returned HTTP {status_code}")
    if status_code >= 400:
        raise SportyBetLiveUpstreamError(f"Upstream returned HTTP {status_code}")
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        snippet = _body_snippet(text)
        raise SportyBetLiveUpstreamError(
            "Upstream returned invalid JSON "
            f"(status={status_code} content-type={content_type or 'unknown'} "
            f"body={snippet!r})"
        ) from exc
    return validate_live_payload(payload)


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


class SportyBetLiveClient:
    """Dedicated client for the liveOrPrematchEvents facts-center endpoint."""

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    @property
    def url(self) -> str:
        return str(_setting(self.settings, "sportybet_live_url", DEFAULT_LIVE_URL))

    async def fetch(
        self, client: httpx.AsyncClient | None = None
    ) -> dict[str, Any]:
        headers = live_request_headers()
        params = {
            "sportId": str(
                _setting(self.settings, "sportybet_live_sport_id", DEFAULT_SPORT_ID)
            ),
            "_t": str(int(time.time() * 1000)),
        }
        attempts = int(
            _setting(
                self.settings, "sportybet_live_retry_attempts", DEFAULT_RETRY_ATTEMPTS
            )
        )
        attempts = min(max(attempts, 1), 3)
        timeout = _request_timeout(self.settings)
        timeout_seconds = float(timeout.read)
        url = self.url

        async def _from_httpx(http: httpx.AsyncClient) -> dict[str, Any]:
            last_error: Exception | None = None
            for attempt in range(1, attempts + 1):
                try:
                    response = await http.get(url, params=params, headers=headers)
                except httpx.TimeoutException as exc:
                    last_error = exc
                    logger.warning(
                        "SportyBet live timeout on attempt %s/%s", attempt, attempts
                    )
                    if attempt >= attempts:
                        raise SportyBetLiveUpstreamError(
                            "Upstream request timed out", status_code=504
                        ) from exc
                    continue
                except httpx.RequestError as exc:
                    last_error = exc
                    logger.warning(
                        "SportyBet live connection error on attempt %s/%s",
                        attempt,
                        attempts,
                    )
                    if attempt >= attempts:
                        raise SportyBetLiveUpstreamError(
                            "Upstream connection failed"
                        ) from exc
                    continue

                logger.info(
                    "SportyBet liveOrPrematchEvents HTTP %s attempt %s/%s",
                    response.status_code,
                    attempt,
                    attempts,
                )
                content_type = None
                if getattr(response, "headers", None):
                    content_type = response.headers.get("content-type")
                try:
                    return parse_live_response_body(
                        response.status_code, content_type, response.text or ""
                    )
                except SportyBetLiveUpstreamError as exc:
                    last_error = exc
                    if (
                        response.status_code in TRANSIENT_STATUS_CODES
                        and attempt < attempts
                    ):
                        continue
                    raise
            raise SportyBetLiveUpstreamError("Upstream request failed") from last_error

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
                        "SportyBet live curl_cffi timeout on attempt %s/%s",
                        attempt,
                        attempts,
                    )
                    if attempt >= attempts:
                        raise SportyBetLiveUpstreamError(
                            "Upstream request timed out", status_code=504
                        ) from exc
                    continue
                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "SportyBet live curl_cffi error on attempt %s/%s: %s",
                        attempt,
                        attempts,
                        type(exc).__name__,
                    )
                    if attempt >= attempts:
                        raise SportyBetLiveUpstreamError(
                            "Upstream connection failed"
                        ) from exc
                    continue

                logger.info(
                    "SportyBet liveOrPrematchEvents HTTP %s attempt %s/%s via curl_cffi",
                    status,
                    attempt,
                    attempts,
                )
                try:
                    return parse_live_response_body(status, content_type, text)
                except SportyBetLiveUpstreamError as exc:
                    last_error = exc
                    if status in TRANSIENT_STATUS_CODES and attempt < attempts:
                        continue
                    raise
            raise SportyBetLiveUpstreamError("Upstream request failed") from last_error

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


async def fetch_live_or_prematch_events(
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    return await SportyBetLiveClient(settings=settings).fetch(client=client)
