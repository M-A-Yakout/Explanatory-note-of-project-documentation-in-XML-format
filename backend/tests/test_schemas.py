from pathlib import Path

from app.models import Role

from .test_projects import PROJECT, auth

XSD_DIR = Path(__file__).parent.parent / "app" / "xsd_bundled"
GOOD = (XSD_DIR / "ExplanatoryNote_01.05.xsd").read_text(encoding="utf-8")


def admin(client):
    return auth(client, "root@inpad.ru", {"mode": "create", "name": "ИнПАД", "inn": "7714765432"}, Role.super_admin)


def upload(client, h, version="01.06", content=GOOD, **kw):
    return client.post("/api/schemas", json={"version": version, "title": "Новая схема", "content": content, **kw}, headers=h)


def test_bundled_schemas_loaded_one_default(client):
    h = auth(client)
    items = client.get("/api/schemas", headers=h).json()
    assert [s["version"] for s in items] == ["01.05", "01.04"]
    assert [s["isDefault"] for s in items] == [True, False]
    assert all("content" not in s for s in items)  # XSD text is never listed


def test_inactive_hidden_and_registry_admin_only(client):
    h = auth(client)
    assert client.get("/api/schemas?includeInactive=true", headers=h).status_code == 403
    a = admin(client)
    assert len(client.get("/api/schemas?includeInactive=true", headers=a).json()) == 2


def test_only_super_admin_mutates(client):
    h = auth(client)
    assert upload(client, h).status_code == 403
    assert client.patch("/api/schemas/1", json={"title": "Хак"}, headers=h).status_code == 403
    assert client.delete("/api/schemas/2", headers=h).status_code == 403
    assert client.get("/api/schemas/1/structure", headers=h).status_code == 403
    assert client.get("/api/schemas/1/xsd", headers=h).status_code == 403


def test_upload_valid_schema(client):
    a = admin(client)
    r = upload(client, a, changelog="Добавлено поле", compatibility="Совместима с 01.05")
    assert r.status_code == 201
    s = r.json()
    assert s["version"] == "01.06" and s["isActive"] is True and s["isDefault"] is False
    assert len(s["checksum"]) == 64 and s["uploadedByName"] == "Ковалёва Анна" and s["documentsCount"] == 0


def test_upload_rejects_bad_input(client):
    a = admin(client)
    assert upload(client, a, version="v1").status_code == 422
    assert upload(client, a, version="01.05").status_code == 409  # duplicate
    r = upload(client, a, content="<xs:schema")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid_xsd"
    r = upload(client, a, content="<root><a/></root>")
    assert "xs:schema" in r.json()["detail"]["message"]
    broken = GOOD.replace('type="NonEmpty"/>\n      <xs:element name="Address"', 'type="Missing"/>\n      <xs:element name="Address"')
    assert upload(client, a, content=broken).status_code == 422


def test_upload_blocks_external_references_and_entities(client):
    a = admin(client)
    inc = GOOD.replace("<xs:simpleType", '<xs:include schemaLocation="http://evil.example/x.xsd"/><xs:simpleType', 1)
    r = upload(client, a, content=inc)
    assert r.status_code == 422 and "include" in r.json()["detail"]["message"]
    xxe = '<?xml version="1.0"?><!DOCTYPE s [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + GOOD.split("?>", 1)[1]
    r = upload(client, a, content=xxe)
    assert r.status_code == 422 and "DOCTYPE" in r.json()["detail"]["message"]
    assert len(client.get("/api/schemas?includeInactive=true", headers=a).json()) == 2  # nothing stored


def test_default_switching_rules(client):
    a = admin(client)
    r = upload(client, a, make_default=True).json()
    items = {s["version"]: s for s in client.get("/api/schemas", headers=a).json()}
    assert items["01.06"]["isDefault"] and not items["01.05"]["isDefault"]
    assert sum(s["isDefault"] for s in items.values()) == 1
    assert client.patch(f"/api/schemas/{r['id']}", json={"isActive": False}, headers=a).json()["detail"]["code"] == "default_schema"
    assert client.delete(f"/api/schemas/{r['id']}", headers=a).status_code == 409
    old = items["01.04"]["id"]
    client.patch(f"/api/schemas/{old}", json={"isActive": False}, headers=a)
    assert client.post(f"/api/schemas/{old}/default", headers=a).json()["detail"]["code"] == "inactive_schema"


def test_documents_use_default_and_respect_active(client):
    a = admin(client)
    pid = client.post("/api/projects", json=PROJECT, headers=a).json()["id"]
    assert client.post("/api/documents", json={"projectId": pid}, headers=a).json()["schemaVersion"] == "01.05"
    v104 = next(s for s in client.get("/api/schemas", headers=a).json() if s["version"] == "01.04")
    client.patch(f"/api/schemas/{v104['id']}", json={"isActive": False}, headers=a)
    r = client.post("/api/documents", json={"projectId": pid, "schemaVersion": "01.04"}, headers=a)
    assert r.status_code == 422
    new_default = upload(client, a, make_default=True).json()
    assert client.post("/api/documents", json={"projectId": pid}, headers=a).json()["schemaVersion"] == new_default["version"]


def test_schema_in_use_cannot_be_deleted(client):
    a = admin(client)
    pid = client.post("/api/projects", json=PROJECT, headers=a).json()["id"]
    client.post("/api/documents", json={"projectId": pid, "schemaVersion": "01.04"}, headers=a)
    v104 = next(s for s in client.get("/api/schemas", headers=a).json() if s["version"] == "01.04")
    assert v104["documentsCount"] == 1
    r = client.delete(f"/api/schemas/{v104['id']}", headers=a)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "in_use"
    fresh = upload(client, a).json()
    assert client.delete(f"/api/schemas/{fresh['id']}", headers=a).status_code == 204


def test_structure_and_download(client):
    a = admin(client)
    sid = next(s["id"] for s in client.get("/api/schemas", headers=a).json() if s["version"] == "01.05")
    tree = client.get(f"/api/schemas/{sid}/structure", headers=a).json()
    root = tree[0]
    assert root["name"] == "ExplanatoryNote"
    kids = {c["name"]: c for c in root["children"]}
    assert kids["@schemaVersion"]["kind"] == "attribute" and kids["@schemaVersion"]["required"]
    assert {c["name"] for c in kids["Object"]["children"]} >= {"Name", "CadastralNumber", "Developer"}
    assert kids["Additional"]["required"] is False
    ind = kids["Indicators"]["children"][0]
    assert ind["name"] == "Indicator" and ind["repeatable"] is True
    r = client.get(f"/api/schemas/{sid}/xsd", headers=a)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"] and r.text.strip().startswith("<?xml")
