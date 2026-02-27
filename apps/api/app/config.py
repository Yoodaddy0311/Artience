"""Application path configuration.

In development, file paths resolve relative to the monorepo layout
(../desktop/public). In production (Docker), paths use /app/data as
the base, configurable via the PUBLIC_DIR environment variable.
"""

import os
from pathlib import Path

_default_public = Path(__file__).parent.parent.parent / "desktop" / "public"

PUBLIC_DIR = Path(os.getenv("PUBLIC_DIR", str(_default_public)))
UPLOAD_DIR = PUBLIC_DIR / "assets" / "uploads"
THUMBNAIL_DIR = UPLOAD_DIR / "thumbnails"
ARTIFACTS_DIR = PUBLIC_DIR / "artifacts"
GENERATED_DIR = PUBLIC_DIR / "generated"
HISTORY_DIR = PUBLIC_DIR / "history"
PROJECT_JSON_PATH = PUBLIC_DIR / "project.json"

# Create directories at import time (only creates what's possible)
for _d in [UPLOAD_DIR, THUMBNAIL_DIR, ARTIFACTS_DIR, GENERATED_DIR, HISTORY_DIR]:
    _d.mkdir(parents=True, exist_ok=True)
