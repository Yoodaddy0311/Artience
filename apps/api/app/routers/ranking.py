import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.ranking_service import (
    get_weekly_ranking,
    get_all_achievements,
    get_user_achievements,
    check_and_unlock_achievements,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ranking", tags=["ranking"])


@router.get("/weekly")
def weekly_ranking(
    week: Optional[str] = Query(None, description="ISO week string like '2026-W09'"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get weekly contribution ranking (all job types)."""
    results = get_weekly_ranking(db, week=week, limit=limit)
    return {"ranking": results, "week": week}


@router.get("/weekly/{job_type}")
def weekly_ranking_by_job(
    job_type: str,
    week: Optional[str] = Query(None, description="ISO week string like '2026-W09'"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get weekly contribution ranking filtered by job type."""
    results = get_weekly_ranking(db, week=week, job_type=job_type, limit=limit)
    return {"ranking": results, "week": week, "job_type": job_type}


@router.get("/achievements")
def list_achievements(db: Session = Depends(get_db)):
    """Get all available achievements."""
    achievements = get_all_achievements(db)
    return {"achievements": achievements}


@router.get("/achievements/{user_id}")
def user_achievements(user_id: str, db: Session = Depends(get_db)):
    """Get achievements unlocked by a specific user."""
    unlocked = get_user_achievements(db, user_id)
    all_achievements = get_all_achievements(db)
    return {
        "user_id": user_id,
        "unlocked": unlocked,
        "total": len(all_achievements),
        "unlocked_count": len(unlocked),
    }
