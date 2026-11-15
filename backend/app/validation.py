"""Two validation layers: business rules (BR-*) and XSD (XSD-*), both mapped to form fields."""
import re
from datetime import datetime, timezone
from functools import lru_cache

from lxml import etree

from .document_data import REQUIRED_OBJECT_FIELDS
from .xml_builder import build_xml, field_for_path, to_number
from .xsd import compile_xsd

CADASTRAL = re.compile(r"^\d{2}:\d{2}:\d{6,7}:\d{1,6}$")
OBJECT_LABELS = {
    "name": "Наименование объекта", "address": "Адрес", "cadastralNumber": "Кадастровый номер",
    "constructionType": "Вид строительства", "developer": "Застройщик",
}
# referenced documents that were superseded
OUTDATED = {
    "СП 54.13330.2016": "СП 54.13330.2022",
    "СП 118.13330.2012": "СП 118.13330.2022",
    "СП 59.13330.2016": "СП 59.13330.2020",
}


@lru_cache(maxsize=32)
def compiled(checksum: str, content: str) -> etree.XMLSchema:  # noqa: ARG001  (checksum = cache key)
    return compile_xsd(content)


def _section(field: str | None) -> str | None:
    return re.split(r"[.\[]", field, maxsplit=1)[0] if field else None


class _Issues(list):
    def add(self, severity, source, code, message, field=None, xpath=None, line=None):
        self.append({
            "id": f"{code}:{field or len(self)}", "severity": severity, "source": source, "code": code,
            "message": message, "field": field, "section": _section(field), "xpath": xpath, "line": line,
        })


def _num(x: float) -> str:
    return f"{x:,.2f}".rstrip("0").rstrip(".").replace(",", " ").replace(".", ",")


def business_rules(data: dict, warn_outdated: bool = True) -> list[dict]:
    out = _Issues()
    obj = data.get("object", {})

    for key in REQUIRED_OBJECT_FIELDS:
        if not str(obj.get(key, "")).strip():
            out.add("error", "business", "BR-001", f"Не заполнено обязательное поле «{OBJECT_LABELS[key]}»", f"object.{key}")
    cad = str(obj.get("cadastralNumber", "")).strip()
    if cad and not CADASTRAL.match(cad):
        out.add("error", "business", "BR-002", "Кадастровый номер не соответствует формату 77:01:0004012:1234", "object.cadastralNumber")

    rows = data.get("tei", [])
    if not rows:
        out.add("error", "business", "BR-010", "Не указано ни одного технико-экономического показателя", "tei")
    seen: dict[str, str] = {}
    for r in rows:
        rid = r.get("id")
        for key, label in (("name", "наименование"), ("unit", "единица измерения"), ("value", "значение")):
            if not str(r.get(key, "")).strip():
                out.add("error", "business", "BR-011", f"В показателе не заполнено {label}", f"tei[{rid}].{key}")
        raw = str(r.get("value", "")).strip()
        if raw:
            n = to_number(raw)
            if n is None or n < 0:
                out.add("error", "business", "BR-012", f"Значение «{raw}» должно быть неотрицательным числом", f"tei[{rid}].value")
        nm = str(r.get("name", "")).strip().lower()
        if nm:
            if nm in seen:
                out.add("warning", "business", "BR-013", f"Показатель «{r.get('name')}» указан повторно", f"tei[{rid}].name")
            seen[nm] = rid

    def find(pred):
        return next((r for r in rows if pred(str(r.get("name", "")).lower()) and r.get("unit") == "м²"), None)

    plot = find(lambda n: "площадь" in n and "участка" in n)
    built = find(lambda n: "площадь застройки" in n)
    if plot and built:
        p, b = to_number(plot.get("value", "")), to_number(built.get("value", ""))
        if p is not None and b is not None and b > p:
            out.add("error", "business", "BR-014",
                    f"Площадь застройки ({_num(b)} м²) больше площади участка ({_num(p)} м²)", f"tei[{built['id']}].value")

    comp = data.get("composition", [])
    if not any(c.get("included") for c in comp):
        out.add("error", "business", "BR-020", "Не выбран ни один раздел проектной документации", "composition")
    elif not any(c.get("code") == "1" and c.get("included") for c in comp):
        out.add("error", "business", "BR-021", "Раздел 1 «Пояснительная записка» должен быть включён в состав", "composition[1]")

    refs = data.get("references", [])
    if not refs:
        out.add("error", "business", "BR-030", "Не указано ни одной нормативной ссылки", "references")
    for ref in refs:
        code = str(ref.get("code", "")).strip()
        if warn_outdated and code in OUTDATED:
            out.add("warning", "business", "BR-031", f"Ссылка {code} устарела, актуальная редакция: {OUTDATED[code]}", f"references[{ref.get('id')}]")

    if not str(data.get("additional", {}).get("notes", "")).strip():
        out.add("info", "business", "INF-001", "Дополнительные сведения не заполнены (необязательно)", "additional.notes")
    return list(out)


