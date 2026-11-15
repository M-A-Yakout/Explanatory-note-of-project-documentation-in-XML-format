"""Runtime settings editable by a super admin. Stored as key/value rows; defaults fill the gaps."""
from typing import Any

from pydantic import Field
from sqlalchemy.orm import Session

from .core.camel import CamelModel
from .core.config import settings as env
from .models import Setting

TEMPLATE_DEFAULTS = {
    "confirm": {"subject": "Подтверждение регистрации", "body": "Здравствуйте!\n\nПодтвердите адрес почты по ссылке:\n{link}\n"},
    "invite": {"subject": "Приглашение в «{org}»", "body": "Вас пригласили в организацию «{org}» (роль: {role}).\n\nПринять приглашение (ссылка действует 7 дней):\n{link}\n"},
    "reset": {"subject": "Восстановление пароля", "body": "Для смены пароля перейдите по ссылке (действует {minutes} мин.):\n{link}\n"},
}


class Template(CamelModel):
    subject: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=10, max_length=5000)


class EmailTemplates(CamelModel):
    confirm: Template
    invite: Template
    reset: Template


class SystemSettings(CamelModel):
    max_xml_mb: int = Field(ge=1, le=50)
    require_email_confirmation: bool
    block_export_on_warnings: bool  # warnings block export/validated status, not only errors
    warn_outdated_references: bool  # BR-031
    email_templates: EmailTemplates


def defaults() -> dict[str, Any]:
    return SystemSettings(
        max_xml_mb=env.max_xml_mb, require_email_confirmation=env.require_email_confirmation, block_export_on_warnings=False,
        warn_outdated_references=True, email_templates=EmailTemplates(**TEMPLATE_DEFAULTS),
    ).model_dump(by_alias=True)


def get_settings(db: Session) -> dict[str, Any]:
    out = defaults()
    for row in db.query(Setting).all():
        if row.key in out:
            out[row.key] = row.value
    return out


def save_settings(db: Session, new: SystemSettings) -> dict[str, Any]:
    data = new.model_dump(by_alias=True)
    for key, value in data.items():
        row = db.get(Setting, key)
        if row is None:
            db.add(Setting(key=key, value=value))
        else:
            row.value = value
    db.flush()
    return data


def render(template: dict[str, str], **vars) -> tuple[str, str]:
    """Placeholders: {link} {org} {role} {minutes}. Unknown placeholders are left as typed, never raise."""
    class Safe(dict):
        def __missing__(self, k):
            return "{" + k + "}"
    return template["subject"].format_map(Safe(vars)), template["body"].format_map(Safe(vars))
