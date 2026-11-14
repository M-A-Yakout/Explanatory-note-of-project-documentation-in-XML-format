"""Builds the explanatory-note XML from the document form model.

The builder is schema-aware: for the Object block it emits only the elements the
selected XSD declares (required ones even when empty, so the XSD reports them).
It also returns a map  xpath -> form field  so XSD errors can point to the right input.
"""
import re
from dataclasses import dataclass

from lxml import etree

from .xsd import structure

# characters not allowed in XML 1.0 (control chars etc.)
_INVALID = re.compile("[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\U00010000-\U0010FFFF]")

OBJECT_FIELDS = [
    ("Name", "name"), ("Address", "address"), ("CadastralNumber", "cadastralNumber"),
    ("ConstructionType", "constructionType"), ("Developer", "developer"), ("Customer", "customer"),
    ("Designer", "designer"), ("FunctionalPurpose", "functionalPurpose"), ("FinancingSource", "financingSource"),
]


def clean(value) -> str:
    return _INVALID.sub("", str(value or ""))


def normalize_decimal(value: str) -> str:
    """'8 412,0' -> '8412.0'; anything unparsable is kept so the XSD can flag it."""
    return re.sub(r"[\s\u00a0]", "", clean(value)).replace(",", ".")


def to_number(value: str) -> float | None:
    try:
        return float(normalize_decimal(value))
    except ValueError:
        return None


@dataclass
class BuildResult:
    xml: bytes
    fieldmap: dict[str, str]
    root: etree._Element


def _object_rules(xsd_content: str) -> dict[str, bool]:
    """{element name: required?} for the Object block of the schema."""
    for top in structure(xsd_content):
        if top["name"] != "ExplanatoryNote":
            continue
        for child in top["children"]:
            if child["name"] == "Object":
                return {c["name"]: c["required"] for c in child["children"] if c["kind"] == "element"}
    return {tag: tag in {"Name", "Address", "CadastralNumber", "ConstructionType", "Developer"} for tag, _ in OBJECT_FIELDS}


def build_xml(data: dict, schema_version: str, xsd_content: str) -> BuildResult:
    rules = _object_rules(xsd_content)
    root = etree.Element("ExplanatoryNote", schemaVersion=clean(schema_version))
    marks: list[tuple[etree._Element, str]] = [(root, "")]

    def add(parent, tag, text=None, field=""):
        el = etree.SubElement(parent, tag)
        if text is not None:
            el.text = text
        marks.append((el, field))
        return el

    obj_data = data.get("object", {})
    obj = add(root, "Object", field="object")
    for tag, key in OBJECT_FIELDS:
        if tag not in rules:
            continue  # the selected schema does not know this element
        value = clean(obj_data.get(key, "")).strip()
        if value or rules[tag]:
            add(obj, tag, value, f"object.{key}")

    ind = add(root, "Indicators", field="tei")
    for row in data.get("tei", []):
        rid = clean(row.get("id"))
        item = add(ind, "Indicator", field=f"tei[{rid}]")
        add(item, "Name", clean(row.get("name")).strip(), f"tei[{rid}].name")
        add(item, "Unit", clean(row.get("unit")).strip(), f"tei[{rid}].unit")
        add(item, "Value", normalize_decimal(row.get("value", "")), f"tei[{rid}].value")

    comp = add(root, "Composition", field="composition")
    for sec in data.get("composition", []):
        if not sec.get("included"):
            continue
        code = clean(sec.get("code"))
        node = add(comp, "Section", field=f"composition[{code}]")
        node.set("code", code)
        add(node, "Title", clean(sec.get("title")).strip(), f"composition[{code}]")
        note = clean(sec.get("note")).strip()
        if note:
            add(node, "Note", note, f"composition[{code}].note")

    refs = add(root, "References", field="references")
    for ref in data.get("references", []):
        rid = clean(ref.get("id"))
        node = add(refs, "Reference", field=f"references[{rid}]")
        add(node, "Code", clean(ref.get("code")).strip(), f"references[{rid}].code")
        title = clean(ref.get("title")).strip()
        if title:
            add(node, "Title", title, f"references[{rid}].title")

    notes = clean(data.get("additional", {}).get("notes", "")).strip()
    if notes:
        extra = add(root, "Additional", field="additional")
        add(extra, "Notes", notes, "additional.notes")

    tree = root.getroottree()
    fieldmap = {tree.getpath(el): field for el, field in marks}
    xml = etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="UTF-8")
    return BuildResult(xml=xml, fieldmap=fieldmap, root=root)


def field_for_path(fieldmap: dict[str, str], path: str | None) -> str | None:
    """Exact xpath, else the nearest ancestor that maps to a form field."""
    while path:
        if path in fieldmap and fieldmap[path]:
            return fieldmap[path]
        path = path.rsplit("/", 1)[0] if "/" in path.strip("/") else None
    return None
