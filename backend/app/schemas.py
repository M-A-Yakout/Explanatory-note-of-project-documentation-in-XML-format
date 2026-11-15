import re
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import Field, field_validator

from .core.camel import CamelModel

from .models import Role

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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


# ---------------- projects ----------------
from .models import ConstructionType, ProjectStatus  # noqa: E402

CADASTRAL_RE = r"^\d{2}:\d{2}:\d{6,7}:\d{1,6}$"


class ProjectIn(CamelModel):
    name: str = Field(min_length=3, max_length=500)
    address: str = Field(min_length=3, max_length=500)
    cadastral_number: str = Field(pattern=CADASTRAL_RE)
    construction_type: ConstructionType
    developer: str = Field(min_length=2, max_length=255)
    customer: str = Field(default="", max_length=255)
    designer: str = Field(default="", max_length=255)
    functional_purpose: str = Field(default="", max_length=255)
    financing_source: str = Field(default="", max_length=255)


class ProjectPatch(CamelModel):
    name: str | None = Field(default=None, min_length=3, max_length=500)
    address: str | None = Field(default=None, min_length=3, max_length=500)
    cadastral_number: str | None = Field(default=None, pattern=CADASTRAL_RE)
    construction_type: ConstructionType | None = None
    developer: str | None = Field(default=None, min_length=2, max_length=255)
    customer: str | None = Field(default=None, max_length=255)
    designer: str | None = Field(default=None, max_length=255)
    functional_purpose: str | None = Field(default=None, max_length=255)
    financing_source: str | None = Field(default=None, max_length=255)
    status: ProjectStatus | None = None


class ProjectOut(CamelModel):
    id: str
    organization_id: str
    code: str
    name: str
    address: str
    cadastral_number: str
    construction_type: ConstructionType
    developer: str
    customer: str
    designer: str
    functional_purpose: str
    financing_source: str
    status: ProjectStatus
    participant_ids: list[str]
    created_at: datetime
    updated_at: datetime


class ProjectPage(CamelModel):
    items: list[ProjectOut]
    total: int
    page: int
    page_size: int


# ---------------- documents ----------------
from .document_data import DocumentData  # noqa: E402
from .models import DocumentStatus  # noqa: E402


class DocumentCreate(CamelModel):
    project_id: str
    title: str | None = Field(default=None, max_length=500)
    schema_version: str | None = Field(default=None, max_length=20)  # None = default schema


class DocumentPatch(CamelModel):
    title: str | None = Field(default=None, min_length=3, max_length=500)
    status: DocumentStatus | None = None


class DocumentDataIn(CamelModel):
    data: DocumentData
    base_revision: int


class VersionIn(CamelModel):
    comment: str = Field(default="", max_length=500)


class DocumentOut(CamelModel):
    id: str
    organization_id: str
    project_id: str
    project_name: str
    title: str
    schema_id: str
    schema_version: str
    status: DocumentStatus
    author_id: str
    author_name: str
    progress: int
    errors_count: int = 0
    warnings_count: int = 0
    validation_stale: bool = False
    archived_at: datetime | None = None
    archived_by_name: str | None = None
    current_version: int
    revision: int
    created_at: datetime
    updated_at: datetime


class DocumentDetail(DocumentOut):
    data: dict
    sections: dict[str, bool]


class DocumentPage(CamelModel):
    items: list[DocumentOut]
    total: int
    page: int
    page_size: int


class VersionMeta(CamelModel):
    number: int
    author_id: str
    author_name: str
    comment: str
    created_at: datetime


class VersionDetail(VersionMeta):
    data: dict


class Change(CamelModel):
    path: str
    kind: Literal["added", "removed", "changed"]
    before: object | None = None
    after: object | None = None


# ---------------- xml schemas (XSD registry) ----------------
VERSION_RE = r"^\d{1,3}(\.\d{1,3}){1,2}$"


