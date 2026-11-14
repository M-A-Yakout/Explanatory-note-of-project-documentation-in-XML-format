from .models import Organization, User
from .schemas import OrganizationOut, UserOut


def org_out(o: Organization) -> OrganizationOut:
    return OrganizationOut(
        id=str(o.id), name=o.name, short_name=o.name, inn=o.inn or "",
        members_count=len(o.users), created_at=o.created_at, is_active=o.is_active,
    )


def user_out(u: User) -> UserOut:
    org_id = str(u.organization_id) if u.organization_id else ""
    return UserOut(
        id=str(u.id), full_name=u.full_name, email=u.email, role=u.role,
        status="active" if u.is_active else "blocked",
        organization_ids=[org_id] if org_id else [], active_organization_id=org_id,
        created_at=u.created_at, last_login_at=u.last_login_at,
    )


def project_out(p) -> "ProjectOut":
    from .schemas import ProjectOut

    return ProjectOut(
        id=str(p.id), organization_id=str(p.organization_id), code=p.code, name=p.name, address=p.address,
        cadastral_number=p.cadastral_number, construction_type=p.construction_type, developer=p.developer,
        customer=p.customer, designer=p.designer, functional_purpose=p.functional_purpose,
        financing_source=p.financing_source, status=p.status,
        participant_ids=[str(p.created_by_id)] if p.created_by_id else [],
        created_at=p.created_at, updated_at=p.updated_at,
    )


def doc_out(d, detail: bool = False):
    from .document_data import progress, section_status
    from .schemas import DocumentDetail, DocumentOut

    base = dict(
        id=str(d.id), organization_id=str(d.organization_id), project_id=str(d.project_id),
        project_name=d.project.name if d.project else "", title=d.title,
        schema_id=d.schema_version, schema_version=d.schema_version, status=d.status,
        author_id=str(d.author_id or ""), author_name=d.author.full_name if d.author else "",
        progress=progress(d.data), current_version=d.version, revision=d.revision,
        errors_count=(d.validation or {}).get("errors", 0), warnings_count=(d.validation or {}).get("warnings", 0),
        validation_stale=d.validation is not None and d.validated_revision != d.revision,
        archived_at=d.archived_at, archived_by_name=d.archived_by.full_name if d.archived_by else None,
        created_at=d.created_at, updated_at=d.updated_at,
    )
    if detail:
        return DocumentDetail(**base, data=d.data, sections=section_status(d.data))
    return DocumentOut(**base)


def version_meta(v):
    from .schemas import VersionMeta

    return VersionMeta(number=v.number, author_id=str(v.author_id or ""), author_name=v.author.full_name if v.author else "",
                       comment=v.comment, created_at=v.created_at)
