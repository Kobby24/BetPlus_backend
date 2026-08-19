from fastapi import APIRouter, Depends, Header, HTTPException, Request
import json
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas import PaymentInitiateIn, PaymentIntentOut
from app.services.payment_service import PaymentError, PaymentService
from app.services.rate_limit import client_ip, enforce_rate_limit

router = APIRouter()


@router.post("/deposits", response_model=PaymentIntentOut, status_code=201)
def initiate_deposit(
    payload: PaymentInitiateIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    enforce_rate_limit(bucket=f"pay:{current_user.id}", limit=20, window_seconds=60)
    try:
        intent = PaymentService.initiate_deposit(
            db,
            user_id=current_user.id,
            amount=payload.amount,
            channel=payload.channel,
            email=current_user.email,
        )
        return intent
    except PaymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/withdrawals", response_model=PaymentIntentOut, status_code=201)
def initiate_withdrawal(
    payload: PaymentInitiateIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    enforce_rate_limit(bucket=f"pay:{current_user.id}", limit=20, window_seconds=60)
    try:
        return PaymentService.initiate_withdrawal(
            db,
            user_id=current_user.id,
            amount=payload.amount,
            channel=payload.channel,
            destination=payload.destination,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{reference}", response_model=PaymentIntentOut)
def get_payment(reference: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    intent = PaymentService.get_by_ref(db, reference)
    if not intent or intent.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Payment not found")
    return intent


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_paystack_signature: str | None = Header(default=None),
    x_webhook_signature: str | None = Header(default=None),
):
    enforce_rate_limit(bucket=f"webhook:{client_ip(request)}", limit=120, window_seconds=60)
    raw = await request.body()
    signature = x_paystack_signature or x_webhook_signature
    if not PaymentService.verify_webhook_signature(raw, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc
    try:
        intent = PaymentService.handle_webhook(db, payload)
    except PaymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "reference": intent.provider_ref if intent else None, "status": intent.status if intent else None}
