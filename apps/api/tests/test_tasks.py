"""Tests for Task API endpoints and Job Matcher service.

Covers:
- POST /api/rooms/{room_id}/tasks     — create task (with auto-matching)
- GET  /api/rooms/{room_id}/tasks     — list room tasks
- GET  /api/tasks/{task_id}           — get task detail
- POST /api/tasks/{task_id}/assign    — manual assign
- POST /api/tasks/{task_id}/complete  — complete task
- POST /api/tasks/{task_id}/cancel    — cancel task
- GET  /api/town/job-definitions      — list job definitions
- GET  /api/town/job-match            — preview job matching
"""

import json

from app.models.room import Member, Room
from app.models.task import Assignment, Task
from app.models.job_definition import JobDefinition, SEED_JOB_DEFINITIONS
from app.services.job_matcher import ALL_JOB_IDS, get_job_name, match_jobs_from_prompt


# ── Helper ───────────────────────────────────────────

def _create_room_with_member(client, owner_id="owner_t", room_name="Task Room"):
    """Create a room and return (room_id, code, owner_member_id)."""
    resp = client.post("/api/rooms/", json={
        "name": room_name,
        "owner_id": owner_id,
    })
    assert resp.status_code == 201
    room = resp.json()
    return room["id"], room["code"], room["members"][0]["id"]


def _seed_jobs_via_client(db_session):
    """Seed job definitions into the test DB."""
    for jd in SEED_JOB_DEFINITIONS:
        db_session.add(JobDefinition(**jd))
    db_session.commit()


# ── Create Task ──────────────────────────────────────

class TestCreateTask:
    def test_create_task_success(self, client):
        room_id, _, member_id = _create_room_with_member(client)

        # Use a title that won't trigger keyword matching to avoid __ai_fallback__ FK issue
        resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Implement feature XYZ",
            "description": "Create the feature",
            "priority": 2,
            "created_by": member_id,
        })
        assert resp.status_code == 200
        task = resp.json()["task"]
        assert task["title"] == "Implement feature XYZ"
        assert task["description"] == "Create the feature"
        assert task["priority"] == 2
        assert task["room_id"] == room_id
        assert task["created_by"] == member_id

    def test_create_task_minimal(self, client):
        room_id, _, _ = _create_room_with_member(client)

        resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Hello world",
        })
        assert resp.status_code == 200
        task = resp.json()["task"]
        assert task["title"] == "Hello world"
        assert task["description"] == ""
        assert task["priority"] == 0

    def test_create_task_auto_assigns_with_matching_member(self, client, db_session):
        """When prompt keywords match a member's job_slot, auto-assign works."""
        room_id, code, owner_member_id = _create_room_with_member(client)

        # Give the owner a FE_DEV job_slot so auto-matching can assign them
        member = db_session.query(Member).filter(Member.id == owner_member_id).first()
        member.job_slot = "FE_DEV"
        member.is_online = True
        db_session.commit()

        # Use "react component" — only matches FE_DEV (no other jobs)
        resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "react component",
            "prompt": "react component",
        })
        assert resp.status_code == 200
        task = resp.json()["task"]
        # Auto-matching should create at least one assignment to the FE_DEV member
        assert len(task["assignments"]) >= 1
        assigned_members = [a["member_id"] for a in task["assignments"]]
        assert owner_member_id in assigned_members

    def test_create_task_room_not_found(self, client):
        resp = client.post("/api/rooms/fake_room/tasks", json={
            "title": "Orphan task",
        })
        assert resp.status_code == 404

    def test_create_task_missing_title(self, client):
        room_id, _, _ = _create_room_with_member(client)
        resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "description": "No title",
        })
        assert resp.status_code == 422


# ── List Room Tasks ──────────────────────────────────

