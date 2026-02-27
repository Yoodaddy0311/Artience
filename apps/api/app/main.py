from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

import json
import logging

from app.database import Base, engine, SessionLocal, is_sqlite
from app.exceptions import DokbaError
from app.middleware.auth import ApiKeyMiddleware
from app.middleware.error_handler import (
    dokba_error_handler,
    generic_error_handler,
    validation_error_handler,
)
from app.middleware.rate_limit import RateLimitMiddleware
from app.models import Project, Job, Recipe, Room, Member, Character, Task, Assignment, JobDefinition, WeeklyScore, Achievement, UserAchievement  # noqa: F401 — ensure models are registered
from app.models.job_definition import SEED_JOB_DEFINITIONS
from app.routers import cli, studio, ws, documents, export, jobs, projects, rooms, settings, stats, ranking, tasks, leveling


logger = logging.getLogger(__name__)

_SEED_RECIPES = [
    {"id": "r01", "name": "Node 버전 확인", "description": "node -v (데모)", "command": "node", "args": ["-v"], "cwd": ""},
    {"id": "r02", "name": "디렉토리 목록", "description": "dir 실행", "command": "cmd", "args": ["/c", "dir"], "cwd": ""},
    {"id": "r03", "name": "Git 상태", "description": "git status", "command": "git", "args": ["status"], "cwd": ""},
    {"id": "r04", "name": "Python 버전", "description": "python --version", "command": "python", "args": ["--version"], "cwd": ""},
    {"id": "r05", "name": "NPM 의존성 확인", "description": "npm ls --depth=0", "command": "npm", "args": ["ls", "--depth=0"], "cwd": ""},
]


def _seed_recipes():
    """Insert default recipes if the recipes table is empty."""
    db = SessionLocal()
    try:
        if db.query(Recipe).count() == 0:
            for r in _SEED_RECIPES:
                recipe = Recipe(
                    id=r["id"],
                    name=r["name"],
                    description=r["description"],
                    command=r["command"],
                    args=json.dumps(r.get("args", [])),
                    cwd=r.get("cwd", ""),
                )
                db.add(recipe)
            db.commit()
            logger.info("Seeded %d default recipes", len(_SEED_RECIPES))
    finally:
        db.close()


def _seed_job_definitions():
    """Insert default job definitions if the table is empty."""
    db = SessionLocal()
    try:
        if db.query(JobDefinition).count() == 0:
            for jd in SEED_JOB_DEFINITIONS:
                db.add(JobDefinition(**jd))
            db.commit()
            logger.info("Seeded %d job definitions", len(SEED_JOB_DEFINITIONS))
    finally:
        db.close()


def _seed_achievements():
    """Insert default achievements if the table is empty."""
    from app.services.ranking_service import seed_achievements
    db = SessionLocal()
    try:
        seed_achievements(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-create tables only in dev (SQLite). Production uses Alembic migrations.
    if is_sqlite():
        Base.metadata.create_all(bind=engine)
    _seed_recipes()
    _seed_job_definitions()
    _seed_achievements()
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
_allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "*")
_cors_origins = ["*"] if _allowed_origins_raw == "*" else [o.strip() for o in _allowed_origins_raw.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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
app.include_router(ranking.router)
app.include_router(rooms.router, prefix="/api/rooms", tags=["rooms"])
app.include_router(tasks.router)
app.include_router(leveling.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
