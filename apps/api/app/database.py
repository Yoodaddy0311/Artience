"""Database engine and session configuration.

Supports both SQLite (development) and PostgreSQL (production) via the
``DATABASE_URL`` environment variable.

When ``DATABASE_URL`` is not set, falls back to a local SQLite file at
``./data/dogba.db`` (the original development behaviour).
"""

import os
import logging

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

_logger = logging.getLogger(__name__)

# ── Resolve database URL ──────────────────────────────
_DEFAULT_SQLITE_PATH = os.getenv("DOGBA_DB_PATH", "./data/dogba.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DEFAULT_SQLITE_PATH}")

_is_sqlite = DATABASE_URL.startswith("sqlite")

# ── Engine configuration ──────────────────────────────
_engine_kwargs: dict = {}

if _is_sqlite:
    # SQLite: single-threaded check disabled for FastAPI's thread pool
    _dir = os.path.dirname(_DEFAULT_SQLITE_PATH)
    if _dir:
        os.makedirs(_dir, exist_ok=True)
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL: connection pool tuning
    _engine_kwargs.update(
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=300,
    )

engine = create_engine(DATABASE_URL, **_engine_kwargs)

# Enable foreign key enforcement for SQLite (required for ON DELETE CASCADE)
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

_logger.info(
    "Database configured: %s (engine=%s)",
    "SQLite" if _is_sqlite else "PostgreSQL",
    DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL[:50],
)


def is_sqlite() -> bool:
    """Return True if the current database is SQLite."""
    return _is_sqlite


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
