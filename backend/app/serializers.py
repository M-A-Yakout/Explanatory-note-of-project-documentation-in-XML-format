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
