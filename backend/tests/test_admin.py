import re
from datetime import date, timedelta

from app.core.security import create_token
from app.models import Invitation, Role, User

from .conftest import PASSWORD
from .test_documents import make_doc
from .test_projects import PROJECT, auth
from .test_schemas import admin
from .test_validation import complete_doc, save, validate

ORG = {"mode": "create", "name": "ПроектСтрой", "inn": "7701234567"}


def hdr(client, email, password=PASSWORD):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {r.json().get('token', '')}"}, r


def join(client, email, role=None, org_name="ПроектСтрой"):
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == org_name)
    return auth(client, email, {"mode": "join", "organizationId": org_id}, role)


def token_from(outbox, i=-1):
    return re.search(r"/(?:invite|reset-password)/(\S+)", outbox[i]["body"]).group(1)


def accept(client, token, name="Новый Сотрудник", password="NewStrong2026x"):
    return client.post("/api/auth/accept-invite", json={"token": token, "fullName": name, "password": password})


# ---------------- users ----------------
def test_user_list_is_scoped_and_searchable_in_cyrillic(client):
    boss = auth(client)
    join(client, "bob@x.ru")
    other = auth(client, "z@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    r = client.get("/api/users", headers=boss).json()
    assert r["total"] == 2 and {u["organizationName"] for u in r["items"]} == {"ПроектСтрой"}
    assert client.get("/api/users?q=КОВАЛЁВА", headers=boss).json()["total"] == 2  # same registered name, upper-case query
    assert client.get("/api/users?q=bob@", headers=boss).json()["total"] == 1
    assert client.get("/api/users?role=org_admin", headers=boss).json()["total"] == 1
    assert client.get("/api/users?status=blocked", headers=boss).json()["total"] == 0
    assert client.get("/api/users", headers=other).json()["total"] == 1  # never sees ПроектСтрой
    root = admin(client)
    assert client.get("/api/users", headers=root).json()["total"] == 4
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "Другая")
    assert client.get(f"/api/users?organizationId={org_id}", headers=root).json()["total"] == 1


def test_only_admins_see_user_management(client):
    auth(client)
    d = join(client, "des@x.ru")
    e = join(client, "exp@x.ru", Role.expert)
    for h in (d, e):
        assert client.get("/api/users", headers=h).status_code == 403
        assert client.post("/api/users/invite", json={"email": "n@x.ru", "role": "designer"}, headers=h).status_code == 403
    assert client.get("/api/users").status_code == 401


def test_invite_and_accept_full_flow(client, outbox):
    boss = auth(client)
    r = client.post("/api/users/invite", json={"email": "New@Mail.ru", "role": "expert"}, headers=boss)
    assert r.status_code == 201 and r.json()["email"] == "new@mail.ru" and r.json()["organizationName"] == "ПроектСтрой"
    assert len(outbox) == 1 and outbox[0]["to"] == "new@mail.ru" and "ПроектСтрой" in outbox[0]["subject"]
    assert len(client.get("/api/users/invitations", headers=boss).json()) == 1
    res = accept(client, token_from(outbox))
    assert res.status_code == 200
    s = res.json()
    assert s["user"]["role"] == "expert" and s["organization"]["name"] == "ПроектСтрой" and s["user"]["email"] == "new@mail.ru"
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {s['token']}"}).status_code == 200
    assert hdr(client, "new@mail.ru", "NewStrong2026x")[1].status_code == 200
    assert client.get("/api/users/invitations", headers=boss).json() == []
    assert accept(client, token_from(outbox)).json()["detail"]["code"] == "token_invalid"  # one-time
    n = client.get("/api/notifications", headers=boss).json()
    assert n["unread"] == 1 and "принял" in n["items"][0]["title"] and n["items"][0]["link"] == "/admin/users"


def test_invite_rules(client, outbox):
    boss = auth(client)
    assert client.post("/api/users/invite", json={"email": "a@x.ru", "role": "org_admin"}, headers=boss).status_code == 403
    assert client.post("/api/users/invite", json={"email": "a@x.ru", "role": "super_admin"}, headers=boss).status_code == 403
    assert client.post("/api/users/invite", json={"email": "bad", "role": "designer"}, headers=boss).status_code == 422
    assert client.post("/api/users/invite", json={"email": "anna@psi.ru", "role": "designer"}, headers=boss).status_code == 409  # already a user
    client.post("/api/users/invite", json={"email": "a@x.ru", "role": "designer"}, headers=boss)
    client.post("/api/users/invite", json={"email": "a@x.ru", "role": "expert"}, headers=boss)  # replaces the pending one
    pending = client.get("/api/users/invitations", headers=boss).json()
    assert len(pending) == 1 and pending[0]["role"] == "expert"
    old = token_from(outbox, 0)
    assert accept(client, old).json()["detail"]["code"] == "token_invalid"  # the replaced invitation no longer works
    root = admin(client)  # a super admin may invite an org admin into any organization
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "ПроектСтрой")
    r = client.post("/api/users/invite", json={"email": "b@x.ru", "role": "org_admin", "organizationId": org_id}, headers=root)
    assert r.status_code == 201 and r.json()["organizationName"] == "ПроектСтрой"


