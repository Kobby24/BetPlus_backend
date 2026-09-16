from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.schema_status import schema_gaps
from app.db.session import get_db

router = APIRouter()


@router.get("/")
def health():
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    missing = schema_gaps(db.get_bind())
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                "database schema is not migrated (missing "
                + ", ".join(missing)
                + "); run alembic upgrade head"
            ),
        )
    return {"status": "ok"}
