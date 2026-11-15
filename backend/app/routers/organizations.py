from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..core.db import get_db
from ..core.errors import api_error
from ..deps import require_roles
from ..models import Document, Organization, Project, Role, User
from ..schemas import OrganizationPublic
from ..schemas_admin import OrgAdminOut, OrgCreate, OrgPatch

router = APIRouter(prefix="/organizations", tags=["organizations"])
SUPER = require_roles(Role.super_admin)


def _counts(db: Session, model) -> dict[int, int]:
    return dict(db.execute(select(model.organization_id, func.count()).group_by(model.organization_id)).all())


def _out(o: Organization, users: dict, projects: dict, documents: dict) -> OrgAdminOut:
    return OrgAdminOut(
        id=str(o.id), name=o.name, inn=o.inn or "", ogrn=o.ogrn, address=o.address, max_users=o.max_users, max_projects=o.max_projects,
        users_count=users.get(o.id, 0), projects_count=projects.get(o.id, 0), documents_count=documents.get(o.id, 0),
        is_active=o.is_active, created_at=o.created_at,
    )


def _one(db: Session, o: Organization) -> OrgAdminOut:
    return _out(o, _counts(db, User), _counts(db, Project), _counts(db, Document))


@router.get("/public", response_model=list[OrganizationPublic], response_model_by_alias=True)
def list_public(db: Session = Depends(get_db)):
    rows = db.scalars(select(Organization).where(Organization.is_active).order_by(Organization.name)).all()
    return [OrganizationPublic(id=str(o.id), name=o.name, inn=o.inn or "") for o in rows]


@router.get("", response_model=list[OrgAdminOut], response_model_by_alias=True)
def list_all(db: Session = Depends(get_db), _: User = Depends(SUPER)):
    users, projects, documents = _counts(db, User), _counts(db, Project), _counts(db, Document)
    return [_out(o, users, projects, documents) for o in db.scalars(select(Organization).order_by(Organization.name))]


@router.post("", status_code=201, response_model=OrgAdminOut, response_model_by_alias=True)
def create_org(body: OrgCreate, db: Session = Depends(get_db), actor: User = Depends(SUPER)):
    if db.scalar(select(Organization).where(Organization.name == body.name.strip())):
        raise api_error(409, "conflict", "Организация с таким названием уже существует")
    o = Organization(name=body.name.strip(), inn=body.inn, ogrn=body.ogrn, address=body.address, max_users=body.max_users, max_projects=body.max_projects)
    db.add(o)
    db.flush()
    audit(db, "org.created", user=actor, org_id=o.id, entity_type="organization", entity_id=o.id, summary=f"{o.name} (ИНН {o.inn})")
    db.commit()
    return _one(db, o)


@router.patch("/{org_id}", response_model=OrgAdminOut, response_model_by_alias=True)
def update_org(org_id: int, body: OrgPatch, db: Session = Depends(get_db), actor: User = Depends(SUPER)):
    o = db.get(Organization, org_id)
    if o is None:
        raise api_error(404, "not_found", "Организация не найдена")
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        data["name"] = data["name"].strip()
        if data["name"] != o.name and db.scalar(select(Organization).where(Organization.name == data["name"])):
            raise api_error(409, "conflict", "Организация с таким названием уже существует")
    if data.get("max_users") is not None:
        used = db.scalar(select(func.count()).select_from(User).where(User.organization_id == o.id)) or 0
        if data["max_users"] < used:
            raise api_error(409, "limit_too_low", f"В организации уже {used} пользователей: лимит не может быть меньше")
    if data.get("max_projects") is not None:
        used = db.scalar(select(func.count()).select_from(Project).where(Project.organization_id == o.id)) or 0
        if data["max_projects"] < used:
            raise api_error(409, "limit_too_low", f"В организации уже {used} объектов: лимит не может быть меньше")
    changed = [k for k, v in data.items() if v is not None and getattr(o, k) != v]
    for k, v in data.items():
        if v is not None:
            setattr(o, k, v)
    if changed:
        action = "org.deactivated" if data.get("is_active") is False else "org.activated" if data.get("is_active") is True and "is_active" in changed else "org.updated"
        audit(db, action, user=actor, org_id=o.id, entity_type="organization", entity_id=o.id, summary=f"{o.name}: {', '.join(changed)}")
    db.commit()
    return _one(db, o)
