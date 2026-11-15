from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..core.camel import CamelModel
from ..core.db import get_db
from ..core.timeutil import utcnow
from ..deps import get_current_user, require_roles
from ..models import AuditLog, Document, DocumentStatus, Organization, Project, ProjectStatus, Role, User
from ..schemas import DocumentOut
from ..schemas_admin import AuditOut
from ..serializers import doc_out
from .audit import _out as audit_out

router = APIRouter(prefix="/stats", tags=["stats"])


class DashboardOut(CamelModel):
    documents_by_status: dict[str, int]
    errors: int
    warnings: int
    stale_checks: int
    unchecked: int
    projects_total: int
    projects_active: int
    my_drafts: int
    recent: list[DocumentOut]


class WeekPoint(CamelModel):
    week_start: date
    count: int


class AdminStatsOut(CamelModel):
    users_total: int
    users_active: int
    organizations_total: int
    organizations_active: int
    projects_total: int
    documents_total: int
    documents_archived: int
    weekly_documents: list[WeekPoint]
    recent_audit: list[AuditOut]


@router.get("/dashboard", response_model=DashboardOut, response_model_by_alias=True)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    org = user.organization_id
    counts = dict(db.execute(select(Document.status, func.count()).where(Document.organization_id == org).group_by(Document.status)).all())
    by_status = {s.value: counts.get(s, 0) for s in DocumentStatus}

    errors = warnings = stale = unchecked = 0
    live = db.execute(select(Document.validation, Document.validated_revision, Document.revision)
                      .where(Document.organization_id == org, Document.status != DocumentStatus.archived)).all()
    for validation, validated_rev, rev in live:
        if validation is None:
            unchecked += 1
        elif validated_rev != rev:
            stale += 1  # the numbers of an outdated check are not counted
        else:
            errors += validation.get("errors", 0)
            warnings += validation.get("warnings", 0)

    total = db.scalar(select(func.count()).select_from(Project).where(Project.organization_id == org)) or 0
    active = db.scalar(select(func.count()).select_from(Project).where(Project.organization_id == org, Project.status == ProjectStatus.active)) or 0
    mine = db.scalar(select(func.count()).select_from(Document).where(Document.organization_id == org, Document.author_id == user.id, Document.status == DocumentStatus.draft)) or 0
    recent = db.scalars(select(Document).where(Document.organization_id == org, Document.status != DocumentStatus.archived)
                        .options(selectinload(Document.project), selectinload(Document.author), selectinload(Document.archived_by))
                        .order_by(Document.updated_at.desc()).limit(5)).all()
    return DashboardOut(documents_by_status=by_status, errors=errors, warnings=warnings, stale_checks=stale, unchecked=unchecked,
                        projects_total=total, projects_active=active, my_drafts=mine, recent=[doc_out(d) for d in recent])


@router.get("/admin", response_model=AdminStatsOut, response_model_by_alias=True)
def admin_stats(db: Session = Depends(get_db), actor: User = Depends(require_roles(Role.super_admin, Role.org_admin))):
    scoped = actor.role != Role.super_admin
    org = actor.organization_id

    def count(model, *extra):
        cond = list(extra) + ([model.organization_id == org] if scoped and hasattr(model, "organization_id") else [])
        return db.scalar(select(func.count()).select_from(model).where(*cond)) or 0

    since = utcnow() - timedelta(weeks=8)
    stmt = select(Document.created_at).where(Document.created_at >= since)
    if scoped:
        stmt = stmt.where(Document.organization_id == org)
    buckets: dict[date, int] = {}
    today = utcnow().date()
    monday = today - timedelta(days=today.weekday())
    for i in range(7, -1, -1):  # always 8 points, oldest first, empty weeks included
        buckets[monday - timedelta(weeks=i)] = 0
    for (created,) in db.execute(stmt):
        d = created.date()
        key = d - timedelta(days=d.weekday())
        if key in buckets:
            buckets[key] += 1

    audit_stmt = select(AuditLog, Organization.name).outerjoin(Organization, Organization.id == AuditLog.organization_id)
    if scoped:
        audit_stmt = audit_stmt.where(AuditLog.organization_id == org)
    recent = db.execute(audit_stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(8)).all()
    return AdminStatsOut(
        users_total=count(User), users_active=count(User, User.is_active),
        organizations_total=1 if scoped else (db.scalar(select(func.count()).select_from(Organization)) or 0),
        organizations_active=1 if scoped else (db.scalar(select(func.count()).select_from(Organization).where(Organization.is_active)) or 0),
        projects_total=count(Project), documents_total=count(Document, Document.status != DocumentStatus.archived),
        documents_archived=count(Document, Document.status == DocumentStatus.archived),
        weekly_documents=[WeekPoint(week_start=k, count=v) for k, v in buckets.items()],
        recent_audit=[audit_out(a, n) for a, n in recent],
    )
