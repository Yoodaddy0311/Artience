from pydantic import BaseModel
from datetime import datetime


class JobResponse(BaseModel):
    id: str
    recipe_id: str
    recipe_name: str
    assigned_agent_id: str | None
    status: str
    command: str
    logs: list
    error: str | None
    exit_code: int | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int
    skip: int
    limit: int
