"""Tests for Room-dedicated WebSocket endpoint (/ws/room/{room_id}).

Covers:
- Connection with valid room membership
- Rejection when user is not a member
- Rejection when user_id is missing
- ROOM_MEMBER_JOIN broadcast on connect
- Message relay for ROOM_TASK_CREATED, ROOM_STATUS_UPDATE
- ROOM_CHAT sanitization and broadcast
- Member online status update on connect
"""

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app
from app.models.room import Member, Room

# Re-use conftest's test engine setup
from tests.conftest import TestSessionLocal, _test_engine, _override_get_db


@pytest.fixture(autouse=True)
def _ensure_tables():
    """Create all tables before each test and drop after."""
    Base.metadata.create_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture()
def ws_client():
    """TestClient with auth disabled, test DB, and WS session factory patched."""
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.middleware.auth._API_KEY", None), \
         patch("app.routers.ws._WS_TOKEN", None), \
         patch("app.routers.ws._session_factory", TestSessionLocal):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


def _create_room(client, owner_id="user_ws01"):
    """Create a room via API and return (room_id, invite_code)."""
    resp = client.post("/api/rooms/", json={
        "name": "WS Test Room",
        "owner_id": owner_id,
    })
    assert resp.status_code == 201
    data = resp.json()
    return data["id"], data["code"]


class TestRoomWebSocket:
    """Integration tests for /ws/room/{room_id}."""

    def test_connect_success_receives_join_event(self, ws_client):
        """Connecting as a valid member should receive ROOM_MEMBER_JOIN."""
        room_id, code = _create_room(ws_client, "user_ws01")

        with ws_client.websocket_connect(
            f"/ws/room/{room_id}?user_id=user_ws01"
        ) as ws:
            data = ws.receive_text()
            msg = json.loads(data)
            assert msg["type"] == "ROOM_MEMBER_JOIN"
            assert msg["payload"]["userId"] == "user_ws01"
            assert "characterName" in msg["payload"]
            assert "onlineUsers" in msg["payload"]
            assert "timestamp" in msg

    def test_connect_sets_member_online(self, ws_client):
        """Connecting should set is_online=True in the DB."""
        room_id, code = _create_room(ws_client, "user_online")

        with ws_client.websocket_connect(
            f"/ws/room/{room_id}?user_id=user_online"
        ) as ws:
            ws.receive_text()  # consume JOIN event

            db = TestSessionLocal()
            member = (
                db.query(Member)
                .filter(Member.room_id == room_id, Member.user_id == "user_online")
                .first()
            )
            assert member is not None
            assert member.is_online is True
            db.close()

    def test_reject_non_member(self, ws_client):
        """Non-members should be rejected."""
        room_id, code = _create_room(ws_client, "owner_x")

        with pytest.raises(Exception):
            with ws_client.websocket_connect(
                f"/ws/room/{room_id}?user_id=stranger"
            ) as ws:
                pass

    def test_reject_missing_user_id(self, ws_client):
        """Missing user_id should be rejected."""
        room_id, code = _create_room(ws_client, "owner_y")

        with pytest.raises(Exception):
            with ws_client.websocket_connect(
                f"/ws/room/{room_id}"
            ) as ws:
                pass

    def test_relay_room_task_created(self, ws_client):
        """ROOM_TASK_CREATED messages should be relayed to the room."""
        room_id, code = _create_room(ws_client, "user_task")

        with ws_client.websocket_connect(
            f"/ws/room/{room_id}?user_id=user_task"
        ) as ws:
            ws.receive_text()  # consume JOIN event

            ws.send_text(json.dumps({
                "type": "ROOM_TASK_CREATED",
                "payload": {
                    "taskId": "task_001",
                    "taskTitle": "Build login page",
                },
            }))

            data = ws.receive_text()
            msg = json.loads(data)
            assert msg["type"] == "ROOM_TASK_CREATED"
            assert msg["payload"]["taskId"] == "task_001"
            assert msg["payload"]["userId"] == "user_task"
            assert "timestamp" in msg

    def test_relay_room_status_update(self, ws_client):
        """ROOM_STATUS_UPDATE messages should be relayed."""
        room_id, code = _create_room(ws_client, "user_status")

        with ws_client.websocket_connect(
            f"/ws/room/{room_id}?user_id=user_status"
        ) as ws:
            ws.receive_text()  # consume JOIN event

            ws.send_text(json.dumps({
                "type": "ROOM_STATUS_UPDATE",
                "payload": {"status": "in_progress"},
            }))

            data = ws.receive_text()
            msg = json.loads(data)
            assert msg["type"] == "ROOM_STATUS_UPDATE"
            assert msg["payload"]["status"] == "in_progress"
            assert msg["payload"]["userId"] == "user_status"

    def test_room_chat_sanitization(self, ws_client):
        """ROOM_CHAT messages should have HTML stripped and broadcast as ROOM_STATUS_UPDATE."""
        room_id, code = _create_room(ws_client, "user_chat")

        with ws_client.websocket_connect(
            f"/ws/room/{room_id}?user_id=user_chat"
        ) as ws:
            ws.receive_text()  # consume JOIN event

            ws.send_text(json.dumps({
                "type": "ROOM_CHAT",
                "content": "<script>alert('xss')</script>Hello World",
            }))

            data = ws.receive_text()
            msg = json.loads(data)
            assert msg["type"] == "ROOM_STATUS_UPDATE"
            assert "<script>" not in msg["payload"]["content"]
            assert "Hello World" in msg["payload"]["content"]

    def test_empty_chat_ignored(self, ws_client):
        """Empty ROOM_CHAT messages should be silently ignored."""
        room_id, code = _create_room(ws_client, "user_empty")

        with ws_client.websocket_connect(
            f"/ws/room/{room_id}?user_id=user_empty"
        ) as ws:
            ws.receive_text()  # consume JOIN event

            ws.send_text(json.dumps({
                "type": "ROOM_CHAT",
                "content": "",
            }))

            ws.send_text(json.dumps({
                "type": "ROOM_STATUS_UPDATE",
                "payload": {"check": "alive"},
            }))

            data = ws.receive_text()
            msg = json.loads(data)
            assert msg["type"] == "ROOM_STATUS_UPDATE"
            assert msg["payload"]["check"] == "alive"

    def test_invalid_json_ignored(self, ws_client):
        """Invalid JSON should be silently ignored."""
        room_id, code = _create_room(ws_client, "user_json")

        with ws_client.websocket_connect(
            f"/ws/room/{room_id}?user_id=user_json"
        ) as ws:
            ws.receive_text()  # consume JOIN event

            ws.send_text("not json {{{")

            ws.send_text(json.dumps({
                "type": "ROOM_STATUS_UPDATE",
                "payload": {"ping": "pong"},
            }))

            data = ws.receive_text()
            msg = json.loads(data)
            assert msg["type"] == "ROOM_STATUS_UPDATE"


class TestRoomWsHelpers:
    """Unit tests for room WS helper functions."""

    def test_room_msg_structure(self):
        from app.routers.ws import _room_msg
        msg = _room_msg("ROOM_MEMBER_JOIN", {"userId": "u1"})
        assert msg["type"] == "ROOM_MEMBER_JOIN"
        assert msg["payload"]["userId"] == "u1"
        assert "timestamp" in msg
        assert "T" in msg["timestamp"]

    def test_utc_iso_format(self):
        from app.routers.ws import _utc_iso
        ts = _utc_iso()
        assert "T" in ts
        assert "+" in ts or "Z" in ts or ts.endswith("+00:00")
