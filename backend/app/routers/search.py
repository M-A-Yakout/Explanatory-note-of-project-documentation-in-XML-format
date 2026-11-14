from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..core.db import get_db
from ..deps import get_current_user
from ..models import Document, DocumentStatus, Project, User
from ..schemas import SearchDocument, SearchOut, SearchProject

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchOut, response_model_by_alias=True)
def global_search(q: str = Query("", max_length=100), limit: int = Query(6, ge=1, le=20),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Top-bar search: objects (name, address, cadastral number, code) and documents of the user's organization."""
    needle = q.strip().lower()
    if len(needle) < 2:
        return SearchOut(projects=[], documents=[])
    like = f"%{needle}%"
    projects = db.scalars(select(Project).where(Project.organization_id == user.organization_id, Project.search_text.like(like))
                          .order_by(Project.updated_at.desc()).limit(limit))
    docs = db.scalars(select(Document).where(Document.organization_id == user.organization_id, Document.search_text.like(like),
                                             Document.status != DocumentStatus.archived)
                      .options(selectinload(Document.project)).order_by(Document.updated_at.desc()).limit(limit))
    return SearchOut(
        projects=[SearchProject(id=str(p.id), code=p.code, name=p.name, address=p.address, cadastral_number=p.cadastral_number) for p in projects],
        documents=[SearchDocument(id=str(d.id), title=d.title, project_name=d.project.name, status=d.status, schema_version=d.schema_version) for d in docs],
    )
