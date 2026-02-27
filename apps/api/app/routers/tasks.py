"""Task CRUD + distribution endpoints for room-based task management."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import NotFoundError, ValidationError
from app.models.room import Member, Room
from app.models.task import Assignment, Task
from app.services.job_matcher import ALL_JOB_IDS, get_job_name, match_jobs_from_prompt
from app.services.task_router import auto_match_and_assign, reassign_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["tasks"])


# ── Schemas ───────────────────────────────────────────
class TaskCreate(BaseModel):
    title: str
    description: str = ""
    prompt: str = ""
    priority: int = 0
    created_by: str | None = None


class ManualAssign(BaseModel):
    member_id: str
    job_type: str


# ── Helpers ───────────────────────────────────────────
def _task_to_dict(task: Task, db: Session) -> dict:
    assignments = (
        db.query(Assignment).filter(Assignment.task_id == task.id).all()
    )
    return {
        "id": task.id,
        "room_id": task.room_id,
        "title": task.title,
        "description": task.description,
        "prompt": task.prompt,
        "status": task.status,
        "priority": task.priority,
        "created_by": task.created_by,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "assignments": [_assignment_to_dict(a) for a in assignments],
    }


def _assignment_to_dict(a: Assignment) -> dict:
    return {
        "id": a.id,
        "task_id": a.task_id,
        "member_id": a.member_id,
        "job_type": a.job_type,
        "job_name_ko": get_job_name(a.job_type, "ko"),
        "job_name_en": get_job_name(a.job_type, "en"),
        "status": a.status,
        "started_at": a.started_at.isoformat() if a.started_at else None,
        "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        "result": json.loads(a.result) if a.result and a.result != "{}" else {},
    }


def _get_room_or_404(db: Session, room_id: str) -> Room:
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise NotFoundError(
            message=f"Room '{room_id}' not found",
            error_code="room_not_found",
            details={"room_id": room_id},
        )
    return room


def _get_task_or_404(db: Session, task_id: str) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise NotFoundError(
            message=f"Task '{task_id}' not found",
            error_code="task_not_found",
            details={"task_id": task_id},
        )
    return task


# ── Room Task Endpoints ───────────────────────────────
@router.post("/rooms/{room_id}/tasks")
def create_task(room_id: str, body: TaskCreate, db: Session = Depends(get_db)):
    """Create a task in a room. Auto-matches jobs from the prompt."""
    room = _get_room_or_404(db, room_id)

    task = Task(
        room_id=room.id,
        title=body.title,
        description=body.description,
        prompt=body.prompt,
        priority=body.priority,
        created_by=body.created_by,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # Auto-match and assign if prompt is provided
    if body.prompt or body.title:
        auto_match_and_assign(db, task)

    logger.info("Created task %s in room %s", task.id, room.id)
    return {"task": _task_to_dict(task, db)}


@router.get("/rooms/{room_id}/tasks")
def list_room_tasks(
    room_id: str,
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """List tasks for a room with optional status filter."""
    _get_room_or_404(db, room_id)

    query = db.query(Task).filter(Task.room_id == room_id)
    if status:
        query = query.filter(Task.status == status)
    query = query.order_by(Task.created_at.desc())

    total = query.count()
    tasks = query.offset(skip).limit(limit).all()

    return {
        "tasks": [_task_to_dict(t, db) for t in tasks],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


# ── Single Task Endpoints ─────────────────────────────
@router.get("/tasks/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db)):
    """Get task details including assignments."""
    task = _get_task_or_404(db, task_id)
    return {"task": _task_to_dict(task, db)}


@router.post("/tasks/{task_id}/assign")
def assign_task(task_id: str, body: ManualAssign, db: Session = Depends(get_db)):
    """Manually assign a member to a task with a specific job type."""
    task = _get_task_or_404(db, task_id)

    if task.status in ("completed", "failed"):
        raise ValidationError(
            message="Cannot assign a completed or failed task",
            error_code="task_not_assignable",
            details={"task_id": task_id, "status": task.status},
        )

    # Verify member exists
    member = db.query(Member).filter(Member.id == body.member_id).first()
    if not member:
        raise NotFoundError(
            message=f"Member '{body.member_id}' not found",
            error_code="member_not_found",
            details={"member_id": body.member_id},
        )

    # Verify job_type is valid
    if body.job_type not in ALL_JOB_IDS:
        raise ValidationError(
            message=f"Unknown job type '{body.job_type}'",
            error_code="invalid_job_type",
            details={"job_type": body.job_type},
        )

    assignment = reassign_task(db, task, body.member_id, body.job_type)
    logger.info("Manually assigned task %s to member %s", task_id, body.member_id)
    return {"assignment": _assignment_to_dict(assignment)}


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: str, db: Session = Depends(get_db)):
    """Mark a task as completed. Also completes all active assignments."""
    task = _get_task_or_404(db, task_id)

    if task.status == "completed":
        raise ValidationError(
            message="Task is already completed",
            error_code="task_already_completed",
            details={"task_id": task_id},
        )

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    # Complete all non-completed assignments
    active_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.task_id == task_id,
            Assignment.status.in_(("assigned", "in_progress")),
        )
        .all()
    )
    for a in active_assignments:
        a.status = "completed"
        a.completed_at = now

    task.status = "completed"
    db.commit()
    db.refresh(task)

    logger.info("Completed task %s (%d assignments closed)", task_id, len(active_assignments))
    return {"task": _task_to_dict(task, db)}


@router.post("/tasks/{task_id}/cancel")
def cancel_task(task_id: str, db: Session = Depends(get_db)):
    """Cancel a task and all its active assignments."""
    task = _get_task_or_404(db, task_id)

    if task.status in ("completed", "failed"):
        raise ValidationError(
            message="Cannot cancel a completed or failed task",
            error_code="task_not_cancellable",
            details={"task_id": task_id, "status": task.status},
        )

    # Fail all active assignments
    active_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.task_id == task_id,
            Assignment.status.in_(("assigned", "in_progress")),
        )
        .all()
    )
    for a in active_assignments:
        a.status = "failed"

    task.status = "failed"
    db.commit()
    db.refresh(task)

    logger.info("Cancelled task %s", task_id)
    return {"task": _task_to_dict(task, db)}


# ── Job Definitions (read-only reference) ─────────────
@router.get("/town/job-definitions")
def list_job_definitions(db: Session = Depends(get_db)):
    """Return all 25 job definitions for the town system."""
    from app.models.job_definition import JobDefinition
    defs = db.query(JobDefinition).all()
    jobs = [
        {
            "id": j.id,
            "name": j.name,
            "description": j.description,
            "icon": j.icon,
            "category": j.category,
            "required_level": j.required_level,
        }
        for j in defs
    ]
    return {"jobs": jobs, "total": len(jobs)}


@router.get("/town/job-match")
def match_jobs(prompt: str = Query(..., min_length=1), top_n: int = Query(default=5, ge=1, le=25)):
    """Analyze a prompt and return matching jobs (for preview / debugging)."""
    results = match_jobs_from_prompt(prompt)
    return {"matches": results[:top_n], "total": len(results)}
