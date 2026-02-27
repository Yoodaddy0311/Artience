"""Tests for achievement condition checkers in ranking_service.py.

Covers the 6 new condition types:
- streak_days, job_level, collab_count, quality_avg, speed_complete, error_free_streak
"""

from datetime import datetime, timedelta, timezone

from app.models.ranking import Achievement, UserAchievement, WeeklyScore
from app.models.room import Character, Member, Room
from app.models.task import Assignment, Task
from app.services.ranking_service import (
    _check_collab_count,
    _check_error_free_streak,
    _check_job_level,
    _check_quality_avg,
    _check_speed_complete,
    _check_streak_days,
    _check_task_count,
    check_and_unlock_achievements,
)


# ── Helpers ──────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def _make_room(db):
    room = Room(id="room_ach", name="Ach Room", owner_id="user_ach", code="ACH001")
    db.add(room)
    db.commit()
    return room


def _make_member(db, room, member_id="mem_ach", user_id="user_ach"):
    mem = Member(
        id=member_id, room_id=room.id, user_id=user_id,
        character_name="Tester", is_online=True,
    )
    db.add(mem)
    db.commit()
    return mem


def _make_task(db, room, task_id="task_ach"):
    task = Task(
        id=task_id, room_id=room.id, title="Test Task",
        status="completed", priority=1,
    )
    db.add(task)
    db.commit()
    return task


def _make_assignment(db, task, member, asgn_id, status="completed",
                     started_at=None, completed_at=None, job_type="FE_DEV"):
    asgn = Assignment(
        id=asgn_id, task_id=task.id, member_id=member.id,
        job_type=job_type, status=status,
        started_at=started_at or _now(),
        completed_at=completed_at,
    )
    db.add(asgn)
    db.commit()
    return asgn


# ── _check_task_count ────────────────────────────────────────