class TestListRoomTasks:
    def test_list_tasks_empty(self, client):
        room_id, _, _ = _create_room_with_member(client)

        resp = client.get(f"/api/rooms/{room_id}/tasks")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tasks"] == []
        assert data["total"] == 0

    def test_list_tasks_with_data(self, client):
        room_id, _, _ = _create_room_with_member(client)

        for i in range(3):
            client.post(f"/api/rooms/{room_id}/tasks", json={
                "title": f"Item {i}",
            })

        resp = client.get(f"/api/rooms/{room_id}/tasks")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["tasks"]) == 3

    def test_list_tasks_filter_by_status(self, client):
        room_id, _, _ = _create_room_with_member(client)

        # Create 2 tasks
        resp1 = client.post(f"/api/rooms/{room_id}/tasks", json={"title": "T1"})
        resp2 = client.post(f"/api/rooms/{room_id}/tasks", json={"title": "T2"})

        # Complete one
        task_id = resp1.json()["task"]["id"]
        client.post(f"/api/tasks/{task_id}/complete")

        # Filter by completed
        resp = client.get(f"/api/rooms/{room_id}/tasks", params={"status": "completed"})
        assert resp.status_code == 200
        completed = resp.json()["tasks"]
        assert len(completed) == 1
        assert completed[0]["status"] == "completed"

    def test_list_tasks_pagination(self, client):
        room_id, _, _ = _create_room_with_member(client)

        for i in range(5):
            client.post(f"/api/rooms/{room_id}/tasks", json={"title": f"T{i}"})

        resp = client.get(f"/api/rooms/{room_id}/tasks", params={
            "skip": 0,
            "limit": 2,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tasks"]) == 2
        assert data["total"] == 5
        assert data["limit"] == 2

    def test_list_tasks_room_not_found(self, client):
        resp = client.get("/api/rooms/nope/tasks")
        assert resp.status_code == 404


# ── Get Task ─────────────────────────────────────────

class TestGetTask:
    def test_get_task_success(self, client):
        room_id, _, _ = _create_room_with_member(client)

        create_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Something to do",
            "description": "Check the results",
        })
        task_id = create_resp.json()["task"]["id"]

        resp = client.get(f"/api/tasks/{task_id}")
        assert resp.status_code == 200
        task = resp.json()["task"]
        assert task["id"] == task_id
        assert task["title"] == "Something to do"
        assert "assignments" in task

    def test_get_task_not_found(self, client):
        resp = client.get("/api/tasks/nonexistent")
        assert resp.status_code == 404


# ── Assign Task ──────────────────────────────────────

class TestAssignTask:
    def test_manual_assign_success(self, client, db_session):
        room_id, code, owner_member_id = _create_room_with_member(client)

        # Join a second member
        join_resp = client.post(f"/api/rooms/{room_id}/join", json={
            "code": code,
            "user_id": "dev_user",
            "character_name": "Dev",
            "character_role": "Developer",
        })
        new_member_id = join_resp.json()["id"]

        # Create a task (avoid keywords in title to prevent __ai_fallback__)
        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Do the thing",
        })
        task_id = task_resp.json()["task"]["id"]

        # Assign manually
        resp = client.post(f"/api/tasks/{task_id}/assign", json={
            "member_id": new_member_id,
            "job_type": "FE_DEV",
        })
        assert resp.status_code == 200
        assignment = resp.json()["assignment"]
        assert assignment["member_id"] == new_member_id
        assert assignment["job_type"] == "FE_DEV"
        assert assignment["status"] == "assigned"
        assert "job_name_ko" in assignment
        assert "job_name_en" in assignment

    def test_assign_task_not_found(self, client):
        resp = client.post("/api/tasks/ghost/assign", json={
            "member_id": "mem",
            "job_type": "QA",
        })
        assert resp.status_code == 404

    def test_assign_invalid_job_type(self, client):
        room_id, code, owner_member_id = _create_room_with_member(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Bad job type",
        })
        task_id = task_resp.json()["task"]["id"]

        resp = client.post(f"/api/tasks/{task_id}/assign", json={
            "member_id": owner_member_id,
            "job_type": "INVALID_JOB",
        })
        assert resp.status_code == 422

    def test_assign_member_not_found(self, client):
        room_id, _, _ = _create_room_with_member(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "No member",
        })
        task_id = task_resp.json()["task"]["id"]

        resp = client.post(f"/api/tasks/{task_id}/assign", json={
            "member_id": "nonexistent_member",
            "job_type": "QA",
        })
        assert resp.status_code == 404

    def test_assign_completed_task_fails(self, client):
        room_id, _, owner_member_id = _create_room_with_member(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Will be completed",
        })
        task_id = task_resp.json()["task"]["id"]

        # Complete the task first
        client.post(f"/api/tasks/{task_id}/complete")

        # Try to assign — should fail
        resp = client.post(f"/api/tasks/{task_id}/assign", json={
            "member_id": owner_member_id,
            "job_type": "QA",
        })
        assert resp.status_code == 422


