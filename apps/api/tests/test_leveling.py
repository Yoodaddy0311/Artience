"""Tests for the Leveling API endpoints and leveling_service.

Covers:
- GET  /api/leveling/profile/{user_id}  — leveling profile
- POST /api/leveling/reward             — grant reward
- GET  /api/leveling/jobs               — job unlock status
- GET  /api/leveling/level-curve        — level curve reference
- leveling_service unit tests (XP, levels, grades, rewards)
"""

from app.models.room import Character, Member, Room
from app.models.job_definition import JobDefinition, SEED_JOB_DEFINITIONS
from app.services.leveling_service import (
    LEVEL_CURVE,
    MAX_LEVEL,
    JOB_GRADES,
    calculate_reward,
    grade_for_level,
    level_from_xp,
    xp_for_level,
    xp_for_next_level,
)


# ── Helpers ──────────────────────────────────────────

def _setup_room_and_member(client):
    """Create a room via API (auto-creates owner member + character)."""
    resp = client.post("/api/rooms/", json={
        "name": "Leveling Room",
        "owner_id": "user_lv",
    })
    assert resp.status_code == 201
    room = resp.json()
    member_id = room["members"][0]["id"]
    return room["id"], room["code"], member_id


def _seed_jobs(db_session):
    for jd in SEED_JOB_DEFINITIONS:
        db_session.add(JobDefinition(**jd))
    db_session.commit()


# ── GET /api/leveling/level-curve ────────────────────


class TestLevelCurve:
    def test_level_curve_endpoint(self, client):
        resp = client.get("/api/leveling/level-curve")
        assert resp.status_code == 200
        data = resp.json()
        assert "levels" in data
        assert data["max_level"] == 10
        assert "grades" in data
        assert len(data["grades"]) == len(JOB_GRADES)

    def test_level_curve_values(self, client):
        resp = client.get("/api/leveling/level-curve")
        levels = resp.json()["levels"]
        # Keys are stringified ints in JSON
        assert levels["1"] == 0
        assert levels["10"] == 10000


# ── GET /api/leveling/profile/{user_id} ──────────────


class TestLevelingProfile:
    def test_profile_success(self, client):
        room_id, code, member_id = _setup_room_and_member(client)

        resp = client.get("/api/leveling/profile/user_lv")
        assert resp.status_code == 200
        profile = resp.json()["profile"]
        assert profile["user_id"] == "user_lv"
        assert "summary" in profile
        assert "characters" in profile
        assert profile["summary"]["highest_level"] >= 1
        assert len(profile["characters"]) >= 1

    def test_profile_not_found(self, client):
        resp = client.get("/api/leveling/profile/nonexistent_user")
        assert resp.status_code == 404

    def test_profile_contains_grade(self, client):
        _setup_room_and_member(client)

        resp = client.get("/api/leveling/profile/user_lv")
        profile = resp.json()["profile"]
        grade = profile["summary"]["grade"]
        assert "grade" in grade
        assert "title_ko" in grade

    def test_profile_character_fields(self, client):
        _setup_room_and_member(client)

        resp = client.get("/api/leveling/profile/user_lv")
        chars = resp.json()["profile"]["characters"]
        assert len(chars) >= 1
        char = chars[0]
        for field in ("level", "xp", "xp_to_next", "progress", "coins", "diamonds", "grade"):
            assert field in char, f"Missing field: {field}"


# ── POST /api/leveling/reward ────────────────────────


