"""Leveling service — XP calculation, level curve, job grades, and rewards.

Uses the Character model (level, xp, coins, diamonds) and
integrates with the ranking service for weekly score tracking.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.models.room import Character, Member
from app.models.task import Assignment
from app.services.ranking_service import update_weekly_score, check_and_unlock_achievements

logger = logging.getLogger(__name__)


# ── Level Curve ──────────────────────────────────────
# Lv -> cumulative XP required
LEVEL_CURVE: dict[int, int] = {
    1: 0,
    2: 100,
    3: 300,
    4: 600,
    5: 1000,
    6: 1600,
    7: 2500,
    8: 3800,
    9: 5800,
    10: 10000,
}

MAX_LEVEL = 10


def xp_for_level(level: int) -> int:
    """Return cumulative XP required to reach a given level."""
    return LEVEL_CURVE.get(min(level, MAX_LEVEL), LEVEL_CURVE[MAX_LEVEL])


def xp_for_next_level(level: int) -> int:
    """Return additional XP needed from current level to next level."""
    if level >= MAX_LEVEL:
        return 0
    return xp_for_level(level + 1) - xp_for_level(level)


def level_from_xp(total_xp: int) -> int:
    """Calculate level from total XP."""
    for lv in range(MAX_LEVEL, 0, -1):
        if total_xp >= LEVEL_CURVE[lv]:
            return lv
    return 1


# ── Job Grades (based on level) ──────────────────────
JOB_GRADES: list[dict] = [
    {"min_level": 1, "grade": "intern", "title_ko": "인턴", "title_en": "Intern"},
    {"min_level": 3, "grade": "junior", "title_ko": "주니어", "title_en": "Junior"},
    {"min_level": 5, "grade": "mid", "title_ko": "미드레벨", "title_en": "Mid-Level"},
    {"min_level": 7, "grade": "senior", "title_ko": "시니어", "title_en": "Senior"},
    {"min_level": 10, "grade": "lead", "title_ko": "리드", "title_en": "Lead"},
]


def grade_for_level(level: int) -> dict:
    """Return the job grade for a given level."""
    result = JOB_GRADES[0]
    for g in JOB_GRADES:
        if level >= g["min_level"]:
            result = g
    return result


# ── XP Calculation ───────────────────────────────────
# Priority: 0=normal, 1=high, 2=urgent
_PRIORITY_MULTIPLIER = {0: 1.0, 1: 1.5, 2: 2.0}
_BASE_XP = 50
_BASE_COINS = 10


def calculate_reward(priority: int = 0, quality: float = 80.0) -> dict:
    """Calculate XP, coins, and optional diamonds for a completed task.

    Args:
        priority: Task priority (0=normal, 1=high, 2=urgent).
        quality: Completion quality percentage (0-100).

    Returns:
        dict with xp, coins, diamonds amounts.
    """
    multiplier = _PRIORITY_MULTIPLIER.get(priority, 1.0)
    quality_factor = max(0.5, quality / 100.0)

    xp = int(_BASE_XP * multiplier * quality_factor)
    coins = int(_BASE_COINS * multiplier * quality_factor)

    # Diamonds only for high quality + high priority
    diamonds = 0
    if quality >= 90 and priority >= 1:
        diamonds = 1
    if quality >= 95 and priority >= 2:
        diamonds = 3

    return {"xp": xp, "coins": coins, "diamonds": diamonds}


# ── Core: Grant Reward ───────────────────────────────
def grant_reward(
    db: Session,
    member_id: str,
    job_type: str,
    priority: int = 0,
    quality: float = 80.0,
) -> dict:
    """Grant XP/coins/diamonds to a member's character after task completion.

    Also updates weekly ranking score and checks achievements.

    Returns dict with reward amounts, new level info, and whether a level-up occurred.
    """
    # Find character
    character = (
        db.query(Character)
        .filter(Character.member_id == member_id)
        .first()
    )
    if not character:
        logger.warning("No character found for member %s", member_id)
        return {"error": "character_not_found"}

    # Find member for user_id (needed for ranking)
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        logger.warning("No member found for id %s", member_id)
        return {"error": "member_not_found"}

    reward = calculate_reward(priority, quality)
    old_level = character.level

    # Apply rewards
    character.xp += reward["xp"]
    character.coins += reward["coins"]
    character.diamonds += reward["diamonds"]

    # Recalculate level
    new_level = level_from_xp(character.xp)
    character.level = new_level

    db.commit()
    db.refresh(character)

    # Level-up detection
    leveled_up = new_level > old_level
    if leveled_up:
        logger.info(
            "Member %s leveled up: %d -> %d (xp=%d)",
            member_id, old_level, new_level, character.xp,
        )

    grade = grade_for_level(new_level)

    # Update weekly ranking
    update_weekly_score(
        db,
        user_id=member.user_id,
        job_type=job_type,
        task_count_delta=1,
        quality=quality,
    )

    # Check achievements
    new_achievements = check_and_unlock_achievements(db, member.user_id)

    return {
        "reward": reward,
        "character": {
            "level": character.level,
            "xp": character.xp,
            "xp_to_next": xp_for_next_level(character.level),
            "progress": _level_progress(character.xp, character.level),
            "coins": character.coins,
            "diamonds": character.diamonds,
            "grade": grade,
        },
        "leveled_up": leveled_up,
        "old_level": old_level,
        "new_level": new_level,
        "new_achievements": new_achievements,
    }


def _level_progress(total_xp: int, level: int) -> float:
    """Calculate progress percentage toward next level (0.0 - 1.0)."""
    if level >= MAX_LEVEL:
        return 1.0
    current_threshold = xp_for_level(level)
    next_threshold = xp_for_level(level + 1)
    delta = next_threshold - current_threshold
    if delta <= 0:
        return 1.0
    return (total_xp - current_threshold) / delta


# ── Profile ──────────────────────────────────────────
def get_leveling_profile(db: Session, user_id: str) -> dict | None:
    """Get a user's leveling profile across all their memberships."""
    members = db.query(Member).filter(Member.user_id == user_id).all()
    if not members:
        return None

    # Aggregate across all characters
    profiles = []
    for mem in members:
        char = db.query(Character).filter(Character.member_id == mem.id).first()
        if not char:
            continue
        grade = grade_for_level(char.level)
        profiles.append({
            "member_id": mem.id,
            "room_id": mem.room_id,
            "job_slot": mem.job_slot,
            "level": char.level,
            "xp": char.xp,
            "xp_to_next": xp_for_next_level(char.level),
            "progress": _level_progress(char.xp, char.level),
            "coins": char.coins,
            "diamonds": char.diamonds,
            "grade": grade,
        })

    # Summary: highest level across all characters
    if profiles:
        best = max(profiles, key=lambda p: p["level"])
        total_xp = sum(p["xp"] for p in profiles)
        total_coins = sum(p["coins"] for p in profiles)
        total_diamonds = sum(p["diamonds"] for p in profiles)
    else:
        best = {"level": 1, "grade": grade_for_level(1)}
        total_xp = total_coins = total_diamonds = 0

    return {
        "user_id": user_id,
        "summary": {
            "highest_level": best["level"],
            "grade": best["grade"],
            "total_xp": total_xp,
            "total_coins": total_coins,
            "total_diamonds": total_diamonds,
        },
        "characters": profiles,
    }


def get_job_unlock_status(db: Session, user_id: str) -> list[dict]:
    """Return all 25 jobs with unlock status based on user's highest level."""
    from app.models.job_definition import JobDefinition

    # Find the user's highest character level
    members = db.query(Member).filter(Member.user_id == user_id).all()
    max_level = 1
    for mem in members:
        char = db.query(Character).filter(Character.member_id == mem.id).first()
        if char and char.level > max_level:
            max_level = char.level

    # Get all job definitions
    job_defs = db.query(JobDefinition).all()
    results = []
    for jd in job_defs:
        unlocked = max_level >= jd.required_level
        results.append({
            "id": jd.id,
            "name": jd.name,
            "description": jd.description,
            "icon": jd.icon,
            "category": jd.category,
            "required_level": jd.required_level,
            "unlocked": unlocked,
            "user_level": max_level,
        })

    return results
