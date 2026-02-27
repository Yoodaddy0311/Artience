"""Tests for Dokba Town DB models (Phase 1-B T1).

Covers:
- Room, Member, Character models (room.py)
- Task, Assignment models (task.py)
- JobDefinition model + seed data (job_definition.py)
- Foreign key relationships and cascades
"""

import json

import pytest
from app.models.room import Room, Member, Character
from app.models.task import Task, Assignment
from app.models.job_definition import JobDefinition, SEED_JOB_DEFINITIONS


# ── Room Model ───────────────────────────────────────

class TestRoomModel:
    def test_create_room(self, db_session):
        room = Room(
            id="room_001",
            name="Dev Town",
            owner_id="user_a",
            code="XYZ789",
        )
        db_session.add(room)
        db_session.commit()

        fetched = db_session.query(Room).filter(Room.id == "room_001").first()
        assert fetched is not None
        assert fetched.name == "Dev Town"
        assert fetched.owner_id == "user_a"
        assert fetched.code == "XYZ789"

    def test_room_defaults(self, db_session):
        room = Room(id="room_002", name="Test", owner_id="u1", code="AAA111")
        db_session.add(room)
        db_session.commit()

        fetched = db_session.query(Room).filter(Room.id == "room_002").first()
        assert fetched.max_members == 25
        assert fetched.status == "active"
        assert fetched.created_at is not None

    def test_room_code_unique(self, db_session):
        r1 = Room(id="room_a", name="R1", owner_id="u1", code="UNIQ01")
        r2 = Room(id="room_b", name="R2", owner_id="u2", code="UNIQ01")
        db_session.add(r1)
        db_session.commit()
        db_session.add(r2)
        with pytest.raises(Exception):
            db_session.commit()


# ── Member Model ─────────────────────────────────────

class TestMemberModel:
    def test_create_member(self, db_session, sample_room):
        member = Member(
            id="mem_001",
            room_id=sample_room.id,
            user_id="user_b",
            character_name="Luna",
            character_role="Frontend Developer",
        )
        db_session.add(member)
        db_session.commit()

        fetched = db_session.query(Member).filter(Member.id == "mem_001").first()
        assert fetched is not None
        assert fetched.room_id == sample_room.id
        assert fetched.character_name == "Luna"
        assert fetched.character_role == "Frontend Developer"

    def test_member_defaults(self, db_session, sample_room):
        member = Member(
            id="mem_002",
            room_id=sample_room.id,
            user_id="user_c",
            character_name="Rio",
        )
        db_session.add(member)
        db_session.commit()

        fetched = db_session.query(Member).filter(Member.id == "mem_002").first()
        assert fetched.character_role == ""
        assert fetched.job_slot is None
        assert fetched.is_online is False
        assert fetched.joined_at is not None

    def test_member_job_slot(self, db_session, sample_room):
        member = Member(
            id="mem_003",
            room_id=sample_room.id,
            user_id="user_d",
            character_name="Ara",
            job_slot="QA",
        )
        db_session.add(member)
        db_session.commit()

        fetched = db_session.query(Member).filter(Member.id == "mem_003").first()
        assert fetched.job_slot == "QA"

    def test_member_cascade_on_room_delete(self, db_session):
        """Deleting a room should cascade-delete its members."""
        room = Room(id="room_del", name="Temp", owner_id="u1", code="DEL001")
        db_session.add(room)
        db_session.commit()

        member = Member(
            id="mem_del",
            room_id="room_del",
            user_id="u2",
            character_name="Temp User",
        )
        db_session.add(member)
        db_session.commit()

        db_session.delete(room)
        db_session.commit()

        assert db_session.query(Member).filter(Member.id == "mem_del").first() is None


# ── Character Model ──────────────────────────────────

