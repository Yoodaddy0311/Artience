from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
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

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
