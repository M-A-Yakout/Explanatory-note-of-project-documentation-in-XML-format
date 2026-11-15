from sqlalchemy.orm import Session

from .models import AuditLog, User


def audit(db: Session, action: str, *, user: User | None = None, org_id: int | None = None, entity_type: str = "",
          entity_id: str | int = "", summary: str = "", result: str = "ok", ip: str | None = None, user_name: str | None = None) -> None:
    """Adds an audit row to the current transaction (the caller commits). The user's name is snapshotted."""
    name = user_name if user_name is not None else (user.full_name if user else "")
    db.add(AuditLog(
        action=action, user_id=user.id if user else None, user_name=name,
        organization_id=org_id if org_id is not None else (user.organization_id if user else None),
        entity_type=entity_type, entity_id=str(entity_id), summary=summary[:500], result=result, ip=ip,
        search_text=f"{name} {summary} {entity_id} {action}".lower()[:2000],
    ))
