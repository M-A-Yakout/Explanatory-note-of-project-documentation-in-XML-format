import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..audit import audit
from ..core.config import settings as env
from ..core.db import get_db
from ..core.errors import api_error
from ..core.mailer import send_email
from ..core.timeutil import utcnow
from ..core.security import create_token, hash_password, verify_password
from ..deps import get_current_user, require_roles
from ..models import Invitation, Organization, Role, User
from ..notify import prefs_of
from ..schemas_admin import (InvitationOut, InviteIn, PasswordChangeIn, Prefs, ProfileOut, ProfilePatch, UserAdminOut, UserPage, UserPatch)
from ..settings_store import get_settings, render

router = APIRouter(prefix="/users", tags=["users"])
ADMINS = (Role.super_admin, Role.org_admin)
INVITE_DAYS = 7


def user_admin_out(u: User) -> UserAdminOut:
    return UserAdminOut(
        id=str(u.id), full_name=u.full_name, email=u.email, role=u.role, status="active" if u.is_active else "blocked",
        organization_id=str(u.organization_id or ""), organization_name=u.organization.name if u.organization else "",
        email_confirmed=u.email_confirmed, created_at=u.created_at, last_login_at=u.last_login_at,
    )


def invitation_out(i: Invitation) -> InvitationOut:
    return InvitationOut(id=str(i.id), email=i.email, role=i.role, organization_id=str(i.organization_id), organization_name=i.organization.name,
                         invited_by_name=i.invited_by.full_name if i.invited_by else "—", expires_at=i.expires_at, created_at=i.created_at)


def _scope_org(actor: User, requested: str | None) -> int:
    """org_admin always works in their own organization; super_admin may name another one."""
    if actor.role == Role.super_admin and requested:
        return int(requested) if requested.isdigit() else -1
    return actor.organization_id


def _get_target(db: Session, actor: User, user_id: int) -> User:
    t = db.get(User, user_id)
    if t is None or (actor.role != Role.super_admin and t.organization_id != actor.organization_id):
        raise api_error(404, "not_found", "Пользователь не найден")
    return t


def _org_user_slots_left(db: Session, org: Organization) -> int:
    users = db.scalar(select(func.count()).select_from(User).where(User.organization_id == org.id)) or 0
    pending = db.scalar(select(func.count()).select_from(Invitation).where(
        Invitation.organization_id == org.id, Invitation.accepted_at.is_(None), Invitation.expires_at > utcnow())) or 0
    return org.max_users - users - pending


def _active_admins(db: Session, org_id: int | None) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.organization_id == org_id, User.role == Role.org_admin, User.is_active)) or 0


# ---------------- own profile (declared before /{user_id}) ----------------
def _profile(u: User) -> ProfileOut:
    return ProfileOut(id=str(u.id), full_name=u.full_name, email=u.email, role=u.role, position=u.position, phone=u.phone,
                      organization_name=u.organization.name if u.organization else "", prefs=Prefs(**prefs_of(u)),
                      created_at=u.created_at, last_login_at=u.last_login_at)


@router.get("/me", response_model=ProfileOut, response_model_by_alias=True)
def my_profile(user: User = Depends(get_current_user)):
    return _profile(user)


