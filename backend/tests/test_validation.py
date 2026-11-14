from pathlib import Path

from lxml import etree

from app.models import Role

from .test_projects import PROJECT, auth
from .test_schemas import GOOD, admin, upload
from .test_documents import make_doc

XSD = etree.XMLSchema(etree.fromstring((Path(__file__).parent.parent / "app" / "xsd_bundled" / "ExplanatoryNote_01.05.xsd").read_bytes()))

ROWS = [
    {"id": "r1", "name": "Площадь земельного участка", "unit": "м²", "value": "8 412,0"},
    {"id": "r2", "name": "Площадь застройки", "unit": "м²", "value": "3 960,5"},
    {"id": "r3", "name": "Этажность", "unit": "эт.", "value": "17"},
]
REFS = [{"id": "n1", "code": "СП 54.13330.2022", "title": "Здания жилые", "custom": False}]


def save(client, h, doc, **changes):
    data = {**doc["data"], **changes}
    r = client.put(f"/api/documents/{doc['id']}/data", json={"data": data, "baseRevision": doc["revision"]}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def complete_doc(client, h, **kw):
    d = make_doc(client, h, **kw)
    return save(client, h, d, tei=ROWS, references=REFS)


def validate(client, h, doc):
    r = client.post(f"/api/documents/{doc['id']}/validate", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def by_code(res):
    return {i["code"]: i for i in res["issues"]}


def test_fresh_document_reports_missing_sections(client):
    h = auth(client)
    d = make_doc(client, h)
    res = validate(client, h, d)
    codes = by_code(res)
    assert "BR-010" in codes and codes["BR-010"]["field"] == "tei" and codes["BR-010"]["section"] == "tei"
    assert "BR-030" in codes and res["errors"] == 2 and res["status"] == "draft"
    got = client.get(f"/api/documents/{d['id']}", headers=h).json()
    assert got["errorsCount"] == 2 and got["status"] == "draft"


def test_complete_document_passes_and_gets_validated_status(client):
    h = auth(client)
    d = complete_doc(client, h)
    res = validate(client, h, d)
    assert res["errors"] == 0 and res["xmlValid"] is True and res["status"] == "validated"
    assert res["stale"] is False
    assert client.get(f"/api/documents/{d['id']}", headers=h).json()["status"] == "validated"


def test_cross_field_rule_points_to_the_exact_row(client):
    h = auth(client)
    d = complete_doc(client, h)
    rows = [dict(r) for r in ROWS]
    rows[1]["value"] = "9 500"  # built-up area > plot area
    d = save(client, h, d, tei=rows)
    issue = by_code(validate(client, h, d))["BR-014"]
    assert issue["severity"] == "error" and issue["field"] == "tei[r2].value" and issue["section"] == "tei"


def test_bad_number_and_no_duplicate_xsd_noise(client):
    h = auth(client)
    d = complete_doc(client, h)
    rows = [dict(r) for r in ROWS]
    rows[2]["value"] = "17-24"
    res = validate(client, h, save(client, h, d, tei=rows))
    on_field = [i for i in res["issues"] if i["field"] == "tei[r3].value"]
    assert [i["code"] for i in on_field] == ["BR-012"]  # XSD repeat of the same field is dropped
    assert res["xmlValid"] is False  # ...but real XSD validity is still reported honestly


def test_required_fields_map_to_form_fields(client):
    h = auth(client)
    d = complete_doc(client, h)
    obj = {**d["data"]["object"], "developer": "  ", "cadastralNumber": "77:01"}
    res = validate(client, h, save(client, h, d, object=obj))
    fields = {i["field"] for i in res["issues"] if i["severity"] == "error"}
    assert fields == {"object.developer", "object.cadastralNumber"}
    assert res["status"] == "draft"


def test_warnings_do_not_block(client):
    h = auth(client)
    d = complete_doc(client, h)
    refs = [{"id": "n1", "code": "СП 54.13330.2016", "title": "Старая редакция", "custom": False}]
    d = save(client, h, d, references=refs)
    res = validate(client, h, d)
    assert res["errors"] == 0 and res["warnings"] == 1 and by_code(res)["BR-031"]["severity"] == "warning"
    assert res["status"] == "validated"
    assert "СП 54.13330.2022" in by_code(res)["BR-031"]["message"]


def test_xsd_layer_catches_what_business_rules_miss(client):
    a = admin(client)
    strict = GOOD.replace('<xs:maxLength value="500"/>', '<xs:maxLength value="10"/>')
    assert upload(client, a, version="01.07", content=strict).status_code == 201
    d = complete_doc(client, a, schemaVersion="01.07")
    res = validate(client, a, d)
    xsd = [i for i in res["issues"] if i["source"] == "xsd"]
    assert xsd and res["errors"] >= 1
    name_issue = next(i for i in xsd if i["field"] == "object.name")
    assert name_issue["code"].startswith("XSD-") and name_issue["xpath"] == "/ExplanatoryNote/Object/Name" and name_issue["line"]
    assert res["xmlValid"] is False
    assert client.get(f"/api/documents/{d['id']}/xml/download", headers=a).status_code == 409


def test_xml_content_and_schema_awareness(client):
    h = auth(client)
    new = complete_doc(client, h)
    obj = {**new["data"]["object"], "functionalPurpose": "Жилой дом", "financingSource": "Бюджет"}
    new = save(client, h, new, object=obj)
    xml = client.get(f"/api/documents/{new['id']}/xml", headers=h).json()
    assert xml["xsdValid"] is True and xml["schemaVersion"] == "01.05"
    root = etree.fromstring(xml["xml"].encode())
    assert root.get("schemaVersion") == "01.05"
    assert root.findtext("Object/FunctionalPurpose") == "Жилой дом"
    assert root.xpath("Indicators/Indicator[1]/Value/text()") == ["8412.0"]  # '8 412,0' normalised
    assert [s.get("code") for s in root.findall("Composition/Section")] == ["1"]
    old = complete_doc(client, h, schemaVersion="01.04")
    old = save(client, h, old, object=obj)
    root = etree.fromstring(client.get(f"/api/documents/{old['id']}/xml", headers=h).json()["xml"].encode())
    assert root.find("Object/FunctionalPurpose") is None and root.find("Object/FinancingSource") is None  # 01.04 does not declare them


def test_download_valid_xml_and_block_invalid(client):
    h = auth(client)
    d = make_doc(client, h)
    blocked = client.get(f"/api/documents/{d['id']}/xml/download", headers=h)
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "validation_failed"
    d = save(client, h, d, tei=ROWS, references=REFS)
    ok = client.get(f"/api/documents/{d['id']}/xml/download", headers=h)
    assert ok.status_code == 200 and "attachment" in ok.headers["content-disposition"]
    assert XSD.validate(etree.fromstring(ok.content)), XSD.error_log  # the file itself is schema-valid
    assert ok.content.startswith(b"<?xml")


def test_download_never_trusts_a_stale_validation(client):
    h = auth(client)
    d = complete_doc(client, h)
    validate(client, h, d)  # status validated, 0 errors
    d = client.get(f"/api/documents/{d['id']}", headers=h).json()
    bad = save(client, h, d, references=[])  # edit after validation
    assert bad["status"] == "draft" and bad["validationStale"] is True
    assert client.get(f"/api/documents/{d['id']}/xml/download", headers=h).status_code == 409
    last = client.get(f"/api/documents/{d['id']}/validation", headers=h).json()
    assert last["stale"] is True


def test_no_validation_yet_and_report(client):
    h = auth(client)
    d = make_doc(client, h)
    assert client.get(f"/api/documents/{d['id']}/validation", headers=h).json()["detail"]["code"] == "not_validated"
    rep = client.get(f"/api/documents/{d['id']}/validation/report", headers=h)
    assert rep.status_code == 200 and "BR-010" in rep.text and "tei" in rep.text and "attachment" in rep.headers["content-disposition"]


def test_control_characters_do_not_break_xml(client):
    h = auth(client)
    d = complete_doc(client, h)
    obj = {**d["data"]["object"], "customer": "ООО\x00 Заказчик\x0b"}
    d = save(client, h, d, object=obj)
    xml = client.get(f"/api/documents/{d['id']}/xml", headers=h)
    assert xml.status_code == 200
    assert etree.fromstring(xml.json()["xml"].encode()).findtext("Object/Customer") == "ООО Заказчик"


def test_special_characters_are_escaped(client):
    h = auth(client)
    d = complete_doc(client, h)
    obj = {**d["data"]["object"], "customer": 'A & B <c> "d"'}
    d = save(client, h, d, object=obj)
    out = client.get(f"/api/documents/{d['id']}/xml", headers=h).json()["xml"]
    assert "A &amp; B &lt;c&gt;" in out and etree.fromstring(out.encode()).findtext("Object/Customer") == 'A & B <c> "d"'


def test_roles_isolation_and_archive(client):
    owner = auth(client)
    d = complete_doc(client, owner)
    other = auth(client, "b@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    for method, url in (("post", "validate"), ("get", "validation"), ("get", "xml"), ("get", "xml/download"), ("get", "validation/report")):
        assert getattr(client, method)(f"/api/documents/{d['id']}/{url}", headers=other).status_code == 404
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "ПроектСтрой")
    expert = auth(client, "e@x.ru", {"mode": "join", "organizationId": org_id}, Role.expert)
    assert client.post(f"/api/documents/{d['id']}/validate", headers=expert).status_code == 403
    assert client.get(f"/api/documents/{d['id']}/xml", headers=expert).status_code == 200
    assert client.get(f"/api/documents/{d['id']}/xml/download", headers=expert).status_code == 200
    client.post(f"/api/documents/{d['id']}/archive", headers=owner)
    assert client.post(f"/api/documents/{d['id']}/validate", headers=owner).json()["detail"]["code"] == "archived"
