from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.exceptions import DokbaError
from app.middleware.auth import ApiKeyMiddleware
from app.middleware.error_handler import (
    dokba_error_handler,
    generic_error_handler,
    validation_error_handler,
)
from app.middleware.rate_limit import RateLimitMiddleware
from app.models import Project, Job  # noqa: F401 — ensure models are registered
from app.routers import cli, studio, ws, documents, export, jobs, projects, settings, stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="DogBa Platform API",
    description="Backend services for the Artifarm DogBa Client",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Exception handlers (structured error responses) ──
app.add_exception_handler(DokbaError, dokba_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, generic_error_handler)

# ── Middleware stack (order matters: last added = first executed) ──
# 1. CORS (outermost — runs first on every request)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 2. Rate limiting (before auth to block floods early)
app.add_middleware(RateLimitMiddleware)
# 3. API key authentication (innermost HTTP middleware)
app.add_middleware(ApiKeyMiddleware)

app.include_router(cli.router)
app.include_router(studio.router)
app.include_router(ws.router)
app.include_router(documents.router)
app.include_router(export.router)
app.include_router(jobs.router)
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(stats.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
