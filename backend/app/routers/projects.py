from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.errors import api_error
from ..deps import get_current_user, require_roles
from ..models import ConstructionType, Document, Project, ProjectStatus, Role, User
from ..schemas import ProjectIn, ProjectOut, ProjectPage, ProjectPatch
from ..serializers import project_out

router = APIRouter(prefix="/projects", tags=["projects"])

EDITORS = (Role.super_admin, Role.org_admin, Role.designer)
ADMINS = (Role.super_admin, Role.org_admin)
SORTS = {"updated_at": Project.updated_at, "created_at": Project.created_at, "name": Project.name, "code": Project.code}


def _get_own(db: Session, user: User, project_id: int) -> Project:
    """Tenant isolation: a project of another organization looks like it does not exist."""
    p = db.get(Project, project_id)
    if p is None or p.organization_id != user.organization_id:
        raise api_error(404, "not_found", "Объект не найден")
    return p


@router.get("", response_model=ProjectPage, response_model_by_alias=True)
def list_projects(
    q: str | None = None,
    status: ProjectStatus | None = None,
    construction_type: ConstructionType | None = Query(None, alias="constructionType"),
    sort: Literal["updated_at", "created_at", "name", "code"] = "updated_at",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cond = [Project.organization_id == user.organization_id]
    if q and q.strip():
        cond.append(Project.search_text.like(f"%{q.strip().lower()}%"))
    if status:
        cond.append(Project.status == status)
    if construction_type:
        cond.append(Project.construction_type == construction_type)

    total = db.scalar(select(func.count()).select_from(Project).where(*cond)) or 0
    col = SORTS[sort]
    stmt = select(Project).where(*cond).order_by(col.asc() if order == "asc" else col.desc(), Project.id.desc())
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return ProjectPage(items=[project_out(p) for p in rows], total=total, page=page, page_size=page_size)


@router.post("", status_code=201, response_model=ProjectOut, response_model_by_alias=True)
def create_project(body: ProjectIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    p = Project(**body.model_dump(), organization_id=user.organization_id, created_by_id=user.id)
    db.add(p)
    db.flush()
    p.code = f"ПР-{p.created_at.year if p.created_at else 2026}-{p.id:04d}"
    p.refresh_search()
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.get("/{project_id}", response_model=ProjectOut, response_model_by_alias=True)
def get_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return project_out(_get_own(db, user, project_id))


@router.patch("/{project_id}", response_model=ProjectOut, response_model_by_alias=True)
def update_project(
    project_id: int, body: ProjectPatch, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))
):
    p = _get_own(db, user, project_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None and k in {"name", "address", "cadastral_number", "construction_type", "developer", "status"}:
            continue
        setattr(p, k, v)
    p.refresh_search()
    for d in db.scalars(select(Document).where(Document.project_id == p.id)):
        d.refresh_search()
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*ADMINS))):
    p = _get_own(db, user, project_id)
    if db.scalar(select(func.count()).select_from(Document).where(Document.project_id == p.id)):
        raise api_error(409, "has_documents", "Нельзя удалить объект, у которого есть документы")
    db.delete(p)
    db.commit()
    return Response(status_code=204)
