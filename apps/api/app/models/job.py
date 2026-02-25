from sqlalchemy import Column, String, Text, DateTime, Integer
from sqlalchemy.sql import func
from app.database import Base
import uuid


def generate_uuid():
    return f"job_{uuid.uuid4().hex[:8]}"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, index=True, default=generate_uuid)
    recipe_id = Column(String, nullable=False)
    recipe_name = Column(String, default="")
    assigned_agent_id = Column(String, nullable=True)
    status = Column(String, default="QUEUED")  # QUEUED, RUNNING, SUCCESS, ERROR, STOPPED
    command = Column(String, default="")
    args = Column(Text, default="[]")  # JSON array
    cwd = Column(String, nullable=True)
    logs = Column(Text, default="[]")  # JSON array of log entries
    error = Column(Text, nullable=True)
    exit_code = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    project_id = Column(String, nullable=True)  # optional FK to projects
