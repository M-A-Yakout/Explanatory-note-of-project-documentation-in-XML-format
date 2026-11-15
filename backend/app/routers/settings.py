from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..audit import audit
from ..core.db import get_db
from ..deps import require_roles
from ..models import Role, User
from ..settings_store import SystemSettings, get_settings, save_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def read(db: Session = Depends(get_db), _: User = Depends(require_roles(Role.super_admin))):
    return get_settings(db)


@router.put("")
def write(body: SystemSettings, db: Session = Depends(get_db), actor: User = Depends(require_roles(Role.super_admin))):
    before = get_settings(db)
    data = save_settings(db, body)
    changed = [k for k in data if before.get(k) != data[k]]
    if changed:
        audit(db, "settings.updated", user=actor, entity_type="settings", summary="Изменено: " + ", ".join(changed))
    db.commit()
    return data
