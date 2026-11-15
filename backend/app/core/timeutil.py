from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; they were stored as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
