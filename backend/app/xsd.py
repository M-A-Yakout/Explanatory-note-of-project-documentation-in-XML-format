"""Safe XSD handling: validation of uploaded schemas and a readable structure tree."""
from lxml import etree

XS = "http://www.w3.org/2001/XMLSchema"
MAX_XSD_BYTES = 2 * 1024 * 1024
FORBIDDEN = ("include", "import", "redefine", "override")


class XsdError(ValueError):
    pass


def _parser() -> etree.XMLParser:
    # no entities / DTD / network: protects against XXE and entity-expansion attacks
    return etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False, remove_comments=True)


def parse_xsd(content: str) -> etree._Element:
    data = content.encode("utf-8")
    if len(data) > MAX_XSD_BYTES:
        raise XsdError("Файл больше 2 МБ")
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise XsdError("DOCTYPE и ENTITY в схеме запрещены")
    try:
        root = etree.fromstring(data, _parser())
    except etree.XMLSyntaxError as e:
        raise XsdError(f"Некорректный XML: {e}") from None
    if root.tag != f"{{{XS}}}schema":
        raise XsdError("Корневой элемент должен быть xs:schema")
    for el in root.iter():
        if isinstance(el.tag, str) and etree.QName(el).namespace == XS and etree.QName(el).localname in FORBIDDEN:
            raise XsdError(f"xs:{etree.QName(el).localname} не поддерживается: схема должна быть самодостаточной")
    return root


def compile_xsd(content: str) -> etree.XMLSchema:
    root = parse_xsd(content)
    try:
        return etree.XMLSchema(root)
    except etree.XMLSchemaParseError as e:
        raise XsdError(f"Схема не компилируется: {e}") from None


def _q(name: str) -> str:
    return f"{{{XS}}}{name}"


def structure(content: str, max_depth: int = 8) -> list[dict]:
    """Tree of top-level elements with attributes, occurrence and type."""
    root = parse_xsd(content)
    types = {t.get("name"): t for t in root.findall(_q("complexType"))}

    def occurs(el):
        mn, mx = el.get("minOccurs", "1"), el.get("maxOccurs", "1")
        return mn != "0", mx == "unbounded" or (mx.isdigit() and int(mx) > 1)

    def children_of(ctype, depth, seen):
        out = []
        if ctype is None or depth > max_depth:
            return out
        for attr in ctype.findall(_q("attribute")):
            out.append({"name": "@" + attr.get("name", "?"), "kind": "attribute", "type": attr.get("type", ""),
                        "required": attr.get("use") == "required", "repeatable": False, "children": []})
        for group in ctype.findall(f"{_q('sequence')}") + ctype.findall(_q("choice")) + ctype.findall(_q("all")):
            for el in group.findall(_q("element")):
                out.append(node(el, depth, seen))
        return out

    def node(el, depth, seen):
        req, rep = occurs(el)
        tname = el.get("type", "")
        ctype = el.find(_q("complexType"))
        if ctype is None and tname in types and tname not in seen:
            ctype = types[tname]
        kids = children_of(ctype, depth + 1, seen | {tname}) if ctype is not None else []
        return {"name": el.get("name") or el.get("ref", "?"), "kind": "element", "type": tname or ("complex" if kids else ""),
                "required": req, "repeatable": rep, "children": kids}

    return [node(el, 0, frozenset()) for el in root.findall(_q("element"))]
