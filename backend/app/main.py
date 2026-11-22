from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import models  # noqa: F401  (register tables for Alembic)
from .core.config import settings
from .routers import auth, health, organizations, projects, documents, xml_schemas, search, users, audit, notifications, stats
from .routers import settings as settings_router

app = FastAPI(title="ПЗ Генератор API", version="1.0.0",
              docs_url=None if settings.environment == "production" else "/docs",
              redoc_url=None, openapi_url=None if settings.environment == "production" else "/openapi.json")
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("Cache-Control", "no-store")  # API answers hold personal data: never cached by browsers/proxies
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(_, exc: RequestValidationError):
    fields = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": {"code": "validation", "message": "Некорректные данные", "fields": fields}})


for r in (health.router, auth.router, organizations.router, projects.router, documents.router, xml_schemas.router, search.router, users.router, audit.router, notifications.router, settings_router.router, stats.router):
    app.include_router(r, prefix="/api")
