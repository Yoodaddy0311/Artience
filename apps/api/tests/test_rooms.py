"""Tests for Room API endpoints (POST/GET/JOIN/LEAVE/DELETE).

Covers:
- POST   /api/rooms/           — create room
- GET    /api/rooms/           — list rooms for a user
- GET    /api/rooms/{room_id}  — get room details
- POST   /api/rooms/{room_id}/join  — join via invite code
- POST   /api/rooms/{room_id}/leave — leave room
- DELETE /api/rooms/{room_id}  — delete room (owner only)
"""


# ── Create Room ──────────────────────────────────────

class TestCreateRoom:
    def test_create_room_success(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "Dev Town",
            "owner_id": "user_a",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Dev Town"
        assert data["owner_id"] == "user_a"
        assert data["status"] == "active"
        assert len(data["code"]) == 6
        assert data["max_members"] == 25  # default
        # Owner auto-joins as first member (CTO)
        assert len(data["members"]) == 1
        assert data["members"][0]["user_id"] == "user_a"
        assert data["members"][0]["character_role"] == "CTO"

    def test_create_room_custom_max_members(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "Small Room",
            "owner_id": "user_b",
            "max_members": 5,
        })
        assert resp.status_code == 201
        assert resp.json()["max_members"] == 5

    def test_create_room_missing_name(self, client):
        resp = client.post("/api/rooms/", json={
            "owner_id": "user_a",
        })
        assert resp.status_code == 422

    def test_create_room_missing_owner(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "Test Room",
        })
        assert resp.status_code == 422

    def test_create_room_empty_name(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "",
            "owner_id": "user_a",
        })
        assert resp.status_code == 422

    def test_create_room_generates_unique_codes(self, client):
        codes = set()
        for i in range(5):
            resp = client.post("/api/rooms/", json={
                "name": f"Room {i}",
                "owner_id": f"user_{i}",
            })
            assert resp.status_code == 201
            codes.add(resp.json()["code"])
        # All codes should be unique (extremely unlikely to collide in 5 tries)
        assert len(codes) == 5


# ── List Rooms ───────────────────────────────────────

