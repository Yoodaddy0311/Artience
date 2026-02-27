import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


def _room_id():
    return f"room_{uuid.uuid4().hex[:8]}"


def _member_id():
    return f"mem_{uuid.uuid4().hex[:8]}"


def _char_id():
    return f"chr_{uuid.uuid4().hex[:8]}"


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True, index=True, default=_room_id)
    name = Column(String, nullable=False)
    owner_id = Column(String, nullable=False)  # user_id of the room creator (CTO)
    code = Column(String(6), unique=True, nullable=False, index=True)  # 6-char invite code
    max_members = Column(Integer, default=25)
    status = Column(String, default="active")  # active, closed
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Member(Base):
    __tablename__ = "members"

    id = Column(String, primary_key=True, index=True, default=_member_id)
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, nullable=False)
    character_name = Column(String, nullable=False)
    character_role = Column(String, default="")  # display role
    job_slot = Column(String, nullable=True)  # FK-like reference to job_definitions.id
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    is_online = Column(Boolean, default=False)


class Character(Base):
    __tablename__ = "characters"

    id = Column(String, primary_key=True, index=True, default=_char_id)
    member_id = Column(String, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, unique=True)
    avatar_config = Column(Text, default="{}")  # JSON — sprite, color, accessories
    level = Column(Integer, default=1)
    xp = Column(Integer, default=0)
    coins = Column(Integer, default=0)
    diamonds = Column(Integer, default=0)
