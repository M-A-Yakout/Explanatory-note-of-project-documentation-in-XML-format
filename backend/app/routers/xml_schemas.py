from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.errors import api_error
from ..deps import get_current_user, require_roles
from ..models import Document, Role, User, XmlSchema
from ..schema_registry import checksum
from ..schemas import SchemaCreate, SchemaOut, SchemaPatch, StructureNode
from ..xsd import XsdError, compile_xsd, structure

router = APIRouter(prefix="/schemas", tags=["xml-schemas"])
ADMIN = require_roles(Role.super_admin)


def _out(db: Session, s: XmlSchema) -> SchemaOut:
    n = db.scalar(select(func.count()).select_from(Document).where(Document.schema_version == s.version)) or 0
    return SchemaOut(
        id=str(s.id), version=s.version, title=s.title, filename=s.filename, checksum=s.checksum,
        size_bytes=len(s.content.encode("utf-8")), is_active=s.is_active, is_default=s.is_default,
        changelog=s.changelog, compatibility=s.compatibility,
        uploaded_by_name=s.uploaded_by.full_name if s.uploaded_by else "—",
        documents_count=n, created_at=s.created_at, updated_at=s.updated_at,
    )


def _get(db: Session, schema_id: int) -> XmlSchema:
    s = db.get(XmlSchema, schema_id)
    if s is None:
        raise api_error(404, "not_found", "Схема не найдена")
    return s


@router.get("", response_model=list[SchemaOut], response_model_by_alias=True)
def list_schemas(include_inactive: bool = Query(False, alias="includeInactive"), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Active schemas for everybody; the full registry only for super admins."""
    if include_inactive and user.role != Role.super_admin:
        raise api_error(403, "forbidden", "Недостаточно прав")
    stmt = select(XmlSchema).order_by(XmlSchema.is_default.desc(), XmlSchema.version.desc())
    if not include_inactive:
        stmt = stmt.where(XmlSchema.is_active)
    return [_out(db, s) for s in db.scalars(stmt)]


@router.post("", status_code=201, response_model=SchemaOut, response_model_by_alias=True)
def upload_schema(body: SchemaCreate, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    if db.scalar(select(XmlSchema).where(XmlSchema.version == body.version)):
        raise api_error(409, "conflict", f"Схема версии {body.version} уже загружена")
    try:
        compile_xsd(body.content)
    except XsdError as e:
        raise api_error(422, "invalid_xsd", str(e))
    first = db.scalar(select(func.count()).select_from(XmlSchema)) == 0
    s = XmlSchema(
        version=body.version, title=body.title.strip(), filename=body.filename or f"ExplanatoryNote_{body.version}.xsd",
        content=body.content, checksum=checksum(body.content), changelog=body.changelog, compatibility=body.compatibility,
        uploaded_by_id=user.id, is_default=False,
    )
    db.add(s)
    db.flush()
    if first or body.make_default:
        db.execute(update(XmlSchema).values(is_default=False))
        s.is_default = True
    db.commit()
    db.refresh(s)
    return _out(db, s)


@router.patch("/{schema_id}", response_model=SchemaOut, response_model_by_alias=True)
def patch_schema(schema_id: int, body: SchemaPatch, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    s = _get(db, schema_id)
    if body.is_active is False and s.is_default:
        raise api_error(409, "default_schema", "Нельзя отключить схему по умолчанию: сначала назначьте другую")
    for k in ("title", "changelog", "compatibility", "is_active"):
        v = getattr(body, k)
        if v is not None:
            setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _out(db, s)


@router.post("/{schema_id}/default", response_model=SchemaOut, response_model_by_alias=True)
def make_default(schema_id: int, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    s = _get(db, schema_id)
    if not s.is_active:
        raise api_error(409, "inactive_schema", "Сначала активируйте схему")
    db.execute(update(XmlSchema).values(is_default=False))
    s.is_default = True
    db.commit()
    db.refresh(s)
    return _out(db, s)


@router.delete("/{schema_id}", status_code=204)
def delete_schema(schema_id: int, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    s = _get(db, schema_id)
    if s.is_default:
        raise api_error(409, "default_schema", "Нельзя удалить схему по умолчанию")
    if _out(db, s).documents_count:
        raise api_error(409, "in_use", "Схема используется в документах: её можно только отключить")
    db.delete(s)
    db.commit()
    return Response(status_code=204)


@router.get("/{schema_id}/structure", response_model=list[StructureNode], response_model_by_alias=True)
def get_structure(schema_id: int, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    return structure(_get(db, schema_id).content)


@router.get("/{schema_id}/xsd")
def download_xsd(schema_id: int, db: Session = Depends(get_db), _: User = Depends(ADMIN)):
    s = _get(db, schema_id)
    return Response(s.content, media_type="application/xml; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{s.filename or "schema.xsd"}"'})
