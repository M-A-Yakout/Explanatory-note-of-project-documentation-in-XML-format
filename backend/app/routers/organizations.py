from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..deps import require_roles
from ..models import Organization, Role, User
from ..schemas import OrganizationOut, OrganizationPublic
from ..serializers import org_out

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/public", response_model=list[OrganizationPublic], response_model_by_alias=True)
def list_public(db: Session = Depends(get_db)):
    rows = db.scalars(select(Organization).where(Organization.is_active).order_by(Organization.name)).all()
    return [OrganizationPublic(id=str(o.id), name=o.name, inn=o.inn or "") for o in rows]


@router.get("", response_model=list[OrganizationOut], response_model_by_alias=True)
def list_all(db: Session = Depends(get_db), _: User = Depends(require_roles(Role.super_admin))):
    return [org_out(o) for o in db.scalars(select(Organization).order_by(Organization.id)).all()]