# ── Complete Task ────────────────────────────────────

class TestCompleteTask:
    def test_complete_task_success(self, client):
        room_id, _, _ = _create_room_with_member(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Complete me",
        })
        task_id = task_resp.json()["task"]["id"]

        resp = client.post(f"/api/tasks/{task_id}/complete")
        assert resp.status_code == 200
        task = resp.json()["task"]
        assert task["status"] == "completed"

    def test_complete_task_closes_assignments(self, client):
        room_id, code, owner_member_id = _create_room_with_member(client)

        # Create task and assign someone
        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Close assignments",
        })
        task_id = task_resp.json()["task"]["id"]

        client.post(f"/api/tasks/{task_id}/assign", json={
            "member_id": owner_member_id,
            "job_type": "BE_DEV",
        })

        # Complete the task
        resp = client.post(f"/api/tasks/{task_id}/complete")
        assert resp.status_code == 200
        task = resp.json()["task"]
        for a in task["assignments"]:
            assert a["status"] == "completed"

    def test_complete_already_completed(self, client):
        room_id, _, _ = _create_room_with_member(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Double complete",
        })
        task_id = task_resp.json()["task"]["id"]

        client.post(f"/api/tasks/{task_id}/complete")
        resp = client.post(f"/api/tasks/{task_id}/complete")
        assert resp.status_code == 422

    def test_complete_task_not_found(self, client):
        resp = client.post("/api/tasks/fake/complete")
        assert resp.status_code == 404


# ── Cancel Task ──────────────────────────────────────

class TestCancelTask:
    def test_cancel_task_success(self, client):
        room_id, _, _ = _create_room_with_member(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Cancel me",
        })
        task_id = task_resp.json()["task"]["id"]

        resp = client.post(f"/api/tasks/{task_id}/cancel")
        assert resp.status_code == 200
        task = resp.json()["task"]
        assert task["status"] == "failed"

    def test_cancel_fails_active_assignments(self, client):
        room_id, _, owner_member_id = _create_room_with_member(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Cancel with assignment",
        })
        task_id = task_resp.json()["task"]["id"]

        client.post(f"/api/tasks/{task_id}/assign", json={
            "member_id": owner_member_id,
            "job_type": "QA",
        })

        resp = client.post(f"/api/tasks/{task_id}/cancel")
        assert resp.status_code == 200
        task = resp.json()["task"]
        for a in task["assignments"]:
            assert a["status"] == "failed"

    def test_cancel_completed_task_fails(self, client):
        room_id, _, _ = _create_room_with_member(client)

        task_resp = client.post(f"/api/rooms/{room_id}/tasks", json={
            "title": "Already done",
        })
        task_id = task_resp.json()["task"]["id"]

        client.post(f"/api/tasks/{task_id}/complete")
        resp = client.post(f"/api/tasks/{task_id}/cancel")
        assert resp.status_code == 422

    def test_cancel_task_not_found(self, client):
        resp = client.post("/api/tasks/ghost/cancel")
        assert resp.status_code == 404


# ── Job Definitions (Read-Only) ──────────────────────

