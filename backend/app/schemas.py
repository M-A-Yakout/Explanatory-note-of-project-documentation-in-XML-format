import re
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from .models import Role

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


def _check_password(v: str) -> str:
    if len(v) < 10 or not re.search(r"[A-ZА-ЯЁ]", v) or not re.search(r"\d", v):
        raise ValueError("Пароль: минимум 10 символов, заглавная буква и цифра")
    return v


class OrgJoin(CamelModel):
    mode: Literal["join"]
    organization_id: str


class OrgCreate(CamelModel):
    mode: Literal["create"]
    name: str = Field(min_length=2, max_length=255)
    inn: str = Field(pattern=r"^\d{10}$")


class RegisterIn(CamelModel):
    full_name: str = Field(min_length=3, max_length=255)
    email: str
    password: str
    organization: Annotated[Union[OrgJoin, OrgCreate], Field(discriminator="mode")]

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Некорректный email")
        return v

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class LoginIn(CamelModel):
    email: str
    password: str


class EmailIn(CamelModel):
    email: str


class ResetIn(CamelModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class TokenIn(CamelModel):
    token: str


class OrganizationOut(CamelModel):
    id: str
    name: str
    short_name: str
    inn: str
    ogrn: str = ""
    address: str = ""
    limits: dict = {"maxUsers": 50, "maxProjects": 200, "maxStorageMb": 5000}
    members_count: int
    created_at: datetime
    is_active: bool


class OrganizationPublic(CamelModel):
    id: str
    name: str
    inn: str


class UserOut(CamelModel):
    id: str
    full_name: str
    email: str
    role: Role
    status: Literal["active", "blocked"]
    organization_ids: list[str]
    active_organization_id: str
    created_at: datetime
    last_login_at: datetime | None = None


class SessionOut(CamelModel):
    user: UserOut
    organization: OrganizationOut
    token: str
