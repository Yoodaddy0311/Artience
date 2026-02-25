import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectStatusUpdate,
    ProjectUpdate,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────

def _deserialize_project(project: Project) -> dict:
    """Convert a Project ORM instance to a dict with JSON fields parsed."""
    return {
        "id": project.id,
        "name": project.name,
        "goals": project.goals or "",
        "stack_preset": project.stack_preset or "web_react",
        "agent_team": json.loads(project.agent_team) if project.agent_team else [],
        "settings": json.loads(project.settings) if project.settings else {},
        "status": project.status or "created",
        "progress": project.progress or 0,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def _get_project_or_404(db: Session, project_id: str) -> Project:
    """Fetch a project by ID or raise 404."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return project


# ── Endpoints ────────────────────────────────────────────

@router.get("/", response_model=ProjectListResponse)
def list_projects(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Max records to return"),
    db: Session = Depends(get_db),
):
    """List all projects with pagination."""
    total = db.query(Project).count()
    projects = (
        db.query(Project)
        .order_by(Project.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "projects": [_deserialize_project(p) for p in projects],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/", response_model=ProjectResponse, status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
):
    """Create a new project."""
    project = Project(
        name=payload.name,
        goals=payload.goals,
        stack_preset=payload.stack_preset,
        agent_team=json.dumps(payload.agent_team),
        settings=json.dumps(payload.settings),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _deserialize_project(project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Get a single project by ID."""
    project = _get_project_or_404(db, project_id)
    return _deserialize_project(project)


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
):
    """Update a project. Only provided fields are changed."""
    project = _get_project_or_404(db, project_id)

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        if field == "agent_team":
            setattr(project, field, json.dumps(value))
        elif field == "settings":
            setattr(project, field, json.dumps(value))
        else:
            setattr(project, field, value)

    db.commit()
    db.refresh(project)
    return _deserialize_project(project)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Delete a project by ID."""
    project = _get_project_or_404(db, project_id)
    db.delete(project)
    db.commit()
    return None


@router.patch("/{project_id}/status", response_model=ProjectResponse)
def update_project_status(
    project_id: str,
    payload: ProjectStatusUpdate,
    db: Session = Depends(get_db),
):
    """Update only the status (and optionally progress) of a project."""
    project = _get_project_or_404(db, project_id)

    project.status = payload.status
    if payload.progress is not None:
        project.progress = payload.progress

    db.commit()
    db.refresh(project)
    return _deserialize_project(project)
