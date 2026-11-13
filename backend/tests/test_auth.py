from app.core.config import settings
from app.core.mailer import log  # noqa: F401
from app.core.security import create_token
from app.models import Role, User

from .conftest import PASSWORD, register_payload


def login(client, email="anna@psi.ru", password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_register_create_org_makes_org_admin(client):
    r = client.post("/api/auth/register", json=register_payload())
    assert r.status_code == 201
    s = login(client).json()
    assert s["user"]["role"] == "org_admin"
    assert s["organization"]["name"] == "ПроектСтрой"
    assert s["user"]["activeOrganizationId"] == s["organization"]["id"]


def test_register_join_org_makes_designer(client):
    client.post("/api/auth/register", json=register_payload())
    org_id = client.get("/api/organizations/public").json()[0]["id"]
    r = client.post("/api/auth/register", json=register_payload("petr@psi.ru", {"mode": "join", "organizationId": org_id}))
    assert r.status_code == 201
    assert login(client, "petr@psi.ru").json()["user"]["role"] == "designer"


def test_duplicate_email_conflict(client):
    client.post("/api/auth/register", json=register_payload())
    r = client.post("/api/auth/register", json=register_payload(org={"mode": "create", "name": "Другая", "inn": "7701234568"}))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "conflict"


def test_weak_password_rejected(client):
    p = register_payload()
    p["password"] = "short"
    r = client.post("/api/auth/register", json=p)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "validation"


def test_login_wrong_password(client):
    client.post("/api/auth/register", json=register_payload())
    r = login(client, password="WrongPass2026")
    assert r.status_code == 401 and r.json()["detail"]["code"] == "invalid_credentials"


def test_blocked_user_locked(client):
    client.post("/api/auth/register", json=register_payload())
    with client.session_factory() as db:
        u = db.query(User).one()
        u.is_active = False
        db.commit()
    r = login(client)
    assert r.status_code == 423 and r.json()["detail"]["code"] == "locked"


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    client.post("/api/auth/register", json=register_payload())
    token = login(client).json()["token"]
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "anna@psi.ru"


def test_role_guard(client):
    client.post("/api/auth/register", json=register_payload())
    token = login(client).json()["token"]
    r = client.get("/api/organizations", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    with client.session_factory() as db:
        u = db.query(User).one()
        u.role = Role.super_admin
        db.commit()
    r = client.get("/api/organizations", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and len(r.json()) == 1


def test_password_reset_flow(client):
    client.post("/api/auth/register", json=register_payload())
    assert client.post("/api/auth/forgot-password", json={"email": "nobody@x.ru"}).status_code == 202
    with client.session_factory() as db:
        uid = db.query(User).one().id
    token = create_token(uid, "reset", 10)
    r = client.post("/api/auth/reset-password", json={"token": token, "password": "NewStrong2026x"})
    assert r.status_code == 204
    assert login(client, password="NewStrong2026x").status_code == 200
    assert login(client).status_code == 401


def test_reset_token_expired_and_wrong_purpose(client):
    client.post("/api/auth/register", json=register_payload())
    expired = create_token(1, "reset", -1)
    r = client.post("/api/auth/reset-password", json={"token": expired, "password": "NewStrong2026x"})
    assert r.json()["detail"]["code"] == "token_expired"
    access = create_token(1, "access", 10)
    r = client.post("/api/auth/reset-password", json={"token": access, "password": "NewStrong2026x"})
    assert r.json()["detail"]["code"] == "token_invalid"


def test_email_confirmation_required(client):
    settings.require_email_confirmation = True
    client.post("/api/auth/register", json=register_payload())
    r = login(client)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "email_not_confirmed"
    with client.session_factory() as db:
        uid = db.query(User).one().id
    assert client.post("/api/auth/confirm-email", json={"token": create_token(uid, "confirm", 10)}).status_code == 200
    assert login(client).status_code == 200
