import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc, func, distinct, case

from app.models.ranking import Achievement, UserAchievement, WeeklyScore, SEED_ACHIEVEMENTS
from app.models.task import Assignment, Task
from app.models.room import Character, Member


logger = logging.getLogger(__name__)


def get_current_week() -> str:
    """Return current ISO week string like '2026-W09'."""
    now = datetime.now(timezone.utc)
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


# ── Achievement condition checkers ────────────────────────────


def _check_task_count(db: Session, user_id: str, threshold: int) -> bool:
    """Check if user completed >= threshold tasks."""
    count = (
        db.query(func.count(Assignment.id))
        .filter(Assignment.member_id == user_id, Assignment.status == "completed")
        .scalar()
        or 0
    )
    return count >= threshold


def _check_streak_days(db: Session, user_id: str, threshold: int) -> bool:
    """Check if user has >= threshold consecutive active days.

    Looks at completed_at dates in assignments and checks for consecutive days
    ending at (or including) today.
    """
    rows = (
        db.query(func.date(Assignment.completed_at))
        .filter(
            Assignment.member_id == user_id,
            Assignment.status == "completed",
            Assignment.completed_at.isnot(None),
        )
        .distinct()
        .order_by(func.date(Assignment.completed_at).desc())
        .all()
    )

    if not rows:
        return False

    # Extract sorted unique dates (most recent first)
    dates = []
    for row in rows:
        val = row[0]
        if val is None:
            continue
        if isinstance(val, str):
            try:
                val = datetime.strptime(val, "%Y-%m-%d").date()
            except ValueError:
                continue
        elif isinstance(val, datetime):
            val = val.date()
        dates.append(val)

    if not dates:
        return False

    # Count consecutive days from the most recent date backwards
    streak = 1
    for i in range(1, len(dates)):
        if dates[i - 1] - dates[i] == timedelta(days=1):
            streak += 1
        else:
            break

    return streak >= threshold


def _check_job_level(db: Session, user_id: str, threshold: int) -> bool:
    """Check if user has any job/character at level >= threshold."""
    members = db.query(Member).filter(Member.user_id == user_id).all()
    for mem in members:
        char = db.query(Character).filter(Character.member_id == mem.id).first()
        if char and char.level >= threshold:
            return True
    return False


def _check_collab_count(db: Session, user_id: str, threshold: int) -> bool:
    """Check if user has collaborated (same task, different members) >= threshold times."""
    # Find tasks where this user has a completed assignment
    user_task_ids = (
        db.query(Assignment.task_id)
        .filter(
            Assignment.member_id == user_id,
            Assignment.status == "completed",
        )
        .subquery()
    )

    # For each such task, count distinct other members
    collab_count = (
        db.query(func.count(distinct(Assignment.task_id)))
        .filter(
            Assignment.task_id.in_(db.query(user_task_ids.c.task_id)),
            Assignment.member_id != user_id,
            Assignment.status == "completed",
        )
        .scalar()
        or 0
    )

    return collab_count >= threshold


def _check_quality_avg(db: Session, user_id: str, threshold: int) -> bool:
    """Check if user's average quality score across weekly scores >= threshold."""
    # Use WeeklyScore quality_avg as the quality metric
    avg = (
        db.query(func.avg(WeeklyScore.quality_avg))
        .filter(WeeklyScore.user_id == user_id)
        .scalar()
    )
    if avg is None:
        return False
    return avg >= threshold


def _check_speed_complete(db: Session, user_id: str, threshold: int) -> bool:
    """Check if user has >= threshold fast completions.

    A fast completion is one where completed_at - started_at <= 1 hour.
    """
    # SQLite doesn't support datetime arithmetic well, so do it in Python
    assignments = (
        db.query(Assignment)
        .filter(
            Assignment.member_id == user_id,
            Assignment.status == "completed",
            Assignment.started_at.isnot(None),
            Assignment.completed_at.isnot(None),
        )
        .all()
    )

    fast_count = 0
    for a in assignments:
        if a.completed_at and a.started_at:
            duration = a.completed_at - a.started_at
            if duration <= timedelta(hours=1):
                fast_count += 1

    return fast_count >= threshold


def _check_error_free_streak(db: Session, user_id: str, threshold: int) -> bool:
    """Check if user has >= threshold consecutive completed assignments without failure.

    Looks at assignments ordered by started_at/completed_at and counts the
    current streak of status='completed' without any status='failed'.
    """
    assignments = (
        db.query(Assignment.status)
        .filter(
            Assignment.member_id == user_id,
            Assignment.status.in_(["completed", "failed"]),
        )
        .order_by(Assignment.started_at.desc())
        .all()
    )

    streak = 0
    for (status,) in assignments:
        if status == "completed":
            streak += 1
        else:
            break  # failed breaks the streak

    return streak >= threshold


# ── Condition type dispatcher ─────────────────────────────────

_CONDITION_CHECKERS = {
    "task_count": _check_task_count,
    "streak_days": _check_streak_days,
    "job_level": _check_job_level,
    "collab_count": _check_collab_count,
    "quality_avg": _check_quality_avg,
    "speed_complete": _check_speed_complete,
    "error_free_streak": _check_error_free_streak,
}


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

    for ach in all_achievements:
        if ach.id in unlocked_ids:
            continue

        checker = _CONDITION_CHECKERS.get(ach.condition_type)
        if checker is None:
            logger.warning("Unknown achievement condition_type: %s", ach.condition_type)
            continue

        if checker(db, user_id, ach.condition_value):
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
