#!/bin/bash
set -euo pipefail
# Dokba Studio — Firebase Hosting Deploy
echo "=== Dokba Studio Web Deploy ==="
cd "$(dirname "$0")"
echo "[1/2] Building web app..."
VITE_API_URL=https://dokba-api-lb4ek5vfnq-du.a.run.app pnpm build
echo "[2/2] Deploying to Firebase Hosting..."
cd ../..  # back to monorepo root where firebase.json is
npx firebase-tools deploy --only hosting --project artitown
echo "=== Deploy complete ==="
echo "  URL: https://artitown.web.app"
