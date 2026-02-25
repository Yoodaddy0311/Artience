from pydantic import BaseModel, Field
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    goals: str = ""
    stack_preset: str = "web_react"
    agent_team: list[str] = []
    settings: dict = {}


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    goals: str | None = None
    stack_preset: str | None = None
    agent_team: list[str] | None = None
    settings: dict | None = None


class ProjectStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(created|active|completed|archived)$")
    progress: int | None = Field(None, ge=0, le=100)


class ProjectResponse(BaseModel):
    id: str
    name: str
    goals: str
    stack_preset: str
    agent_team: list[str]
    settings: dict
    status: str
    progress: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int
    skip: int
    limit: int
