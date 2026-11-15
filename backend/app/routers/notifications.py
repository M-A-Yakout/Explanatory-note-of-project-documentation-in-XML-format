from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.errors import api_error
from ..deps import get_current_user
from ..models import Notification, User
from ..schemas_admin import NotificationOut, NotificationPage

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _out(n: Notification) -> NotificationOut:
    return NotificationOut(id=str(n.id), kind=n.kind, title=n.title, body=n.body, link=n.link, read=n.is_read, created_at=n.created_at)


def _unread(db: Session, user: User) -> int:
    return db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, ~Notification.is_read)) or 0


@router.get("", response_model=NotificationPage, response_model_by_alias=True)
def list_notifications(unread_only: bool = Query(False, alias="unreadOnly"), kind: str | None = None,
                       page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                       db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cond = [Notification.user_id == user.id]  # strictly the caller's own
    if unread_only:
        cond.append(~Notification.is_read)
    if kind:
        cond.append(Notification.kind == kind)
    total = db.scalar(select(func.count()).select_from(Notification).where(*cond)) or 0
    rows = db.scalars(select(Notification).where(*cond).order_by(Notification.created_at.desc(), Notification.id.desc())
                      .offset((page - 1) * page_size).limit(page_size))
    return NotificationPage(items=[_out(n) for n in rows], total=total, unread=_unread(db, user), page=page, page_size=page_size)


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"unread": _unread(db, user)}


@router.post("/read-all", status_code=204)
def read_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.execute(update(Notification).where(Notification.user_id == user.id, ~Notification.is_read).values(is_read=True))
    db.commit()
    return Response(status_code=204)


@router.post("/{notification_id}/read", response_model=NotificationOut, response_model_by_alias=True)
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise api_error(404, "not_found", "Уведомление не найдено")
    n.is_read = True
    db.commit()
    return _out(n)
