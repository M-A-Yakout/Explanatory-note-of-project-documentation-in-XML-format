import hashlib
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import XmlSchema
from .xsd import compile_xsd

BUNDLED = [
    ("01.05", "Пояснительная записка, схема 01.05", "Актуальная рабочая схема.", ""),
    ("01.04", "Пояснительная записка, схема 01.04", "Предыдущая редакция: без FunctionalPurpose и FinancingSource.",
     "Документы схемы 01.04 не содержат функционального назначения и источника финансирования."),
]


def checksum(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def load_bundled(db: Session) -> int:
    """Insert the bundled schemas that are missing. The first one becomes the default."""
    added = 0
    for version, title, changelog, compat in BUNDLED:
        if db.scalar(select(XmlSchema).where(XmlSchema.version == version)):
            continue
        path = Path(__file__).parent / "xsd_bundled" / f"ExplanatoryNote_{version}.xsd"
        content = path.read_text(encoding="utf-8")
        compile_xsd(content)
        has_default = db.scalar(select(XmlSchema).where(XmlSchema.is_default)) is not None
        db.add(XmlSchema(version=version, title=title, filename=path.name, content=content, checksum=checksum(content),
                         changelog=changelog, compatibility=compat, is_default=not has_default))
        db.flush()
        added += 1
    db.commit()
    return added
