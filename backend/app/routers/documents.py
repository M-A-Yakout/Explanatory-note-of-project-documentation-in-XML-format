import io
import zipfile
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..core.db import get_db
from ..core.errors import api_error
from ..deps import get_current_user, require_roles
from ..document_data import DocumentData, diff, initial_data
from ..models import Document, DocumentStatus, DocumentVersion, Project, Role, User, XmlSchema
from ..schemas import (AuthorOut, BulkIn, BulkItem, BulkResult, BulkXmlIn, Change, DocumentCreate, DocumentDataIn, DocumentDetail, DocumentOut, DocumentPage,
                       DocumentPatch, ImportCreateIn, ImportPreviewIn, ImportReport, ImportResult, ValidationOut, VersionDetail, VersionIn, VersionMeta, XmlPreview)
from ..serializers import doc_out, version_meta
from ..xml_importer import ImportFailure, decode_payload, map_document, parse_xml, source_xsd_issues
from ..validation import compiled, report_text, validate_document, xsd_issues
from ..xml_builder import build_xml

router = APIRouter(prefix="/documents", tags=["documents"])

EDITORS = (Role.super_admin, Role.org_admin, Role.designer)
ADMINS = (Role.super_admin, Role.org_admin)
SORTS = {"updated_at": Document.updated_at, "created_at": Document.created_at, "title": Document.title}


def _get_own(db: Session, user: User, doc_id: int) -> Document:
    d = db.get(Document, doc_id)
    if d is None or d.organization_id != user.organization_id:
        raise api_error(404, "not_found", "Документ не найден")
    return d


def _snapshot(db: Session, d: Document, user: User, comment: str) -> DocumentVersion:
    d.version += 1
    v = DocumentVersion(document_id=d.id, number=d.version, author_id=user.id, comment=comment, data=d.data)
    db.add(v)
    return v


def _version(db: Session, d: Document, number: int) -> DocumentVersion:
    v = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == d.id, DocumentVersion.number == number))
    if v is None:
        raise api_error(404, "not_found", "Версия не найдена")
    return v


