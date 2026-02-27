#!/bin/bash
set -euo pipefail

# ── Dokba API — Cloud Run Deploy Script ──────────────────────
# Usage: ./deploy.sh [project-id] [region]
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - Artifact Registry repository created
#   - Cloud Run API enabled
#   - Required secrets in Secret Manager

PROJECT_ID="${1:-artitown}"
REGION="${2:-asia-northeast3}"
SERVICE_NAME="dokba-api"
REPO_NAME="artitown-repo"
IMAGE_TAG="latest"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"

echo "=== Dokba API Deploy ==="
echo "  Project:  ${PROJECT_ID}"
echo "  Region:   ${REGION}"
echo "  Image:    ${IMAGE_URI}"
echo ""

# Step 1: Configure Docker for Artifact Registry
echo "[1/3] Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# Step 2: Build and push Docker image
echo "[2/3] Building and pushing Docker image..."
docker build -t "${IMAGE_URI}" .
docker push "${IMAGE_URI}"

# Step 3: Deploy to Cloud Run
echo "[3/3] Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --image="${IMAGE_URI}" \
    --platform=managed \
    --allow-unauthenticated \
    --port=8080 \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --concurrency=80 \
    --timeout=120 \
    --set-env-vars="GCP_PROJECT=${PROJECT_ID},GCS_BUCKET=artitown-assets" \
    --set-secrets="DOKBA_API_KEY=dokba-api-key:latest,GOOGLE_API_KEY=google-api-key:latest,DATABASE_URL=database-url:latest" \
    --add-cloudsql-instances="${PROJECT_ID}:${REGION}:artitown-db"

echo ""
echo "=== Deploy complete ==="
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --project="${PROJECT_ID}" --region="${REGION}" --format="value(status.url)")
echo "  Service URL: ${SERVICE_URL}"
echo "  Health check: ${SERVICE_URL}/api/health"