def xsd_issues(schema: etree.XMLSchema, xml: bytes, fieldmap: dict[str, str]) -> list[dict]:
    doc = etree.fromstring(xml)
    if schema.validate(doc):
        return []
    out = _Issues()
    for e in schema.error_log:
        field = field_for_path(fieldmap, e.path)
        out.add("error", "xsd", f"XSD-{e.type_name}", f"Нарушение XSD: {e.message}", field, e.path, e.line)
    return list(out)


def validate_document(doc, schema_row, opts: dict | None = None) -> dict:
    """Run both layers on the document's current data. XSD issues that repeat a business error on the same field are dropped."""
    built = build_xml(doc.data, doc.schema_version, schema_row.content)
    opts = opts or {}
    biz = business_rules(doc.data, warn_outdated=opts.get("warn_outdated", True))
    bad_fields = {i["field"] for i in biz if i["severity"] == "error" and i["field"]}
    raw_xsd = xsd_issues(compiled(schema_row.checksum, schema_row.content), built.xml, built.fieldmap)
    xsd = [i for i in raw_xsd if i["field"] not in bad_fields]
    issues = biz + xsd
    count = lambda s: sum(1 for i in issues if i["severity"] == s)  # noqa: E731
    order = {"error": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda i: (order[i["severity"]], i["source"] != "business"))
    return {
        "issues": issues, "errors": count("error"), "warnings": count("warning"), "infos": count("info"),
        # what actually blocks export / the "validated" status (warnings only when the admin enabled that)
        "blocking": count("error") + (count("warning") if opts.get("block_on_warnings") else 0),
        "checkedAt": datetime.now(timezone.utc).isoformat(), "revision": doc.revision, "schemaVersion": doc.schema_version,
        "xmlValid": not raw_xsd,  # real XSD validity, before de-duplication
    }


def report_text(doc, result: dict) -> str:
    lines = [
        f"Отчёт о проверке: {doc.title}", f"Схема: {result['schemaVersion']}   Редакция документа: {result['revision']}",
        f"Проверено: {result['checkedAt']}",
        f"Ошибок: {result['errors']}, предупреждений: {result['warnings']}, сведений: {result['infos']}", "",
    ]
    names = {"error": "ОШИБКА", "warning": "ПРЕДУПРЕЖДЕНИЕ", "info": "СВЕДЕНИЯ"}
    for i in result["issues"]:
        lines.append(f"[{names[i['severity']]}] {i['code']}: {i['message']}")
        if i.get("field"):
            lines.append(f"    поле: {i['field']}")
        if i.get("xpath"):
            lines.append(f"    xpath: {i['xpath']}" + (f" (строка {i['line']})" if i.get("line") else ""))
    if not result["issues"]:
        lines.append("Замечаний нет.")
    return "\n".join(lines) + "\n"
