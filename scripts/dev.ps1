Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps\api; .\venv\Scripts\Activate.ps1; python -m uvicorn app.main:app --port 8742 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps\desktop; pnpm run dev"
