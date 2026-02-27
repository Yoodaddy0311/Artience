#!/bin/bash
set -e

# Run Alembic migrations (skip for SQLite / dev mode)
if [ -n "${DATABASE_URL:-}" ] && echo "$DATABASE_URL" | grep -q "^postgresql"; then
    echo "[entrypoint] Running Alembic migrations..."
    python -m alembic upgrade head
    echo "[entrypoint] Migrations complete."
fi

# Start gunicorn
exec gunicorn app.main:app \
    --bind 0.0.0.0:${PORT:-8080} \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers ${GUNICORN_WORKERS:-2} \
    --timeout 120 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile -
