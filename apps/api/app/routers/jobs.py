from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import asyncio
import uuid
import time

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# ── Models ──────────────────────────────────────────────
class RecipeModel(BaseModel):
    id: str
    name: str
    description: str
    command: str
    args: list[str] = []
    cwd: str = ""

class JobModel(BaseModel):
    id: str
    recipe_id: str
    recipe_name: str
    assigned_agent_id: str
    state: str  # QUEUED | RUNNING | SUCCESS | ERROR | CANCELED
    started_at: Optional[float] = None
    ended_at: Optional[float] = None
    exit_code: Optional[int] = None

# ── In-memory store ─────────────────────────────────────
jobs_store: dict[str, dict] = {}

DEMO_RECIPES = [
    {"id": "r01", "name": "Node 버전 확인", "description": "node -v (데모)", "command": "node", "args": ["-v"], "cwd": ""},
    {"id": "r02", "name": "디렉토리 목록", "description": "dir 실행", "command": "cmd", "args": ["/c", "dir"], "cwd": ""},
    {"id": "r03", "name": "Git 상태", "description": "git status", "command": "git", "args": ["status"], "cwd": ""},
    {"id": "r04", "name": "Python 버전", "description": "python --version", "command": "python", "args": ["--version"], "cwd": ""},
    {"id": "r05", "name": "NPM 의존성 확인", "description": "npm ls --depth=0", "command": "npm", "args": ["ls", "--depth=0"], "cwd": ""},
]

# ── Endpoints ───────────────────────────────────────────
@router.get("/recipes")
def list_recipes():
    return {"recipes": DEMO_RECIPES}

@router.get("/")
def list_jobs():
    return {"jobs": list(jobs_store.values())}

@router.post("/run")
async def run_job(recipe_id: str, agent_id: str = "a01"):
    recipe = next((r for r in DEMO_RECIPES if r["id"] == recipe_id), None)
    if not recipe:
        return {"error": "Recipe not found"}

    job_id = f"job_{uuid.uuid4().hex[:8]}"
    job = {
        "id": job_id,
        "recipe_id": recipe_id,
        "recipe_name": recipe["name"],
        "assigned_agent_id": agent_id,
        "state": "QUEUED",
        "started_at": None,
        "ended_at": None,
        "exit_code": None,
        "logs": [],
    }
    jobs_store[job_id] = job

    # Simulate job execution in background
    asyncio.create_task(_execute_job(job_id, recipe))
    return {"job": job}

@router.post("/stop")
def stop_job(job_id: str):
    if job_id in jobs_store:
        job = jobs_store[job_id]
        if "_process" in job:
            try:
                job["_process"].terminate()
            except Exception:
                pass
        
        job["state"] = "CANCELED"
        job["ended_at"] = time.time()
        
        # Broadcast the cancellation to update the UI immediately
        from app.routers.ws import manager
        import asyncio
        
        # Create a background task for the broadcast since we are in a sync endpoint
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(manager.broadcast({"type": "JOB_UPDATE", "job": job}))
        except RuntimeError:
            pass # No running event loop
            
        return {"job": job}
    return {"error": "Job not found"}

@router.get("/{job_id}")
def get_job(job_id: str):
    if job_id in jobs_store:
        return {"job": jobs_store[job_id]}
    return {"error": "Job not found"}

# ── Execution ───────────────────────────────────────────
async def _execute_job(job_id: str, recipe: dict):
    from app.routers.ws import manager  # lazy import to avoid circular
    import subprocess
    import threading

    job = jobs_store[job_id]
    job["state"] = "RUNNING"
    job["started_at"] = time.time()

    # Broadcast initial state change
    await manager.broadcast({
        "type": "AGENT_STATE_CHANGE",
        "agentId": job["assigned_agent_id"],
        "state": "RUNNING"
    })
    await manager.broadcast({"type": "JOB_UPDATE", "job": job})

    cwd = recipe.get("cwd") or None
    command = recipe["command"]
    args = recipe.get("args", [])

    # Construct the full shell command
    full_command = f"{command} {' '.join(args)}"
    
    loop = asyncio.get_running_loop()
    
    try:
        # Use standard subprocess to avoid asyncio NotImplementedError on Windows
        proc = subprocess.Popen(
            full_command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
            text=True,    # Return strings
            bufsize=1,    # Line buffered
            encoding='utf-8',
            errors='replace'
        )
        
        # Save the process reference in case we want to stop it later
        job["_process"] = proc

        def read_stream(stream, stream_name):
            try:
                for line in iter(stream.readline, ''):
                    if not line:
                        break
                    text = line.rstrip()
                    log_entry = {
                        "ts": time.time(),
                        "stream": stream_name,
                        "text": text,
                        "jobId": job_id,
                    }
                    job["logs"].append(log_entry)
                    
                    # Schedule broadcast on the event loop safely
                    async def do_broadcast(t=text, l=log_entry):
                        lower_text = t.lower()
                        if "[think]" in lower_text or "[plan]" in lower_text:
                            await manager.broadcast({"type": "AGENT_STATE_CHANGE", "agentId": job["assigned_agent_id"], "state": "THINKING"})
                        elif "[run]" in lower_text or "[build]" in lower_text or "[exec]" in lower_text:
                            await manager.broadcast({"type": "AGENT_STATE_CHANGE", "agentId": job["assigned_agent_id"], "state": "RUNNING"})
                        await manager.broadcast({"type": "JOB_LOG", "log": l})
                        
                    asyncio.run_coroutine_threadsafe(do_broadcast(), loop)
            except Exception:
                pass

        # Start reader threads
        t_out = threading.Thread(target=read_stream, args=(proc.stdout, "stdout"), daemon=True)
        t_err = threading.Thread(target=read_stream, args=(proc.stderr, "stderr"), daemon=True)
        t_out.start()
        t_err.start()

        # Wait for process and threads to finish without blocking the async loop
        def wait_func():
            code = proc.wait()
            t_out.join(timeout=2)
            t_err.join(timeout=2)
            return code

        exit_code = await asyncio.to_thread(wait_func)
        
        # Canceled jobs should ignore their natural exit code if they were killed
        if job["state"] == "CANCELED":
            exit_code = -1

    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        print(f"Exception starting process: {trace}")
        log_entry = {"ts": time.time(), "stream": "stderr", "text": f"Error starting process: {repr(e)}\n{trace}", "jobId": job_id}
        job["logs"].append(log_entry)
        await manager.broadcast({"type": "JOB_LOG", "log": log_entry})
        exit_code = -1

    # Cleanup the process reference
    job.pop("_process", None)

    # Job completed
    is_success = (exit_code == 0) and (job["state"] != "CANCELED")
    
    if job["state"] != "CANCELED":
        job["state"] = "SUCCESS" if is_success else "ERROR"
        
    job["exit_code"] = exit_code
    job["ended_at"] = time.time()

    await manager.broadcast({
        "type": "AGENT_STATE_CHANGE", 
        "agentId": job["assigned_agent_id"], 
        "state": "SUCCESS" if is_success else "ERROR"
    })
    await manager.broadcast({"type": "JOB_UPDATE", "job": job})

    # Return to IDLE after 1.5s
    await asyncio.sleep(1.5)
    
    # Only reset to IDLE if the state hasn't changed to something else during sleep
    if job["state"] in ["SUCCESS", "ERROR", "CANCELED"]:
        await manager.broadcast({"type": "AGENT_STATE_CHANGE", "agentId": job["assigned_agent_id"], "state": "IDLE"})
