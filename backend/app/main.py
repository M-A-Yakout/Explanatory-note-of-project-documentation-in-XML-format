from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import models  # noqa: F401  (register tables for Alembic)
from .core.config import settings
from .routers import auth, health, organizations, projects, documents, xml_schemas, search

app = FastAPI(title="ПЗ Генератор API", version="0.2.0")
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_, exc: RequestValidationError):
    fields = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": {"code": "validation", "message": "Некорректные данные", "fields": fields}})


for r in (health.router, auth.router, organizations.router, projects.router, documents.router, xml_schemas.router, search.router):
    app.include_router(r, prefix="/api")
