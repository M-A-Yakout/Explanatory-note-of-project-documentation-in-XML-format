import io
import zipfile

from app.models import Role

from .test_documents import make_doc
from .test_projects import PROJECT, auth
from .test_validation import REFS, ROWS, complete_doc, save, validate


def ids(res):
    return [i["id"] for i in res.json()["items"]]


def test_archive_and_restore_cycle(client):
    h = auth(client)
    d = make_doc(client, h)
    r = client.post(f"/api/documents/{d['id']}/archive", headers=h)
    assert r.status_code == 200
    a = r.json()
    assert a["status"] == "archived" and a["archivedAt"] and a["archivedByName"] == "Ковалёва Анна"
    assert d["id"] not in ids(client.get("/api/documents", headers=h))  # hidden from the main list
    assert d["id"] in ids(client.get("/api/documents?status=archived", headers=h))
    assert client.post(f"/api/documents/{d['id']}/archive", headers=h).json()["detail"]["code"] == "already_archived"
    r = client.post(f"/api/documents/{d['id']}/restore", headers=h).json()
    assert r["status"] == "draft" and r["archivedAt"] is None and r["archivedByName"] is None
    assert client.post(f"/api/documents/{d['id']}/restore", headers=h).json()["detail"]["code"] == "not_archived"


def test_archived_document_is_frozen(client):
    h = auth(client)
    d = make_doc(client, h)
    client.post(f"/api/documents/{d['id']}/archive", headers=h)
    put = client.put(f"/api/documents/{d['id']}/data", json={"data": d["data"], "baseRevision": 1}, headers=h)
    assert put.json()["detail"]["code"] == "archived"
    assert client.post(f"/api/documents/{d['id']}/versions/1/restore", headers=h).json()["detail"]["code"] == "archived"
    assert client.post(f"/api/documents/{d['id']}/validate", headers=h).json()["detail"]["code"] == "archived"
    assert client.get(f"/api/documents/{d['id']}", headers=h).status_code == 200  # still readable


def test_status_cannot_be_changed_around_the_archive(client):
    h = auth(client)
    d = make_doc(client, h)
    assert client.patch(f"/api/documents/{d['id']}", json={"status": "archived"}, headers=h).status_code == 422
    client.post(f"/api/documents/{d['id']}/archive", headers=h)
    assert client.patch(f"/api/documents/{d['id']}", json={"status": "draft"}, headers=h).status_code == 422
    assert client.patch(f"/api/documents/{d['id']}", json={"title": "Новое имя"}, headers=h).status_code == 200


def test_restore_returns_to_previous_status_only_if_still_valid(client):
    h = auth(client)
    d = complete_doc(client, h)
    validate(client, h, d)  # -> validated
    client.post(f"/api/documents/{d['id']}/archive", headers=h)
    assert client.post(f"/api/documents/{d['id']}/restore", headers=h).json()["status"] == "validated"
    # in review stays in review
    d2 = make_doc(client, h)
    client.patch(f"/api/documents/{d2['id']}", json={"status": "in_review"}, headers=h)
    client.post(f"/api/documents/{d2['id']}/archive", headers=h)
    assert client.post(f"/api/documents/{d2['id']}/restore", headers=h).json()["status"] == "in_review"


def test_delete_only_from_archive_and_only_by_admins(client):
    admin = auth(client)
    d = make_doc(client, admin)
    assert client.delete(f"/api/documents/{d['id']}", headers=admin).json()["detail"]["code"] == "not_archived"
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "ПроектСтрой")
    designer = auth(client, "dima@x.ru", {"mode": "join", "organizationId": org_id})
    client.post(f"/api/documents/{d['id']}/archive", headers=designer)
    assert client.delete(f"/api/documents/{d['id']}", headers=designer).status_code == 403
    assert client.delete(f"/api/documents/{d['id']}", headers=admin).status_code == 204
    assert client.get(f"/api/documents/{d['id']}", headers=admin).status_code == 404
    assert client.get(f"/api/documents/{d['id']}/versions", headers=admin).status_code == 404


def test_bulk_archive_restore_delete_with_mixed_outcomes(client):
    h = auth(client)
    a, b, c = (make_doc(client, h) for _ in range(3))
    other = auth(client, "x@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    foreign = make_doc(client, other)
    r = client.post("/api/documents/bulk", json={"ids": [int(a["id"]), int(b["id"]), int(foreign["id"]), 9999, int(a["id"])], "action": "archive"}, headers=h).json()
    assert r["okCount"] == 2 and r["failedCount"] == 2  # duplicate id counted once
    codes = {x["id"]: x.get("code") for x in r["results"] if not x["ok"]}
    assert codes == {foreign["id"]: "not_found", "9999": "not_found"}  # foreign doc looks like it does not exist
    assert client.get(f"/api/documents/{foreign['id']}", headers=other).json()["status"] == "draft"  # untouched
    r = client.post("/api/documents/bulk", json={"ids": [int(a["id"]), int(c["id"])], "action": "restore"}, headers=h).json()
    assert [x["ok"] for x in r["results"]] == [True, False] and r["results"][1]["code"] == "not_archived"
    r = client.post("/api/documents/bulk", json={"ids": [int(a["id"]), int(b["id"])], "action": "delete"}, headers=h).json()
    assert [x["ok"] for x in r["results"]] == [False, True]  # a was restored -> cannot be deleted; b is archived


def test_bulk_validation_and_permissions(client):
    admin = auth(client)
    d = make_doc(client, admin)
    assert client.post("/api/documents/bulk", json={"ids": [], "action": "archive"}, headers=admin).status_code == 422
    assert client.post("/api/documents/bulk", json={"ids": list(range(101)), "action": "archive"}, headers=admin).status_code == 422
    assert client.post("/api/documents/bulk", json={"ids": [1], "action": "explode"}, headers=admin).status_code == 422
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "ПроектСтрой")
    designer = auth(client, "dima@x.ru", {"mode": "join", "organizationId": org_id})
    assert client.post("/api/documents/bulk", json={"ids": [int(d["id"])], "action": "delete"}, headers=designer).status_code == 403
    expert = auth(client, "e@x.ru", {"mode": "join", "organizationId": org_id}, Role.expert)
    assert client.post("/api/documents/bulk", json={"ids": [int(d["id"])], "action": "archive"}, headers=expert).status_code == 403
    assert client.post("/api/documents/bulk", json={"ids": [1], "action": "archive"}).status_code == 401


