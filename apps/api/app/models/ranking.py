import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


def _weekly_score_id():
    return f"ws_{uuid.uuid4().hex[:8]}"


def _achievement_id():
    return f"ach_{uuid.uuid4().hex[:8]}"


def _user_achievement_id():
    return f"uach_{uuid.uuid4().hex[:8]}"


class WeeklyScore(Base):
    __tablename__ = "weekly_scores"

    id = Column(String, primary_key=True, index=True, default=_weekly_score_id)
    user_id = Column(String, nullable=False, index=True)
    week = Column(String, nullable=False, index=True)  # ISO week: "2026-W09"
    job_type = Column(String, nullable=False)  # job slot type
    score = Column(Float, default=0.0)
    task_count = Column(Integer, default=0)
    quality_avg = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ── Seed achievements ──

SEED_ACHIEVEMENTS = [
    {"id": "ach_first_task", "name": "첫 발걸음", "description": "첫 번째 태스크를 완료했습니다", "icon": "footprints", "condition_type": "task_count", "condition_value": 1},
    {"id": "ach_10_tasks", "name": "열일 장인", "description": "태스크 10개를 완료했습니다", "icon": "flame", "condition_type": "task_count", "condition_value": 10},
    {"id": "ach_50_tasks", "name": "작업의 달인", "description": "태스크 50개를 완료했습니다", "icon": "trophy", "condition_type": "task_count", "condition_value": 50},
    {"id": "ach_100_tasks", "name": "태스크 센추리", "description": "태스크 100개를 완료했습니다", "icon": "crown", "condition_type": "task_count", "condition_value": 100},
    {"id": "ach_5_streak", "name": "5일 연속 출석", "description": "5일 연속으로 활동했습니다", "icon": "calendar-check", "condition_type": "streak_days", "condition_value": 5},
    {"id": "ach_job_master", "name": "직업 마스터", "description": "하나의 직업에서 레벨 5에 도달했습니다", "icon": "award", "condition_type": "job_level", "condition_value": 5},
    {"id": "ach_team_player", "name": "팀 플레이어", "description": "3명 이상의 팀원과 협업한 태스크를 완료했습니다", "icon": "users", "condition_type": "collab_count", "condition_value": 3},
    {"id": "ach_quality_star", "name": "퀄리티 스타", "description": "평균 품질 점수 90점 이상을 달성했습니다", "icon": "star", "condition_type": "quality_avg", "condition_value": 90},
    {"id": "ach_speed_runner", "name": "스피드 러너", "description": "예상 시간의 50% 이내에 태스크를 완료했습니다", "icon": "zap", "condition_type": "speed_complete", "condition_value": 1},
    {"id": "ach_perfectionist", "name": "완벽주의자", "description": "10개 연속 태스크를 오류 없이 완료했습니다", "icon": "check-circle", "condition_type": "error_free_streak", "condition_value": 10},
]


class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(String, primary_key=True, index=True, default=_achievement_id)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    icon = Column(String, default="award")  # lucide icon name
    condition_type = Column(String, nullable=False)  # task_count, streak_days, job_level, etc.
    condition_value = Column(Integer, default=0)  # threshold value


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id = Column(String, primary_key=True, index=True, default=_user_achievement_id)
    user_id = Column(String, nullable=False, index=True)
    achievement_id = Column(String, ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False, index=True)
    unlocked_at = Column(DateTime(timezone=True), server_default=func.now())
