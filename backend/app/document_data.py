"""Shape of the form model stored in Document.data (camelCase JSON) + completeness rules."""
from pydantic import Field

from .core.camel import CamelModel

REQUIRED_OBJECT_FIELDS = ("name", "address", "cadastralNumber", "constructionType", "developer")
SECTIONS = ("object", "tei", "composition", "references", "additional")

# Sections of project documentation (Постановление Правительства РФ № 87)
STANDARD_COMPOSITION = [
    ("1", "Пояснительная записка"),
    ("2", "Схема планировочной организации земельного участка"),
    ("3", "Архитектурные решения"),
    ("4", "Конструктивные и объёмно-планировочные решения"),
    ("5", "Сведения об инженерном оборудовании, о сетях и системах инженерно-технического обеспечения"),
    ("6", "Проект организации строительства"),
    ("7", "Проект организации работ по сносу или демонтажу объектов капитального строительства"),
    ("8", "Перечень мероприятий по охране окружающей среды"),
    ("9", "Мероприятия по обеспечению пожарной безопасности"),
    ("10", "Мероприятия по обеспечению доступа инвалидов к объектам"),
    ("11", "Смета на строительство объектов капитального строительства"),
    ("12", "Иная документация в случаях, предусмотренных федеральными законами"),
]


class ObjectInfo(CamelModel):
    name: str = Field("", max_length=500)
    address: str = Field("", max_length=500)
    cadastral_number: str = Field("", max_length=64)
    construction_type: str = Field("", max_length=32)
    developer: str = Field("", max_length=255)
    customer: str = Field("", max_length=255)
    designer: str = Field("", max_length=255)
    functional_purpose: str = Field("", max_length=255)
    financing_source: str = Field("", max_length=255)


class TeiRow(CamelModel):
    id: str = Field(max_length=40)
    name: str = Field("", max_length=300)
    unit: str = Field("", max_length=30)
    value: str = Field("", max_length=60)


class CompositionItem(CamelModel):
    code: str = Field(max_length=20)
    title: str = Field("", max_length=500)
    included: bool = False
    note: str = Field("", max_length=1000)


class Reference(CamelModel):
    id: str = Field(max_length=40)
    code: str = Field("", max_length=100)
    title: str = Field("", max_length=500)
    custom: bool = False


class Additional(CamelModel):
    notes: str = Field("", max_length=20000)


class DocumentData(CamelModel):
    object: ObjectInfo = ObjectInfo()
    tei: list[TeiRow] = Field(default_factory=list, max_length=500)
    composition: list[CompositionItem] = Field(default_factory=list, max_length=100)
    references: list[Reference] = Field(default_factory=list, max_length=500)
    additional: Additional = Additional()


def initial_data(project) -> dict:
    data = DocumentData(
        object=ObjectInfo(
            name=project.name, address=project.address, cadastral_number=project.cadastral_number,
            construction_type=project.construction_type.value, developer=project.developer,
            customer=project.customer, designer=project.designer,
            functional_purpose=project.functional_purpose, financing_source=project.financing_source,
        ),
        composition=[CompositionItem(code=c, title=t, included=(c == "1")) for c, t in STANDARD_COMPOSITION],
    )
    return data.model_dump(by_alias=True)


def section_status(data: dict) -> dict[str, bool]:
    obj = data.get("object", {})
    tei = data.get("tei", [])
    return {
        "object": all(str(obj.get(f, "")).strip() for f in REQUIRED_OBJECT_FIELDS),
        "tei": bool(tei) and all(r.get("name", "").strip() and r.get("unit", "").strip() and r.get("value", "").strip() for r in tei),
        "composition": any(c.get("included") for c in data.get("composition", [])),
        "references": bool(data.get("references")),
        "additional": bool(str(data.get("additional", {}).get("notes", "")).strip()),
    }


def progress(data: dict) -> int:
    st = section_status(data)
    return round(100 * sum(st.values()) / len(SECTIONS))


def _flatten(node, path: str, out: dict) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            _flatten(v, f"{path}.{k}" if path else k, out)
    elif isinstance(node, list):
        for i, item in enumerate(node):
            key = item.get("id") or item.get("code") if isinstance(item, dict) else None
            _flatten(item, f"{path}[{key if key else i}]", out)
    else:
        out[path] = node


def diff(before: dict, after: dict) -> list[dict]:
    a, b = {}, {}
    _flatten(before, "", a)
    _flatten(after, "", b)
    changes = []
    for path in sorted(set(a) | set(b)):
        if path not in a:
            changes.append({"path": path, "kind": "added", "before": None, "after": b[path]})
        elif path not in b:
            changes.append({"path": path, "kind": "removed", "before": a[path], "after": None})
        elif a[path] != b[path]:
            changes.append({"path": path, "kind": "changed", "before": a[path], "after": b[path]})
    return changes
