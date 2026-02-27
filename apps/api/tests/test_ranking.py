"""Tests for the Ranking API endpoints (ranking.py) and ranking_service.

Covers:
- GET /api/ranking/weekly — weekly ranking (all job types)
- GET /api/ranking/weekly/{job_type} — job-type filtered ranking
- GET /api/ranking/achievements — list all achievements
- GET /api/ranking/achievements/{user_id} — user achievements
- ranking_service helper functions
"""

from app.models.ranking import Achievement, UserAchievement, WeeklyScore, SEED_ACHIEVEMENTS
from app.services.ranking_service import (
    calculate_score,
    get_current_week,
    update_weekly_score,
    check_and_unlock_achievements,
    seed_achievements,
)


# ── GET /api/ranking/weekly ──────────────────────────


class TestWeeklyRanking:
    def test_weekly_ranking_empty(self, client):
        resp = client.get("/api/ranking/weekly")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ranking"] == []

    def test_weekly_ranking_with_scores(self, client, db_session):
        week = get_current_week()
        ws1 = WeeklyScore(
            id="ws_t1", user_id="user_a", week=week,
            job_type="FE_DEV", score=240.0, task_count=3, quality_avg=80.0,
        )
        ws2 = WeeklyScore(
            id="ws_t2", user_id="user_b", week=week,
            job_type="BE_DEV", score=450.0, task_count=5, quality_avg=90.0,
        )
        db_session.add_all([ws1, ws2])
        db_session.commit()

        resp = client.get("/api/ranking/weekly")
        assert resp.status_code == 200
        ranking = resp.json()["ranking"]
        assert len(ranking) == 2
        # Should be sorted by score descending
        assert ranking[0]["score"] >= ranking[1]["score"]
        assert ranking[0]["rank"] == 1
        assert ranking[1]["rank"] == 2

    def test_weekly_ranking_limit(self, client, db_session):
        week = get_current_week()
        for i in range(5):
            db_session.add(WeeklyScore(
                id=f"ws_lim_{i}", user_id=f"user_{i}", week=week,
                job_type="QA", score=float(i * 100), task_count=i + 1, quality_avg=80.0,
            ))
        db_session.commit()

        resp = client.get("/api/ranking/weekly", params={"limit": 3})
        assert resp.status_code == 200
        assert len(resp.json()["ranking"]) == 3

    def test_weekly_ranking_specific_week(self, client, db_session):
        db_session.add(WeeklyScore(
            id="ws_w1", user_id="user_w", week="2026-W01",
            job_type="PM", score=100.0, task_count=1, quality_avg=100.0,
        ))
        db_session.add(WeeklyScore(
            id="ws_w9", user_id="user_w", week="2026-W09",
            job_type="PM", score=200.0, task_count=2, quality_avg=100.0,
        ))
        db_session.commit()

        resp = client.get("/api/ranking/weekly", params={"week": "2026-W01"})
        assert resp.status_code == 200
        ranking = resp.json()["ranking"]
        assert len(ranking) == 1
        assert ranking[0]["week"] == "2026-W01"


# ── GET /api/ranking/weekly/{job_type} ──────────────


class TestWeeklyRankingByJob:
    def test_filter_by_job_type(self, client, db_session):
        week = get_current_week()
        db_session.add(WeeklyScore(
            id="ws_fe", user_id="user_fe", week=week,
            job_type="FE_DEV", score=300.0, task_count=3, quality_avg=100.0,
        ))
        db_session.add(WeeklyScore(
            id="ws_be", user_id="user_be", week=week,
            job_type="BE_DEV", score=200.0, task_count=2, quality_avg=100.0,
        ))
        db_session.commit()

        resp = client.get("/api/ranking/weekly/FE_DEV")
        assert resp.status_code == 200
        data = resp.json()
        assert data["job_type"] == "FE_DEV"
        assert len(data["ranking"]) == 1
        assert data["ranking"][0]["user_id"] == "user_fe"

    def test_filter_by_job_type_empty(self, client):
        resp = client.get("/api/ranking/weekly/NONEXISTENT")
        assert resp.status_code == 200
        assert resp.json()["ranking"] == []


# ── GET /api/ranking/achievements ────────────────────


