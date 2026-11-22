import base64

from app import seed
from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import Organization, Role, User, XmlSchema

from .test_import import SIMPLE, b64, preview
from .test_projects import auth


def run_seed(client, monkeypatch, capsys):
    monkeypatch.setattr(seed, "SessionLocal", client.session_factory)
    seed.run()
    return capsys.readouterr().out


# ---------------- first start: the seed that every deployment relies on ----------------
def test_seed_creates_super_admin_with_the_configured_password(client, monkeypatch, capsys):
    monkeypatch.setattr(settings, "seed_admin_email", "boss@company.ru")
    monkeypatch.setattr(settings, "seed_admin_password", "Sup3rSecret-Pass")
    out = run_seed(client, monkeypatch, capsys)
    assert "Created super admin boss@company.ru" in out
    r = client.post("/api/auth/login", json={"email": "boss@company.ru", "password": "Sup3rSecret-Pass"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "super_admin" and r.json()["organization"]["name"] == "ИнПАД"
    assert client.post("/api/auth/login", json={"email": "boss@company.ru", "password": "ChangeMe2026"}).status_code == 401  # the dev default is NOT accepted


def test_seed_is_idempotent_and_never_overwrites_an_existing_admin(client, monkeypatch, capsys):
    monkeypatch.setattr(settings, "seed_admin_email", "boss@company.ru")
    monkeypatch.setattr(settings, "seed_admin_password", "Sup3rSecret-Pass")
    run_seed(client, monkeypatch, capsys)
    client.post("/api/users/me/password", json={"currentPassword": "Sup3rSecret-Pass", "newPassword": "Changed-By-Admin-1"},
                headers={"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": "boss@company.ru", "password": "Sup3rSecret-Pass"}).json()["token"]})
    out = run_seed(client, monkeypatch, capsys)  # a container restart must not reset the password the admin chose
    assert "already exists" in out
    assert client.post("/api/auth/login", json={"email": "boss@company.ru", "password": "Changed-By-Admin-1"}).status_code == 200
    with client.session_factory() as db:
        assert db.query(User).filter(User.email == "boss@company.ru").count() == 1
        assert db.query(Organization).filter(Organization.name == "ИнПАД").count() == 1


def test_seed_loads_bundled_schemas_once(client, monkeypatch, capsys):
    with client.session_factory() as db:
        db.query(XmlSchema).delete()
        db.commit()
    out = run_seed(client, monkeypatch, capsys)
    assert "Loaded 2 bundled XML schema(s)" in out
    with client.session_factory() as db:
        assert sorted(s.version for s in db.query(XmlSchema)) == ["01.04", "01.05"]
        assert db.query(XmlSchema).filter(XmlSchema.is_default).count() == 1


# ---------------- password hashing edge cases ----------------
def test_password_verification_rejects_malformed_hashes():
    good = hash_password("Correct-Horse-1")
    assert verify_password("Correct-Horse-1", good) and not verify_password("wrong", good)
    for broken in ("", "plain-text", "scrypt$only-two", "bcrypt$AAAA$BBBB", "scrypt$%%%$%%%", "a$b$c$d"):
        assert verify_password("Correct-Horse-1", broken) is False  # never raises, never accepts
    assert good != hash_password("Correct-Horse-1")  # salted


# ---------------- importer: odd but legal structures are reported, never crash ----------------
def test_importer_reports_every_kind_of_unexpected_element(client):
    h = auth(client)
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<ExplanatoryNote schemaVersion="01.05">
  <Object><Name>Объект</Name><Address>Адрес</Address><CadastralNumber>77:01:0004012:1234</CadastralNumber><ConstructionType>new</ConstructionType><Developer>Д</Developer></Object>
  <Object><Name>Второй блок</Name></Object>
  <Indicators><Note>лишнее</Note><Indicator><Name>Этажность</Name><Unit>эт.</Unit><Value>3</Value></Indicator></Indicators>
  <Composition><Foo/><Section code="1"><Title>Пояснительная записка</Title><Extra/></Section></Composition>
  <References><Bar/><Reference><Title>без кода</Title></Reference><Reference><Code>СП 1</Code><Weird/></Reference></References>
  <Additional><Notes>заметка</Notes><Other/></Additional>
</ExplanatoryNote>"""
    rep = preview(client, h, xml).json()
    reasons = {(e["element"], e["message"]) for e in rep["skipped"]}
    assert ("Object", "Повторный блок: учтён только первый") in reasons
    assert ("Note", "Ожидался элемент Indicator") in reasons
    assert ("Foo", "Ожидался элемент Section") in reasons and ("Extra", "Элемент раздела не поддерживается") in reasons
    assert ("Bar", "Ожидался элемент Reference") in reasons and ("Weird", "Элемент ссылки не поддерживается") in reasons
    assert ("Reference", "У ссылки нет обозначения (Code)") in reasons and ("Other", "Элемент не поддерживается формой") in reasons
    assert rep["data"]["object"]["name"] == "Объект"  # the first block wins
    assert [r["code"] for r in rep["data"]["references"]] == ["СП 1"] and rep["data"]["additional"]["notes"] == "заметка"


def test_importer_caps_sections_and_references(client):
    h = auth(client)
    sections = "".join(f'<Section code="X{i}"><Title>Раздел {i}</Title></Section>' for i in range(100))
    refs = "".join(f"<Reference><Code>СП {i}</Code></Reference>" for i in range(505))
    xml = f'<ExplanatoryNote schemaVersion="01.05"><Composition>{sections}</Composition><References>{refs}</References></ExplanatoryNote>'
    rep = preview(client, h, xml).json()
    assert len(rep["data"]["composition"]) == 100 and len(rep["data"]["references"]) == 500
    texts = " ".join(e["message"] for e in rep["truncated"])
    assert "Слишком много разделов" in texts and "Слишком много ссылок" in texts


def test_empty_and_non_utf8_base64_inputs(client):
    h = auth(client)
    assert client.post("/api/documents/import/preview", json={"contentBase64": base64.b64encode(b"\xff\xfe\x00\x00garbage").decode()}, headers=h).status_code == 422
    assert preview(client, h, "<?xml version='1.0'?><ExplanatoryNote><!-- only a comment --></ExplanatoryNote>").status_code == 200
