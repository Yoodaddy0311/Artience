#!/bin/bash
echo "Starting DogBa Development Environment..."

function cleanup() {
  echo "Closing environments..."
  kill %1
  kill %2
}
trap cleanup EXIT

# Start API
cd apps/api
if [ ! -d "venv" ]; then
  python -m venv venv
  source venv/Scripts/activate || source venv/bin/activate
  pip install -r requirements.txt
else
  source venv/Scripts/activate || source venv/bin/activate
fi
python -m uvicorn app.main:app --port 8000 --reload &

# Start Vite
cd ../desktop
pnpm run dev &

wait
