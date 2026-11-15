import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.db import Base


class Role(str, enum.Enum):
    super_admin = "super_admin"
    org_admin = "org_admin"
    designer = "designer"
    expert = "expert"


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    inn: Mapped[str | None] = mapped_column(String(12))
    ogrn: Mapped[str] = mapped_column(String(15), default="", server_default="")
    address: Mapped[str] = mapped_column(String(500), default="", server_default="")
    max_users: Mapped[int] = mapped_column(Integer, default=50, server_default="50")
    max_projects: Mapped[int] = mapped_column(Integer, default=200, server_default="200")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    users: Mapped[list["User"]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.designer)
    is_active: Mapped[bool] = mapped_column(default=True)
    email_confirmed: Mapped[bool] = mapped_column(default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    position: Mapped[str] = mapped_column(String(255), default="", server_default="")
    phone: Mapped[str] = mapped_column(String(50), default="", server_default="")
    prefs: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # notification preferences
    search_text: Mapped[str] = mapped_column(Text, default="", server_default="")  # lower-cased name + e-mail
    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    organization: Mapped[Organization | None] = relationship(back_populates="users")

    def refresh_search(self) -> None:
        self.search_text = f"{self.full_name} {self.email}".lower()


class ConstructionType(str, enum.Enum):
    new = "new"
    reconstruction = "reconstruction"
    overhaul = "overhaul"
    linear = "linear"


class ProjectStatus(str, enum.Enum):
    active = "active"
    on_hold = "on_hold"
    completed = "completed"
    archived = "archived"


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    code: Mapped[str] = mapped_column(String(32), default="")
    name: Mapped[str] = mapped_column(String(500))
    address: Mapped[str] = mapped_column(String(500))
    cadastral_number: Mapped[str] = mapped_column(String(64))
    construction_type: Mapped[ConstructionType] = mapped_column(Enum(ConstructionType))
    developer: Mapped[str] = mapped_column(String(255))
    customer: Mapped[str] = mapped_column(String(255), default="")
    designer: Mapped[str] = mapped_column(String(255), default="")
    functional_purpose: Mapped[str] = mapped_column(String(255), default="")
    financing_source: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus), default=ProjectStatus.active)
    # lower-cased copy used by search: SQL lower() is ASCII-only on SQLite
    search_text: Mapped[str] = mapped_column(Text, default="")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def refresh_search(self) -> None:
        parts = (self.name, self.address, self.cadastral_number, self.code, self.developer, self.customer, self.designer)
        self.search_text = " ".join(x for x in parts if x).lower()


class DocumentStatus(str, enum.Enum):
    draft = "draft"
    in_review = "in_review"
    validated = "validated"
    archived = "archived"


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    schema_version: Mapped[str] = mapped_column(String(20))
    status: Mapped[DocumentStatus] = mapped_column(Enum(DocumentStatus), default=DocumentStatus.draft)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    revision: Mapped[int] = mapped_column(default=1)  # +1 on every autosave (optimistic locking)
    version: Mapped[int] = mapped_column(default=0)  # number of the latest saved version
    search_text: Mapped[str] = mapped_column(Text, default="")
    validation: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # last validation result
    validated_revision: Mapped[int | None] = mapped_column(nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status_before_archive: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    project: Mapped["Project"] = relationship()
    author: Mapped["User | None"] = relationship(foreign_keys=[author_id])
    archived_by: Mapped["User | None"] = relationship(foreign_keys=[archived_by_id])

    def refresh_search(self) -> None:
        p = self.project
        parts = [self.title] + ([p.name, p.cadastral_number, p.code, p.address] if p else [])
        self.search_text = " ".join(x for x in parts if x).lower()


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    number: Mapped[int]
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    comment: Mapped[str] = mapped_column(String(500), default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    author: Mapped["User | None"] = relationship()


class XmlSchema(Base):
    __tablename__ = "xml_schemas"
    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(String(20), unique=True)
    title: Mapped[str] = mapped_column(String(255))
    filename: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text)
    checksum: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(default=True)
    is_default: Mapped[bool] = mapped_column(default=False)
    changelog: Mapped[str] = mapped_column(Text, default="")
    compatibility: Mapped[str] = mapped_column(Text, default="")
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    uploaded_by: Mapped["User | None"] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), index=True, nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    user_name: Mapped[str] = mapped_column(String(255), default="", server_default="")  # snapshot: survives user changes
    action: Mapped[str] = mapped_column(String(50), index=True)
    entity_type: Mapped[str] = mapped_column(String(30), default="", server_default="")
    entity_id: Mapped[str] = mapped_column(String(40), default="", server_default="")
    summary: Mapped[str] = mapped_column(String(500), default="", server_default="")
    result: Mapped[str] = mapped_column(String(10), default="ok", server_default="ok")
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    search_text: Mapped[str] = mapped_column(Text, default="", server_default="")  # lower-cased user + summary + action


class Invitation(Base):
    __tablename__ = "invitations"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[Role] = mapped_column(Enum(Role))
    nonce: Mapped[str] = mapped_column(String(32), default="", server_default="")  # binds the e-mailed link to THIS invitation, not to a reusable row id
    invited_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    organization: Mapped[Organization] = relationship()
    invited_by: Mapped["User | None"] = relationship(foreign_keys=[invited_by_id])


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="", server_default="")
    link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str | int | bool | None] = mapped_column(JSON)
