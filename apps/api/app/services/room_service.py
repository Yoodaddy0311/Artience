"""Room management service — invite codes, member state, WebSocket notifications."""

import logging
import random
import string
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.room import Member, Room

_logger = logging.getLogger(__name__)

_CODE_CHARS = string.ascii_uppercase + string.digits


def generate_invite_code(length: int = 6) -> str:
    """Generate a random 6-character alphanumeric invite code."""
    return "".join(random.choices(_CODE_CHARS, k=length))


def set_member_online(db: Session, member_id: str, online: bool) -> Optional[Member]:
    """Update a member's online status."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if member:
        member.is_online = online
        db.commit()
        db.refresh(member)
        _logger.info("Member %s is now %s", member_id, "online" if online else "offline")
    return member


def get_online_members(db: Session, room_id: str) -> List[Member]:
    """Return all online members in a room."""
    return (
        db.query(Member)
        .filter(Member.room_id == room_id, Member.is_online == True)  # noqa: E712
        .all()
    )


def get_room_by_code(db: Session, code: str) -> Optional[Room]:
    """Look up a room by its invite code."""
    return db.query(Room).filter(Room.code == code, Room.status == "active").first()