def test_invite_respects_user_limit_including_pending(client, outbox):
    boss = auth(client)
    root = admin(client)
    org = next(o for o in client.get("/api/organizations", headers=root).json() if o["name"] == "ПроектСтрой")
    assert client.patch(f"/api/organizations/{org['id']}", json={"maxUsers": 2}, headers=root).status_code == 200
    assert client.post("/api/users/invite", json={"email": "a@x.ru", "role": "designer"}, headers=boss).status_code == 201
    r = client.post("/api/users/invite", json={"email": "b@x.ru", "role": "designer"}, headers=boss)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "limit_reached"
    reg = client.post("/api/auth/register", json={"fullName": "Иван Иванов", "email": "c@x.ru", "password": PASSWORD,
                                                  "organization": {"mode": "join", "organizationId": org["id"]}})
    assert reg.status_code == 201  # self-registration counts users only (1 of 2): pending invites are reserved for invitees
    full = client.post("/api/auth/register", json={"fullName": "Пётр Петров", "email": "d@x.ru", "password": PASSWORD,
                                                   "organization": {"mode": "join", "organizationId": org["id"]}})
    assert full.status_code == 409 and full.json()["detail"]["code"] == "limit_reached"
    assert accept(client, token_from(outbox, 0)).json()["detail"]["code"] == "limit_reached"  # no room left for the invitee either


def test_expired_and_revoked_invitations(client, outbox):
    boss = auth(client)
    inv = client.post("/api/users/invite", json={"email": "a@x.ru", "role": "designer"}, headers=boss).json()
    assert accept(client, create_token(int(inv["id"]), "invite", -1)).json()["detail"]["code"] == "token_expired"
    assert accept(client, create_token(int(inv["id"]), "access", 10)).json()["detail"]["code"] == "token_invalid"  # wrong purpose
    with client.session_factory() as db:  # an expired row, even with a valid token
        row = db.get(Invitation, int(inv["id"]))
        from datetime import datetime, timezone
        row.expires_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        db.commit()
    assert accept(client, token_from(outbox)).json()["detail"]["code"] == "token_invalid"
    assert client.get("/api/users/invitations", headers=boss).json() == []
    inv2 = client.post("/api/users/invite", json={"email": "b@x.ru", "role": "designer"}, headers=boss).json()
    assert client.delete(f"/api/users/invitations/{inv2['id']}", headers=boss).status_code == 204
    assert accept(client, token_from(outbox)).json()["detail"]["code"] == "token_invalid"
    assert client.delete(f"/api/users/invitations/{inv2['id']}", headers=boss).status_code == 404


