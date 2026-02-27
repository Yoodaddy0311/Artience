from pydantic import BaseModel


class RecipeCreate(BaseModel):
    id: str | None = None
    name: str
    description: str = ""
    command: str
    args: list[str] = []
    cwd: str = ""


class RecipeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    command: str | None = None
    args: list[str] | None = None
    cwd: str | None = None
