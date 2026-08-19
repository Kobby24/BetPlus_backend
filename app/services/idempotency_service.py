import hashlib
import json
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.payment import IdempotencyKey


def request_hash(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class IdempotencyService:
    @staticmethod
    def replay_or_begin(
        db: Session,
        *,
        user_id: str,
        key: str | None,
        method: str,
        path: str,
        payload: Any,
    ) -> IdempotencyKey | None:
        if not key:
            return None
        normalized = key.strip()[:128]
        if not normalized:
            return None

        digest = request_hash(payload)
        existing = (
            db.query(IdempotencyKey)
            .filter(
                IdempotencyKey.user_id == user_id,
                IdempotencyKey.key_value == normalized,
            )
            .with_for_update()
            .first()
        )
        if existing:
            if existing.request_hash != digest or existing.path != path:
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency-Key reused with a different request",
                )
            return existing

        placeholder = IdempotencyKey(
            user_id=user_id,
            key_value=normalized,
            method=method,
            path=path,
            request_hash=digest,
            status_code=0,
            response_body={},
        )
        try:
            with db.begin_nested():
                db.add(placeholder)
                db.flush()
        except IntegrityError:
            existing = (
                db.query(IdempotencyKey)
                .filter(
                    IdempotencyKey.user_id == user_id,
                    IdempotencyKey.key_value == normalized,
                )
                .first()
            )
            if existing:
                if existing.request_hash != digest:
                    raise HTTPException(
                        status_code=409,
                        detail="Idempotency-Key reused with a different request",
                    )
                return existing
            raise HTTPException(status_code=409, detail="Duplicate request") from None
        return None

    @staticmethod
    def store(
        db: Session,
        *,
        user_id: str,
        key: str | None,
        method: str,
        path: str,
        payload: Any,
        status_code: int,
        response_body: Any,
    ) -> None:
        if not key:
            return
        normalized = key.strip()[:128]
        if not normalized:
            return
        row = (
            db.query(IdempotencyKey)
            .filter(
                IdempotencyKey.user_id == user_id,
                IdempotencyKey.key_value == normalized,
            )
            .first()
        )
        body = response_body
        if hasattr(response_body, "model_dump"):
            body = response_body.model_dump(mode="json")
        if row:
            row.status_code = status_code
            row.response_body = body
            db.add(row)
        else:
            db.add(
                IdempotencyKey(
                    user_id=user_id,
                    key_value=normalized,
                    method=method,
                    path=path,
                    request_hash=request_hash(payload),
                    status_code=status_code,
                    response_body=body,
                )
            )
