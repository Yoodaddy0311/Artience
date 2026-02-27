"""Tests for Task Router service (auto_match_and_assign, reassign_task) and Job Matcher.

Covers:
- task_router.py: auto_match_and_assign, reassign_task, AI fallback (skip) logic
- job_matcher.py: keyword matching (Korean/English), scoring, ALL_JOB_IDS
- Endpoint integration: /api/rooms/{room_id}/tasks CRUD, /api/town/job-definitions,
  /api/town/job-match
"""

from app.models.room import Character, Member, Room
from app.models.task import Assignment, Task
from app.models.job_definition import JobDefinition, SEED_JOB_DEFINITIONS
from app.services.job_matcher import (
    ALL_JOB_IDS,
    get_job_name,
    match_jobs_from_prompt,
)
from app.services.task_router import auto_match_and_assign, reassign_task


# ── Helpers ──────────────────────────────────────────

def _make_room(db_session, room_id="room_tr", owner_id="user_cto"):
    room = Room(id=room_id, name="Router Room", owner_id=owner_id, code="TR1234")
    db_session.add(room)
    db_session.commit()
    return room


def _make_member(db_session, room_id, member_id, user_id, job_slot=None, is_online=True):
    member = Member(
        id=member_id, room_id=room_id, user_id=user_id,
        character_name=f"Char-{member_id}", is_online=is_online,
        job_slot=job_slot,
    )
    db_session.add(member)
    db_session.commit()
    return member


def _make_task(db_session, room_id, task_id="task_tr01", title="Build login", prompt=""):
    task = Task(
        id=task_id, room_id=room_id, title=title, prompt=prompt, status="pending",
    )
    db_session.add(task)
    db_session.commit()
    return task


def _create_room_via_api(client, owner_id="owner_api"):
    resp = client.post("/api/rooms/", json={
        "name": "API Router Room",
        "owner_id": owner_id,
    })
    assert resp.status_code == 201
    room = resp.json()
    return room["id"], room["code"], room["members"][0]["id"]


def _seed_jobs(db_session):
    for jd in SEED_JOB_DEFINITIONS:
        db_session.add(JobDefinition(**jd))
    db_session.commit()


# ═══════════════════════════════════════════════════════
# Job Matcher — Unit Tests
# ═══════════════════════════════════════════════════════


class TestJobMatcherKeywords:
    """Keyword-based matching for Korean and English prompts."""

    def test_korean_frontend_keywords(self):
        results = match_jobs_from_prompt("프론트엔드 컴포넌트 React 레이아웃")
        ids = [r["id"] for r in results]
        assert "FE_DEV" in ids

    def test_korean_backend_keywords(self):
        results = match_jobs_from_prompt("백엔드 서버 API 데이터베이스")
        ids = [r["id"] for r in results]
        assert "BE_DEV" in ids

    def test_korean_devops_keywords(self):
        results = match_jobs_from_prompt("배포 도커 컨테이너 CI/CD")
        ids = [r["id"] for r in results]
        assert "DEVOPS" in ids

    def test_korean_qa_keywords(self):
        results = match_jobs_from_prompt("테스트 자동화 품질 검증 버그")
        ids = [r["id"] for r in results]
        assert "QA" in ids

    def test_english_frontend_keywords(self):
        results = match_jobs_from_prompt("React component page layout CSS view")
        ids = [r["id"] for r in results]
        assert "FE_DEV" in ids

    def test_english_backend_keywords(self):
        results = match_jobs_from_prompt("REST API endpoint server database CRUD")
        ids = [r["id"] for r in results]
        assert any(jid in ids for jid in ["BE_DEV", "API_DEV"])

    def test_english_ai_keywords(self):
        results = match_jobs_from_prompt("LLM prompt engineering fine-tuning embedding RAG")
        ids = [r["id"] for r in results]
        assert "AI_ENG" in ids

    def test_mixed_korean_english(self):
        results = match_jobs_from_prompt("프론트엔드 React component with CSS styling")
        ids = [r["id"] for r in results]
        assert "FE_DEV" in ids

    def test_multi_job_match(self):
        """A prompt touching multiple domains should return multiple jobs."""
        results = match_jobs_from_prompt("Build React frontend with REST API backend and Docker deploy")
        ids = [r["id"] for r in results]
        assert len(ids) >= 2
        # Should match frontend + backend + devops-related jobs
        matched_categories = set()
        if "FE_DEV" in ids:
            matched_categories.add("fe")
        if "BE_DEV" in ids or "API_DEV" in ids:
            matched_categories.add("be")
        if "DEVOPS" in ids:
            matched_categories.add("ops")
        assert len(matched_categories) >= 2

    def test_no_match_gibberish(self):
        results = match_jobs_from_prompt("xyzzy foobar qwerty blargh")
        assert results == []

    def test_empty_prompt(self):
        results = match_jobs_from_prompt("")
        assert results == []

    def test_scores_descending(self):
        results = match_jobs_from_prompt("프론트 프론트엔드 frontend React component page view CSS layout")
        if len(results) > 1:
            for i in range(len(results) - 1):
                assert results[i]["score"] >= results[i + 1]["score"]

    def test_result_structure(self):
        results = match_jobs_from_prompt("프론트엔드 React")
        assert len(results) >= 1
        r = results[0]
        assert "id" in r
        assert "name_ko" in r
        assert "name_en" in r
        assert "score" in r
        assert isinstance(r["score"], int)


