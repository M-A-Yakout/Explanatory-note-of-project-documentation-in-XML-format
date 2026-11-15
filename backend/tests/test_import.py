import base64

from lxml import etree

from app.models import Role

from .test_projects import PROJECT, auth
from .test_validation import REFS, ROWS, complete_doc, save


def b64(text: str | bytes, encoding="utf-8") -> str:
    raw = text if isinstance(text, bytes) else text.encode(encoding)
    return base64.b64encode(raw).decode()


def setup(client, h):
    pid = client.post("/api/projects", json=PROJECT, headers=h).json()["id"]
    return pid


def preview(client, h, xml, **kw):
    return client.post("/api/documents/import/preview", json={"contentBase64": b64(xml), "filename": "src.xml", **kw}, headers=h)


def export_xml(client, h):
    """A schema-valid file produced by the service itself."""
    d = complete_doc(client, h)
    return client.get(f"/api/documents/{d['id']}/xml", headers=h).json()["xml"], d


SIMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<ExplanatoryNote schemaVersion="01.05">
  <Object><Name>Школа на 825 мест</Name><Address>г. Казань</Address><CadastralNumber>16:50:011106:48</CadastralNumber>
    <ConstructionType>new</ConstructionType><Developer>МКУ</Developer></Object>
  <Indicators><Indicator><Name>Этажность</Name><Unit>эт.</Unit><Value>3</Value></Indicator></Indicators>
  <Composition><Section code="1"><Title>Пояснительная записка</Title></Section></Composition>
  <References><Reference><Code>СП 118.13330.2022</Code></Reference></References>
