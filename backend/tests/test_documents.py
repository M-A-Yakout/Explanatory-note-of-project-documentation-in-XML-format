from app.models import Role

from .conftest import register_payload
from .test_projects import PROJECT, auth


def make_doc(client, h, **kw):
    pid = client.post("/api/projects", json=PROJECT, headers=h).json()["id"]
    r = client.post("/api/documents", json={"projectId": pid, **kw}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def data_with(doc, **obj):
    d = doc["data"]
    d = {**d, "object": {**d["object"], **obj}}
    return d


def test_create_prefills_from_project_and_starts_history(client):
    h = auth(client)
    d = make_doc(client, h)
    assert d["data"]["object"]["name"] == PROJECT["name"]
    assert d["data"]["object"]["cadastralNumber"] == PROJECT["cadastralNumber"]
    assert len(d["data"]["composition"]) == 12 and d["data"]["composition"][0]["included"] is True
    assert d["currentVersion"] == 1 and d["revision"] == 1 and d["status"] == "draft"
    assert d["sections"]["object"] is True and d["sections"]["tei"] is False
    assert d["progress"] == 40  # object + composition
    vs = client.get(f"/api/documents/{d['id']}/versions", headers=h).json()
    assert [v["number"] for v in vs] == [1] and vs[0]["comment"] == "Документ создан"


def test_unknown_schema_and_foreign_project(client):
    h = auth(client)
    pid = client.post("/api/projects", json=PROJECT, headers=h).json()["id"]
    assert client.post("/api/documents", json={"projectId": pid, "schemaVersion": "9.9"}, headers=h).status_code == 422
    other = auth(client, "b@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    assert client.post("/api/documents", json={"projectId": pid}, headers=other).status_code == 404


def test_autosave_revision_and_conflict(client):
    h = auth(client)
    d = make_doc(client, h)
    r = client.put(f"/api/documents/{d['id']}/data", json={"data": data_with(d, developer="ООО Новый"), "baseRevision": 1}, headers=h)
    assert r.status_code == 200 and r.json()["revision"] == 2
    assert r.json()["data"]["object"]["developer"] == "ООО Новый"
    stale = client.put(f"/api/documents/{d['id']}/data", json={"data": d["data"], "baseRevision": 1}, headers=h)
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "conflict"


def test_data_validation(client):
    h = auth(client)
    d = make_doc(client, h)
    bad = {**d["data"], "tei": [{"id": "r1", "name": "x" * 400, "unit": "м²", "value": "1"}]}
    assert client.put(f"/api/documents/{d['id']}/data", json={"data": bad, "baseRevision": 1}, headers=h).status_code == 422
    many = {**d["data"], "tei": [{"id": f"r{i}", "name": "n", "unit": "м²", "value": "1"} for i in range(501)]}
    assert client.put(f"/api/documents/{d['id']}/data", json={"data": many, "baseRevision": 1}, headers=h).status_code == 422


def test_progress_grows_with_sections(client):
    h = auth(client)
    d = make_doc(client, h)
    full = {**d["data"], "tei": [{"id": "r1", "name": "Площадь участка", "unit": "м²", "value": "8412"}],
            "references": [{"id": "n1", "code": "СП 54.13330.2022", "title": "Здания жилые", "custom": False}],
            "additional": {"notes": "Примечание"}}
    r = client.put(f"/api/documents/{d['id']}/data", json={"data": full, "baseRevision": 1}, headers=h).json()
    assert r["progress"] == 100 and all(r["sections"].values())


def test_versions_diff_restore(client):
    h = auth(client)
    d = make_doc(client, h)
    did = d["id"]
    client.put(f"/api/documents/{did}/data", json={"data": data_with(d, developer="ООО Новый"), "baseRevision": 1}, headers=h)
    v2 = client.post(f"/api/documents/{did}/versions", json={"comment": "Сменили застройщика"}, headers=h)
    assert v2.status_code == 201 and v2.json()["number"] == 2
    changes = client.get(f"/api/documents/{did}/diff?from=1&to=2", headers=h).json()
    assert changes == [{"path": "object.developer", "kind": "changed", "before": PROJECT["developer"], "after": "ООО Новый"}]
    assert client.get(f"/api/documents/{did}/diff?from=1", headers=h).json() == changes  # to=current
    r = client.post(f"/api/documents/{did}/versions/1/restore", headers=h).json()
    assert r["data"]["object"]["developer"] == PROJECT["developer"]
    assert r["currentVersion"] == 3 and r["revision"] == 3
    assert client.get(f"/api/documents/{did}/versions", headers=h).json()[0]["comment"] == "Восстановлена версия 1"
    assert client.get(f"/api/documents/{did}/versions/99", headers=h).status_code == 404


def test_diff_tracks_added_and_removed_rows(client):
    h = auth(client)
    d = make_doc(client, h)
    did = d["id"]
    row = {"id": "r1", "name": "Этажность", "unit": "эт.", "value": "17"}
    client.put(f"/api/documents/{did}/data", json={"data": {**d["data"], "tei": [row]}, "baseRevision": 1}, headers=h)
    paths = {c["path"]: c["kind"] for c in client.get(f"/api/documents/{did}/diff?from=1", headers=h).json()}
    assert paths["tei[r1].name"] == "added" and paths["tei[r1].value"] == "added"


def test_list_filters_and_status_rules(client):
    h = auth(client)
    a = make_doc(client, h, title="Первый документ")
    make_doc(client, h, title="Второй документ")
    assert client.get("/api/documents", headers=h).json()["total"] == 2
    assert client.get("/api/documents?q=первый", headers=h).json()["total"] == 1
    assert client.get(f"/api/documents?projectId={a['projectId']}", headers=h).json()["total"] == 1
    r = client.patch(f"/api/documents/{a['id']}", json={"status": "validated"}, headers=h)
    assert r.status_code == 422
    client.post(f"/api/documents/{a['id']}/archive", headers=h)
    assert client.get("/api/documents", headers=h).json()["total"] == 1  # archived hidden by default
    assert client.get("/api/documents?status=archived", headers=h).json()["total"] == 1
    arch = client.put(f"/api/documents/{a['id']}/data", json={"data": a["data"], "baseRevision": 1}, headers=h)
    assert arch.status_code == 409 and arch.json()["detail"]["code"] == "archived"


def test_tenant_isolation_and_roles(client):
    admin = auth(client)
    d = make_doc(client, admin)
    other = auth(client, "b@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    for url in (f"/api/documents/{d['id']}", f"/api/documents/{d['id']}/versions", f"/api/documents/{d['id']}/diff?from=1"):
        assert client.get(url, headers=other).status_code == 404
    assert client.get("/api/documents", headers=other).json()["total"] == 0
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "ПроектСтрой")
    expert = auth(client, "e@x.ru", {"mode": "join", "organizationId": org_id}, Role.expert)
    assert client.get(f"/api/documents/{d['id']}", headers=expert).status_code == 200
    assert client.put(f"/api/documents/{d['id']}/data", json={"data": d["data"], "baseRevision": 1}, headers=expert).status_code == 403
    assert client.post(f"/api/documents/{d['id']}/versions", json={}, headers=expert).status_code == 403
    assert client.post("/api/documents", json={"projectId": d["projectId"]}, headers=expert).status_code == 403
    assert client.delete(f"/api/documents/{d['id']}", headers=expert).status_code == 403


def test_project_with_documents_cannot_be_deleted(client):
    h = auth(client)
    d = make_doc(client, h)
    r = client.delete(f"/api/projects/{d['projectId']}", headers=h)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "has_documents"
    assert client.delete(f"/api/documents/{d['id']}", headers=h).status_code == 409  # only archived documents can be deleted
    client.post(f"/api/documents/{d['id']}/archive", headers=h)
    assert client.delete(f"/api/documents/{d['id']}", headers=h).status_code == 204
    assert client.delete(f"/api/projects/{d['projectId']}", headers=h).status_code == 204
