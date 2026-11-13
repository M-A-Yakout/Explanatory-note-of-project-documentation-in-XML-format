from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.db import get_db
from ..core.errors import api_error
from ..core.mailer import send_email
from ..core.security import TokenError, create_token, decode_token, hash_password, verify_password
from ..deps import get_current_user
from ..models import Organization, Role, User
from ..schemas import EmailIn, LoginIn, RegisterIn, ResetIn, SessionOut, TokenIn
from ..serializers import org_out, user_out

router = APIRouter(prefix="/auth", tags=["auth"])


def _session(user: User) -> SessionOut:
    token = create_token(user.id, "access", settings.access_token_minutes)
    return SessionOut(user=user_out(user), organization=org_out(user.organization), token=token)


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise api_error(409, "conflict", "Пользователь с такой почтой уже зарегистрирован")

    org_data = body.organization
    if org_data.mode == "create":
        if db.scalar(select(Organization).where(Organization.name == org_data.name)):
            raise api_error(409, "conflict", "Организация с таким названием уже существует")
        org = Organization(name=org_data.name, inn=org_data.inn)
        db.add(org)
        role = Role.org_admin
    else:
        org = db.get(Organization, int(org_data.organization_id)) if org_data.organization_id.isdigit() else None
        if org is None or not org.is_active:
            raise api_error(404, "not_found", "Организация не найдена")
        role = Role.designer

    user = User(
        email=body.email, full_name=body.full_name.strip(), password_hash=hash_password(body.password),
        role=role, organization=org, email_confirmed=not settings.require_email_confirmation,
    )
    db.add(user)
    db.commit()

    if settings.require_email_confirmation:
        token = create_token(user.id, "confirm", settings.confirm_token_minutes)
        send_email(user.email, "Подтверждение регистрации",
                   f"Перейдите по ссылке: {settings.frontend_url}/confirm/{token}")
    return {"email": user.email}


@router.post("/login", response_model=SessionOut, response_model_by_alias=True)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise api_error(401, "invalid_credentials", "Неверная почта или пароль")
    if not user.is_active:
        raise api_error(423, "locked", "Учётная запись заблокирована")
    if not user.email_confirmed:
        raise api_error(403, "email_not_confirmed", "Подтвердите почту по ссылке из письма")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return _session(user)


@router.get("/me", response_model=SessionOut, response_model_by_alias=True)
def me(user: User = Depends(get_current_user)):
    return _session(user)


@router.post("/forgot-password", status_code=202)
def forgot_password(body: EmailIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user and user.is_active:  # same response either way: no account enumeration
        token = create_token(user.id, "reset", settings.reset_token_minutes)
        send_email(user.email, "Восстановление пароля",
                   f"Ссылка действует {settings.reset_token_minutes} мин: {settings.frontend_url}/reset-password/{token}")
    return {"ok": True}


@router.post("/reset-password", status_code=204)
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    try:
        user_id = decode_token(body.token, "reset")
    except TokenError as e:
        raise api_error(400, "token_expired" if e.expired else "token_invalid", "Ссылка недействительна или устарела")
    user = db.get(User, user_id)
    if user is None:
        raise api_error(400, "token_invalid", "Ссылка недействительна или устарела")
    user.password_hash = hash_password(body.password)
    db.commit()
    return Response(status_code=204)


@router.post("/confirm-email")
def confirm_email(body: TokenIn, db: Session = Depends(get_db)):
    try:
        user_id = decode_token(body.token, "confirm")
    except TokenError as e:
        raise api_error(400, "token_expired" if e.expired else "token_invalid", "Ссылка недействительна или устарела")
    user = db.get(User, user_id)
    if user is None:
        raise api_error(400, "token_invalid", "Ссылка недействительна или устарела")
    user.email_confirmed = True
    db.commit()
    return {"email": user.email}
