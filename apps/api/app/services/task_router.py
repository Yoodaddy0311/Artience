"""Task routing service — auto-matches jobs from prompt analysis and assigns users."""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.room import Member
from app.models.task import Assignment, Task
from app.services.job_matcher import match_jobs_from_prompt

logger = logging.getLogger(__name__)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def auto_match_and_assign(
    db: Session,
    task: Task,
    *,
    top_n: int = 3,
) -> list[Assignment]:
    """Analyze the task prompt, match required jobs, and assign online members.

    Steps:
    1. Run keyword matching on task.prompt (or task.title + description).
    2. For each matched job (up to top_n), look for an online member in the
       same room with that job_slot.
    3. If found -> create Assignment with status='assigned'.
       If not found -> skip (no assignment created; AI fallback handled upstream).

    Returns list of created Assignment objects.
    """
    text = " ".join(filter(None, [task.title, task.description, task.prompt]))
    matched_jobs = match_jobs_from_prompt(text)

    if not matched_jobs:
        logger.info("No jobs matched for task %s", task.id)
        return []

    assignments: list[Assignment] = []

    for job_def in matched_jobs[:top_n]:
        job_id = job_def["id"]

        # Find an online member in the room with this job_slot
        member = (
            db.query(Member)
            .filter(
                Member.room_id == task.room_id,
                Member.job_slot == job_id,
                Member.is_online.is_(True),
            )
            .first()
        )

        if member:
            assignment = Assignment(
                task_id=task.id,
                member_id=member.id,
                job_type=job_id,
                status="assigned",
                started_at=_now_utc(),
            )
            db.add(assignment)
            assignments.append(assignment)
            logger.info(
                "Assigned task %s job=%s to member %s",
                task.id, job_id, member.id,
            )
        else:
            # No online user with this job — skip assignment, log for AI fallback
            logger.info(
                "No online member for job=%s in room=%s — awaiting assignment",
                job_id, task.room_id,
            )

    if assignments:
        task.status = "assigned"
        db.commit()
        for a in assignments:
            db.refresh(a)

    return assignments


def reassign_task(
    db: Session,
    task: Task,
    member_id: str,
    job_type: str,
) -> Assignment:
    """Manually assign (or reassign) a specific member to a task."""
    # Check for existing assignment with same job_type
    existing = (
        db.query(Assignment)
        .filter(
            Assignment.task_id == task.id,
            Assignment.job_type == job_type,
        )
        .first()
    )

    if existing:
        existing.member_id = member_id
        existing.status = "assigned"
        existing.started_at = _now_utc()
        existing.completed_at = None
        existing.result = "{}"
        db.commit()
        db.refresh(existing)
        return existing

    assignment = Assignment(
        task_id=task.id,
        member_id=member_id,
        job_type=job_type,
        status="assigned",
        started_at=_now_utc(),
    )
    db.add(assignment)
    task.status = "assigned"
    db.commit()
    db.refresh(assignment)
    return assignment
