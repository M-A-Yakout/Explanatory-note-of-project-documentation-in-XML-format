import hmac

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..core.config import settings
from ..core.db import get_db
from ..core.errors import api_error
from ..core.mailer import send_email
from ..core.security import TokenError, create_token, decode_payload, decode_token, hash_password, verify_password
from ..core.timeutil import aware, utcnow
from ..deps import get_current_user
from ..models import Invitation, Organization, Role, User
from ..notify import notify
from ..schemas import EmailIn, LoginIn, RegisterIn, ResetIn, SessionOut, TokenIn
from ..schemas_admin import AcceptInviteIn, InviteInfo
from ..serializers import org_out, user_out
from ..settings_store import get_settings, render

router = APIRouter(prefix="/auth", tags=["auth"])


def _session(user: User) -> SessionOut:
    token = create_token(user.id, "access", settings.access_token_minutes)
    return SessionOut(user=user_out(user), organization=org_out(user.organization), token=token)


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _user_count(db: Session, org_id: int) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.organization_id == org_id)) or 0


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    cfg = get_settings(db)
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
        if _user_count(db, org.id) >= org.max_users:
            raise api_error(409, "limit_reached", "В организации достигнут лимит пользователей. Обратитесь к администратору")
        role = Role.designer

    user = User(
        email=body.email, full_name=body.full_name.strip(), password_hash=hash_password(body.password),
        role=role, organization=org, email_confirmed=not cfg["requireEmailConfirmation"],
    )
    user.refresh_search()
    db.add(user)
    db.flush()
    audit(db, "auth.register", user=user, entity_type="user", entity_id=user.id,
          summary=f"{user.email} · {'новая организация' if org_data.mode == 'create' else 'вступление'}: {org.name}", ip=_ip(request))
    db.commit()

    if cfg["requireEmailConfirmation"]:
        token = create_token(user.id, "confirm", settings.confirm_token_minutes)
        send_email(user.email, *render(cfg["emailTemplates"]["confirm"], link=f"{settings.frontend_url}/confirm/{token}"))
    return {"email": user.email}


@router.post("/login", response_model=SessionOut, response_model_by_alias=True)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        audit(db, "auth.login_failed", user=user, org_id=user.organization_id if user else None, user_name=user.full_name if user else "",
              entity_type="user", entity_id=user.id if user else "", summary=f"Неверные данные: {email}", result="denied", ip=_ip(request))
        db.commit()
        raise api_error(401, "invalid_credentials", "Неверная почта или пароль")
    if not user.is_active or (user.organization and not user.organization.is_active):
        audit(db, "auth.login_failed", user=user, entity_type="user", entity_id=user.id, summary="Учётная запись или организация заблокированы", result="denied", ip=_ip(request))
        db.commit()
        raise api_error(423, "locked", "Учётная запись заблокирована")
    if not user.email_confirmed:
        raise api_error(403, "email_not_confirmed", "Подтвердите почту по ссылке из письма")
    user.last_login_at = utcnow()
    audit(db, "auth.login", user=user, entity_type="user", entity_id=user.id, summary="Вход в систему", ip=_ip(request))
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
        cfg = get_settings(db)["emailTemplates"]["reset"]
        send_email(user.email, *render(cfg, link=f"{settings.frontend_url}/reset-password/{token}", minutes=settings.reset_token_minutes))
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
    audit(db, "auth.password_reset", user=user, entity_type="user", entity_id=user.id, summary="Пароль сброшен по ссылке")
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


def _valid_invitation(db: Session, token: str) -> Invitation:
    try:
        payload = decode_payload(token, "invite")
    except TokenError as e:
        raise api_error(400, "token_expired" if e.expired else "token_invalid", "Приглашение недействительно или истекло")
    inv = db.get(Invitation, int(payload["sub"]))
    # the nonce ties the link to this very invitation: a replaced/revoked one can never be revived by a reused row id
    if (inv is None or not inv.nonce or not hmac.compare_digest(inv.nonce, str(payload.get("n", "")))
            or inv.accepted_at is not None or aware(inv.expires_at) < utcnow()):
        raise api_error(400, "token_invalid", "Приглашение недействительно или истекло")
    return inv


@router.get("/invite-info", response_model=InviteInfo, response_model_by_alias=True)
def invite_info(token: str, db: Session = Depends(get_db)):
    """Lets the invitation page show who is invited where, before the person sets a password."""
    inv = _valid_invitation(db, token)
    return InviteInfo(email=inv.email, organization_name=inv.organization.name, role=inv.role)


@router.post("/accept-invite", response_model=SessionOut, response_model_by_alias=True)
def accept_invite(body: AcceptInviteIn, request: Request, db: Session = Depends(get_db)):
    inv = _valid_invitation(db, body.token)
    org = inv.organization
    if not org.is_active:
        raise api_error(423, "locked", "Организация отключена")
    if db.scalar(select(User).where(User.email == inv.email)):
        raise api_error(409, "conflict", "Пользователь с такой почтой уже зарегистрирован")
    if _user_count(db, org.id) >= org.max_users:
        raise api_error(409, "limit_reached", "В организации достигнут лимит пользователей")
    user = User(email=inv.email, full_name=body.full_name.strip(), password_hash=hash_password(body.password), role=inv.role,
                organization=org, email_confirmed=True, last_login_at=utcnow())
    user.refresh_search()
    db.add(user)
    db.flush()
    inv.accepted_at = utcnow()
    audit(db, "user.invite_accepted", user=user, entity_type="invitation", entity_id=inv.id, summary=f"{inv.email} ({inv.role.value})", ip=_ip(request))
    notify(db, inv.invited_by, "invitation", f"{user.full_name} принял(а) приглашение", f"{user.email} · {inv.role.value}", "/admin/users")
    db.commit()
    return _session(user)
