import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    settings.require_email_confirmation = False
    with TestClient(app) as c:
        c.session_factory = Session
        yield c
    app.dependency_overrides.clear()


PASSWORD = "StrongPass2026"


def register_payload(email="anna@psi.ru", org=None):
    org = org or {"mode": "create", "name": "ПроектСтрой", "inn": "7701234567"}
    return {"fullName": "Ковалёва Анна", "email": email, "password": PASSWORD, "organization": org}