class TestCharacterModel:
    def test_create_character(self, db_session, sample_member):
        char = Character(
            id="chr_001",
            member_id=sample_member.id,
            avatar_config=json.dumps({"sprite": "otter", "color": "blue"}),
            level=3,
            xp=1500,
            coins=200,
            diamonds=10,
        )
        db_session.add(char)
        db_session.commit()

        fetched = db_session.query(Character).filter(Character.id == "chr_001").first()
        assert fetched is not None
        assert fetched.level == 3
        assert fetched.xp == 1500
        config = json.loads(fetched.avatar_config)
        assert config["sprite"] == "otter"

    def test_character_defaults(self, db_session, sample_member):
        char = Character(id="chr_002", member_id=sample_member.id)
        db_session.add(char)
        db_session.commit()

        fetched = db_session.query(Character).filter(Character.id == "chr_002").first()
        assert fetched.level == 1
        assert fetched.xp == 0
        assert fetched.coins == 0
        assert fetched.diamonds == 0
        assert fetched.avatar_config == "{}"

    def test_character_unique_member(self, db_session, sample_member):
        """Each member should have at most one character."""
        c1 = Character(id="chr_a", member_id=sample_member.id)
        c2 = Character(id="chr_b", member_id=sample_member.id)
        db_session.add(c1)
        db_session.commit()
        db_session.add(c2)
        with pytest.raises(Exception):
            db_session.commit()


# ── Task Model ───────────────────────────────────────

class TestTaskModel:
    def test_create_task(self, db_session, sample_room):
        task = Task(
            id="task_001",
            room_id=sample_room.id,
            title="Build navbar",
            description="Create responsive navigation bar",
            prompt="Build a responsive navbar with React",
            status="pending",
            priority=2,
        )
        db_session.add(task)
        db_session.commit()

        fetched = db_session.query(Task).filter(Task.id == "task_001").first()
        assert fetched is not None
        assert fetched.title == "Build navbar"
        assert fetched.priority == 2
        assert fetched.status == "pending"

    def test_task_defaults(self, db_session, sample_room):
        task = Task(id="task_002", room_id=sample_room.id, title="Test task")
        db_session.add(task)
        db_session.commit()

        fetched = db_session.query(Task).filter(Task.id == "task_002").first()
        assert fetched.description == ""
        assert fetched.prompt == ""
        assert fetched.status == "pending"
        assert fetched.priority == 0
        assert fetched.created_by is None
        assert fetched.created_at is not None

    def test_task_cascade_on_room_delete(self, db_session):
        room = Room(id="room_t_del", name="Temp", owner_id="u1", code="TDL001")
        db_session.add(room)
        db_session.commit()

        task = Task(id="task_del", room_id="room_t_del", title="Will be deleted")
        db_session.add(task)
        db_session.commit()

        db_session.delete(room)
        db_session.commit()

        assert db_session.query(Task).filter(Task.id == "task_del").first() is None

    def test_task_status_values(self, db_session, sample_room):
        """Verify all expected status values can be stored."""
        statuses = ["pending", "assigned", "in_progress", "completed", "failed"]
        for i, status in enumerate(statuses):
            task = Task(
                id=f"task_s{i}",
                room_id=sample_room.id,
                title=f"Status: {status}",
                status=status,
            )
            db_session.add(task)
        db_session.commit()

        for i, status in enumerate(statuses):
            fetched = db_session.query(Task).filter(Task.id == f"task_s{i}").first()
            assert fetched.status == status


# ── Assignment Model ─────────────────────────────────