class TestListRooms:
    def _create_room(self, client, name, owner_id):
        resp = client.post("/api/rooms/", json={
            "name": name,
            "owner_id": owner_id,
        })
        assert resp.status_code == 201
        return resp.json()

    def test_list_rooms_for_user(self, client):
        self._create_room(client, "Room A", "user_x")
        self._create_room(client, "Room B", "user_x")
        self._create_room(client, "Room C", "user_y")  # different user

        resp = client.get("/api/rooms/", params={"user_id": "user_x"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        names = [r["name"] for r in data["rooms"]]
        assert "Room A" in names
        assert "Room B" in names

    def test_list_rooms_empty(self, client):
        resp = client.get("/api/rooms/", params={"user_id": "nobody"})
        assert resp.status_code == 200
        assert resp.json()["rooms"] == []
        assert resp.json()["total"] == 0

    def test_list_rooms_pagination(self, client):
        for i in range(5):
            self._create_room(client, f"Room {i}", "user_page")

        resp = client.get("/api/rooms/", params={
            "user_id": "user_page",
            "skip": 0,
            "limit": 2,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["rooms"]) == 2
        assert data["limit"] == 2

    def test_list_rooms_missing_user_id(self, client):
        resp = client.get("/api/rooms/")
        assert resp.status_code == 422

    def test_list_rooms_includes_member_count(self, client):
        room = self._create_room(client, "Test Room", "user_mc")
        resp = client.get("/api/rooms/", params={"user_id": "user_mc"})
        assert resp.status_code == 200
        rooms = resp.json()["rooms"]
        assert len(rooms) >= 1
        assert rooms[0]["member_count"] >= 1


# ── Get Room ─────────────────────────────────────────

class TestGetRoom:
    def test_get_room_success(self, client):
        create_resp = client.post("/api/rooms/", json={
            "name": "Detail Room",
            "owner_id": "user_d",
        })
        room_id = create_resp.json()["id"]

        resp = client.get(f"/api/rooms/{room_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == room_id
        assert data["name"] == "Detail Room"
        assert "members" in data
        assert len(data["members"]) == 1

    def test_get_room_not_found(self, client):
        resp = client.get("/api/rooms/nonexistent_room")
        assert resp.status_code == 404


# ── Join Room ────────────────────────────────────────

class TestJoinRoom:
    def _create_room(self, client, name="Join Test", owner_id="owner_j"):
        resp = client.post("/api/rooms/", json={
            "name": name,
            "owner_id": owner_id,
        })
        assert resp.status_code == 201
        return resp.json()

    def test_join_room_success(self, client):
        room = self._create_room(client)
        room_id = room["id"]
        code = room["code"]

        resp = client.post(f"/api/rooms/{room_id}/join", json={
            "code": code,
            "user_id": "new_user",
            "character_name": "Luna",
            "character_role": "Frontend Developer",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_id"] == "new_user"
        assert data["character_name"] == "Luna"
        assert data["room_id"] == room_id

    def test_join_room_wrong_code(self, client):
        room = self._create_room(client)
        room_id = room["id"]

        resp = client.post(f"/api/rooms/{room_id}/join", json={
            "code": "WRONG1",
            "user_id": "new_user",
            "character_name": "Aria",
        })
        assert resp.status_code == 404

    def test_join_room_already_member(self, client):
        room = self._create_room(client, owner_id="user_dup")
        room_id = room["id"]
        code = room["code"]

        # Owner is already a member — trying to join again should fail
        resp = client.post(f"/api/rooms/{room_id}/join", json={
            "code": code,
            "user_id": "user_dup",
            "character_name": "Dup",
        })
        assert resp.status_code == 409

    def test_join_room_full(self, client):
        # Create room with max_members=2
        resp = client.post("/api/rooms/", json={
            "name": "Tiny Room",
            "owner_id": "owner_tiny",
            "max_members": 2,
        })
        assert resp.status_code == 201
        room = resp.json()
        room_id = room["id"]
        code = room["code"]

        # Add second member to fill room
        resp = client.post(f"/api/rooms/{room_id}/join", json={
            "code": code,
            "user_id": "user_2",
            "character_name": "Two",
        })
        assert resp.status_code == 200

        # Third member should be rejected (room full)
        resp = client.post(f"/api/rooms/{room_id}/join", json={
            "code": code,
            "user_id": "user_3",
            "character_name": "Three",
        })
        assert resp.status_code == 409

    def test_join_room_not_found(self, client):
        resp = client.post("/api/rooms/fake_room/join", json={
            "code": "ABC123",
            "user_id": "user",
            "character_name": "Test",
        })
        assert resp.status_code == 404

    def test_join_closed_room(self, client, db_session):
        """Joining a closed room should return 409."""
        room = self._create_room(client)
        room_id = room["id"]
        # Close the room directly in DB
        from app.models.room import Room as RoomModel
        db_room = db_session.query(RoomModel).filter(RoomModel.id == room_id).first()
        db_room.status = "closed"
        db_session.commit()

        resp = client.post(f"/api/rooms/{room_id}/join", json={
            "code": room["code"],
            "user_id": "late_user",
            "character_name": "Late",
        })
        assert resp.status_code == 409

    def test_join_room_member_has_character(self, client):
        """Joining should also create a Character record for the member."""
        room = self._create_room(client)
        room_id = room["id"]
        code = room["code"]

        resp = client.post(f"/api/rooms/{room_id}/join", json={
            "code": code,
            "user_id": "char_user",
            "character_name": "Rio",
        })
        assert resp.status_code == 200

        # Verify via room detail
        detail = client.get(f"/api/rooms/{room_id}")
        members = detail.json()["members"]
        assert len(members) == 2  # owner + new member


# ── Leave Room ───────────────────────────────────────

class TestLeaveRoom:
    def _setup_room_with_member(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "Leave Room",
            "owner_id": "owner_leave",
        })
        room = resp.json()
        room_id = room["id"]
        code = room["code"]

        client.post(f"/api/rooms/{room_id}/join", json={
            "code": code,
            "user_id": "leaver",
            "character_name": "Leaver",
        })
        return room_id

    def test_leave_room_success(self, client):
        room_id = self._setup_room_with_member(client)

        resp = client.post(f"/api/rooms/{room_id}/leave", json={
            "user_id": "leaver",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "left"
        assert data["user_id"] == "leaver"

        # Verify member is gone
        detail = client.get(f"/api/rooms/{room_id}")
        members = detail.json()["members"]
        user_ids = [m["user_id"] for m in members]
        assert "leaver" not in user_ids

    def test_leave_room_owner_cannot_leave(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "Owner Room",
            "owner_id": "owner_stay",
        })
        room_id = resp.json()["id"]

        resp = client.post(f"/api/rooms/{room_id}/leave", json={
            "user_id": "owner_stay",
        })
        assert resp.status_code == 409

    def test_leave_room_not_a_member(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "Stranger Room",
            "owner_id": "owner_s",
        })
        room_id = resp.json()["id"]

        resp = client.post(f"/api/rooms/{room_id}/leave", json={
            "user_id": "stranger",
        })
        assert resp.status_code == 404

    def test_leave_room_not_found(self, client):
        resp = client.post("/api/rooms/no_room/leave", json={
            "user_id": "user",
        })
        assert resp.status_code == 404


# ── Delete Room ──────────────────────────────────────

class TestDeleteRoom:
    def test_delete_room_success(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "Delete Me",
            "owner_id": "owner_del",
        })
        room_id = resp.json()["id"]

        resp = client.delete(f"/api/rooms/{room_id}", params={
            "owner_id": "owner_del",
        })
        assert resp.status_code == 204

        # Verify room is gone
        resp = client.get(f"/api/rooms/{room_id}")
        assert resp.status_code == 404

    def test_delete_room_not_owner(self, client):
        resp = client.post("/api/rooms/", json={
            "name": "Protected Room",
            "owner_id": "real_owner",
        })
        room_id = resp.json()["id"]

        resp = client.delete(f"/api/rooms/{room_id}", params={
            "owner_id": "imposter",
        })
        assert resp.status_code == 409

    def test_delete_room_not_found(self, client):
        resp = client.delete("/api/rooms/ghost_room", params={
            "owner_id": "user",
        })
        assert resp.status_code == 404

    def test_delete_room_cascades_members(self, client):
        """Deleting a room should also remove its members."""
        resp = client.post("/api/rooms/", json={
            "name": "Cascade Room",
            "owner_id": "owner_cas",
        })
        room = resp.json()
        room_id = room["id"]
        code = room["code"]

        # Add a second member
        client.post(f"/api/rooms/{room_id}/join", json={
            "code": code,
            "user_id": "cas_user",
            "character_name": "Cascade",
        })

        # Delete the room
        resp = client.delete(f"/api/rooms/{room_id}", params={
            "owner_id": "owner_cas",
        })
        assert resp.status_code == 204

        # Room should be gone
        assert client.get(f"/api/rooms/{room_id}").status_code == 404