class TestCheckTaskCount:
    def test_returns_true_when_threshold_met(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        task = _make_task(db_session, room)
        _make_assignment(db_session, task, mem, "a_tc1", completed_at=_now())

        assert _check_task_count(db_session, mem.id, 1) is True

    def test_returns_false_when_below_threshold(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)

        assert _check_task_count(db_session, mem.id, 1) is False


# ── _check_streak_days ───────────────────────────────────────


class TestCheckStreakDays:
    def test_consecutive_days_meets_threshold(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        now = _now()

        for i in range(5):
            task = _make_task(db_session, room, task_id=f"task_streak_{i}")
            _make_assignment(
                db_session, task, mem, f"a_streak_{i}",
                completed_at=now - timedelta(days=i),
            )

        assert _check_streak_days(db_session, mem.id, 5) is True

    def test_gap_breaks_streak(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        now = _now()

        # Days: today, yesterday, 3 days ago (gap at day 2)
        for i, offset in enumerate([0, 1, 3]):
            task = _make_task(db_session, room, task_id=f"task_gap_{i}")
            _make_assignment(
                db_session, task, mem, f"a_gap_{i}",
                completed_at=now - timedelta(days=offset),
            )

        assert _check_streak_days(db_session, mem.id, 3) is False
        assert _check_streak_days(db_session, mem.id, 2) is True

    def test_no_completions_returns_false(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)

        assert _check_streak_days(db_session, mem.id, 1) is False

    def test_single_day_counts_as_streak_1(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        task = _make_task(db_session, room)
        _make_assignment(db_session, task, mem, "a_s1", completed_at=_now())

        assert _check_streak_days(db_session, mem.id, 1) is True


# ── _check_job_level ─────────────────────────────────────────


class TestCheckJobLevel:
    def test_returns_true_when_level_met(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        char = Character(id="chr_jl1", member_id=mem.id, level=5, xp=1000)
        db_session.add(char)
        db_session.commit()

        assert _check_job_level(db_session, "user_ach", 5) is True

    def test_returns_false_when_level_below(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        char = Character(id="chr_jl2", member_id=mem.id, level=3, xp=300)
        db_session.add(char)
        db_session.commit()

        assert _check_job_level(db_session, "user_ach", 5) is False

    def test_returns_false_when_no_character(self, db_session):
        room = _make_room(db_session)
        _make_member(db_session, room)

        assert _check_job_level(db_session, "user_ach", 1) is False

    def test_checks_across_multiple_memberships(self, db_session):
        room = _make_room(db_session)
        mem1 = _make_member(db_session, room, member_id="mem_jl_a")
        mem2 = _make_member(db_session, room, member_id="mem_jl_b")

        char1 = Character(id="chr_jl_a", member_id=mem1.id, level=2, xp=100)
        char2 = Character(id="chr_jl_b", member_id=mem2.id, level=7, xp=2500)
        db_session.add_all([char1, char2])
        db_session.commit()

        assert _check_job_level(db_session, "user_ach", 5) is True


# ── _check_collab_count ──────────────────────────────────────


class TestCheckCollabCount:
    def test_collab_detected(self, db_session):
        room = _make_room(db_session)
        mem1 = _make_member(db_session, room, member_id="mem_col1", user_id="user_col1")
        mem2 = _make_member(db_session, room, member_id="mem_col2", user_id="user_col2")
        mem3 = _make_member(db_session, room, member_id="mem_col3", user_id="user_col3")

        task = _make_task(db_session, room, task_id="task_collab")
        for i, m in enumerate([mem1, mem2, mem3]):
            _make_assignment(
                db_session, task, m, f"a_col_{i}",
                completed_at=_now(),
            )

        # mem1 collaborated with 2 others on 1 task
        assert _check_collab_count(db_session, mem1.id, 1) is True

    def test_no_collab_returns_false(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        task = _make_task(db_session, room)
        _make_assignment(db_session, task, mem, "a_solo", completed_at=_now())

        assert _check_collab_count(db_session, mem.id, 1) is False

    def test_multiple_collab_tasks(self, db_session):
        room = _make_room(db_session)
        mem1 = _make_member(db_session, room, member_id="mem_mc1", user_id="user_mc1")
        mem2 = _make_member(db_session, room, member_id="mem_mc2", user_id="user_mc2")

        for i in range(3):
            task = _make_task(db_session, room, task_id=f"task_mc_{i}")
            _make_assignment(db_session, task, mem1, f"a_mc1_{i}", completed_at=_now())
            _make_assignment(db_session, task, mem2, f"a_mc2_{i}", completed_at=_now())

        assert _check_collab_count(db_session, mem1.id, 3) is True


# ── _check_quality_avg ───────────────────────────────────────


class TestCheckQualityAvg:
    def test_above_threshold(self, db_session):
        ws = WeeklyScore(
            id="ws_qa1", user_id="user_qa", week="2026-W09",
            job_type="FE_DEV", score=450, task_count=5, quality_avg=92.0,
        )
        db_session.add(ws)
        db_session.commit()

        assert _check_quality_avg(db_session, "user_qa", 90) is True

    def test_below_threshold(self, db_session):
        ws = WeeklyScore(
            id="ws_qa2", user_id="user_qa2", week="2026-W09",
            job_type="BE_DEV", score=200, task_count=3, quality_avg=75.0,
        )
        db_session.add(ws)
        db_session.commit()

        assert _check_quality_avg(db_session, "user_qa2", 90) is False

    def test_no_scores_returns_false(self, db_session):
        assert _check_quality_avg(db_session, "user_no_scores", 90) is False

    def test_average_across_multiple_weeks(self, db_session):
        db_session.add(WeeklyScore(
            id="ws_qa_w1", user_id="user_qa_multi", week="2026-W08",
            job_type="QA", score=270, task_count=3, quality_avg=88.0,
        ))
        db_session.add(WeeklyScore(
            id="ws_qa_w2", user_id="user_qa_multi", week="2026-W09",
            job_type="QA", score=280, task_count=3, quality_avg=92.0,
        ))
        db_session.commit()

        # Average = (88 + 92) / 2 = 90
        assert _check_quality_avg(db_session, "user_qa_multi", 90) is True
        assert _check_quality_avg(db_session, "user_qa_multi", 91) is False


# ── _check_speed_complete ────────────────────────────────────


class TestCheckSpeedComplete:
    def test_fast_completion(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        task = _make_task(db_session, room)

        now = _now()
        _make_assignment(
            db_session, task, mem, "a_fast1",
            started_at=now - timedelta(minutes=30),
            completed_at=now,
        )

        assert _check_speed_complete(db_session, mem.id, 1) is True

    def test_slow_completion_excluded(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        task = _make_task(db_session, room)

        now = _now()
        _make_assignment(
            db_session, task, mem, "a_slow1",
            started_at=now - timedelta(hours=2),
            completed_at=now,
        )

        assert _check_speed_complete(db_session, mem.id, 1) is False

    def test_mixed_fast_and_slow(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        now = _now()

        task1 = _make_task(db_session, room, task_id="task_mix1")
        _make_assignment(
            db_session, task1, mem, "a_mix_fast",
            started_at=now - timedelta(minutes=20),
            completed_at=now,
        )

        task2 = _make_task(db_session, room, task_id="task_mix2")
        _make_assignment(
            db_session, task2, mem, "a_mix_slow",
            started_at=now - timedelta(hours=3),
            completed_at=now,
        )

        assert _check_speed_complete(db_session, mem.id, 1) is True
        assert _check_speed_complete(db_session, mem.id, 2) is False

    def test_exactly_one_hour_counts(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        task = _make_task(db_session, room)
        now = _now()

        _make_assignment(
            db_session, task, mem, "a_exact",
            started_at=now - timedelta(hours=1),
            completed_at=now,
        )

        assert _check_speed_complete(db_session, mem.id, 1) is True


# ── _check_error_free_streak ─────────────────────────────────


class TestCheckErrorFreeStreak:
    def test_all_completed_meets_threshold(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        now = _now()

        for i in range(10):
            task = _make_task(db_session, room, task_id=f"task_ef_{i}")
            _make_assignment(
                db_session, task, mem, f"a_ef_{i}",
                started_at=now - timedelta(hours=10 - i),
                completed_at=now - timedelta(hours=10 - i - 1) if i < 9 else now,
            )

        assert _check_error_free_streak(db_session, mem.id, 10) is True

    def test_failed_breaks_streak(self, db_session):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        now = _now()

        # 3 completed, then 1 failed, then 2 completed (most recent)
        for i in range(3):
            task = _make_task(db_session, room, task_id=f"task_old_{i}")
            _make_assignment(
                db_session, task, mem, f"a_old_{i}",
                started_at=now - timedelta(hours=20 - i),
                completed_at=now - timedelta(hours=20 - i - 1),
            )

        task_f = _make_task(db_session, room, task_id="task_fail")
        _make_assignment(
            db_session, task_f, mem, "a_fail", status="failed",
            started_at=now - timedelta(hours=10),
        )

        for i in range(2):
            task = _make_task(db_session, room, task_id=f"task_new_{i}")
            _make_assignment(
                db_session, task, mem, f"a_new_{i}",
                started_at=now - timedelta(hours=2 - i),
                completed_at=now - timedelta(hours=1 - i) if i == 0 else now,
            )

        # Current streak is only 2 (after the failed one)
        assert _check_error_free_streak(db_session, mem.id, 3) is False
        assert _check_error_free_streak(db_session, mem.id, 2) is True

    def test_no_assignments_returns_false(self, db_session):
        assert _check_error_free_streak(db_session, "nobody", 1) is False


# ── Integration: check_and_unlock_achievements ───────────────


class TestCheckAndUnlockIntegration:
    def test_unlocks_streak_achievement(self, db_session, seed_achievements):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        now = _now()

        for i in range(5):
            task = _make_task(db_session, room, task_id=f"task_int_streak_{i}")
            _make_assignment(
                db_session, task, mem, f"a_int_streak_{i}",
                completed_at=now - timedelta(days=i),
            )

        newly = check_and_unlock_achievements(db_session, mem.id)
        unlocked_ids = [a["id"] for a in newly]
        # Should unlock streak_days (5 days) and task_count (1 task, 5 tasks)
        assert "ach_5_streak" in unlocked_ids
        assert "ach_first_task" in unlocked_ids

    def test_unlocks_job_level_achievement(self, db_session, seed_achievements):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        char = Character(id="chr_int_jl", member_id=mem.id, level=5, xp=1000)
        db_session.add(char)
        db_session.commit()

        newly = check_and_unlock_achievements(db_session, "user_ach")
        unlocked_ids = [a["id"] for a in newly]
        assert "ach_job_master" in unlocked_ids

    def test_unlocks_error_free_streak(self, db_session, seed_achievements):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)
        now = _now()

        for i in range(10):
            task = _make_task(db_session, room, task_id=f"task_int_ef_{i}")
            _make_assignment(
                db_session, task, mem, f"a_int_ef_{i}",
                started_at=now - timedelta(hours=10 - i),
                completed_at=now - timedelta(hours=10 - i - 1) if i < 9 else now,
            )

        newly = check_and_unlock_achievements(db_session, mem.id)
        unlocked_ids = [a["id"] for a in newly]
        assert "ach_perfectionist" in unlocked_ids

    def test_does_not_unlock_unmet_conditions(self, db_session, seed_achievements):
        room = _make_room(db_session)
        mem = _make_member(db_session, room)

        newly = check_and_unlock_achievements(db_session, mem.id)
        assert len(newly) == 0

    def test_unknown_condition_type_skipped(self, db_session):
        ach = Achievement(
            id="ach_unknown", name="Unknown", description="Mystery",
            icon="question", condition_type="mystery_type", condition_value=1,
        )
        db_session.add(ach)
        db_session.commit()

        # Should not crash, just skip
        newly = check_and_unlock_achievements(db_session, "some_user")
        assert len(newly) == 0