class TestJobMatcherRegistry:
    """Static registry: ALL_JOB_IDS, get_job_name."""

    def test_all_job_ids_has_25(self):
        assert len(ALL_JOB_IDS) == 25

    def test_all_job_ids_unique(self):
        assert len(set(ALL_JOB_IDS)) == 25

    def test_known_ids_present(self):
        for expected in ("PM", "FE_DEV", "BE_DEV", "QA", "DEVOPS", "AI_ENG", "TECH_WRITER"):
            assert expected in ALL_JOB_IDS

    def test_get_job_name_ko(self):
        assert get_job_name("FE_DEV", "ko") == "프론트엔드 개발자"
        assert get_job_name("BE_DEV", "ko") == "백엔드 개발자"
        assert get_job_name("PM", "ko") == "프로젝트 매니저"

    def test_get_job_name_en(self):
        assert get_job_name("FE_DEV", "en") == "Frontend Developer"
        assert get_job_name("QA", "en") == "QA Engineer"
        assert get_job_name("DEVOPS", "en") == "DevOps Engineer"

    def test_get_job_name_unknown_returns_id(self):
        assert get_job_name("NONEXISTENT", "ko") == "NONEXISTENT"
        assert get_job_name("NONEXISTENT", "en") == "NONEXISTENT"


# ═══════════════════════════════════════════════════════
# Task Router Service — Unit Tests (DB-level)
# ═══════════════════════════════════════════════════════