def test_bulk_xml_zip_contains_only_valid_documents(client):
    h = auth(client)
    good = complete_doc(client, h)
    bad = make_doc(client, h)  # has errors
    r = client.post("/api/documents/bulk/xml", json={"ids": [int(good["id"]), int(bad["id"])]}, headers=h)
    assert r.status_code == 200 and r.headers["x-exported"] == "1" and r.headers["x-skipped"] == "1"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    assert f"explanatory_note_{good['id']}_r{good['revision']}.xml" in names and "_skipped.txt" in names
    assert z.read(f"explanatory_note_{good['id']}_r{good['revision']}.xml").startswith(b"<?xml")
    assert f"{bad['id']}: ошибок" in z.read("_skipped.txt").decode()
    none = client.post("/api/documents/bulk/xml", json={"ids": [int(bad["id"])]}, headers=h)
    assert none.status_code == 409 and none.json()["detail"]["code"] == "validation_failed"
    all_ok = client.post("/api/documents/bulk/xml", json={"ids": [int(good["id"])]}, headers=h)
    assert "_skipped.txt" not in zipfile.ZipFile(io.BytesIO(all_ok.content)).namelist()


def test_bulk_xml_is_tenant_scoped(client):
    owner = auth(client)
    d = complete_doc(client, owner)
    other = auth(client, "x@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    r = client.post("/api/documents/bulk/xml", json={"ids": [int(d["id"])]}, headers=other)
    assert r.status_code == 409 and "не найден" in r.json()["detail"]["message"].lower()


def test_list_filters_author_and_dates(client):
    admin = auth(client)
    a = make_doc(client, admin, title="От админа")
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "ПроектСтрой")
    designer = auth(client, "dima@x.ru", {"mode": "join", "organizationId": org_id})
    pid = client.post("/api/projects", json=PROJECT, headers=designer).json()["id"]
    b = client.post("/api/documents", json={"projectId": pid, "title": "От дизайнера"}, headers=designer).json()
    authors = client.get("/api/documents/authors", headers=admin).json()
    assert sorted(x["name"] for x in authors) == ["Ковалёва Анна", "Ковалёва Анна"] or len(authors) == 2
    mine = client.get(f"/api/documents?authorId={b['authorId']}", headers=admin).json()
    assert [i["id"] for i in mine["items"]] == [b["id"]]
    today = a["createdAt"][:10]
    assert client.get(f"/api/documents?updatedFrom={today}&updatedTo={today}", headers=admin).json()["total"] == 2
    assert client.get("/api/documents?updatedTo=2000-01-01", headers=admin).json()["total"] == 0
    assert client.get("/api/documents?updatedFrom=2999-01-01", headers=admin).json()["total"] == 0
    assert client.get("/api/documents?updatedFrom=not-a-date", headers=admin).status_code == 422


def test_authors_are_tenant_scoped(client):
    owner = auth(client)
    make_doc(client, owner)
    other = auth(client, "x@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    assert client.get("/api/documents/authors", headers=other).json() == []
    assert len(client.get("/api/documents/authors", headers=owner).json()) == 1


def test_global_search_covers_cadastral_title_and_isolation(client):
    h = auth(client)
    d = make_doc(client, h, title="Особая записка")
    r = client.get("/api/search?q=77:01:0004012", headers=h).json()  # cadastral number
    assert [p["name"] for p in r["projects"]] == [PROJECT["name"]] and [x["id"] for x in r["documents"]] == [d["id"]]
    assert client.get("/api/search?q=ОСОБАЯ", headers=h).json()["documents"][0]["title"] == "Особая записка"  # case-insensitive Cyrillic
    assert client.get("/api/search?q=зорге", headers=h).json()["projects"][0]["address"] == PROJECT["address"]
    assert client.get("/api/search?q=з", headers=h).json() == {"projects": [], "documents": []}  # too short
    assert client.get("/api/search?q=несуществует", headers=h).json() == {"projects": [], "documents": []}
    other = auth(client, "x@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    assert client.get("/api/search?q=зорге", headers=other).json() == {"projects": [], "documents": []}
    assert client.get("/api/search?q=зорге").status_code == 401
    client.post(f"/api/documents/{d['id']}/archive", headers=h)
    assert client.get("/api/search?q=особая", headers=h).json()["documents"] == []  # archived docs are not suggested


def test_renaming_project_keeps_document_search_fresh(client):
    h = auth(client)
    d = make_doc(client, h, title="Документ")
    client.patch(f"/api/projects/{d['projectId']}", json={"name": "Совершенно новое название"}, headers=h)
    assert client.get("/api/documents?q=совершенно", headers=h).json()["total"] == 1
    assert client.get("/api/search?q=совершенно", headers=h).json()["documents"][0]["id"] == d["id"]
    assert client.get("/api/documents?q=вл. 9", headers=h).json()["total"] == 0  # a phrase only the old name had
    assert client.get("/api/documents?q=зорге", headers=h).json()["total"] == 1  # the address (unchanged) still matches
