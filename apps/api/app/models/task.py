import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


def _task_id():
    return f"task_{uuid.uuid4().hex[:8]}"


def _assign_id():
    return f"asgn_{uuid.uuid4().hex[:8]}"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, index=True, default=_task_id)
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    prompt = Column(Text, default="")  # AI prompt for task execution
    status = Column(String, default="pending")  # pending, assigned, in_progress, completed, failed
    priority = Column(Integer, default=0)  # 0=normal, 1=high, 2=urgent
    created_by = Column(String, nullable=True)  # member_id of creator
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(String, primary_key=True, index=True, default=_assign_id)
    task_id = Column(String, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(String, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(String, nullable=False)  # one of the 25 job definition IDs
    status = Column(String, default="assigned")  # assigned, in_progress, completed, failed
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    result = Column(Text, default="{}")  # JSON — output data from the assignment
