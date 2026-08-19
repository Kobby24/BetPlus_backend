from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.money import to_decimal
from app.models.referral import ReferralDeposit
from app.models.user import User

REFERRAL_COMMISSION_RATE = Decimal("0.05")
MANAGER_REFERRAL_SHARE = Decimal("0.5")


def generate_referral_code(name: str, user_id: str) -> str:
    prefix = "".join(ch for ch in name if ch.isalnum())[:4].upper() or "MGR"
    suffix = user_id.replace("-", "")[:4].upper()
    return f"{prefix}{suffix}"


class ReferralService:
    @staticmethod
    def manager_share(gross: Decimal) -> Decimal:
        return (gross * MANAGER_REFERRAL_SHARE).quantize(Decimal("0.01"))

    @staticmethod
    def platform_share(gross: Decimal) -> Decimal:
        return (gross * (Decimal("1") - MANAGER_REFERRAL_SHARE)).quantize(
            Decimal("0.01")
        )

    @staticmethod
    def ensure_manager_referral_code(db: Session, user: User) -> str | None:
        if not user.is_manager:
            return None
        if user.referral_code:
            return user.referral_code

        code = generate_referral_code(user.name or "", user.id)
        attempt = 0
        while (
            db.query(User)
            .filter(User.referral_code == code, User.id != user.id)
            .first()
        ):
            attempt += 1
            code = f"{generate_referral_code(user.name or '', user.id)}{attempt}"
        user.referral_code = code
        db.add(user)
        return code

    @staticmethod
    def track_deposit(
        db: Session,
        *,
        referred_user_id: str,
        amount: Decimal | float,
        transaction_id: str | None,
    ) -> ReferralDeposit | None:
        referred = db.get(User, referred_user_id)
        if not referred or not referred.referred_by_manager_id:
            return None

        manager = db.get(User, referred.referred_by_manager_id)
        if not manager or not manager.is_manager:
            return None

        dec_amount = to_decimal(amount)
        if dec_amount <= 0:
            return None

        commission = (dec_amount * REFERRAL_COMMISSION_RATE).quantize(Decimal("0.01"))
        entry = ReferralDeposit(
            manager_id=manager.id,
            referred_user_id=referred_user_id,
            amount=dec_amount,
            commission=commission,
            transaction_id=transaction_id,
        )
        db.add(entry)
        return entry

    @staticmethod
    def manager_stats(db: Session, manager_id: str, origin: str = "") -> dict:
        manager = db.get(User, manager_id)
        if not manager:
            raise ValueError("Manager not found")

        ReferralService.ensure_manager_referral_code(db, manager)
        code = manager.referral_code or ""
        invite_link = f"{origin}/?ref={code}" if origin and code else ""

        referred_users = (
            db.query(User)
            .filter(User.referred_by_manager_id == manager_id)
            .order_by(User.created_at.desc())
            .all()
        )
        deposits = (
            db.query(ReferralDeposit)
            .filter(ReferralDeposit.manager_id == manager_id)
            .all()
        )

        referrals = []
        for user in referred_users:
            user_deposits = [
                d for d in deposits if d.referred_user_id == user.id
            ]
            gross = sum((to_decimal(d.commission) for d in user_deposits), Decimal("0"))
            total_deposited = sum(
                (to_decimal(d.amount) for d in user_deposits), Decimal("0")
            )
            referrals.append(
                {
                    "user_id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "phone": user.phone,
                    "signed_up_at": user.created_at,
                    "deposit_count": len(user_deposits),
                    "total_deposited": float(total_deposited),
                    "gross_revenue": float(gross),
                    "commission_earned": float(ReferralService.manager_share(gross)),
                }
            )

        total_deposits = sum((to_decimal(d.amount) for d in deposits), Decimal("0"))
        gross_revenue = sum((to_decimal(d.commission) for d in deposits), Decimal("0"))
        manager_earnings = ReferralService.manager_share(gross_revenue)
        platform_earnings = ReferralService.platform_share(gross_revenue)

        return {
            "manager_id": manager_id,
            "referral_code": code,
            "invite_link": invite_link,
            "signup_count": len(referred_users),
            "total_deposits": float(total_deposits),
            "gross_revenue": float(gross_revenue),
            "manager_earnings": float(manager_earnings),
            "platform_earnings": float(platform_earnings),
            "referrals": referrals,
        }

    @staticmethod
    def all_managers_overview(db: Session) -> list[dict]:
        managers = db.query(User).filter(User.is_manager.is_(True)).all()
        rows = []
        for manager in managers:
            stats = ReferralService.manager_stats(db, manager.id)
            rows.append(
                {
                    "manager_id": manager.id,
                    "name": manager.name,
                    "email": manager.email,
                    "referral_code": stats["referral_code"],
                    "signup_count": stats["signup_count"],
                    "total_deposits": stats["total_deposits"],
                    "gross_revenue": stats["gross_revenue"],
                    "manager_earnings": stats["manager_earnings"],
                    "platform_earnings": stats["platform_earnings"],
                }
            )
        rows.sort(key=lambda r: r["gross_revenue"], reverse=True)
        return rows
