from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.payment import RateLimitHit


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host
    return "unknown"


def enforce_rate_limit(
    *,
    bucket: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    settings = get_settings()
    if not settings.effective_rate_limit_enabled:
        return

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        db.query(RateLimitHit).filter(
            RateLimitHit.bucket == bucket, RateLimitHit.created_at < cutoff
        ).delete(synchronize_session=False)

        count = (
            db.query(RateLimitHit)
            .filter(RateLimitHit.bucket == bucket, RateLimitHit.created_at >= cutoff)
            .count()
        )
        if count >= limit:
            raise HTTPException(status_code=429, detail="Too many requests")

        db.add(RateLimitHit(bucket=bucket))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
