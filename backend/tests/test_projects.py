from app.models import Role, User

from .conftest import PASSWORD, register_payload

PROJECT = {
    "name": "ЖК на ул. Зорге, вл. 9", "address": "г. Москва, ул. Зорге", "cadastralNumber": "77:01:0004012:1234",
    "constructionType": "new", "developer": "ООО «СтройИнвест»",
}


def auth(client, email="anna@psi.ru", org=None, role=None):
    client.post("/api/auth/register", json=register_payload(email, org))
    if role:
        with client.session_factory() as db:
            u = db.query(User).filter(User.email == email).one()
            u.role = role
            db.commit()
    token = client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_requires_auth(client):
    assert client.get("/api/projects").status_code == 401


def test_create_get_update(client):
    h = auth(client)
    r = client.post("/api/projects", json=PROJECT, headers=h)
    assert r.status_code == 201
    p = r.json()
    assert p["code"].startswith("ПР-") and p["status"] == "active"
    assert client.get(f"/api/projects/{p['id']}", headers=h).json()["name"] == PROJECT["name"]
    r = client.patch(f"/api/projects/{p['id']}", json={"status": "on_hold", "customer": "ООО Заказчик"}, headers=h)
    assert r.json()["status"] == "on_hold" and r.json()["customer"] == "ООО Заказчик"


def test_validation_cadastral(client):
    h = auth(client)
    r = client.post("/api/projects", json={**PROJECT, "cadastralNumber": "123"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "validation"


def test_list_search_filter_sort_paginate(client):
    h = auth(client)
    for i in range(5):
        client.post("/api/projects", json={**PROJECT, "name": f"Объект {i}", "constructionType": "new" if i < 3 else "overhaul"}, headers=h)
    r = client.get("/api/projects?pageSize=2&page=2&sort=name&order=asc", headers=h).json()
    assert r["total"] == 5 and len(r["items"]) == 2 and r["items"][0]["name"] == "Объект 2"
    assert client.get("/api/projects?constructionType=overhaul", headers=h).json()["total"] == 2
    assert client.get("/api/projects?q=объект 4", headers=h).json()["total"] == 1
    assert client.get("/api/projects?status=archived", headers=h).json()["total"] == 0


def test_tenant_isolation(client):
    a = auth(client)
    b = auth(client, "boris@other.ru", {"mode": "create", "name": "Другая орг", "inn": "7701234568"})
    pid = client.post("/api/projects", json=PROJECT, headers=a).json()["id"]
    assert client.get("/api/projects", headers=b).json()["total"] == 0
    assert client.get(f"/api/projects/{pid}", headers=b).status_code == 404
    assert client.patch(f"/api/projects/{pid}", json={"name": "Взлом"}, headers=b).status_code == 404
    assert client.delete(f"/api/projects/{pid}", headers=b).status_code == 404
    assert client.get(f"/api/projects/{pid}", headers=a).status_code == 200


def test_expert_is_read_only(client):
    admin = auth(client)
    pid = client.post("/api/projects", json=PROJECT, headers=admin).json()["id"]
    org_id = client.get("/api/organizations/public").json()[0]["id"]
    expert = auth(client, "eva@exp.ru", {"mode": "join", "organizationId": org_id}, Role.expert)
    assert client.get("/api/projects", headers=expert).json()["total"] == 1
    assert client.post("/api/projects", json=PROJECT, headers=expert).status_code == 403
    assert client.patch(f"/api/projects/{pid}", json={"name": "Правка"}, headers=expert).status_code == 403


def test_only_admins_delete(client):
    admin = auth(client)
    org_id = client.get("/api/organizations/public").json()[0]["id"]
    designer = auth(client, "dima@psi.ru", {"mode": "join", "organizationId": org_id})
    pid = client.post("/api/projects", json=PROJECT, headers=designer).json()["id"]
    assert client.delete(f"/api/projects/{pid}", headers=designer).status_code == 403
    assert client.delete(f"/api/projects/{pid}", headers=admin).status_code == 204
    assert client.get(f"/api/projects/{pid}", headers=admin).status_code == 404
