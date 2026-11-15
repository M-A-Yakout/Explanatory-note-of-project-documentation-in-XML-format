from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from .core.camel import CamelModel
from .models import Role
from .schemas import EMAIL_RE, _check_password


class UserAdminOut(CamelModel):
    id: str
    full_name: str
    email: str
    role: Role
    status: Literal["active", "blocked"]
    organization_id: str
    organization_name: str
    email_confirmed: bool
    created_at: datetime
    last_login_at: datetime | None = None


class UserPage(CamelModel):
    items: list[UserAdminOut]
    total: int
    page: int
    page_size: int


class UserPatch(CamelModel):
    full_name: str | None = Field(default=None, min_length=3, max_length=255)
    role: Role | None = None
    status: Literal["active", "blocked"] | None = None


class InviteIn(CamelModel):
    email: str
    role: Role
    organization_id: str | None = None  # super admin only

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Некорректный email")
        return v


class InvitationOut(CamelModel):
    id: str
    email: str
    role: Role
    organization_id: str
    organization_name: str
    invited_by_name: str
    expires_at: datetime
    created_at: datetime


class AcceptInviteIn(CamelModel):
    token: str
    full_name: str = Field(min_length=3, max_length=255)
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class Prefs(CamelModel):
    validation: bool = True
    versions: bool = True
    invitations: bool = True
    email: bool = True


class ProfileOut(CamelModel):
    id: str
    full_name: str
    email: str
    role: Role
    position: str
    phone: str
    organization_name: str
    prefs: Prefs
    created_at: datetime
    last_login_at: datetime | None = None


class ProfilePatch(CamelModel):
    full_name: str | None = Field(default=None, min_length=3, max_length=255)
    position: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    prefs: Prefs | None = None


class PasswordChangeIn(CamelModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class OrgCreate(CamelModel):
    name: str = Field(min_length=2, max_length=255)
    inn: str = Field(pattern=r"^\d{10}$")
    ogrn: str = Field(default="", pattern=r"^(\d{13}|\d{15})?$")
    address: str = Field(default="", max_length=500)
    max_users: int = Field(default=50, ge=1, le=10000)
    max_projects: int = Field(default=200, ge=1, le=100000)


class OrgPatch(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    inn: str | None = Field(default=None, pattern=r"^\d{10}$")
    ogrn: str | None = Field(default=None, pattern=r"^(\d{13}|\d{15})?$")
    address: str | None = Field(default=None, max_length=500)
    max_users: int | None = Field(default=None, ge=1, le=10000)
    max_projects: int | None = Field(default=None, ge=1, le=100000)
    is_active: bool | None = None


class OrgAdminOut(CamelModel):
    id: str
    name: str
    inn: str
    ogrn: str
    address: str
    max_users: int
    max_projects: int
    users_count: int
    projects_count: int
    documents_count: int
    is_active: bool
    created_at: datetime


class AuditOut(CamelModel):
    id: str
    created_at: datetime
    user_id: str | None
    user_name: str
    organization_id: str | None
    organization_name: str
    action: str
    entity_type: str
    entity_id: str
    summary: str
    result: str
    ip: str | None


class AuditPage(CamelModel):
    items: list[AuditOut]
    total: int
    page: int
    page_size: int


class NotificationOut(CamelModel):
    id: str
    kind: str
    title: str
    body: str
    link: str | None
    read: bool
    created_at: datetime


class NotificationPage(CamelModel):
    items: list[NotificationOut]
    total: int
    unread: int
    page: int
    page_size: int


class InviteInfo(CamelModel):
    email: str
    organization_name: str
    role: Role
