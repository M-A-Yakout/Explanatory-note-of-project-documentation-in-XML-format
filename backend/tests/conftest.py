import os

# TEST_DATABASE_URL=postgresql+psycopg://... runs the whole suite on a real PostgreSQL
# (schema must be created first with `alembic upgrade head`, so the migrations are tested too).
TEST_DB = os.environ.get("TEST_DATABASE_URL")
os.environ["DATABASE_URL"] = TEST_DB or "sqlite:///./test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.db import Base, get_db  # noqa: E402
from app import ratelimit  # noqa: E402
from app.main import app  # noqa: E402
from app.schema_registry import load_bundled  # noqa: E402


def _sqlite_session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


_pg_engine = None


def _postgres_session_factory():
    """Fresh state per test: truncate every table of the migrated schema."""
    global _pg_engine
    from sqlalchemy import text

    if _pg_engine is None:
        _pg_engine = create_engine(TEST_DB, pool_pre_ping=True)
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with _pg_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    return sessionmaker(bind=_pg_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client():
    Session = _postgres_session_factory() if TEST_DB else _sqlite_session_factory()

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    with Session() as db:
        load_bundled(db)
    settings.require_email_confirmation = False
    with Session() as db:
        ratelimit.reset_all(db)
    with TestClient(app) as c:
        c.session_factory = Session
        yield c
    app.dependency_overrides.clear()


PASSWORD = "StrongPass2026"


def register_payload(email="anna@psi.ru", org=None):
    org = org or {"mode": "create", "name": "ПроектСтрой", "inn": "7701234567"}
    return {"fullName": "Ковалёва Анна", "email": email, "password": PASSWORD, "organization": org}


@pytest.fixture()
def outbox(monkeypatch):
    """Captures every e-mail the app would send."""
    box: list[dict] = []

    def fake(to, subject, body):
        box.append({"to": to, "subject": subject, "body": body})

    import app.routers.auth as auth_router
    import app.routers.users as users_router

    monkeypatch.setattr(auth_router, "send_email", fake)
    monkeypatch.setattr(users_router, "send_email", fake)
    return box