@router.get("", response_model=DocumentPage, response_model_by_alias=True)
def list_documents(
    q: str | None = None,
    project_id: int | None = Query(None, alias="projectId"),
    status: DocumentStatus | None = None,
    schema_version: str | None = Query(None, alias="schemaVersion"),
    author_id: int | None = Query(None, alias="authorId"),
    updated_from: date | None = Query(None, alias="updatedFrom"),
    updated_to: date | None = Query(None, alias="updatedTo"),
    sort: Literal["updated_at", "created_at", "title"] = "updated_at",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cond = [Document.organization_id == user.organization_id]
    cond.append(Document.status == status if status else Document.status != DocumentStatus.archived)
    if q and q.strip():
        cond.append(Document.search_text.like(f"%{q.strip().lower()}%"))
    if project_id:
        cond.append(Document.project_id == project_id)
    if schema_version:
        cond.append(Document.schema_version == schema_version)
    if author_id:
        cond.append(Document.author_id == author_id)
    if updated_from:
        cond.append(Document.updated_at >= datetime.combine(updated_from, time.min))
    if updated_to:  # inclusive day
        cond.append(Document.updated_at < datetime.combine(updated_to + timedelta(days=1), time.min))
    total = db.scalar(select(func.count()).select_from(Document).where(*cond)) or 0
    col = SORTS[sort]
    stmt = (select(Document).where(*cond).order_by(col.asc() if order == "asc" else col.desc(), Document.id.desc())
            .options(selectinload(Document.project), selectinload(Document.author), selectinload(Document.archived_by))
            .offset((page - 1) * page_size).limit(page_size))
    return DocumentPage(items=[doc_out(d) for d in db.scalars(stmt)], total=total, page=page, page_size=page_size)


@router.post("", status_code=201, response_model=DocumentDetail, response_model_by_alias=True)
def create_document(body: DocumentCreate, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    if body.schema_version:
        schema = db.scalar(select(XmlSchema).where(XmlSchema.version == body.schema_version, XmlSchema.is_active))
    else:
        schema = db.scalar(select(XmlSchema).where(XmlSchema.is_default, XmlSchema.is_active))
    if schema is None:
        raise api_error(422, "validation", "Версия XML-схемы недоступна. Попросите администратора загрузить и активировать схему")
    project = db.get(Project, int(body.project_id)) if body.project_id.isdigit() else None
    if project is None or project.organization_id != user.organization_id:
        raise api_error(404, "not_found", "Объект не найден")
    d = Document(
        organization_id=user.organization_id, project_id=project.id, author_id=user.id,
        title=(body.title or f"ПЗ — Раздел 1. {project.name}").strip(),
        schema_version=schema.version, data=initial_data(project),
    )
    d.project, d.author = project, user
    d.refresh_search()
    db.add(d)
    db.flush()
    _snapshot(db, d, user, "Документ создан")
    db.commit()
    return doc_out(d, detail=True)


# ---------------- archive / restore / delete (single + bulk share these) ----------------
def _archive(d: Document, user: User) -> None:
    if d.status == DocumentStatus.archived:
        raise api_error(409, "already_archived", "Документ уже в архиве")
    d.status_before_archive = d.status.value
    d.status = DocumentStatus.archived
    d.archived_at = datetime.now(timezone.utc)
    d.archived_by_id = user.id
    d.archived_by = user


def _restore(d: Document) -> None:
    if d.status != DocumentStatus.archived:
        raise api_error(409, "not_archived", "Документ не находится в архиве")
    before = DocumentStatus(d.status_before_archive) if d.status_before_archive else DocumentStatus.draft
    # "validated" is only honoured while the stored validation still matches the data
    stale = d.validated_revision != d.revision
    d.status = DocumentStatus.draft if before == DocumentStatus.validated and stale else before
    d.archived_at = d.archived_by_id = d.status_before_archive = None
    d.archived_by = None


def _delete(db: Session, d: Document) -> None:
    if d.status != DocumentStatus.archived:
        raise api_error(409, "not_archived", "Удалить можно только документ из архива")
    db.query(DocumentVersion).filter(DocumentVersion.document_id == d.id).delete()
    db.delete(d)


@router.post("/{doc_id}/archive", response_model=DocumentDetail, response_model_by_alias=True)
def archive_document(doc_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    d = _get_own(db, user, doc_id)
    _archive(d, user)
    db.commit()
    return doc_out(d, detail=True)


@router.post("/{doc_id}/restore", response_model=DocumentDetail, response_model_by_alias=True)
def restore_document(doc_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    d = _get_own(db, user, doc_id)
    _restore(d)
    db.commit()
    return doc_out(d, detail=True)


@router.post("/bulk", response_model=BulkResult, response_model_by_alias=True)
def bulk(body: BulkIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    """Applies one action to many documents; every id succeeds or fails on its own."""
    if body.action == "delete" and user.role not in ADMINS:
        raise api_error(403, "forbidden", "Удалять документы могут только администраторы")
    results: list[BulkItem] = []
    for doc_id in dict.fromkeys(body.ids):  # de-duplicated, order kept
        try:
            d = _get_own(db, user, doc_id)
            if body.action == "archive":
                _archive(d, user)
            elif body.action == "restore":
                _restore(d)
            else:
                _delete(db, d)
            db.flush()
            results.append(BulkItem(id=str(doc_id), ok=True))
        except HTTPException as e:
            results.append(BulkItem(id=str(doc_id), ok=False, code=e.detail["code"], message=e.detail["message"]))
    db.commit()
    ok = sum(1 for r in results if r.ok)
    return BulkResult(results=results, ok_count=ok, failed_count=len(results) - ok)


@router.post("/bulk/xml")
def bulk_xml(body: BulkXmlIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """ZIP with the XML of every selected document that passes validation; the rest are listed in _skipped.txt."""
    buf, exported, skipped = io.BytesIO(), 0, []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for doc_id in dict.fromkeys(body.ids):
            try:
                d = _get_own(db, user, doc_id)
                schema = _schema_of(db, d)
                result = validate_document(d, schema)
                if result["errors"]:
                    skipped.append(f"{doc_id}: ошибок — {result['errors']}")
                    continue
                z.writestr(_xml_filename(d), build_xml(d.data, d.schema_version, schema.content).xml)
                exported += 1
            except HTTPException as e:
                skipped.append(f"{doc_id}: {e.detail['message']}")
        if skipped and exported:
            z.writestr("_skipped.txt", "Не выгружены:\n" + "\n".join(skipped) + "\n")
    if not exported:
        raise api_error(409, "validation_failed", "Ни один документ не прошёл проверку: " + "; ".join(skipped))
    return Response(buf.getvalue(), media_type="application/zip", headers={
        "Content-Disposition": 'attachment; filename="explanatory_notes.zip"',
        "X-Exported": str(exported), "X-Skipped": str(len(skipped)),
    })


@router.get("/authors", response_model=list[AuthorOut], response_model_by_alias=True)
def authors(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(select(User.id, User.full_name).join(Document, Document.author_id == User.id)
                      .where(Document.organization_id == user.organization_id).distinct().order_by(User.full_name))
    return [AuthorOut(id=str(i), name=n) for i, n in rows]


# ---------------- XML import ----------------
def _analyze(db: Session, body: ImportPreviewIn):
    """Parse + map + check the file. Never touches the database."""
    try:
        raw = decode_payload(body.content_base64)
        root = parse_xml(raw)
        mapped = map_document(root)
    except ImportFailure as e:
        raise api_error(422, e.code, e.message)
    detected = mapped["detectedVersion"]
    wanted = body.schema_version or detected
    schema = db.scalar(select(XmlSchema).where(XmlSchema.version == wanted, XmlSchema.is_active)) if wanted else None
    fallback = schema is None
    if schema is None:
        schema = db.scalar(select(XmlSchema).where(XmlSchema.is_default, XmlSchema.is_active))
    if schema is None:
        raise api_error(422, "validation", "Нет доступной XML-схемы. Попросите администратора загрузить и активировать схему")
    issues = source_xsd_issues(compiled(schema.checksum, schema.content), root)
    try:
        data = DocumentData.model_validate(mapped["data"]).model_dump(by_alias=True)
    except Exception:  # noqa: BLE001 - mapper truncates to the limits, so this is a safety net
        raise api_error(422, "invalid_content", "Данные файла не удалось преобразовать в документ")
    report = ImportReport(
        filename=body.filename, size_bytes=len(raw), detected_version=detected, used_version=schema.version, schema_fallback=fallback,
        summary=mapped["summary"], skipped=mapped["skipped"], skipped_total=mapped["skippedTotal"],
        truncated=mapped["truncated"], truncated_total=mapped["truncatedTotal"],
        xsd_valid=not issues, xsd_issues=issues, data=data,
    )
    return report, schema


@router.post("/import/preview", response_model=ImportReport, response_model_by_alias=True)
def import_preview(body: ImportPreviewIn, db: Session = Depends(get_db), _: User = Depends(require_roles(*EDITORS))):
    return _analyze(db, body)[0]


@router.post("/import", status_code=201, response_model=ImportResult, response_model_by_alias=True)
def import_document(body: ImportCreateIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    project = db.get(Project, int(body.project_id)) if body.project_id.isdigit() else None
    if project is None or project.organization_id != user.organization_id:
        raise api_error(404, "not_found", "Объект не найден")
    report, schema = _analyze(db, body)  # re-parsed on the server: the client never supplies the mapped data
    name = report.data["object"]["name"] or project.name
    d = Document(
        organization_id=user.organization_id, project_id=project.id, author_id=user.id,
        title=(body.title or f"ПЗ — Раздел 1. {name}").strip(), schema_version=schema.version, data=report.data,
    )
    d.project, d.author = project, user
    d.refresh_search()
    db.add(d)
    db.flush()
    _snapshot(db, d, user, f"Импорт из {body.filename}"[:500])
    db.commit()
    return ImportResult(document=doc_out(d, detail=True), report=report)


@router.get("/{doc_id}", response_model=DocumentDetail, response_model_by_alias=True)
def get_document(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return doc_out(_get_own(db, user, doc_id), detail=True)


@router.put("/{doc_id}/data", response_model=DocumentDetail, response_model_by_alias=True)
def autosave(doc_id: int, body: DocumentDataIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    d = _get_own(db, user, doc_id)
    if d.status == DocumentStatus.archived:
        raise api_error(409, "archived", "Документ в архиве, редактирование недоступно")
    if body.base_revision != d.revision:
        raise api_error(409, "conflict", "Документ изменён в другом окне. Обновите страницу.")
    d.data = body.data.model_dump(by_alias=True)
    d.revision += 1
    if d.status == DocumentStatus.validated:
        d.status = DocumentStatus.draft  # data changed after validation
    db.commit()
    db.refresh(d)
    return doc_out(d, detail=True)


@router.patch("/{doc_id}", response_model=DocumentDetail, response_model_by_alias=True)
def update_meta(doc_id: int, body: DocumentPatch, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    d = _get_own(db, user, doc_id)
    if body.status == DocumentStatus.validated:
        raise api_error(422, "validation", "Статус «Проверен» выставляется только после успешной проверки")
    if body.status == DocumentStatus.archived or (d.status == DocumentStatus.archived and body.status is not None):
        raise api_error(422, "validation", "Архивация и восстановление выполняются отдельными действиями")
    if body.title is not None:
        d.title = body.title.strip()
        d.refresh_search()
    if body.status is not None:
        d.status = body.status
    db.commit()
    db.refresh(d)
    return doc_out(d, detail=True)


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*ADMINS))):
    d = _get_own(db, user, doc_id)
    _delete(db, d)
    db.commit()
    return Response(status_code=204)


# ---------------- versions ----------------
@router.get("/{doc_id}/versions", response_model=list[VersionMeta], response_model_by_alias=True)
def list_versions(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = _get_own(db, user, doc_id)
    rows = db.scalars(select(DocumentVersion).where(DocumentVersion.document_id == d.id)
                      .order_by(DocumentVersion.number.desc()).options(selectinload(DocumentVersion.author)))
    return [version_meta(v) for v in rows]


@router.post("/{doc_id}/versions", status_code=201, response_model=VersionMeta, response_model_by_alias=True)
def save_version(doc_id: int, body: VersionIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    d = _get_own(db, user, doc_id)
    v = _snapshot(db, d, user, body.comment.strip() or "Версия сохранена")
    db.commit()
    return version_meta(v)


@router.get("/{doc_id}/versions/{number}", response_model=VersionDetail, response_model_by_alias=True)
def get_version(doc_id: int, number: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    v = _version(db, _get_own(db, user, doc_id), number)
    return VersionDetail(**version_meta(v).model_dump(), data=v.data)


@router.get("/{doc_id}/diff", response_model=list[Change], response_model_by_alias=True)
def compare(doc_id: int, from_: int = Query(alias="from"), to: str = "current",
            db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = _get_own(db, user, doc_id)
    before = _version(db, d, from_).data
    after = d.data if to == "current" else _version(db, d, int(to) if to.isdigit() else -1).data
    return [Change(**c) for c in diff(before, after)]


@router.post("/{doc_id}/versions/{number}/restore", response_model=DocumentDetail, response_model_by_alias=True)
def restore(doc_id: int, number: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    d = _get_own(db, user, doc_id)
    if d.status == DocumentStatus.archived:
        raise api_error(409, "archived", "Документ в архиве, восстановление версии недоступно")
    v = _version(db, d, number)
    d.data = v.data
    d.revision += 1
    if d.status == DocumentStatus.validated:
        d.status = DocumentStatus.draft
    _snapshot(db, d, user, f"Восстановлена версия {number}")
    db.commit()
    db.refresh(d)
    return doc_out(d, detail=True)


# ---------------- validation and XML ----------------
def _schema_of(db: Session, d: Document) -> XmlSchema:
    s = db.scalar(select(XmlSchema).where(XmlSchema.version == d.schema_version))
    if s is None:
        raise api_error(409, "schema_missing", f"Схема {d.schema_version} отсутствует в реестре")
    return s


def _validation_out(d: Document, result: dict) -> ValidationOut:
    return ValidationOut(**result, stale=d.validated_revision != d.revision, status=d.status)


@router.post("/{doc_id}/validate", response_model=ValidationOut, response_model_by_alias=True)
def validate(doc_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDITORS))):
    d = _get_own(db, user, doc_id)
    if d.status == DocumentStatus.archived:
        raise api_error(409, "archived", "Документ в архиве")
    result = validate_document(d, _schema_of(db, d))
    d.validation, d.validated_revision = result, d.revision
    if result["errors"] == 0 and d.status in (DocumentStatus.draft, DocumentStatus.in_review):
        d.status = DocumentStatus.validated
    elif result["errors"] > 0 and d.status == DocumentStatus.validated:
        d.status = DocumentStatus.draft
    db.commit()
    return _validation_out(d, result)


@router.get("/{doc_id}/validation", response_model=ValidationOut, response_model_by_alias=True)
def last_validation(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = _get_own(db, user, doc_id)
    if not d.validation:
        raise api_error(404, "not_validated", "Проверка ещё не выполнялась")
    return _validation_out(d, d.validation)


def _xml_filename(d: Document) -> str:
    return f"explanatory_note_{d.id}_r{d.revision}.xml"


@router.get("/{doc_id}/xml", response_model=XmlPreview, response_model_by_alias=True)
def xml_preview(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = _get_own(db, user, doc_id)
    schema = _schema_of(db, d)
    built = build_xml(d.data, d.schema_version, schema.content)
    valid = not xsd_issues(compiled(schema.checksum, schema.content), built.xml, built.fieldmap)
    return XmlPreview(xml=built.xml.decode("utf-8"), filename=_xml_filename(d), size_bytes=len(built.xml),
                      schema_version=d.schema_version, xsd_valid=valid)


@router.get("/{doc_id}/xml/download")
def xml_download(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Always re-validates the current data: a stored result is never trusted for export."""
    d = _get_own(db, user, doc_id)
    schema = _schema_of(db, d)
    result = validate_document(d, schema)
    if result["errors"]:
        raise api_error(409, "validation_failed", f"Выгрузка недоступна: найдено ошибок — {result['errors']}")
    xml = build_xml(d.data, d.schema_version, schema.content).xml
    return Response(xml, media_type="application/xml; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{_xml_filename(d)}"'})


@router.get("/{doc_id}/validation/report")
def validation_report(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = _get_own(db, user, doc_id)
    text = report_text(d, validate_document(d, _schema_of(db, d)))
    return PlainTextResponse(text, headers={"Content-Disposition": f'attachment; filename="validation_report_{d.id}.txt"'})