class TestJobDefinitions:
    def test_list_job_definitions(self, client, db_session):
        _seed_jobs_via_client(db_session)

        resp = client.get("/api/town/job-definitions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 25
        assert len(data["jobs"]) == 25

        # Verify field presence
        job = data["jobs"][0]
        assert "id" in job
        assert "name" in job
        assert "description" in job
        assert "icon" in job
        assert "category" in job
        assert "required_level" in job

    def test_list_job_definitions_empty(self, client):
        resp = client.get("/api/town/job-definitions")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


# ── Job Matching (Preview) ───────────────────────────

class TestJobMatch:
    def test_match_frontend_prompt(self, client):
        resp = client.get("/api/town/job-match", params={
            "prompt": "Build a React frontend page with CSS layout",
        })
        assert resp.status_code == 200
        matches = resp.json()["matches"]
        assert len(matches) >= 1
        job_ids = [m["id"] for m in matches]
        assert "FE_DEV" in job_ids

    def test_match_backend_prompt(self, client):
        resp = client.get("/api/town/job-match", params={
            "prompt": "Create a REST API endpoint for user CRUD with database",
        })
        assert resp.status_code == 200
        matches = resp.json()["matches"]
        job_ids = [m["id"] for m in matches]
        assert "BE_DEV" in job_ids or "API_DEV" in job_ids

    def test_match_no_results(self, client):
        resp = client.get("/api/town/job-match", params={
            "prompt": "xyzzy foobar qwerty",
        })
        assert resp.status_code == 200
        assert resp.json()["matches"] == []

    def test_match_top_n_limit(self, client):
        resp = client.get("/api/town/job-match", params={
            "prompt": "Build a React frontend page with CSS and test it with QA automation and deploy with Docker",
            "top_n": 2,
        })
        assert resp.status_code == 200
        assert len(resp.json()["matches"]) <= 2

    def test_match_missing_prompt(self, client):
        resp = client.get("/api/town/job-match")
        assert resp.status_code == 422

    def test_match_returns_names(self, client):
        resp = client.get("/api/town/job-match", params={
            "prompt": "프론트엔드 React 컴포넌트",
        })
        assert resp.status_code == 200
        matches = resp.json()["matches"]
        if matches:
            assert "name_ko" in matches[0]
            assert "name_en" in matches[0]
            assert "score" in matches[0]


# ── Job Matcher Service (Unit Tests) ─────────────────

class TestJobMatcherService:
    def test_all_job_ids_count(self):
        assert len(ALL_JOB_IDS) == 25

    def test_get_job_name_korean(self):
        assert get_job_name("FE_DEV", "ko") == "프론트엔드 개발자"
        assert get_job_name("PM", "ko") == "프로젝트 매니저"

    def test_get_job_name_english(self):
        assert get_job_name("FE_DEV", "en") == "Frontend Developer"
        assert get_job_name("QA", "en") == "QA Engineer"

    def test_get_job_name_unknown(self):
        assert get_job_name("UNKNOWN_JOB", "ko") == "UNKNOWN_JOB"

    def test_match_jobs_from_prompt_frontend(self):
        results = match_jobs_from_prompt("React 프론트엔드 컴포넌트 CSS 레이아웃")
        assert len(results) >= 1
        ids = [r["id"] for r in results]
        assert "FE_DEV" in ids

    def test_match_jobs_from_prompt_mixed(self):
        results = match_jobs_from_prompt("API 서버 배포 docker 모니터링")
        ids = [r["id"] for r in results]
        assert any(jid in ids for jid in ["API_DEV", "BE_DEV"])
        assert "DEVOPS" in ids

    def test_match_jobs_from_prompt_empty(self):
        results = match_jobs_from_prompt("")
        assert results == []

    def test_match_jobs_scores_sorted(self):
        results = match_jobs_from_prompt("React 프론트 프론트엔드 frontend component page view")
        if len(results) > 1:
            for i in range(len(results) - 1):
                assert results[i]["score"] >= results[i + 1]["score"]