class TestAutoMatchAndAssign:
    """auto_match_and_assign() — DB-level tests with fixtures."""

    def test_assigns_matching_online_member(self, db_session):
        room = _make_room(db_session)
        member = _make_member(db_session, room.id, "mem_fe", "user_fe", job_slot="FE_DEV", is_online=True)
        task = _make_task(db_session, room.id, prompt="프론트엔드 React 컴포넌트")

        assignments = auto_match_and_assign(db_session, task)
        assert len(assignments) >= 1
        assert any(a.member_id == member.id and a.job_type == "FE_DEV" for a in assignments)
        assert task.status == "assigned"

    def test_skips_when_no_matching_member(self, db_session):
        room = _make_room(db_session)
        # Member has BE_DEV slot, but prompt is about frontend
        _make_member(db_session, room.id, "mem_be", "user_be", job_slot="BE_DEV", is_online=True)
        task = _make_task(db_session, room.id, prompt="프론트엔드 React 컴포넌트")

        assignments = auto_match_and_assign(db_session, task)
        # No FE_DEV member available => no assignment for that job
        fe_assignments = [a for a in assignments if a.job_type == "FE_DEV"]
        assert len(fe_assignments) == 0

    def test_skips_offline_member(self, db_session):
        room = _make_room(db_session)
        _make_member(db_session, room.id, "mem_off", "user_off", job_slot="FE_DEV", is_online=False)
        task = _make_task(db_session, room.id, prompt="프론트엔드 React")

        assignments = auto_match_and_assign(db_session, task)
        assert len(assignments) == 0
        assert task.status == "pending"  # not changed since no assignments

    def test_no_match_returns_empty(self, db_session):
        room = _make_room(db_session)
        _make_member(db_session, room.id, "mem_any", "user_any", is_online=True)
        task = _make_task(db_session, room.id, prompt="xyzzy gibberish")

        assignments = auto_match_and_assign(db_session, task)
        assert assignments == []
        assert task.status == "pending"

    def test_top_n_limits_assignments(self, db_session):
        room = _make_room(db_session)
        # Create members for multiple job slots
        _make_member(db_session, room.id, "mem_f1", "u_f1", job_slot="FE_DEV", is_online=True)
        _make_member(db_session, room.id, "mem_b1", "u_b1", job_slot="BE_DEV", is_online=True)
        _make_member(db_session, room.id, "mem_q1", "u_q1", job_slot="QA", is_online=True)
        _make_member(db_session, room.id, "mem_d1", "u_d1", job_slot="DEVOPS", is_online=True)
        task = _make_task(db_session, room.id, prompt="프론트 백엔드 테스트 배포 devops frontend backend QA")

        assignments = auto_match_and_assign(db_session, task, top_n=2)
        assert len(assignments) <= 2

    def test_uses_title_and_description(self, db_session):
        room = _make_room(db_session)
        _make_member(db_session, room.id, "mem_td", "u_td", job_slot="QA", is_online=True)
        # No prompt, but title + description contain keywords
        task = Task(
            id="task_td", room_id=room.id,
            title="테스트 작성", description="품질 검증 버그 수정",
            prompt="", status="pending",
        )
        db_session.add(task)
        db_session.commit()

        assignments = auto_match_and_assign(db_session, task)
        assert len(assignments) >= 1
        assert any(a.job_type == "QA" for a in assignments)

    def test_multiple_members_same_slot_picks_first(self, db_session):
        room = _make_room(db_session)
        m1 = _make_member(db_session, room.id, "mem_a1", "u_a1", job_slot="FE_DEV", is_online=True)
        m2 = _make_member(db_session, room.id, "mem_a2", "u_a2", job_slot="FE_DEV", is_online=True)
        task = _make_task(db_session, room.id, prompt="프론트엔드 React")

        assignments = auto_match_and_assign(db_session, task)
        fe_assignments = [a for a in assignments if a.job_type == "FE_DEV"]
        assert len(fe_assignments) == 1  # Only one assignment per job type
        assert fe_assignments[0].member_id in (m1.id, m2.id)


