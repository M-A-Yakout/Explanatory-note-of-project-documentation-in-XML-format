"""Reads an existing explanatory-note XML into the form model and reports what could not be transferred.

The source is untrusted: it is parsed without entities/DTD/network, size-limited, and the mapped data is
always re-validated by the server (a client-supplied mapping is never accepted).
"""
import base64
import binascii
import re
import secrets

from lxml import etree

from .core.config import settings
from .document_data import STANDARD_COMPOSITION
from .xml_builder import OBJECT_FIELDS

MAX_ROWS = {"tei": 500, "composition": 100, "references": 500}
MAX_LEN = {
    "name": 500, "address": 500, "cadastralNumber": 64, "constructionType": 32, "developer": 255, "customer": 255,
    "designer": 255, "functionalPurpose": 255, "financingSource": 255,
    "tei.name": 300, "tei.unit": 30, "tei.value": 60, "comp.code": 20, "comp.title": 500, "comp.note": 1000,
    "ref.code": 100, "ref.title": 500, "notes": 20000,
}
KNOWN_NORMS = {
    "Федеральный закон № 384-ФЗ", "Федеральный закон № 123-ФЗ", "Постановление Правительства РФ № 87",
    "СП 54.13330.2022", "СП 118.13330.2022", "СП 42.13330.2016", "СП 4.13130.2013", "СП 59.13330.2020",
    "СП 20.13330.2016", "ГОСТ Р 21.101-2020",
}
TAG_TO_KEY = dict(OBJECT_FIELDS)
REPORT_LIMIT = 200


class ImportFailure(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


def decode_payload(b64: str, max_mb: int | None = None) -> bytes:
    max_mb = settings.max_xml_mb if max_mb is None else max_mb
    if len(b64) > max_mb * 1024 * 1024 * 4 // 3 + 8:
        raise ImportFailure("too_large", f"Файл больше {max_mb} МБ")
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise ImportFailure("invalid_payload", "Не удалось прочитать файл")
    if len(raw) > max_mb * 1024 * 1024:
        raise ImportFailure("too_large", f"Файл больше {max_mb} МБ")
    if not raw.strip():
        raise ImportFailure("invalid_xml", "Файл пустой")
    return raw


def parse_xml(raw: bytes) -> etree._Element:
    head = raw[:4096].lower()
    if b"<!doctype" in head or b"<!entity" in head:
        raise ImportFailure("forbidden_dtd", "DOCTYPE и ENTITY в XML запрещены")
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False,
                             remove_comments=True, remove_pis=True)
    try:
        return etree.fromstring(raw, parser)
    except etree.XMLSyntaxError as e:
        raise ImportFailure("invalid_xml", f"Некорректный XML (строка {e.lineno or '?'}): {e.msg}")


def _local(el) -> str:
    return etree.QName(el).localname


def _kids(el):
    return [c for c in el if isinstance(c.tag, str)]


