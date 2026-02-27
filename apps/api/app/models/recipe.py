from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    command = Column(String, nullable=False)
    args = Column(Text, default="[]")  # JSON array
    cwd = Column(String, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