class TestReassignTask:
    """reassign_task() — manual assignment and reassignment."""

    def test_new_assignment(self, db_session):
        room = _make_room(db_session, room_id="room_ra")
        member = _make_member(db_session, "room_ra", "mem_ra", "user_ra")
        task = _make_task(db_session, "room_ra", task_id="task_ra")

        assignment = reassign_task(db_session, task, member.id, "FE_DEV")
        assert assignment.member_id == member.id
        assert assignment.job_type == "FE_DEV"
        assert assignment.status == "assigned"
        assert task.status == "assigned"

    def test_reassign_overwrites_existing(self, db_session):
        room = _make_room(db_session, room_id="room_ro")
        m1 = _make_member(db_session, "room_ro", "mem_ro1", "user_ro1")
        m2 = _make_member(db_session, "room_ro", "mem_ro2", "user_ro2")
        task = _make_task(db_session, "room_ro", task_id="task_ro")

        a1 = reassign_task(db_session, task, m1.id, "BE_DEV")
        a2 = reassign_task(db_session, task, m2.id, "BE_DEV")

        # Same assignment object should be reused (same job_type)
        assert a1.id == a2.id
        assert a2.member_id == m2.id
        assert a2.status == "assigned"

    def test_different_job_types_create_separate(self, db_session):
        room = _make_room(db_session, room_id="room_dj")
        member = _make_member(db_session, "room_dj", "mem_dj", "user_dj")
        task = _make_task(db_session, "room_dj", task_id="task_dj")

        a1 = reassign_task(db_session, task, member.id, "FE_DEV")
        a2 = reassign_task(db_session, task, member.id, "QA")

        assert a1.id != a2.id
        assert a1.job_type == "FE_DEV"
        assert a2.job_type == "QA"

    def test_reassign_resets_completed_at(self, db_session):
        room = _make_room(db_session, room_id="room_rc")
        member = _make_member(db_session, "room_rc", "mem_rc", "user_rc")
        task = _make_task(db_session, "room_rc", task_id="task_rc")

        a = reassign_task(db_session, task, member.id, "PM")
        # Simulate completion
        from datetime import datetime, timezone
        a.status = "completed"
        a.completed_at = datetime.now(timezone.utc)
        db_session.commit()

        # Reassign — should reset
        a2 = reassign_task(db_session, task, member.id, "PM")
        assert a2.status == "assigned"
        assert a2.completed_at is None


# ═══════════════════════════════════════════════════════
# Endpoint Integration Tests
# ═══════════════════════════════════════════════════════


class TestTaskCRUDEndpoints:
    """POST/GET /api/rooms/{room_id}/tasks, GET/POST /api/tasks/{task_id}/*."""

    def test_create_and_get_task(self, client):
        room_id, _, member_id = _create_room_via_api(client)

        resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Implement search",
            "description": "Full-text search feature",
            "prompt": "Build a search index",
            "priority": 1,
            "created_by": member_id,
        })
        assert resp.status_code == 200
        task_id = resp.json()["task"]["id"]

        detail = client.get(f"/api/tasks/{task_id}")
        assert detail.status_code == 200
        t = detail.json()["task"]
        assert t["title"] == "Implement search"
        assert t["priority"] == 1

    def test_list_tasks_with_status_filter(self, client):
        room_id, _, _ = _create_room_via_api(client)

        r1 = client.post(f"/api/rooms/{room_id}/tasks", json={"title": "A"})
        r2 = client.post(f"/api/rooms/{room_id}/tasks", json={"title": "B"})
        client.post(f"/api/tasks/{r1.json()['task']['id']}/complete")

        pending = client.get(f"/api/rooms/{room_id}/tasks", params={"status": "pending"})
        assert pending.status_code == 200
        assert pending.json()["total"] == 1

        completed = client.get(f"/api/rooms/{room_id}/tasks", params={"status": "completed"})
        assert completed.json()["total"] == 1

    def test_assign_and_complete(self, client):
        room_id, code, member_id = _create_room_via_api(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={"title": "Quick task"})
        task_id = task_resp.json()["task"]["id"]

        # Assign
        assign_resp = client.post(f"/api/tasks/{task_id}/assign", json={
            "member_id": member_id,
            "job_type": "PM",
        })
        assert assign_resp.status_code == 200
        assert assign_resp.json()["assignment"]["job_type"] == "PM"

        # Complete
        complete_resp = client.post(f"/api/tasks/{task_id}/complete")
        assert complete_resp.status_code == 200
        task = complete_resp.json()["task"]
        assert task["status"] == "completed"
        assert all(a["status"] == "completed" for a in task["assignments"])

    def test_cancel_with_assignments(self, client):
        room_id, _, member_id = _create_room_via_api(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={"title": "Cancel me"})
        task_id = task_resp.json()["task"]["id"]

        client.post(f"/api/tasks/{task_id}/assign", json={
            "member_id": member_id,
            "job_type": "QA",
        })

        cancel_resp = client.post(f"/api/tasks/{task_id}/cancel")
        assert cancel_resp.status_code == 200
        task = cancel_resp.json()["task"]
        assert task["status"] == "failed"
        assert all(a["status"] == "failed" for a in task["assignments"])

    def test_auto_match_with_online_member(self, client, db_session):
        room_id, _, member_id = _create_room_via_api(client)

        # Set member's job_slot to BE_DEV
        member = db_session.query(Member).filter(Member.id == member_id).first()
        member.job_slot = "BE_DEV"
        member.is_online = True
        db_session.commit()

        resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "백엔드 API 서버 개발",
            "prompt": "REST API endpoint database CRUD backend",
        })
        assert resp.status_code == 200
        task = resp.json()["task"]
        assigned_members = [a["member_id"] for a in task["assignments"]]
        assert member_id in assigned_members

    def test_auto_match_no_fallback_fk_error(self, client):
        """When no matching member exists, auto-match should NOT create __ai_fallback__ rows."""
        room_id, _, _ = _create_room_via_api(client)

        # Prompt with keywords, but no member has matching job_slot
        resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Build React frontend with Docker deploy",
            "prompt": "프론트엔드 React component CSS 배포 docker",
        })
        # Should succeed (no FK error) even though no matching members
        assert resp.status_code == 200
        task = resp.json()["task"]
        # Assignments should only contain real members (not __ai_fallback__)
        for a in task["assignments"]:
            assert a["member_id"] != "__ai_fallback__"