</ExplanatoryNote>"""


def test_roundtrip_of_a_service_generated_file(client):
    h = auth(client)
    xml, orig = export_xml(client, h)
    r = preview(client, h, xml)
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["xsdValid"] is True and rep["skippedTotal"] == 0 and rep["truncatedTotal"] == 0
    assert rep["detectedVersion"] == "01.05" and rep["usedVersion"] == "01.05" and rep["schemaFallback"] is False
    assert rep["summary"] == {"object": 5, "tei": 3, "composition": 1, "references": 1, "additional": False}
    d = rep["data"]
    assert d["object"]["name"] == PROJECT["name"] and d["object"]["cadastralNumber"] == PROJECT["cadastralNumber"]
    assert [(r["name"], r["unit"]) for r in d["tei"]] == [(r["name"], r["unit"]) for r in ROWS]
    assert d["tei"][0]["value"] == "8412.0"  # normalised by the exporter
    assert [c["code"] for c in d["composition"] if c["included"]] == ["1"] and len(d["composition"]) == 12
    assert d["references"][0]["code"] == REFS[0]["code"] and d["references"][0]["custom"] is False


def test_preview_does_not_write_anything(client):
    h = auth(client)
    pid = setup(client, h)
    assert preview(client, h, SIMPLE).status_code == 200
    assert client.get("/api/documents", headers=h).json()["total"] == 0


def test_import_creates_document_with_history(client):
    h = auth(client)
    pid = setup(client, h)
    r = client.post("/api/documents/import", json={"contentBase64": b64(SIMPLE), "filename": "school.xml", "projectId": pid}, headers=h)
    assert r.status_code == 201, r.text
    doc = r.json()["document"]
    assert doc["status"] == "draft" and doc["currentVersion"] == 1 and doc["schemaVersion"] == "01.05"
    assert doc["title"] == "ПЗ — Раздел 1. Школа на 825 мест"
    assert doc["data"]["object"]["developer"] == "МКУ"
    vs = client.get(f"/api/documents/{doc['id']}/versions", headers=h).json()
    assert vs[0]["comment"] == "Импорт из school.xml"
    res = client.post(f"/api/documents/{doc['id']}/validate", headers=h).json()  # the normal pipeline works on imported data
    assert res["errors"] == 0 and res["xmlValid"] is True


def test_unknown_parts_are_reported_not_silently_dropped(client):
    h = auth(client)
    xml = SIMPLE.replace("<Developer>МКУ</Developer>", "<Developer>МКУ</Developer><Architect>Иванов</Architect>") \
                .replace('schemaVersion="01.05"', 'schemaVersion="01.05" author="x"') \
                .replace("</ExplanatoryNote>", "<Legacy><A/></Legacy></ExplanatoryNote>") \
                .replace("<Unit>эт.</Unit>", "<Unit>эт.</Unit><Comment>c</Comment>")
    rep = preview(client, h, xml).json()
    by_el = {e["element"]: e for e in rep["skipped"]}
    assert set(by_el) == {"Architect", "@author", "Legacy", "Comment"}
    assert by_el["Architect"]["xpath"] == "/ExplanatoryNote/Object/Architect" and by_el["Architect"]["status"] == "skipped"
    assert rep["skippedTotal"] == 4 and rep["data"]["object"]["developer"] == "МКУ"  # known data still imported
    assert rep["xsdValid"] is False and rep["xsdIssues"] and rep["xsdIssues"][0]["line"]  # source breaks the XSD, but import proceeds


def test_windows_1251_file_is_read_correctly(client):
    h = auth(client)
    xml = SIMPLE.replace('encoding="UTF-8"', 'encoding="windows-1251"')
    rep = preview(client, h, xml.encode("cp1251")).json()
    assert rep["data"]["object"]["name"] == "Школа на 825 мест" and rep["data"]["tei"][0]["name"] == "Этажность"


def test_namespaced_file_is_accepted(client):
    h = auth(client)
    xml = SIMPLE.replace("<ExplanatoryNote ", '<ExplanatoryNote xmlns="urn:minstroy:pz" ')
    rep = preview(client, h, xml).json()
    assert rep["summary"]["object"] == 5 and rep["summary"]["tei"] == 1
    assert rep["xsdValid"] is False  # our XSD has no namespace: reported, not fatal


def test_schema_detection_fallback_and_override(client):
    h = auth(client)
    assert preview(client, h, SIMPLE.replace('"01.05"', '"01.04"')).json()["usedVersion"] == "01.04"
    rep = preview(client, h, SIMPLE.replace('"01.05"', '"9.9"')).json()
    assert rep["usedVersion"] == "01.05" and rep["detectedVersion"] == "9.9" and rep["schemaFallback"] is True
    rep = preview(client, h, SIMPLE, schemaVersion="01.04").json()
    assert rep["usedVersion"] == "01.04" and rep["schemaFallback"] is False
    assert preview(client, h, SIMPLE.replace(' schemaVersion="01.05"', "")).json()["schemaFallback"] is True


def test_rejects_bad_files(client):
    h = auth(client)
    r = preview(client, h, "<ExplanatoryNote><Object>")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid_xml" and "строка" in r.json()["detail"]["message"]
    assert preview(client, h, "<Other/>").json()["detail"]["code"] == "unsupported_root"
    assert preview(client, h, "   ").json()["detail"]["code"] == "invalid_xml"
    bad = client.post("/api/documents/import/preview", json={"contentBase64": "***not base64***"}, headers=h)
    assert bad.json()["detail"]["code"] == "invalid_payload"
    xxe = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><ExplanatoryNote>&e;</ExplanatoryNote>'
    r = preview(client, h, xxe)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "forbidden_dtd"
    bomb = '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><ExplanatoryNote>&b;</ExplanatoryNote>'
    assert preview(client, h, bomb).json()["detail"]["code"] == "forbidden_dtd"


def test_size_limit_comes_from_the_admin_setting(client):
    from .test_schemas import admin

    h = auth(client)
    a = admin(client)
    cfg = client.get("/api/settings", headers=a).json()
    client.put("/api/settings", json={**cfg, "maxXmlMb": 1}, headers=a)
    big = SIMPLE.replace("</ExplanatoryNote>", "<!--" + "x" * (1024 * 1024 + 10) + "--></ExplanatoryNote>")
    r = preview(client, h, big)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "too_large" and "1 МБ" in r.json()["detail"]["message"]
    client.put("/api/settings", json={**cfg, "maxXmlMb": 5}, headers=a)
    assert preview(client, h, big).status_code == 200


def test_long_values_and_row_limits_are_truncated_and_reported(client):
    h = auth(client)
    rows = "".join(f"<Indicator><Name>n{i}</Name><Unit>м²</Unit><Value>1</Value></Indicator>" for i in range(505))
    xml = SIMPLE.replace("<Developer>МКУ</Developer>", f"<Developer>{'Я' * 300}</Developer>").replace(
        "<Indicator><Name>Этажность</Name><Unit>эт.</Unit><Value>3</Value></Indicator>", rows)
    rep = preview(client, h, xml).json()
    assert len(rep["data"]["object"]["developer"]) == 255 and len(rep["data"]["tei"]) == 500
    msgs = " | ".join(e["message"] for e in rep["truncated"])
    assert "255" in msgs and "500" in msgs and rep["truncatedTotal"] == 6  # 1 long value + 5 extra rows


def test_unknown_section_code_is_kept_and_known_ones_marked(client):
    h = auth(client)
    xml = SIMPLE.replace('<Composition><Section code="1"><Title>Пояснительная записка</Title></Section></Composition>',
                         '<Composition><Section code="1"><Title>x</Title></Section><Section code="3"><Title>y</Title><Note>см. том 3</Note></Section>'
                         '<Section code="99"><Title>Особый раздел</Title></Section><Section><Title>без кода</Title></Section></Composition>')
    rep = preview(client, h, xml).json()
    comp = {c["code"]: c for c in rep["data"]["composition"]}
    assert comp["1"]["included"] and comp["3"]["included"] and comp["3"]["note"] == "см. том 3"
    assert comp["99"]["included"] and comp["99"]["title"] == "Особый раздел" and not comp["2"]["included"]
    assert comp["1"]["title"] == "Пояснительная записка"  # standard wording kept for known codes
    assert [e["message"] for e in rep["skipped"]] == ["У раздела нет атрибута code"]


def test_import_permissions_and_isolation(client):
    owner = auth(client)
    pid = setup(client, owner)
    other = auth(client, "b@o.ru", {"mode": "create", "name": "Другая", "inn": "7701234568"})
    body = {"contentBase64": b64(SIMPLE), "filename": "s.xml", "projectId": pid}
    assert client.post("/api/documents/import", json=body, headers=other).status_code == 404
    org_id = next(o["id"] for o in client.get("/api/organizations/public").json() if o["name"] == "ПроектСтрой")
    expert = auth(client, "e@x.ru", {"mode": "join", "organizationId": org_id}, Role.expert)
    assert client.post("/api/documents/import", json=body, headers=expert).status_code == 403
    assert client.post("/api/documents/import/preview", json=body, headers=expert).status_code == 403
    assert client.post("/api/documents/import", json=body).status_code == 401
    assert client.post("/api/documents/import", json={**body, "projectId": "999"}, headers=owner).status_code == 404