class TestListAchievements:
    def test_achievements_empty(self, client):
        resp = client.get("/api/ranking/achievements")
        assert resp.status_code == 200
        assert resp.json()["achievements"] == []

    def test_achievements_seeded(self, client, seed_achievements):
        resp = client.get("/api/ranking/achievements")
        assert resp.status_code == 200
        achievements = resp.json()["achievements"]
        assert len(achievements) == len(SEED_ACHIEVEMENTS)
        # Check structure
        first = achievements[0]
        assert "id" in first
        assert "name" in first
        assert "description" in first
        assert "icon" in first
        assert "condition_type" in first
        assert "condition_value" in first


# ── GET /api/ranking/achievements/{user_id} ─────────


class TestUserAchievements:
    def test_user_no_achievements(self, client):
        resp = client.get("/api/ranking/achievements/user_none")
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_id"] == "user_none"
        assert data["unlocked"] == []
        assert data["unlocked_count"] == 0

    def test_user_with_achievements(self, client, db_session, seed_achievements):
        # Manually unlock an achievement
        ua = UserAchievement(
            id="uach_t1",
            user_id="user_hero",
            achievement_id="ach_first_task",
        )
        db_session.add(ua)
        db_session.commit()

        resp = client.get("/api/ranking/achievements/user_hero")
        assert resp.status_code == 200
        data = resp.json()
        assert data["unlocked_count"] == 1
        assert data["total"] == len(SEED_ACHIEVEMENTS)
        assert data["unlocked"][0]["id"] == "ach_first_task"


# ── ranking_service unit tests ──────────────────────


class TestRankingService:
    def test_calculate_score(self):
        assert calculate_score(3, 80.0) == 240.0
        assert calculate_score(0, 100.0) == 0.0
        assert calculate_score(1, 0.0) == 0.0

    def test_get_current_week_format(self):
        week = get_current_week()
        # Should match ISO week format: YYYY-Www
        assert week.startswith("20")
        assert "-W" in week
        parts = week.split("-W")
        assert len(parts) == 2
        assert int(parts[1]) >= 1
        assert int(parts[1]) <= 53

    def test_update_weekly_score_new(self, db_session):
        ws = update_weekly_score(db_session, "user_new", "FE_DEV", task_count_delta=1, quality=85.0)
        assert ws.user_id == "user_new"
        assert ws.task_count == 1
        assert ws.quality_avg == 85.0
        assert ws.score == 85.0  # 1 * 85.0

    def test_update_weekly_score_existing(self, db_session):
        update_weekly_score(db_session, "user_upd", "BE_DEV", task_count_delta=2, quality=80.0)
        ws = update_weekly_score(db_session, "user_upd", "BE_DEV", task_count_delta=1, quality=100.0)
        assert ws.task_count == 3
        # quality_avg = (80*2 + 100) / 3 ≈ 86.67
        assert ws.quality_avg > 86.0
        assert ws.quality_avg < 87.0

    def test_seed_achievements_idempotent(self, db_session):
        seed_achievements(db_session)
        count1 = db_session.query(Achievement).count()
        assert count1 == len(SEED_ACHIEVEMENTS)

        # Running again should not duplicate
        seed_achievements(db_session)
        count2 = db_session.query(Achievement).count()
        assert count2 == count1

    def test_check_and_unlock_first_task(self, db_session, sample_task, sample_member, seed_achievements):
        from app.models.task import Assignment
        from datetime import datetime, timezone

        # Create a completed assignment
        asgn = Assignment(
            id="asgn_unlock_1",
            task_id=sample_task.id,
            member_id=sample_member.id,
            job_type="FE_DEV",
            status="completed",
            completed_at=datetime.now(timezone.utc),
        )
        db_session.add(asgn)
        db_session.commit()

        newly = check_and_unlock_achievements(db_session, sample_member.id)
        # Should unlock "ach_first_task" (condition: task_count >= 1)
        unlocked_ids = [a["id"] for a in newly]
        assert "ach_first_task" in unlocked_ids

    def test_check_achievements_no_duplicates(self, db_session, sample_task, sample_member, seed_achievements):
        from app.models.task import Assignment
        from datetime import datetime, timezone

        asgn = Assignment(
            id="asgn_dup_1",
            task_id=sample_task.id,
            member_id=sample_member.id,
            job_type="QA",
            status="completed",
            completed_at=datetime.now(timezone.utc),
        )
        db_session.add(asgn)
        db_session.commit()

        first_unlock = check_and_unlock_achievements(db_session, sample_member.id)
        second_unlock = check_and_unlock_achievements(db_session, sample_member.id)
        # Second call should not re-unlock
        assert len(second_unlock) == 0
        assert len(first_unlock) > 0