@router.patch("/me", response_model=ProfileOut, response_model_by_alias=True)
def update_my_profile(body: ProfilePatch, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
        user.refresh_search()
    if body.position is not None:
        user.position = body.position.strip()
    if body.phone is not None:
        user.phone = body.phone.strip()
    if body.prefs is not None:
        user.prefs = body.prefs.model_dump()
    db.commit()
    return _profile(user)


@router.post("/me/password")
def change_password(body: PasswordChangeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not verify_password(body.current_password, user.password_hash):
        audit(db, "auth.password_change_failed", user=user, entity_type="user", entity_id=user.id, summary="Неверный текущий пароль", result="denied")
        db.commit()
        raise api_error(400, "invalid_credentials", "Текущий пароль указан неверно")
    if verify_password(body.new_password, user.password_hash):
        raise api_error(422, "validation", "Новый пароль должен отличаться от текущего")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # other devices/sessions are signed out; this one gets a fresh token below
    audit(db, "auth.password_changed", user=user, entity_type="user", entity_id=user.id, summary="Пароль изменён")
    db.commit()
    return {"token": create_token(user.id, "access", env.access_token_minutes, v=user.token_version)}


# ---------------- user administration ----------------
@router.get("", response_model=UserPage, response_model_by_alias=True)
def list_users(
    q: str | None = None, role: Role | None = None, status: str | None = Query(None, pattern="^(active|blocked)$"),
    organization_id: str | None = Query(None, alias="organizationId"),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: Session = Depends(get_db), actor: User = Depends(require_roles(*ADMINS)),
):
    cond = []
    if actor.role == Role.super_admin:
        if organization_id:
            cond.append(User.organization_id == (int(organization_id) if organization_id.isdigit() else -1))
    else:
        cond.append(User.organization_id == actor.organization_id)
    if q and q.strip():
        cond.append(User.search_text.like(f"%{q.strip().lower()}%"))
    if role:
        cond.append(User.role == role)
    if status:
        cond.append(User.is_active == (status == "active"))
    total = db.scalar(select(func.count()).select_from(User).where(*cond)) or 0
    rows = db.scalars(select(User).where(*cond).options(selectinload(User.organization)).order_by(User.full_name, User.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return UserPage(items=[user_admin_out(u) for u in rows], total=total, page=page, page_size=page_size)


@router.patch("/{user_id}", response_model=UserAdminOut, response_model_by_alias=True)
def update_user(user_id: int, body: UserPatch, db: Session = Depends(get_db), actor: User = Depends(require_roles(*ADMINS))):
    t = _get_target(db, actor, user_id)
    if t.role == Role.super_admin and actor.role != Role.super_admin:
        raise api_error(403, "forbidden", "Недостаточно прав")
    if t.id == actor.id and (body.role is not None or body.status is not None):
        raise api_error(409, "self_change", "Нельзя менять собственную роль или блокировать себя")
    if body.role is not None and body.role != t.role:
        if body.role == Role.super_admin or (actor.role != Role.super_admin and body.role not in (Role.org_admin, Role.designer, Role.expert)):
            raise api_error(403, "forbidden", "Эту роль назначить нельзя")
        if t.role == Role.org_admin and _active_admins(db, t.organization_id) <= 1:
            raise api_error(409, "last_admin", "Нельзя снять роль с последнего администратора организации")
        audit(db, "user.role_changed", user=actor, org_id=t.organization_id, entity_type="user", entity_id=t.id,
              summary=f"{t.full_name}: {t.role.value} → {body.role.value}")
        t.role = body.role
    if body.status is not None and (body.status == "active") != t.is_active:
        if body.status == "blocked" and t.role == Role.org_admin and _active_admins(db, t.organization_id) <= 1:
            raise api_error(409, "last_admin", "Нельзя заблокировать последнего администратора организации")
        t.is_active = body.status == "active"
        audit(db, "user.unblocked" if t.is_active else "user.blocked", user=actor, org_id=t.organization_id, entity_type="user", entity_id=t.id, summary=t.full_name)
    if body.full_name is not None and body.full_name.strip() != t.full_name:
        audit(db, "user.updated", user=actor, org_id=t.organization_id, entity_type="user", entity_id=t.id, summary=f"Имя: {t.full_name} → {body.full_name.strip()}")
        t.full_name = body.full_name.strip()
        t.refresh_search()
    db.commit()
    db.refresh(t)
    return user_admin_out(t)


@router.post("/{user_id}/reset-password", status_code=202)
def admin_reset_password(user_id: int, db: Session = Depends(get_db), actor: User = Depends(require_roles(*ADMINS))):
    t = _get_target(db, actor, user_id)
    if t.role == Role.super_admin and actor.role != Role.super_admin:
        raise api_error(403, "forbidden", "Недостаточно прав")
    cfg = get_settings(db)["emailTemplates"]["reset"]
    token = create_token(t.id, "reset", env.reset_token_minutes)
    send_email(t.email, *render(cfg, link=f"{env.frontend_url}/reset-password/{token}", minutes=env.reset_token_minutes))
    audit(db, "user.password_reset_sent", user=actor, org_id=t.organization_id, entity_type="user", entity_id=t.id, summary=f"Ссылка для смены пароля отправлена: {t.email}")
    db.commit()
    return {"ok": True}


# ---------------- invitations ----------------
def _send_invite(db: Session, inv: Invitation) -> None:
    token = create_token(inv.id, "invite", INVITE_DAYS * 24 * 60, n=inv.nonce)
    cfg = get_settings(db)["emailTemplates"]["invite"]
    send_email(inv.email, *render(cfg, link=f"{env.frontend_url}/invite/{token}", org=inv.organization.name, role=inv.role.value))


@router.post("/invite", status_code=201, response_model=InvitationOut, response_model_by_alias=True)
def invite(body: InviteIn, db: Session = Depends(get_db), actor: User = Depends(require_roles(*ADMINS))):
    allowed = {Role.designer, Role.expert} | ({Role.org_admin} if actor.role == Role.super_admin else set())
    if body.role not in allowed:
        raise api_error(403, "forbidden", "Эту роль назначить нельзя")
    org = db.get(Organization, _scope_org(actor, body.organization_id))
    if org is None or not org.is_active:
        raise api_error(404, "not_found", "Организация не найдена")
    if db.scalar(select(User).where(User.email == body.email)):
        raise api_error(409, "conflict", "Пользователь с такой почтой уже зарегистрирован")
    now = utcnow()
    old = db.scalars(select(Invitation).where(Invitation.email == body.email, Invitation.organization_id == org.id, Invitation.accepted_at.is_(None))).all()
    for o in old:  # a new invitation replaces the pending one
        db.delete(o)
    db.flush()
    if _org_user_slots_left(db, org) <= 0:
        raise api_error(409, "limit_reached", f"Достигнут лимит пользователей организации ({org.max_users})")
    inv = Invitation(organization_id=org.id, email=body.email, role=body.role, invited_by_id=actor.id, nonce=secrets.token_hex(16), expires_at=now + timedelta(days=INVITE_DAYS))
    db.add(inv)
    db.flush()
    inv.organization, inv.invited_by = org, actor
    _send_invite(db, inv)
    audit(db, "user.invited", user=actor, org_id=org.id, entity_type="invitation", entity_id=inv.id, summary=f"{body.email} ({body.role.value})")
    db.commit()
    return invitation_out(inv)


@router.get("/invitations", response_model=list[InvitationOut], response_model_by_alias=True)
def list_invitations(organization_id: str | None = Query(None, alias="organizationId"), db: Session = Depends(get_db), actor: User = Depends(require_roles(*ADMINS))):
    cond = [Invitation.accepted_at.is_(None), Invitation.expires_at > utcnow()]
    if actor.role != Role.super_admin:
        cond.append(Invitation.organization_id == actor.organization_id)
    elif organization_id:
        cond.append(Invitation.organization_id == (int(organization_id) if organization_id.isdigit() else -1))
    rows = db.scalars(select(Invitation).where(*cond).options(selectinload(Invitation.organization), selectinload(Invitation.invited_by)).order_by(Invitation.created_at.desc()))
    return [invitation_out(i) for i in rows]


def _get_invitation(db: Session, actor: User, inv_id: int) -> Invitation:
    inv = db.get(Invitation, inv_id)
    if inv is None or inv.accepted_at is not None or (actor.role != Role.super_admin and inv.organization_id != actor.organization_id):
        raise api_error(404, "not_found", "Приглашение не найдено")
    return inv


@router.delete("/invitations/{inv_id}", status_code=204)
def revoke_invitation(inv_id: int, db: Session = Depends(get_db), actor: User = Depends(require_roles(*ADMINS))):
    inv = _get_invitation(db, actor, inv_id)
    audit(db, "user.invite_revoked", user=actor, org_id=inv.organization_id, entity_type="invitation", entity_id=inv.id, summary=inv.email)
    db.delete(inv)
    db.commit()
    return Response(status_code=204)


@router.post("/invitations/{inv_id}/resend", response_model=InvitationOut, response_model_by_alias=True)
def resend_invitation(inv_id: int, db: Session = Depends(get_db), actor: User = Depends(require_roles(*ADMINS))):
    inv = _get_invitation(db, actor, inv_id)
    inv.expires_at = utcnow() + timedelta(days=INVITE_DAYS)
    _send_invite(db, inv)
    audit(db, "user.invited", user=actor, org_id=inv.organization_id, entity_type="invitation", entity_id=inv.id, summary=f"{inv.email}: повторная отправка")
    db.commit()
    return invitation_out(inv)
