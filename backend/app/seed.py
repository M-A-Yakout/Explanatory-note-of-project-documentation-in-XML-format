"""Create the first super admin:  python -m app.seed"""
from sqlalchemy import select

from .core.config import settings
from .core.db import SessionLocal
from .core.security import hash_password
from .models import Organization, Role, User
from .schema_registry import load_bundled


def run() -> None:
    with SessionLocal() as db:
        added = load_bundled(db)
        if added:
            print(f"Loaded {added} bundled XML schema(s)")
        if db.scalar(select(User).where(User.email == settings.seed_admin_email)):
            print("Super admin already exists")
            return
        org = db.scalar(select(Organization).where(Organization.name == "ИнПАД")) or Organization(name="ИнПАД", inn="7714765432")
        db.add(User(
            email=settings.seed_admin_email, full_name="Кузнецов Даниил Сергеевич",
            password_hash=hash_password(settings.seed_admin_password), role=Role.super_admin,
            organization=org, email_confirmed=True,
        ))
        db.commit()
        print(f"Created super admin {settings.seed_admin_email}")


if __name__ == "__main__":
    run()