class TestAssignmentModel:
    def test_create_assignment(self, db_session, sample_task, sample_member):
        assignment = Assignment(
            id="asgn_001",
            task_id=sample_task.id,
            member_id=sample_member.id,
            job_type="FE_DEV",
            status="assigned",
        )
        db_session.add(assignment)
        db_session.commit()

        fetched = db_session.query(Assignment).filter(Assignment.id == "asgn_001").first()
        assert fetched is not None
        assert fetched.task_id == sample_task.id
        assert fetched.member_id == sample_member.id
        assert fetched.job_type == "FE_DEV"
        assert fetched.status == "assigned"

    def test_assignment_defaults(self, db_session, sample_task, sample_member):
        assignment = Assignment(
            id="asgn_002",
            task_id=sample_task.id,
            member_id=sample_member.id,
            job_type="BE_DEV",
        )
        db_session.add(assignment)
        db_session.commit()

        fetched = db_session.query(Assignment).filter(Assignment.id == "asgn_002").first()
        assert fetched.status == "assigned"
        assert fetched.started_at is None
        assert fetched.completed_at is None
        assert fetched.result == "{}"

    def test_assignment_cascade_on_task_delete(self, db_session, sample_room, sample_member):
        task = Task(id="task_a_del", room_id=sample_room.id, title="Temp task")
        db_session.add(task)
        db_session.commit()

        assignment = Assignment(
            id="asgn_del",
            task_id="task_a_del",
            member_id=sample_member.id,
            job_type="QA",
        )
        db_session.add(assignment)
        db_session.commit()

        db_session.delete(task)
        db_session.commit()

        assert db_session.query(Assignment).filter(Assignment.id == "asgn_del").first() is None

    def test_assignment_status_lifecycle(self, db_session, sample_task, sample_member):
        """Assignment can transition through all status values."""
        from datetime import datetime, timezone

        assignment = Assignment(
            id="asgn_life",
            task_id=sample_task.id,
            member_id=sample_member.id,
            job_type="FE_DEV",
        )
        db_session.add(assignment)
        db_session.commit()

        # Transition to in_progress
        assignment.status = "in_progress"
        assignment.started_at = datetime.now(timezone.utc)
        db_session.commit()
        assert assignment.status == "in_progress"
        assert assignment.started_at is not None

        # Transition to completed
        assignment.status = "completed"
        assignment.completed_at = datetime.now(timezone.utc)
        assignment.result = json.dumps({"output": "Login page implemented"})
        db_session.commit()
        assert assignment.status == "completed"
        result = json.loads(assignment.result)
        assert result["output"] == "Login page implemented"


# ── JobDefinition Model ──────────────────────────────

class TestJobDefinitionModel:
    def test_seed_data_count(self):
        assert len(SEED_JOB_DEFINITIONS) == 25

    def test_seed_data_unique_ids(self):
        ids = [jd["id"] for jd in SEED_JOB_DEFINITIONS]
        assert len(ids) == len(set(ids))

    def test_seed_data_categories(self):
        categories = set(jd["category"] for jd in SEED_JOB_DEFINITIONS)
        assert "management" in categories
        assert "engineering" in categories
        assert "design" in categories
        assert "qa" in categories
        assert "ops" in categories

    def test_insert_seed_data(self, db_session, seed_job_definitions):
        count = db_session.query(JobDefinition).count()
        assert count == 25

    def test_job_definition_fields(self, db_session, seed_job_definitions):
        pm = db_session.query(JobDefinition).filter(JobDefinition.id == "PM").first()
        assert pm is not None
        assert pm.name == "Project Manager"
        assert pm.category == "management"
        assert pm.required_level == 1

    def test_job_definition_required_levels_range(self):
        levels = [jd["required_level"] for jd in SEED_JOB_DEFINITIONS]
        assert min(levels) >= 1
        assert max(levels) <= 5

    def test_category_distribution(self):
        """Verify the expected category distribution from the seed data."""
        by_cat = {}
        for jd in SEED_JOB_DEFINITIONS:
            by_cat.setdefault(jd["category"], []).append(jd["id"])
        assert len(by_cat["management"]) == 4
        assert len(by_cat["design"]) == 4
        assert len(by_cat["qa"]) == 3
        assert len(by_cat["ops"]) == 4  # DEVOPS, SRE, INFRA, SEC
        # engineering + general = remaining 10
        eng_gen = len(by_cat.get("engineering", [])) + len(by_cat.get("general", []))
        assert eng_gen == 10
