"""Room management endpoints — CRUD, join/leave, member listing."""

import json
import logging

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import ConflictError, NotFoundError
from app.models.room import Character, Member, Room
from app.services.room_service import generate_invite_code

_logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request / Response schemas ────────────────────────


class RoomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    owner_id: str = Field(..., min_length=1, max_length=100)
    max_members: int = Field(25, ge=2, le=50)


class RoomJoin(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)
    user_id: str = Field(..., min_length=1, max_length=100)
    character_name: str = Field(..., min_length=1, max_length=50)
    character_role: str = Field("", max_length=100)


class RoomLeave(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=100)


# ── Helpers ───────────────────────────────────────────


def _room_to_dict(room: Room) -> dict:
    return {
        "id": room.id,
        "name": room.name,
        "owner_id": room.owner_id,
        "code": room.code,
        "max_members": room.max_members,
        "status": room.status,
        "created_at": room.created_at.isoformat() if room.created_at else None,
    }


def _member_to_dict(member: Member) -> dict:
    return {
        "id": member.id,
        "room_id": member.room_id,
        "user_id": member.user_id,
        "character_name": member.character_name,
        "character_role": member.character_role,
        "job_slot": member.job_slot,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "is_online": member.is_online,
    }


def _get_room_or_404(db: Session, room_id: str) -> Room:
    room = db.query(Room).filter(Room.id == room_id).first()
    if room is None:
        raise NotFoundError(
            message=f"Room '{room_id}' not found",
            error_code="room_not_found",
            details={"room_id": room_id},
        )
    return room


# ── Endpoints ─────────────────────────────────────────


@router.post("/", status_code=201)
def create_room(payload: RoomCreate, db: Session = Depends(get_db)):
    """Create a new room. The creator becomes the first member (CTO role)."""
    code = generate_invite_code()
    # Ensure unique invite code
    while db.query(Room).filter(Room.code == code).first():
        code = generate_invite_code()

    room = Room(
        name=payload.name,
        owner_id=payload.owner_id,
        code=code,
        max_members=payload.max_members,
    )
    db.add(room)
    db.flush()  # get room.id

    # Owner joins automatically as CTO
    owner_member = Member(
        room_id=room.id,
        user_id=payload.owner_id,
        character_name=payload.name,  # default name = room name; user can change later
        character_role="CTO",
        job_slot="CTO",
        is_online=True,
    )
    db.add(owner_member)
    db.flush()

    # Create default character for the owner
    character = Character(
        member_id=owner_member.id,
        avatar_config=json.dumps({"sprite": "default", "color": "#4F46E5"}),
    )
    db.add(character)
    db.commit()
    db.refresh(room)

    _logger.info("Room created: %s (code=%s, owner=%s)", room.id, code, payload.owner_id)

    result = _room_to_dict(room)
    result["members"] = [_member_to_dict(owner_member)]
    return result


@router.get("/")
def list_rooms(
    user_id: Optional[str] = Query(None, description="Filter rooms the user belongs to"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List rooms. If user_id is provided, only rooms the user belongs to."""
    base_query = db.query(Room).filter(Room.status == "active")

    if user_id:
        member_room_ids = (
            db.query(Member.room_id)
            .filter(Member.user_id == user_id)
            .scalar_subquery()
        )
        base_query = base_query.filter(Room.id.in_(member_room_ids))

    total = base_query.count()
    rooms = (
        base_query
        .order_by(Room.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    items = []
    for room in rooms:
        d = _room_to_dict(room)
        member_count = db.query(Member).filter(Member.room_id == room.id).count()
        d["member_count"] = member_count
        items.append(d)

    return {"rooms": items, "total": total, "skip": skip, "limit": limit}


@router.get("/{room_id}")
def get_room(room_id: str, db: Session = Depends(get_db)):
    """Get room details including full member list."""
    room = _get_room_or_404(db, room_id)
    members = db.query(Member).filter(Member.room_id == room_id).all()

    result = _room_to_dict(room)
    result["members"] = [_member_to_dict(m) for m in members]
    return result


@router.post("/{room_id}/join")
def join_room(room_id: str, payload: RoomJoin, db: Session = Depends(get_db)):
    """Join a room using an invite code."""
    room = _get_room_or_404(db, room_id)

    if room.code != payload.code:
        raise NotFoundError(
            message="Invalid invite code",
            error_code="invalid_invite_code",
            details={"room_id": room_id},
        )

    if room.status != "active":
        raise ConflictError(
            message="Room is closed",
            error_code="room_closed",
            details={"room_id": room_id},
        )

    # Check if already a member
    existing = (
        db.query(Member)
        .filter(Member.room_id == room_id, Member.user_id == payload.user_id)
        .first()
    )
    if existing:
        raise ConflictError(
            message="Already a member of this room",
            error_code="already_member",
            details={"room_id": room_id, "user_id": payload.user_id},
        )

    # Check capacity
    member_count = db.query(Member).filter(Member.room_id == room_id).count()
    if member_count >= room.max_members:
        raise ConflictError(
            message="Room is full",
            error_code="room_full",
            details={"room_id": room_id, "max_members": room.max_members},
        )

    member = Member(
        room_id=room_id,
        user_id=payload.user_id,
        character_name=payload.character_name,
        character_role=payload.character_role,
        is_online=True,
    )
    db.add(member)
    db.flush()

    character = Character(
        member_id=member.id,
        avatar_config=json.dumps({"sprite": "default", "color": "#10B981"}),
    )
    db.add(character)
    db.commit()
    db.refresh(member)

    _logger.info("User %s joined room %s", payload.user_id, room_id)
    return _member_to_dict(member)


@router.post("/{room_id}/leave")
def leave_room(room_id: str, payload: RoomLeave, db: Session = Depends(get_db)):
    """Leave a room. Owner cannot leave (must delete instead)."""
    room = _get_room_or_404(db, room_id)

    if room.owner_id == payload.user_id:
        raise ConflictError(
            message="Owner cannot leave the room. Delete it instead.",
            error_code="owner_cannot_leave",
            details={"room_id": room_id},
        )

    member = (
        db.query(Member)
        .filter(Member.room_id == room_id, Member.user_id == payload.user_id)
        .first()
    )
    if member is None:
        raise NotFoundError(
            message="Not a member of this room",
            error_code="not_a_member",
            details={"room_id": room_id, "user_id": payload.user_id},
        )

    # Cascade deletes character as well
    db.delete(member)
    db.commit()

    _logger.info("User %s left room %s", payload.user_id, room_id)
    return {"status": "left", "room_id": room_id, "user_id": payload.user_id}


@router.delete("/{room_id}", status_code=204)
def delete_room(
    room_id: str,
    owner_id: str = Query(..., description="Must match room owner"),
    db: Session = Depends(get_db),
):
    """Delete a room (owner only). Cascades to members, characters, tasks, assignments."""
    room = _get_room_or_404(db, room_id)

    if room.owner_id != owner_id:
        raise ConflictError(
            message="Only the room owner can delete this room",
            error_code="not_owner",
            details={"room_id": room_id},
        )

    db.delete(room)
    db.commit()

    _logger.info("Room %s deleted by owner %s", room_id, owner_id)
    return None