class SchemaCreate(CamelModel):
    version: str = Field(pattern=VERSION_RE)
    title: str = Field(min_length=3, max_length=255)
    filename: str = Field(default="", max_length=255)
    content: str = Field(min_length=10)
    changelog: str = Field(default="", max_length=5000)
    compatibility: str = Field(default="", max_length=5000)
    make_default: bool = False


class SchemaPatch(CamelModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    changelog: str | None = Field(default=None, max_length=5000)
    compatibility: str | None = Field(default=None, max_length=5000)
    is_active: bool | None = None


class SchemaOut(CamelModel):
    id: str
    version: str
    title: str
    filename: str
    checksum: str
    size_bytes: int
    is_active: bool
    is_default: bool
    changelog: str
    compatibility: str
    uploaded_by_name: str
    documents_count: int
    created_at: datetime
    updated_at: datetime


class StructureNode(CamelModel):
    name: str
    kind: Literal["element", "attribute"]
    type: str
    required: bool
    repeatable: bool
    children: list["StructureNode"] = []


# ---------------- validation / xml ----------------
class IssueOut(CamelModel):
    id: str
    severity: Literal["error", "warning", "info"]
    source: Literal["business", "xsd"]
    code: str
    message: str
    field: str | None = None
    section: str | None = None
    xpath: str | None = None
    line: int | None = None


class ValidationOut(CamelModel):
    issues: list[IssueOut]
    errors: int
    warnings: int
    infos: int
    checked_at: str
    revision: int
    schema_version: str
    xml_valid: bool
    blocking: int = 0
    stale: bool = False
    status: DocumentStatus


class XmlPreview(CamelModel):
    xml: str
    filename: str
    size_bytes: int
    schema_version: str
    xsd_valid: bool


# ---------------- xml import ----------------
class ImportPreviewIn(CamelModel):
    content_base64: str = Field(min_length=4)
    filename: str = Field(default="import.xml", max_length=255)
    schema_version: str | None = Field(default=None, max_length=20)


class ImportCreateIn(ImportPreviewIn):
    project_id: str
    title: str | None = Field(default=None, max_length=500)


class ImportEntry(CamelModel):
    xpath: str
    element: str
    status: Literal["skipped", "truncated"]
    message: str


class XsdSourceIssue(CamelModel):
    code: str
    message: str
    line: int | None = None
    xpath: str | None = None


class ImportSummary(CamelModel):
    object: int
    tei: int
    composition: int
    references: int
    additional: bool


class ImportReport(CamelModel):
    filename: str
    size_bytes: int
    detected_version: str | None
    used_version: str
    schema_fallback: bool
    summary: ImportSummary
    skipped: list[ImportEntry]
    skipped_total: int
    truncated: list[ImportEntry]
    truncated_total: int
    xsd_valid: bool
    xsd_issues: list[XsdSourceIssue]
    data: dict


class ImportResult(CamelModel):
    document: DocumentDetail
    report: ImportReport


# ---------------- archive, bulk, search ----------------
class BulkIn(CamelModel):
    ids: list[int] = Field(min_length=1, max_length=100)
    action: Literal["archive", "restore", "delete"]


class BulkXmlIn(CamelModel):
    ids: list[int] = Field(min_length=1, max_length=100)


class BulkItem(CamelModel):
    id: str
    ok: bool
    code: str | None = None
    message: str | None = None


class BulkResult(CamelModel):
    results: list[BulkItem]
    ok_count: int
    failed_count: int


class AuthorOut(CamelModel):
    id: str
    name: str


class SearchProject(CamelModel):
    id: str
    code: str
    name: str
    address: str
    cadastral_number: str


class SearchDocument(CamelModel):
    id: str
    title: str
    project_name: str
    status: DocumentStatus
    schema_version: str


class SearchOut(CamelModel):
    projects: list[SearchProject]
    documents: list[SearchDocument]