class TestGrantReward:
    def test_reward_success(self, client):
        room_id, code, member_id = _setup_room_and_member(client)

        resp = client.post("/api/leveling/reward", json={
            "member_id": member_id,
            "job_type": "FE_DEV",
            "priority": 0,
            "quality": 80.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "reward" in data
        assert data["reward"]["xp"] > 0
        assert data["reward"]["coins"] > 0
        assert "character" in data
        assert "leveled_up" in data

    def test_reward_high_priority_diamonds(self, client):
        room_id, code, member_id = _setup_room_and_member(client)

        resp = client.post("/api/leveling/reward", json={
            "member_id": member_id,
            "job_type": "BE_DEV",
            "priority": 2,
            "quality": 95.0,
        })
        assert resp.status_code == 200
        reward = resp.json()["reward"]
        assert reward["diamonds"] >= 1  # High quality + urgent priority

    def test_reward_accumulates_xp(self, client):
        room_id, code, member_id = _setup_room_and_member(client)

        # Grant reward twice
        client.post("/api/leveling/reward", json={
            "member_id": member_id,
            "job_type": "QA",
            "priority": 1,
            "quality": 90.0,
        })
        resp = client.post("/api/leveling/reward", json={
            "member_id": member_id,
            "job_type": "QA",
            "priority": 1,
            "quality": 90.0,
        })
        assert resp.status_code == 200
        char = resp.json()["character"]
        # XP should be more than a single reward's worth
        single_xp = calculate_reward(priority=1, quality=90.0)["xp"]
        assert char["xp"] >= single_xp * 2

    def test_reward_member_not_found(self, client):
        resp = client.post("/api/leveling/reward", json={
            "member_id": "nonexistent_member",
            "job_type": "FE_DEV",
            "priority": 0,
            "quality": 80.0,
        })
        assert resp.status_code == 404

    def test_reward_invalid_quality(self, client):
        room_id, code, member_id = _setup_room_and_member(client)

        resp = client.post("/api/leveling/reward", json={
            "member_id": member_id,
            "job_type": "FE_DEV",
            "priority": 0,
            "quality": 150.0,
        })
        assert resp.status_code == 422

    def test_reward_negative_quality(self, client):
        room_id, code, member_id = _setup_room_and_member(client)

        resp = client.post("/api/leveling/reward", json={
            "member_id": member_id,
            "job_type": "FE_DEV",
            "priority": 0,
            "quality": -10.0,
        })
        assert resp.status_code == 422

    def test_reward_level_up_detection(self, client):
        room_id, code, member_id = _setup_room_and_member(client)

        # Grant enough XP to reach level 2 (need 100 XP)
        # priority=2, quality=100 -> 2.0 * 1.0 * 50 = 100 XP per grant
        resp = client.post("/api/leveling/reward", json={
            "member_id": member_id,
            "job_type": "FE_DEV",
            "priority": 2,
            "quality": 100.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        # With 100 XP, should be level 2
        assert data["character"]["level"] >= 2
        assert data["leveled_up"] is True
        assert data["old_level"] == 1
        assert data["new_level"] >= 2


# ── GET /api/leveling/jobs ───────────────────────────


class TestJobUnlockStatus:
    def test_job_unlock_with_definitions(self, client, db_session):
        _seed_jobs(db_session)
        room_id, code, member_id = _setup_room_and_member(client)

        resp = client.get("/api/leveling/jobs", params={"user_id": "user_lv"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_id"] == "user_lv"
        assert len(data["jobs"]) == 25

        # Level 1 user should unlock level-1 required jobs
        lv1_jobs = [j for j in data["jobs"] if j["required_level"] == 1]
        for j in lv1_jobs:
            assert j["unlocked"] is True

        # Higher level jobs should be locked
        lv5_jobs = [j for j in data["jobs"] if j["required_level"] == 5]
        for j in lv5_jobs:
            assert j["unlocked"] is False

    def test_job_unlock_no_definitions(self, client):
        _setup_room_and_member(client)

        resp = client.get("/api/leveling/jobs", params={"user_id": "user_lv"})
        assert resp.status_code == 200
        assert resp.json()["jobs"] == []

    def test_job_unlock_missing_user_id(self, client):
        resp = client.get("/api/leveling/jobs")
        assert resp.status_code == 422


# ── leveling_service unit tests ──────────────────────


class TestLevelingService:
    def test_xp_for_level(self):
        assert xp_for_level(1) == 0
        assert xp_for_level(2) == 100
        assert xp_for_level(5) == 1000
        assert xp_for_level(10) == 10000

    def test_xp_for_level_beyond_max(self):
        assert xp_for_level(11) == 10000
        assert xp_for_level(99) == 10000

    def test_xp_for_next_level(self):
        assert xp_for_next_level(1) == 100  # 100 - 0
        assert xp_for_next_level(2) == 200  # 300 - 100
        assert xp_for_next_level(10) == 0   # max level

    def test_level_from_xp(self):
        assert level_from_xp(0) == 1
        assert level_from_xp(50) == 1
        assert level_from_xp(100) == 2
        assert level_from_xp(299) == 2
        assert level_from_xp(300) == 3
        assert level_from_xp(9999) == 9
        assert level_from_xp(10000) == 10
        assert level_from_xp(99999) == 10

    def test_grade_for_level(self):
        assert grade_for_level(1)["grade"] == "intern"
        assert grade_for_level(2)["grade"] == "intern"
        assert grade_for_level(3)["grade"] == "junior"
        assert grade_for_level(5)["grade"] == "mid"
        assert grade_for_level(7)["grade"] == "senior"
        assert grade_for_level(10)["grade"] == "lead"

    def test_calculate_reward_normal(self):
        reward = calculate_reward(priority=0, quality=80.0)
        assert reward["xp"] == 40  # 50 * 1.0 * 0.8
        assert reward["coins"] == 8  # 10 * 1.0 * 0.8
        assert reward["diamonds"] == 0

    def test_calculate_reward_urgent_high_quality(self):
        reward = calculate_reward(priority=2, quality=100.0)
        assert reward["xp"] == 100  # 50 * 2.0 * 1.0
        assert reward["coins"] == 20  # 10 * 2.0 * 1.0
        assert reward["diamonds"] == 3  # quality >= 95, priority >= 2

    def test_calculate_reward_high_priority_90_quality(self):
        reward = calculate_reward(priority=1, quality=90.0)
        assert reward["diamonds"] == 1  # quality >= 90, priority >= 1

    def test_calculate_reward_low_quality_floor(self):
        reward = calculate_reward(priority=0, quality=0.0)
        # quality_factor = max(0.5, 0/100) = 0.5
        assert reward["xp"] == 25  # 50 * 1.0 * 0.5
        assert reward["coins"] == 5  # 10 * 1.0 * 0.5
        assert reward["diamonds"] == 0

    def test_grant_reward_updates_character(self, db_session):
        # Create room, member, character directly in DB
        room = Room(id="room_gr", name="Grant Room", owner_id="user_gr", code="GR1234")
        db_session.add(room)
        db_session.commit()

        member = Member(
            id="mem_gr", room_id="room_gr", user_id="user_gr",
            character_name="Granter", is_online=True,
        )
        db_session.add(member)
        db_session.commit()

        char = Character(id="chr_gr", member_id="mem_gr", level=1, xp=0, coins=0, diamonds=0)
        db_session.add(char)
        db_session.commit()

        from app.services.leveling_service import grant_reward
        result = grant_reward(db_session, "mem_gr", "FE_DEV", priority=0, quality=80.0)

        assert "error" not in result
        assert result["reward"]["xp"] > 0
        assert result["character"]["xp"] > 0
        assert result["character"]["coins"] > 0

    def test_grant_reward_missing_character(self, db_session):
        # Member without character
        room = Room(id="room_nc", name="No Char Room", owner_id="user_nc", code="NC1234")
        db_session.add(room)
        db_session.commit()

        member = Member(
            id="mem_nc", room_id="room_nc", user_id="user_nc",
            character_name="NoChar", is_online=True,
        )
        db_session.add(member)
        db_session.commit()

        from app.services.leveling_service import grant_reward
        result = grant_reward(db_session, "mem_nc", "QA", priority=0, quality=80.0)
        assert result == {"error": "character_not_found"}
