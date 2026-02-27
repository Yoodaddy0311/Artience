"""Shared test fixtures for the Dokba Studio API test suite.

Provides:
- An in-memory SQLite database for test isolation
- A FastAPI TestClient wired to use the test database
- DB session fixtures for direct ORM access in tests
"""

import os
import sys
from pathlib import Path
from unittest.mock import patch

# Disable rate limiting during tests by setting a very high limit
os.environ.setdefault("DOKBA_RATE_LIMIT_GENERAL", "9999")
os.environ.setdefault("DOKBA_RATE_LIMIT_GENERATE", "9999")
os.environ.setdefault("DOKBA_RATE_LIMIT_WS", "9999")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure the api package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import Base, get_db
from app.main import app

# Import all models so Base.metadata knows about them
from app.models import Project, Job  # noqa: F401
from app.models.recipe import Recipe  # noqa: F401
from app.models.room import Room, Member, Character  # noqa: F401
from app.models.task import Task, Assignment  # noqa: F401
from app.models.job_definition import JobDefinition, SEED_JOB_DEFINITIONS  # noqa: F401
from app.models.ranking import WeeklyScore, Achievement, UserAchievement, SEED_ACHIEVEMENTS  # noqa: F401


# ── In-memory test database ───────────────────────────────────────────
# Use StaticPool + check_same_thread=False so all connections share the
# same in-memory database (SQLite in-memory DBs are per-connection by default).

_test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Enable foreign key enforcement in SQLite (required for ON DELETE CASCADE).
from sqlalchemy import event as _sa_event

@_sa_event.listens_for(_test_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

TestSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=_test_engine
)


def _override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture()
def db_session():
    """Provide a clean DB session for tests that need direct ORM access."""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """Provide a TestClient with auth disabled and test DB wired in."""
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.middleware.auth._API_KEY", None):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


# ── Dokba Town Fixtures ──────────────────────────────────────────────

@pytest.fixture()
def seed_job_definitions(db_session):
    """Populate the job_definitions table with 25 seed jobs."""
    for jd in SEED_JOB_DEFINITIONS:
        db_session.add(JobDefinition(**jd))
    db_session.commit()
    return SEED_JOB_DEFINITIONS


@pytest.fixture()
def sample_room(db_session):
    """Create a sample Room and return it."""
    room = Room(
        id="room_test01",
        name="Test Town",
        owner_id="user_cto",
        code="ABC123",
    )
    db_session.add(room)
    db_session.commit()
    return room


@pytest.fixture()
def sample_member(db_session, sample_room):
    """Create a sample Member joined to sample_room."""
    member = Member(
        id="mem_test01",
        room_id=sample_room.id,
        user_id="user_cto",
        character_name="CTO Player",
        character_role="CTO",
        is_online=True,
    )
    db_session.add(member)
    db_session.commit()
    return member


@pytest.fixture()
def seed_achievements(db_session):
    """Populate the achievements table with seed data."""
    for ach in SEED_ACHIEVEMENTS:
        db_session.add(Achievement(**ach))
    db_session.commit()
    return SEED_ACHIEVEMENTS


@pytest.fixture()
def sample_task(db_session, sample_room, sample_member):
    """Create a sample Task in sample_room."""
    task = Task(
        id="task_test01",
        room_id=sample_room.id,
        title="Implement login page",
        description="Build the login form with email/password validation",
        prompt="Implement a login page with form validation using React Hook Form",
        status="pending",
        priority=1,
        created_by=sample_member.id,
    )
    db_session.add(task)
    db_session.commit()
    return task