def map_document(root: etree._Element) -> dict:
    """-> {data, summary, skipped, truncated, detectedVersion}"""
    if _local(root) != "ExplanatoryNote":
        raise ImportFailure("unsupported_root", f"Корневой элемент «{_local(root)}», ожидался ExplanatoryNote")
    tree = root.getroottree()
    skipped: list[dict] = []
    truncated: list[dict] = []

    def path(el):
        return tree.getpath(el)

    def skip(el, why):
        skipped.append({"xpath": path(el), "element": _local(el), "status": "skipped", "message": why})

    def fit(el, value: str, limit_key: str, target: str) -> str:
        value = (value or "").strip()
        limit = MAX_LEN[limit_key]
        if len(value) > limit:
            truncated.append({"xpath": path(el), "element": _local(el), "status": "truncated",
                              "message": f"Значение длиннее {limit} символов и обрезано (поле {target})"})
            return value[:limit]
        return value

    def leaf(el, key: str, target: str) -> str:
        return fit(el, el.text, key, target)

    for name, value in root.attrib.items():
        if name != "schemaVersion":
            skipped.append({"xpath": f"{path(root)}/@{name}", "element": "@" + name, "status": "skipped", "message": "Неизвестный атрибут не перенесён"})

    obj = {key: "" for _, key in OBJECT_FIELDS}
    tei: list[dict] = []
    composition = [{"code": c, "title": t, "included": False, "note": ""} for c, t in STANDARD_COMPOSITION]
    comp_by_code = {c["code"]: c for c in composition}
    references: list[dict] = []
    notes = ""
    seen: set[str] = set()

    for block in _kids(root):
        name = _local(block)
        if name in seen and name in {"Object", "Indicators", "Composition", "References", "Additional"}:
            skip(block, "Повторный блок: учтён только первый")
            continue
        seen.add(name)

        if name == "Object":
            for el in _kids(block):
                key = TAG_TO_KEY.get(_local(el))
                if key is None:
                    skip(el, "Элемент не поддерживается формой")
                else:
                    obj[key] = leaf(el, key, f"object.{key}")
        elif name == "Indicators":
            for el in _kids(block):
                if _local(el) != "Indicator":
                    skip(el, "Ожидался элемент Indicator")
                    continue
                if len(tei) >= MAX_ROWS["tei"]:
                    truncated.append({"xpath": path(el), "element": "Indicator", "status": "truncated", "message": f"Показателей больше {MAX_ROWS['tei']}: лишние не перенесены"})
                    continue
                row = {"id": secrets.token_hex(4), "name": "", "unit": "", "value": ""}
                for sub in _kids(el):
                    k = {"Name": "name", "Unit": "unit", "Value": "value"}.get(_local(sub))
                    if k:
                        row[k] = leaf(sub, f"tei.{k}", f"tei.{k}")
                    else:
                        skip(sub, "Элемент показателя не поддерживается")
                tei.append(row)
        elif name == "Composition":
            for el in _kids(block):
                if _local(el) != "Section":
                    skip(el, "Ожидался элемент Section")
                    continue
                code = fit(el, el.get("code", ""), "comp.code", "composition.code")
                if not code:
                    skip(el, "У раздела нет атрибута code")
                    continue
                title = note = ""
                for sub in _kids(el):
                    if _local(sub) == "Title":
                        title = leaf(sub, "comp.title", "composition.title")
                    elif _local(sub) == "Note":
                        note = leaf(sub, "comp.note", "composition.note")
                    else:
                        skip(sub, "Элемент раздела не поддерживается")
                item = comp_by_code.get(code)
                if item is None:
                    if len(composition) >= MAX_ROWS["composition"]:
                        truncated.append({"xpath": path(el), "element": "Section", "status": "truncated", "message": "Слишком много разделов: лишние не перенесены"})
                        continue
                    item = {"code": code, "title": title or f"Раздел {code}", "included": False, "note": ""}
                    composition.append(item)
                    comp_by_code[code] = item
                item["included"] = True
                item["note"] = note
        elif name == "References":
            for el in _kids(block):
                if _local(el) != "Reference":
                    skip(el, "Ожидался элемент Reference")
                    continue
                code = title = ""
                for sub in _kids(el):
                    if _local(sub) == "Code":
                        code = leaf(sub, "ref.code", "references.code")
                    elif _local(sub) == "Title":
                        title = leaf(sub, "ref.title", "references.title")
                    else:
                        skip(sub, "Элемент ссылки не поддерживается")
                if not code:
                    skip(el, "У ссылки нет обозначения (Code)")
                elif len(references) >= MAX_ROWS["references"]:
                    truncated.append({"xpath": path(el), "element": "Reference", "status": "truncated", "message": "Слишком много ссылок: лишние не перенесены"})
                else:
                    references.append({"id": secrets.token_hex(4), "code": code, "title": title, "custom": code not in KNOWN_NORMS})
        elif name == "Additional":
            for el in _kids(block):
                if _local(el) == "Notes":
                    notes = leaf(el, "notes", "additional.notes")
                else:
                    skip(el, "Элемент не поддерживается формой")
        else:
            skip(block, "Блок не поддерживается формой")

    return {
        "data": {"object": obj, "tei": tei, "composition": composition, "references": references, "additional": {"notes": notes}},
        "summary": {
            "object": sum(1 for v in obj.values() if v), "tei": len(tei),
            "composition": sum(1 for c in composition if c["included"]), "references": len(references), "additional": bool(notes),
        },
        "skipped": skipped[:REPORT_LIMIT], "skippedTotal": len(skipped),
        "truncated": truncated[:REPORT_LIMIT], "truncatedTotal": len(truncated),
        "detectedVersion": (root.get("schemaVersion") or "").strip() or None,
    }


def source_xsd_issues(schema: etree.XMLSchema, root: etree._Element) -> list[dict]:
    """How the ORIGINAL file fares against the selected XSD (informational: the import still proceeds)."""
    if schema.validate(root):
        return []
    return [{"code": f"XSD-{e.type_name}", "message": e.message, "line": e.line, "xpath": e.path} for e in list(schema.error_log)[:100]]
