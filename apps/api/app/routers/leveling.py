"""Leveling system endpoints — profile, rewards, job unlock status."""

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import NotFoundError, ValidationError
from app.services.leveling_service import (
    LEVEL_CURVE,
    JOB_GRADES,
    get_job_unlock_status,
    get_leveling_profile,
    grant_reward,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leveling", tags=["leveling"])


# ── Schemas ───────────────────────────────────────────
class RewardRequest(BaseModel):
    member_id: str
    job_type: str
    priority: int = 0
    quality: float = 80.0


# ── Endpoints ─────────────────────────────────────────
@router.get("/profile/{user_id}")
def leveling_profile(user_id: str, db: Session = Depends(get_db)):
    """Get a user's leveling profile — level, XP, job proficiencies."""
    profile = get_leveling_profile(db, user_id)
    if not profile:
        raise NotFoundError(
            message=f"No profile found for user '{user_id}'",
            error_code="profile_not_found",
            details={"user_id": user_id},
        )
    return {"profile": profile}


@router.post("/reward")
def grant_task_reward(body: RewardRequest, db: Session = Depends(get_db)):
    """Grant XP/coins/diamonds for a completed task (called internally or by CTO)."""
    if body.quality < 0 or body.quality > 100:
        raise ValidationError(
            message="Quality must be between 0 and 100",
            error_code="invalid_quality",
            details={"quality": body.quality},
        )

    result = grant_reward(
        db,
        member_id=body.member_id,
        job_type=body.job_type,
        priority=body.priority,
        quality=body.quality,
    )

    if "error" in result:
        raise NotFoundError(
            message=result["error"],
            error_code=result["error"],
            details={"member_id": body.member_id},
        )

    logger.info(
        "Granted reward to member %s: xp=%d coins=%d diamonds=%d (leveled_up=%s)",
        body.member_id,
        result["reward"]["xp"],
        result["reward"]["coins"],
        result["reward"]["diamonds"],
        result["leveled_up"],
    )
    return result


@router.get("/jobs")
def job_unlock_status(user_id: str = Query(...), db: Session = Depends(get_db)):
    """Return all 25 jobs with unlock status based on user's level."""
    jobs = get_job_unlock_status(db, user_id)
    return {"jobs": jobs, "user_id": user_id}


@router.get("/level-curve")
def level_curve():
    """Return the level curve and job grades for reference."""
    return {
        "levels": LEVEL_CURVE,
        "max_level": max(LEVEL_CURVE.keys()),
        "grades": JOB_GRADES,
    }
