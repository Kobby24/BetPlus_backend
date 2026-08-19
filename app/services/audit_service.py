from sqlalchemy.orm import Session

from app.models.audit import AuditLog


class AuditService:
    @staticmethod
    def log(
        db: Session,
        *,
        actor_id: str | None,
        role: str,
        action: str,
        detail: str = "",
        bet_id: str | None = None,
        match_id: str | None = None,
        booking_code: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            actor_id=actor_id,
            role=role,
            action=action,
            detail=detail,
            bet_id=bet_id,
            match_id=match_id,
            booking_code=booking_code,
        )
        db.add(entry)
        return entry

    @staticmethod
    def list_entries(
        db: Session, role: str | None = None, limit: int = 200
    ) -> list[AuditLog]:
        q = db.query(AuditLog)
        if role:
            q = q.filter(AuditLog.role == role)
        return q.order_by(AuditLog.created_at.desc()).limit(limit).all()
