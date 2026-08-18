from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas import (
    PasswordChangeIn,
    Token,
    UserOut,
    UserProfileUpdate,
    UserRegister,
    UserSettingsUpdate,
)

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    phone = payload.phone.strip() if payload.phone else None
    if phone and db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status_code=400, detail="Phone already registered")

    referred_by_manager_id = None
    if payload.referral_code:
        manager = (
            db.query(User)
            .filter(User.referral_code == payload.referral_code.strip().upper())
            .first()
        )
        if manager and manager.is_manager:
            referred_by_manager_id = manager.id

    user = User(
        name=(payload.name or email.split("@")[0]).strip(),
        email=email,
        phone=phone,
        hashed_password=get_password_hash(payload.password),
        referred_by_manager_id=referred_by_manager_id,
        settings={
            "notifications": True,
            "oddsFormat": "decimal",
            "language": "en",
            "managerMode": False,
        },
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    identifier = form_data.username.strip()
    user = (
        db.query(User)
        .filter((User.email == identifier.lower()) | (User.phone == identifier))
        .first()
    )
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        current_user.name = name

    if payload.email is not None:
        email = payload.email.strip().lower()
        existing = db.query(User).filter(User.email == email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        current_user.email = email

    if payload.phone is not None:
        phone = payload.phone.strip() or None
        if phone:
            existing = (
                db.query(User)
                .filter(User.phone == phone, User.id != current_user.id)
                .first()
            )
            if existing:
                raise HTTPException(status_code=400, detail="Phone already registered")
        current_user.phone = phone

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/password", response_model=UserOut)
def change_password(
    payload: PasswordChangeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.hashed_password = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/me/settings", response_model=UserOut)
def update_settings(
    payload: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = dict(current_user.settings or {})
    updates = payload.model_dump(exclude_none=True)
    settings.update(updates)
    current_user.settings = settings
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user
