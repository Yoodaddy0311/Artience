import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.models.ranking import Achievement, UserAchievement, WeeklyScore, SEED_ACHIEVEMENTS
from app.models.task import Assignment


logger = logging.getLogger(__name__)


def get_current_week() -> str:
    """Return current ISO week string like '2026-W09'."""
    now = datetime.utcnow()
    iso_cal = now.isocalendar()
    return f"{iso_cal[0]}-W{iso_cal[1]:02d}"


def calculate_score(task_count: int, quality_avg: float) -> float:
    """Calculate weekly score: task_count * quality_avg."""
    return task_count * quality_avg


def get_weekly_ranking(
    db: Session,
    week: Optional[str] = None,
    job_type: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """Get weekly ranking sorted by score descending."""
    if week is None:
        week = get_current_week()

    query = db.query(WeeklyScore).filter(WeeklyScore.week == week)
    if job_type:
        query = query.filter(WeeklyScore.job_type == job_type)

    results = query.order_by(desc(WeeklyScore.score)).limit(limit).all()

    return [
        {
            "rank": idx + 1,
            "user_id": r.user_id,
            "score": r.score,
            "task_count": r.task_count,
            "quality_avg": r.quality_avg,
            "job_type": r.job_type,
            "week": r.week,
        }
        for idx, r in enumerate(results)
    ]


def update_weekly_score(
    db: Session,
    user_id: str,
    job_type: str,
    task_count_delta: int = 1,
    quality: float = 80.0,
) -> WeeklyScore:
    """Update or create a weekly score entry for a user."""
    week = get_current_week()

    existing = (
        db.query(WeeklyScore)
        .filter(
            WeeklyScore.user_id == user_id,
            WeeklyScore.week == week,
            WeeklyScore.job_type == job_type,
        )
        .first()
    )

    if existing:
        old_total_quality = existing.quality_avg * existing.task_count
        existing.task_count += task_count_delta
        if existing.task_count > 0:
            existing.quality_avg = (old_total_quality + quality) / existing.task_count
        existing.score = calculate_score(existing.task_count, existing.quality_avg)
        db.commit()
        db.refresh(existing)
        return existing

    new_score = WeeklyScore(
        user_id=user_id,
        week=week,
        job_type=job_type,
        task_count=task_count_delta,
        quality_avg=quality,
        score=calculate_score(task_count_delta, quality),
    )
    db.add(new_score)
    db.commit()
    db.refresh(new_score)
    return new_score


def get_all_achievements(db: Session) -> list[dict]:
    """Get all available achievements."""
    results = db.query(Achievement).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "icon": a.icon,
            "condition_type": a.condition_type,
            "condition_value": a.condition_value,
        }
        for a in results
    ]


def get_user_achievements(db: Session, user_id: str) -> list[dict]:
    """Get achievements unlocked by a specific user."""
    results = (
        db.query(UserAchievement, Achievement)
        .join(Achievement, UserAchievement.achievement_id == Achievement.id)
        .filter(UserAchievement.user_id == user_id)
        .all()
    )

    return [
        {
            "id": ach.id,
            "name": ach.name,
            "description": ach.description,
            "icon": ach.icon,
            "unlocked_at": ua.unlocked_at.isoformat() if ua.unlocked_at else None,
        }
        for ua, ach in results
    ]


def check_and_unlock_achievements(db: Session, user_id: str) -> list[dict]:
    """Check if user has earned any new achievements and unlock them."""
    # Get already unlocked
    unlocked_ids = {
        ua.achievement_id
        for ua in db.query(UserAchievement).filter(UserAchievement.user_id == user_id).all()
    }

    # Get all achievements
    all_achievements = db.query(Achievement).all()
    newly_unlocked = []

    # Count completed tasks for user
    completed_tasks = (
        db.query(func.count(Assignment.id))
        .filter(Assignment.member_id == user_id, Assignment.status == "completed")
        .scalar()
        or 0
    )

    for ach in all_achievements:
        if ach.id in unlocked_ids:
            continue

        should_unlock = False

        if ach.condition_type == "task_count":
            should_unlock = completed_tasks >= ach.condition_value

        if should_unlock:
            ua = UserAchievement(user_id=user_id, achievement_id=ach.id)
            db.add(ua)
            newly_unlocked.append({
                "id": ach.id,
                "name": ach.name,
                "description": ach.description,
                "icon": ach.icon,
            })

    if newly_unlocked:
        db.commit()

    return newly_unlocked


def seed_achievements(db: Session) -> None:
    """Seed default achievements if the table is empty."""
    if db.query(Achievement).count() == 0:
        for ach_data in SEED_ACHIEVEMENTS:
            db.add(Achievement(**ach_data))
        db.commit()
        logger.info("Seeded %d achievements", len(SEED_ACHIEVEMENTS))
