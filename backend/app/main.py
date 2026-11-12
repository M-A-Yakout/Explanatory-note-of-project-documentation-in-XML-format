from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (register tables)
from .core.config import settings
from .core.db import Base, engine
from .routers import health


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)  # replaced by Alembic migrations in part 2
    yield


app = FastAPI(title="ПЗ Генератор API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
app.include_router(health.router, prefix="/api")
