import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..deps import require_roles
from ..models import AuditLog, Organization, Role, User
from ..schemas_admin import AuditOut, AuditPage

router = APIRouter(prefix="/audit", tags=["audit"])
ADMINS = require_roles(Role.super_admin, Role.org_admin)
EXPORT_LIMIT = 5000


def _conditions(actor: User, user_id, action, entity_type, date_from, date_to, q, result, organization_id):
    cond = []
    if actor.role != Role.super_admin:  # org admins only ever see their own organization
        cond.append(AuditLog.organization_id == actor.organization_id)
    elif organization_id:
        cond.append(AuditLog.organization_id == (int(organization_id) if organization_id.isdigit() else -1))
    if user_id:
        cond.append(AuditLog.user_id == user_id)
    if action:
        cond.append(AuditLog.action == action)
    if entity_type:
        cond.append(AuditLog.entity_type == entity_type)
    if result:
        cond.append(AuditLog.result == result)
    if date_from:
        cond.append(AuditLog.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        cond.append(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc))
    if q and q.strip():
        cond.append(AuditLog.search_text.like(f"%{q.strip().lower()}%"))
    return cond


def _rows(db: Session, cond, limit, offset=0):
    stmt = (select(AuditLog, Organization.name).outerjoin(Organization, Organization.id == AuditLog.organization_id)
            .where(*cond).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit))
    return db.execute(stmt).all()


def _out(a: AuditLog, org_name: str | None) -> AuditOut:
    return AuditOut(id=str(a.id), created_at=a.created_at, user_id=str(a.user_id) if a.user_id else None, user_name=a.user_name,
                    organization_id=str(a.organization_id) if a.organization_id else None, organization_name=org_name or "",
                    action=a.action, entity_type=a.entity_type, entity_id=a.entity_id, summary=a.summary, result=a.result, ip=a.ip)


FILTERS = dict(
    user_id=Query(None, alias="userId"), action=Query(None), entity_type=Query(None, alias="entityType"),
    date_from=Query(None, alias="dateFrom"), date_to=Query(None, alias="dateTo"), q=Query(None),
    result=Query(None, pattern="^(ok|denied)$"), organization_id=Query(None, alias="organizationId"),
)


@router.get("", response_model=AuditPage, response_model_by_alias=True)
def list_audit(
    user_id: int | None = FILTERS["user_id"], action: str | None = FILTERS["action"], entity_type: str | None = FILTERS["entity_type"],
    date_from: date | None = FILTERS["date_from"], date_to: date | None = FILTERS["date_to"], q: str | None = FILTERS["q"],
    result: str | None = FILTERS["result"], organization_id: str | None = FILTERS["organization_id"],
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100, alias="pageSize"),
    db: Session = Depends(get_db), actor: User = Depends(ADMINS),
):
    cond = _conditions(actor, user_id, action, entity_type, date_from, date_to, q, result, organization_id)
    total = db.scalar(select(func.count()).select_from(AuditLog).where(*cond)) or 0
    rows = _rows(db, cond, page_size, (page - 1) * page_size)
    return AuditPage(items=[_out(a, n) for a, n in rows], total=total, page=page, page_size=page_size)


@router.get("/actions", response_model=list[str])
def actions(db: Session = Depends(get_db), actor: User = Depends(ADMINS)):
    stmt = select(AuditLog.action).distinct().order_by(AuditLog.action)
    if actor.role != Role.super_admin:
        stmt = stmt.where(AuditLog.organization_id == actor.organization_id)
    return list(db.scalars(stmt))


@router.get("/export")
def export_csv(
    user_id: int | None = FILTERS["user_id"], action: str | None = FILTERS["action"], entity_type: str | None = FILTERS["entity_type"],
    date_from: date | None = FILTERS["date_from"], date_to: date | None = FILTERS["date_to"], q: str | None = FILTERS["q"],
    result: str | None = FILTERS["result"], organization_id: str | None = FILTERS["organization_id"],
    db: Session = Depends(get_db), actor: User = Depends(ADMINS),
):
    """CSV for Excel: UTF-8 with BOM, ';' separator. Values starting with = + - @ are neutralised (formula injection)."""
    cond = _conditions(actor, user_id, action, entity_type, date_from, date_to, q, result, organization_id)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Время (UTC)", "Пользователь", "Организация", "Действие", "Объект", "Идентификатор", "Описание", "Результат", "IP"])

    def safe(v):
        v = "" if v is None else str(v)
        return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v

    for a, org_name in _rows(db, cond, EXPORT_LIMIT):
        w.writerow([a.created_at.strftime("%Y-%m-%d %H:%M:%S"), *map(safe, (a.user_name, org_name, a.action, a.entity_type, a.entity_id, a.summary, a.result, a.ip))])
    return Response(("\ufeff" + buf.getvalue()).encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="audit_log.csv"'})
