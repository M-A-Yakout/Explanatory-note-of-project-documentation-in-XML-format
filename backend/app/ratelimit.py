"""Rate limiting for authentication endpoints, stored in the database.

Rows are shared by all API workers and instances, so the budget is exact however the service is deployed.
An attempt is recorded and committed BEFORE the work it guards, so parallel requests cannot all slip under the limit.
"""
import random
from datetime import timedelta

from fastapi import Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .core.config import settings
from .core.errors import api_error
from .core.timeutil import aware, utcnow
from .models import AuthAttempt


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _count(db: Session, key: str, window: int) -> int:
    return db.scalar(select(func.count()).select_from(AuthAttempt).where(AuthAttempt.key == key, AuthAttempt.created_at >= utcnow() - timedelta(seconds=window))) or 0


def _too_many(db: Session, key: str, window: int):
    oldest = db.scalar(select(func.min(AuthAttempt.created_at)).where(AuthAttempt.key == key, AuthAttempt.created_at >= utcnow() - timedelta(seconds=window)))
    retry = max(1, int((aware(oldest) + timedelta(seconds=window) - utcnow()).total_seconds()) + 1) if oldest else window
    exc = api_error(429, "too_many_attempts", f"Слишком много попыток. Повторите через {max(1, round(retry / 60))} мин.")
    exc.headers = {"Retry-After": str(retry)}
    return exc


def check(db: Session, key: str, limit: int, window: int) -> None:
    """Refuses when the budget is already spent. Counts nothing itself."""
    if settings.rate_limit_enabled and _count(db, key, window) >= limit:
        raise _too_many(db, key, window)


def record(db: Session, key: str) -> None:
    if not settings.rate_limit_enabled:
        return
    db.add(AuthAttempt(key=key, created_at=utcnow()))
    db.commit()
    if random.random() < 0.02:  # housekeeping: nothing older than a day is ever needed
        db.execute(delete(AuthAttempt).where(AuthAttempt.created_at < utcnow() - timedelta(days=1)))
        db.commit()


def attempt(db: Session, key: str, limit: int, window: int) -> None:
    """Counts this attempt first, then refuses the one that exceeds the budget (exact even under concurrency)."""
    if not settings.rate_limit_enabled:
        return
    record(db, key)
    if _count(db, key, window) > limit:
        raise _too_many(db, key, window)


def reset(db: Session, key: str) -> None:
    """Forgets the attempts of one key (after a successful sign-in). Committed with the caller's transaction."""
    db.execute(delete(AuthAttempt).where(AuthAttempt.key == key))


def reset_all(db: Session) -> None:
    db.execute(delete(AuthAttempt))
    db.commit()


# budgets (attempts per window, seconds)
LOGIN_EMAIL = (5, 15 * 60)
LOGIN_IP = (30, 15 * 60)
FORGOT = (5, 60 * 60)
REGISTER = (10, 60 * 60)
INVITE_ACCEPT = (10, 15 * 60)