def test_resend_and_invitation_isolation(client, outbox):
    boss = auth(client)
    other = auth(client, "z@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    inv = client.post("/api/users/invite", json={"email": "a@x.ru", "role": "designer"}, headers=boss).json()
    assert client.post(f"/api/users/invitations/{inv['id']}/resend", headers=other).status_code == 404
    assert client.delete(f"/api/users/invitations/{inv['id']}", headers=other).status_code == 404
    assert client.get("/api/users/invitations", headers=other).json() == []
    assert client.post(f"/api/users/invitations/{inv['id']}/resend", headers=boss).status_code == 200
    assert len(outbox) == 2 and accept(client, token_from(outbox)).status_code == 200


def test_role_and_status_rules(client):
    boss = auth(client)
    bob = join(client, "bob@x.ru")
    uid = lambda email: next(u["id"] for u in client.get("/api/users", headers=boss).json()["items"] if u["email"] == email)  # noqa: E731
    me_id, bob_id = uid("anna@psi.ru"), uid("bob@x.ru")
    assert client.patch(f"/api/users/{me_id}", json={"role": "designer"}, headers=boss).json()["detail"]["code"] == "self_change"
    assert client.patch(f"/api/users/{me_id}", json={"status": "blocked"}, headers=boss).json()["detail"]["code"] == "self_change"
    assert client.patch(f"/api/users/{bob_id}", json={"role": "super_admin"}, headers=boss).status_code == 403
    assert client.patch(f"/api/users/{bob_id}", json={"role": "expert"}, headers=boss).json()["role"] == "expert"
    assert client.patch(f"/api/users/{bob_id}", json={"fullName": "Боб Новиков"}, headers=boss).json()["fullName"] == "Боб Новиков"
    assert client.get("/api/users?q=новиков", headers=boss).json()["total"] == 1  # search follows the rename
    assert client.patch(f"/api/users/{bob_id}", json={"role": "org_admin"}, headers=boss).json()["role"] == "org_admin"
    root = admin(client)  # now two admins: demoting one is fine, the last one is protected
    assert client.patch(f"/api/users/{bob_id}", json={"role": "designer"}, headers=root).status_code == 200
    r = client.patch(f"/api/users/{me_id}", json={"role": "designer"}, headers=root)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "last_admin"
    r = client.patch(f"/api/users/{me_id}", json={"status": "blocked"}, headers=root)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "last_admin"
    assert client.patch(f"/api/users/{bob_id}", json={"role": "designer"}, headers=bob).status_code == 403  # designers cannot administer


def test_blocking_cuts_access_immediately(client):
    boss = auth(client)
    bob = join(client, "bob@x.ru")
    bob_id = next(u["id"] for u in client.get("/api/users", headers=boss).json()["items"] if u["email"] == "bob@x.ru")
    assert client.get("/api/projects", headers=bob).status_code == 200
    r = client.patch(f"/api/users/{bob_id}", json={"status": "blocked"}, headers=boss)
    assert r.json()["status"] == "blocked"
    assert client.get("/api/projects", headers=bob).status_code == 401  # the token he already holds stops working
    assert hdr(client, "bob@x.ru")[1].json()["detail"]["code"] == "locked"
    client.patch(f"/api/users/{bob_id}", json={"status": "active"}, headers=boss)
    assert hdr(client, "bob@x.ru")[1].status_code == 200


def test_user_admin_tenant_isolation_and_super_admin_protection(client, outbox):
    boss = auth(client)
    other = auth(client, "z@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    other_id = next(u["id"] for u in client.get("/api/users", headers=other).json()["items"])
    assert client.patch(f"/api/users/{other_id}", json={"status": "blocked"}, headers=boss).status_code == 404
    assert client.post(f"/api/users/{other_id}/reset-password", headers=boss).status_code == 404
    root = admin(client)
    root_id = next(u["id"] for u in client.get("/api/users", headers=root).json()["items"] if u["email"] == "root@inpad.ru")
    assert client.patch(f"/api/users/{root_id}", json={"status": "blocked"}, headers=boss).status_code == 404  # other organization
    assert client.patch(f"/api/users/{root_id}", json={"status": "blocked"}, headers=root).json()["detail"]["code"] == "self_change"


def test_admin_triggered_password_reset(client, outbox):
    boss = auth(client)
    join(client, "bob@x.ru")
    bob_id = next(u["id"] for u in client.get("/api/users", headers=boss).json()["items"] if u["email"] == "bob@x.ru")
    assert client.post(f"/api/users/{bob_id}/reset-password", headers=boss).status_code == 202
    assert outbox[-1]["to"] == "bob@x.ru"
    assert client.post("/api/auth/reset-password", json={"token": token_from(outbox), "password": "AnotherPass2026"}).status_code == 204
    assert hdr(client, "bob@x.ru", "AnotherPass2026")[1].status_code == 200


# ---------------- profile ----------------
def test_profile_read_update_and_preferences(client):
    h = auth(client)
    me = client.get("/api/users/me", headers=h).json()
    assert me["email"] == "anna@psi.ru" and me["organizationName"] == "ПроектСтрой" and me["prefs"] == {"validation": True, "versions": True, "invitations": True, "email": True}
    r = client.patch("/api/users/me", json={"fullName": "Анна Ковалёва", "position": "ГИП", "phone": "+7 900 000-00-00", "prefs": {"validation": False, "versions": True, "invitations": True, "email": False}}, headers=h)
    assert r.status_code == 200 and r.json()["position"] == "ГИП" and r.json()["prefs"]["validation"] is False
    assert client.get("/api/users?q=анна ковалёва", headers=h).json()["total"] == 1
    assert client.patch("/api/users/me", json={"fullName": "ab"}, headers=h).status_code == 422
    assert client.get("/api/users/me").status_code == 401


def test_change_password(client):
    h = auth(client)
    bad = client.post("/api/users/me/password", json={"currentPassword": "Wrong12345678", "newPassword": "NewStrong2026x"}, headers=h)
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "invalid_credentials"
    assert client.post("/api/users/me/password", json={"currentPassword": PASSWORD, "newPassword": PASSWORD}, headers=h).status_code == 422
    assert client.post("/api/users/me/password", json={"currentPassword": PASSWORD, "newPassword": "weak"}, headers=h).status_code == 422
    ok = client.post("/api/users/me/password", json={"currentPassword": PASSWORD, "newPassword": "NewStrong2026x"}, headers=h)
    assert ok.status_code == 200 and ok.json()["token"]
    assert hdr(client, "anna@psi.ru")[1].status_code == 401
    assert hdr(client, "anna@psi.ru", "NewStrong2026x")[1].status_code == 200
    root = admin(client)
    entries = client.get("/api/audit?entityType=user", headers=root).json()["items"]
    assert {"auth.password_changed", "auth.password_change_failed"} <= {e["action"] for e in entries}


# ---------------- organizations ----------------
def test_organization_crud_and_permissions(client):
    boss = auth(client)
    root = admin(client)
    body = {"name": "ООО «Новая»", "inn": "7707083893", "maxUsers": 5, "maxProjects": 10}
    assert client.post("/api/organizations", json=body, headers=boss).status_code == 403
    r = client.post("/api/organizations", json=body, headers=root)
    assert r.status_code == 201 and r.json()["maxUsers"] == 5 and r.json()["usersCount"] == 0 and r.json()["isActive"] is True
    assert client.post("/api/organizations", json=body, headers=root).status_code == 409
    assert client.post("/api/organizations", json={**body, "name": "Х", "inn": "123"}, headers=root).status_code == 422
    oid = r.json()["id"]
    assert client.patch(f"/api/organizations/{oid}", json={"address": "г. Москва", "ogrn": "1027700132195"}, headers=root).json()["address"] == "г. Москва"
    assert client.patch(f"/api/organizations/{oid}", json={"name": "ПроектСтрой"}, headers=root).status_code == 409
    assert client.patch("/api/organizations/999", json={"address": "x"}, headers=root).status_code == 404
    assert client.patch(f"/api/organizations/{oid}", json={"address": "x"}, headers=boss).status_code == 403
    rows = {o["name"]: o for o in client.get("/api/organizations", headers=root).json()}
    assert rows["ПроектСтрой"]["usersCount"] == 1 and "ООО «Новая»" in rows


def test_limits_cannot_drop_below_current_usage(client):
    boss = auth(client)
    root = admin(client)
    join(client, "bob@x.ru")
    d = make_doc(client, boss)
    org = next(o for o in client.get("/api/organizations", headers=root).json() if o["name"] == "ПроектСтрой")
    assert org["usersCount"] == 2 and org["projectsCount"] == 1 and org["documentsCount"] == 1
    r = client.patch(f"/api/organizations/{org['id']}", json={"maxUsers": 1}, headers=root)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "limit_too_low"
    assert client.patch(f"/api/organizations/{org['id']}", json={"maxProjects": 1}, headers=root).status_code == 200  # exactly the usage is fine
    assert d


def test_project_limit_is_enforced(client):
    boss = auth(client)
    root = admin(client)
    org = next(o for o in client.get("/api/organizations", headers=root).json() if o["name"] == "ПроектСтрой")
    client.patch(f"/api/organizations/{org['id']}", json={"maxProjects": 1}, headers=root)
    assert client.post("/api/projects", json=PROJECT, headers=boss).status_code == 201
    r = client.post("/api/projects", json=PROJECT, headers=boss)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "limit_reached"


def test_deactivated_organization_loses_access_at_once(client):
    boss = auth(client)
    bob = join(client, "bob@x.ru")
    root = admin(client)
    org = next(o for o in client.get("/api/organizations", headers=root).json() if o["name"] == "ПроектСтрой")
    assert client.patch(f"/api/organizations/{org['id']}", json={"isActive": False}, headers=root).json()["isActive"] is False
    assert client.get("/api/projects", headers=boss).status_code == 401 and client.get("/api/projects", headers=bob).status_code == 401
    assert hdr(client, "anna@psi.ru")[1].json()["detail"]["code"] == "locked"
    assert "ПроектСтрой" not in [o["name"] for o in client.get("/api/organizations/public").json()]
    r = client.post("/api/auth/register", json={"fullName": "Иван Иванов", "email": "n@x.ru", "password": PASSWORD, "organization": {"mode": "join", "organizationId": org["id"]}})
    assert r.status_code == 404
    client.patch(f"/api/organizations/{org['id']}", json={"isActive": True}, headers=root)
    assert hdr(client, "anna@psi.ru")[1].status_code == 200


# ---------------- audit log ----------------
def actions_of(client, h, **q):
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    return [e["action"] for e in client.get(f"/api/audit?{qs}", headers=h).json()["items"]]


def test_audit_records_key_events(client):
    boss = auth(client)
    d = complete_doc(client, boss)
    validate(client, boss, d)
    client.get(f"/api/documents/{d['id']}/xml/download", headers=boss)
    client.post(f"/api/documents/{d['id']}/archive", headers=boss)
    client.post(f"/api/documents/{d['id']}/restore", headers=boss)
    client.post(f"/api/documents/{d['id']}/archive", headers=boss)
    client.delete(f"/api/documents/{d['id']}", headers=boss)
    hdr(client, "anna@psi.ru")
    got = set(actions_of(client, boss, pageSize=100))
    assert {"auth.register", "auth.login", "project.created", "document.created", "document.validated", "document.exported",
            "document.archived", "document.restored", "document.deleted"} <= got
    e = client.get("/api/audit?action=document.deleted", headers=boss).json()["items"][0]
    assert e["userName"] == "Ковалёва Анна" and e["entityType"] == "document" and e["organizationName"] == "ПроектСтрой" and e["result"] == "ok"


def test_failed_login_is_audited_with_ip_and_hidden_from_org_admins(client):
    boss = auth(client)
    root = admin(client)
    client.post("/api/auth/login", json={"email": "nobody@x.ru", "password": "whatever12345"})
    client.post("/api/auth/login", json={"email": "anna@psi.ru", "password": "WrongPass12345"})
    denied = client.get("/api/audit?result=denied", headers=root).json()["items"]
    assert len(denied) == 2 and all(e["action"] == "auth.login_failed" and e["ip"] for e in denied)
    mine = client.get("/api/audit?result=denied", headers=boss).json()["items"]
    assert len(mine) == 1 and "anna@psi.ru" in mine[0]["summary"]  # the unknown-user attempt has no organization


def test_audit_scope_filters_and_permissions(client):
    boss = auth(client)
    other = auth(client, "z@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    client.post("/api/projects", json=PROJECT, headers=other)
    root = admin(client)
    assert "project.created" not in actions_of(client, boss, pageSize=100)  # the project belongs to another organization
    assert "project.created" in actions_of(client, root, pageSize=100)
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "Другая")
    assert set(e for e in actions_of(client, root, organizationId=org_id, pageSize=100)) >= {"project.created"}
    assert client.get("/api/audit", headers=join(client, "des@x.ru")).status_code == 403
    assert client.get("/api/audit").status_code == 401
    uid = client.get("/api/audit?action=auth.register", headers=boss).json()["items"][0]["userId"]
    assert actions_of(client, boss, userId=uid) == ["auth.register"] or "auth.register" in actions_of(client, boss, userId=uid)
    today = date.today().isoformat()
    assert client.get(f"/api/audit?dateFrom={today}&dateTo={today}", headers=boss).json()["total"] > 0
    assert client.get("/api/audit?dateTo=2000-01-01", headers=boss).json()["total"] == 0
    assert client.get(f"/api/audit?dateFrom={(date.today() + timedelta(days=2)).isoformat()}", headers=boss).json()["total"] == 0
    assert client.get("/api/audit?result=maybe", headers=boss).status_code == 422
    page = client.get("/api/audit?pageSize=1&page=2", headers=boss).json()
    assert len(page["items"]) == 1 and page["total"] >= 2
    assert "auth.register" in client.get("/api/audit/actions", headers=boss).json()


def test_audit_search_is_case_insensitive_in_cyrillic(client):
    boss = auth(client)
    client.post("/api/projects", json={**PROJECT, "name": "Школа на 825 мест"}, headers=boss)
    assert client.get("/api/audit?q=ШКОЛА", headers=boss).json()["total"] == 1
    assert client.get("/api/audit?q=ковалёва анна", headers=boss).json()["total"] >= 1
    assert client.get("/api/audit?q=несуществующее", headers=boss).json()["total"] == 0


def test_audit_csv_export_is_excel_safe(client):
    boss = auth(client)
    client.post("/api/auth/register", json={"fullName": "=HYPERLINK(1)", "email": "evil@x.ru", "password": PASSWORD,
                                            "organization": {"mode": "create", "name": "Злая", "inn": "7701234569"}})
    root = admin(client)
    r = client.get("/api/audit/export", headers=root)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    assert r.content.startswith("\ufeff".encode())
    text = r.content.decode("utf-8-sig")
    assert text.splitlines()[0].startswith("Время (UTC);Пользователь") and "ПроектСтрой" in text
    assert "'=HYPERLINK(1)" in text and ";=HYPERLINK(1);" not in text  # formula injection neutralised
    assert client.get("/api/audit/export", headers=boss).content.decode("utf-8-sig").count("Злая") == 0  # scoped like the list


def test_audit_survives_user_rename(client):
    boss = auth(client)
    client.patch("/api/users/me", json={"fullName": "Совсем Другое Имя"}, headers=boss)
    names = {e["userName"] for e in client.get("/api/audit?action=auth.register", headers=boss).json()["items"]}
    assert names == {"Ковалёва Анна"}  # the log keeps the name as it was at the time


# ---------------- notifications ----------------
def test_notifications_are_generated_for_the_author_only_when_someone_else_acts(client):
    author = auth(client)
    d = complete_doc(client, author)
    assert client.get("/api/notifications", headers=author).json()["total"] == 0  # own actions never notify yourself
    validate(client, author, d)
    assert client.get("/api/notifications/unread-count", headers=author).json() == {"unread": 0}
    colleague = join(client, "bob@x.ru")
    client.post(f"/api/documents/{d['id']}/validate", headers=colleague)
    client.post(f"/api/documents/{d['id']}/versions", json={"comment": "правки"}, headers=colleague)
    client.post(f"/api/documents/{d['id']}/archive", headers=colleague)
    r = client.get("/api/notifications", headers=author).json()
    assert r["total"] == 3 and r["unread"] == 3
    kinds = {n["kind"] for n in r["items"]}
    assert kinds == {"validation", "version", "archive"}
    v = next(n for n in r["items"] if n["kind"] == "validation")
    assert d["title"] in v["title"] and v["link"] == f"/app/documents/{d['id']}/validation" and v["read"] is False
    assert client.get("/api/notifications?kind=version", headers=author).json()["total"] == 1
    assert client.get("/api/notifications", headers=colleague).json()["total"] == 0


def test_notification_preferences_are_respected(client):
    author = auth(client)
    d = complete_doc(client, author)
    client.patch("/api/users/me", json={"prefs": {"validation": False, "versions": True, "invitations": True, "email": True}}, headers=author)
    colleague = join(client, "bob@x.ru")
    client.post(f"/api/documents/{d['id']}/validate", headers=colleague)
    assert client.get("/api/notifications", headers=author).json()["total"] == 0
    client.post(f"/api/documents/{d['id']}/versions", json={}, headers=colleague)
    assert client.get("/api/notifications", headers=author).json()["total"] == 1  # other kinds still arrive


def test_read_state_and_privacy(client):
    author = auth(client)
    d = complete_doc(client, author)
    colleague = join(client, "bob@x.ru")
    for _ in range(3):
        client.post(f"/api/documents/{d['id']}/versions", json={}, headers=colleague)
    items = client.get("/api/notifications", headers=author).json()["items"]
    nid = items[0]["id"]
    assert client.post(f"/api/notifications/{nid}/read", headers=colleague).status_code == 404  # not yours
    assert client.post(f"/api/notifications/{nid}/read", headers=author).json()["read"] is True
    assert client.get("/api/notifications/unread-count", headers=author).json()["unread"] == 2
    assert [n["read"] for n in client.get("/api/notifications?unreadOnly=true", headers=author).json()["items"]] == [False, False]
    assert client.post("/api/notifications/read-all", headers=author).status_code == 204
    assert client.get("/api/notifications/unread-count", headers=author).json()["unread"] == 0
    assert client.get("/api/notifications", headers=author).json()["total"] == 3  # read ones stay in the list
    assert client.get("/api/notifications").status_code == 401
    assert client.post("/api/notifications/read-all").status_code == 401


# ---------------- stats ----------------
def test_dashboard_counts(client):
    h = auth(client)
    good = complete_doc(client, h)
    validate(client, h, good)  # validated, 0 errors
    bad = make_doc(client, h)
    validate(client, h, bad)  # 2 errors
    make_doc(client, h)  # never checked
    stale = complete_doc(client, h)
    validate(client, h, stale)
    stale = client.get(f"/api/documents/{stale['id']}", headers=h).json()
    save(client, h, stale, references=[])  # edited after the check -> stale
    arch = make_doc(client, h)
    client.post(f"/api/documents/{arch['id']}/archive", headers=h)
    d = client.get("/api/stats/dashboard", headers=h).json()
    assert d["documentsByStatus"] == {"draft": 3, "in_review": 0, "validated": 1, "archived": 1}
    assert d["errors"] == 2 and d["staleChecks"] == 1 and d["unchecked"] == 1  # stale numbers are not counted
    assert d["projectsTotal"] == 5 and d["projectsActive"] == 5 and d["myDrafts"] == 3
    assert len(d["recent"]) == 4 and all(r["status"] != "archived" for r in d["recent"])  # 5 documents, 1 archived
    assert client.get("/api/stats/dashboard").status_code == 401


def test_dashboard_is_tenant_scoped(client):
    owner = auth(client)
    make_doc(client, owner)
    other = auth(client, "z@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    d = client.get("/api/stats/dashboard", headers=other).json()
    assert d["documentsByStatus"] == {"draft": 0, "in_review": 0, "validated": 0, "archived": 0} and d["recent"] == [] and d["projectsTotal"] == 0


def test_admin_stats_scope_and_shape(client):
    boss = auth(client)
    make_doc(client, boss)
    other = auth(client, "z@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    make_doc(client, other)
    make_doc(client, other)
    a = client.get("/api/stats/admin", headers=boss).json()
    assert a["usersTotal"] == 1 and a["organizationsTotal"] == 1 and a["documentsTotal"] == 1 and a["projectsTotal"] == 1
    assert len(a["weeklyDocuments"]) == 8 and a["weeklyDocuments"][-1]["count"] == 1 and sum(w["count"] for w in a["weeklyDocuments"][:-1]) == 0
    assert 1 <= len(a["recentAudit"]) <= 8 and all(e["organizationName"] == "ПроектСтрой" for e in a["recentAudit"])
    root = admin(client)
    g = client.get("/api/stats/admin", headers=root).json()
    assert g["usersTotal"] == 3 and g["organizationsTotal"] == 3 and g["documentsTotal"] == 3 and g["weeklyDocuments"][-1]["count"] == 3
    assert client.get("/api/stats/admin", headers=join(client, "des@x.ru")).status_code == 403


# ---------------- settings ----------------
def test_settings_permissions_and_validation(client):
    boss = auth(client)
    root = admin(client)
    assert client.get("/api/settings", headers=boss).status_code == 403
    cfg = client.get("/api/settings", headers=root).json()
    assert cfg["maxXmlMb"] == 20 and cfg["blockExportOnWarnings"] is False and cfg["warnOutdatedReferences"] is True
    assert set(cfg["emailTemplates"]) == {"confirm", "invite", "reset"}
    assert client.put("/api/settings", json=cfg, headers=boss).status_code == 403
    assert client.put("/api/settings", json={**cfg, "maxXmlMb": 0}, headers=root).status_code == 422
    assert client.put("/api/settings", json={**cfg, "maxXmlMb": 51}, headers=root).status_code == 422
    short = {**cfg, "emailTemplates": {**cfg["emailTemplates"], "invite": {"subject": "x", "body": "короткий"}}}
    assert client.put("/api/settings", json=short, headers=root).status_code == 422
    assert client.put("/api/settings", json={**cfg, "maxXmlMb": 7}, headers=root).json()["maxXmlMb"] == 7
    assert client.get("/api/settings", headers=root).json()["maxXmlMb"] == 7  # persisted
    assert "settings.updated" in actions_of(client, root, pageSize=100)
    n = client.get("/api/audit?action=settings.updated", headers=root).json()["total"]
    client.put("/api/settings", json={**cfg, "maxXmlMb": 7}, headers=root)  # no change -> no new audit row
    assert client.get("/api/audit?action=settings.updated", headers=root).json()["total"] == n


def test_setting_block_export_on_warnings_changes_behaviour(client):
    boss = auth(client)
    root = admin(client)
    d = complete_doc(client, boss)
    d = save(client, boss, d, references=[{"id": "n1", "code": "СП 54.13330.2016", "title": "Старая", "custom": False}])  # -> warning only
    r = validate(client, boss, d)
    assert r["errors"] == 0 and r["warnings"] == 1 and r["blocking"] == 0 and r["status"] == "validated"
    assert client.get(f"/api/documents/{d['id']}/xml/download", headers=boss).status_code == 200
    cfg = client.get("/api/settings", headers=root).json()
    client.put("/api/settings", json={**cfg, "blockExportOnWarnings": True}, headers=root)
    r = validate(client, boss, d)
    assert r["blocking"] == 1 and r["status"] == "draft"  # a warning now prevents "validated"
    blocked = client.get(f"/api/documents/{d['id']}/xml/download", headers=boss)
    assert blocked.status_code == 409 and "предупреждений" in blocked.json()["detail"]["message"]
    z = client.post("/api/documents/bulk/xml", json={"ids": [int(d["id"])]}, headers=boss)
    assert z.status_code == 409
    client.put("/api/settings", json={**cfg, "blockExportOnWarnings": True, "warnOutdatedReferences": False}, headers=root)
    r = validate(client, boss, d)
    assert r["warnings"] == 0 and r["blocking"] == 0 and r["status"] == "validated"  # rule switched off -> nothing to block


def test_setting_email_templates_are_used(client, outbox):
    boss = auth(client)
    root = admin(client)
    cfg = client.get("/api/settings", headers=root).json()
    tpl = {**cfg["emailTemplates"], "invite": {"subject": "Добро пожаловать в {org}!", "body": "Роль {role}. Ссылка: {link}. Секрет: {unknown}"}}
    client.put("/api/settings", json={**cfg, "emailTemplates": tpl}, headers=root)
    client.post("/api/users/invite", json={"email": "n@x.ru", "role": "designer"}, headers=boss)
    assert outbox[-1]["subject"] == "Добро пожаловать в ПроектСтрой!"
    assert "Роль designer." in outbox[-1]["body"] and "/invite/" in outbox[-1]["body"] and "{unknown}" in outbox[-1]["body"]  # no crash on unknown placeholder


def test_setting_require_email_confirmation(client, outbox):
    root = admin(client)
    cfg = client.get("/api/settings", headers=root).json()
    client.put("/api/settings", json={**cfg, "requireEmailConfirmation": True}, headers=root)
    client.post("/api/auth/register", json={"fullName": "Иван Иванов", "email": "n@x.ru", "password": PASSWORD, "organization": {"mode": "create", "name": "Новая", "inn": "7701234570"}})
    assert hdr(client, "n@x.ru")[1].json()["detail"]["code"] == "email_not_confirmed"
    assert "Подтверждение" in outbox[-1]["subject"] and "/confirm/" in outbox[-1]["body"]


def test_old_invitation_link_cannot_be_revived_by_a_reused_row_id(client, outbox):
    """The link of a revoked invitation must stay dead, also where the freed row id is reused (SQLite)."""
    boss = auth(client)
    first = client.post("/api/users/invite", json={"email": "a@x.ru", "role": "designer"}, headers=boss).json()
    old_token = token_from(outbox)
    client.delete(f"/api/users/invitations/{first['id']}", headers=boss)
    second = client.post("/api/users/invite", json={"email": "b@x.ru", "role": "expert"}, headers=boss).json()
    with client.session_factory() as db:
        if db.bind.dialect.name == "sqlite":  # SQLite reuses freed row ids, PostgreSQL never does
            assert second["id"] == first["id"]  # the dangerous situation this test is about really occurs
    assert accept(client, old_token).json()["detail"]["code"] == "token_invalid"
    ok = accept(client, token_from(outbox))
    assert ok.status_code == 200 and ok.json()["user"]["email"] == "b@x.ru" and ok.json()["user"]["role"] == "expert"


def test_invite_info_shows_the_invitee_without_consuming_the_link(client, outbox):
    boss = auth(client)
    client.post("/api/users/invite", json={"email": "New@Mail.ru", "role": "expert"}, headers=boss)
    token = token_from(outbox)
    info = client.get(f"/api/auth/invite-info?token={token}")
    assert info.status_code == 200 and info.json() == {"email": "new@mail.ru", "organizationName": "ПроектСтрой", "role": "expert"}
    assert client.get(f"/api/auth/invite-info?token={token}").status_code == 200  # read-only: can be opened again
    assert client.get("/api/auth/invite-info?token=garbage").json()["detail"]["code"] == "token_invalid"
    assert client.get(f"/api/auth/invite-info?token={create_token(1, 'invite', -1)}").json()["detail"]["code"] == "token_expired"
    assert accept(client, token).status_code == 200
    assert client.get(f"/api/auth/invite-info?token={token}").json()["detail"]["code"] == "token_invalid"  # used up
