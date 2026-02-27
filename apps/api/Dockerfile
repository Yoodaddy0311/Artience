# ── Stage 1: builder ─────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: runtime ────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Install only runtime system deps (curl for healthcheck, libpq5 for psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built Python packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Create non-root user and data directory
RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser \
    && mkdir -p /app/data /app/cloudsql \
    && chown -R appuser:appuser /app

USER appuser

# Cloud Run uses PORT env (default 8080); docker-compose can override to 8000
ENV PORT=8080
# Use /app/data/public for file storage in production (not the dev desktop path)
ENV PUBLIC_DIR=/app/data/public

EXPOSE ${PORT}

# Health check using the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Production: entrypoint runs Alembic migrations then starts gunicorn
# Development (docker-compose): override CMD to use uvicorn directly
CMD ["bash", "entrypoint.sh"]