class TestJobDefinitionsEndpoint:
    def test_list_definitions_seeded(self, client, db_session):
        _seed_jobs(db_session)

        resp = client.get("/api/town/job-definitions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 25
        assert len(data["jobs"]) == 25
        job = data["jobs"][0]
        for field in ("id", "name", "description", "icon", "category", "required_level"):
            assert field in job

    def test_list_definitions_empty_db(self, client):
        resp = client.get("/api/town/job-definitions")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestJobMatchEndpoint:
    def test_match_korean_prompt(self, client):
        resp = client.get("/api/town/job-match", params={
            "prompt": "프론트엔드 React 컴포넌트 CSS 레이아웃",
        })
        assert resp.status_code == 200
        matches = resp.json()["matches"]
        assert len(matches) >= 1
        assert "FE_DEV" in [m["id"] for m in matches]

    def test_match_english_prompt(self, client):
        resp = client.get("/api/town/job-match", params={
            "prompt": "REST API endpoint server database",
        })
        assert resp.status_code == 200
        ids = [m["id"] for m in resp.json()["matches"]]
        assert any(jid in ids for jid in ["BE_DEV", "API_DEV"])

    def test_match_top_n(self, client):
        resp = client.get("/api/town/job-match", params={
            "prompt": "프론트 백엔드 테스트 배포 보안 AI 문서",
            "top_n": 3,
        })
        assert resp.status_code == 200
        assert len(resp.json()["matches"]) <= 3

    def test_match_empty_returns_422(self, client):
        resp = client.get("/api/town/job-match")
        assert resp.status_code == 422

    def test_match_response_structure(self, client):
        resp = client.get("/api/town/job-match", params={"prompt": "데이터 분석 머신러닝"})
        assert resp.status_code == 200
        data = resp.json()
        assert "matches" in data
        assert "total" in data
        if data["matches"]:
            m = data["matches"][0]
            assert "id" in m
            assert "name_ko" in m
            assert "name_en" in m
            assert "score" in m
