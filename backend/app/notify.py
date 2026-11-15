from sqlalchemy.orm import Session

from .models import Notification, User

DEFAULT_PREFS = {"validation": True, "versions": True, "invitations": True, "email": True}
KIND_PREF = {"validation": "validation", "version": "versions", "archive": "versions", "invitation": "invitations"}


def prefs_of(user: User) -> dict:
    return {**DEFAULT_PREFS, **(user.prefs or {})}


def notify(db: Session, user: User | None, kind: str, title: str, body: str = "", link: str | None = None, actor: User | None = None) -> None:
    """In-app notification; skipped for the actor themselves and when the user switched this kind off."""
    if user is None or (actor is not None and user.id == actor.id):
        return
    if not prefs_of(user).get(KIND_PREF.get(kind, kind), True):
        return
    db.add(Notification(user_id=user.id, kind=kind, title=title[:300], body=body, link=link))
