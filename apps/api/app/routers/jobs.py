from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional
import asyncio
import json
import time
import uuid

from app.database import get_db, SessionLocal
from app.models.job import Job
from app.schemas.job import JobResponse, JobListResponse
from app.routers.settings import get_run_settings

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# ── Constants ──────────────────────────────────────────
MAX_LOGS_PER_JOB = 500
LOG_FLUSH_INTERVAL = 2.0  # seconds between DB log flushes

DEMO_RECIPES = [
    {"id": "r01", "name": "Node \ubc84\uc804 \ud655\uc778", "description": "node -v (\ub370\ubaa8)", "command": "node", "args": ["-v"], "cwd": ""},
    {"id": "r02", "name": "\ub514\ub809\ud1a0\ub9ac \ubaa9\ub85d", "description": "dir \uc2e4\ud589", "command": "cmd", "args": ["/c", "dir"], "cwd": ""},
    {"id": "r03", "name": "Git \uc0c1\ud0dc", "description": "git status", "command": "git", "args": ["status"], "cwd": ""},
    {"id": "r04", "name": "Python \ubc84\uc804", "description": "python --version", "command": "python", "args": ["--version"], "cwd": ""},
    {"id": "r05", "name": "NPM \uc758\uc874\uc131 \ud655\uc778", "description": "npm ls --depth=0", "command": "npm", "args": ["ls", "--depth=0"], "cwd": ""},
]

# ── In-memory runtime state (not persisted) ───────────
# Tracks running processes and pending log buffers for active jobs only.
# This is intentionally NOT in the DB -- process handles and log buffers
# are ephemeral runtime state that has no meaning after a restart.
_active_jobs: dict[str, dict] = {}


# ── Helpers ────────────────────────────────────────────
def _job_to_dict(job: Job) -> dict:
    """Convert a Job ORM instance to a plain dict for WebSocket broadcasting."""
    return {
        "id": job.id,
        "recipe_id": job.recipe_id,
        "recipe_name": job.recipe_name,
        "assigned_agent_id": job.assigned_agent_id,
        "status": job.status,
        "state": job.status,  # backward compat with frontend expecting "state"
        "command": job.command,
        "logs": json.loads(job.logs) if job.logs else [],
        "error": job.error,
        "exit_code": job.exit_code,
        "started_at": job.started_at.timestamp() if job.started_at else None,
        "completed_at": job.completed_at.timestamp() if job.completed_at else None,
        "ended_at": job.completed_at.timestamp() if job.completed_at else None,  # backward compat
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


def _serialize_logs(logs: list) -> str:
    """Serialize a log list to JSON, trimming to MAX_LOGS_PER_JOB."""
    trimmed = logs[-MAX_LOGS_PER_JOB:] if len(logs) > MAX_LOGS_PER_JOB else logs
    return json.dumps(trimmed)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ── Log verbosity levels (ordered by severity) ────────
_VERBOSITY_LEVELS = {"debug": 0, "info": 1, "warn": 2, "error": 3}


def _should_broadcast_log(log_text: str, stream: str, verbosity: str) -> bool:
    """Decide whether a log entry should be broadcast based on verbosity setting.

    Heuristic: stderr lines are treated as 'error' level, stdout lines are
    checked for common level prefixes (DEBUG, WARN/WARNING, ERROR).
    If no prefix is found, stdout defaults to 'info'.
    """
    min_level = _VERBOSITY_LEVELS.get(verbosity, 1)

    if stream == "stderr":
        log_level = _VERBOSITY_LEVELS["error"]
    else:
        lower = log_text.lower()
        if lower.startswith("debug") or "[debug]" in lower:
            log_level = _VERBOSITY_LEVELS["debug"]
        elif lower.startswith("warn") or "[warn" in lower:
            log_level = _VERBOSITY_LEVELS["warn"]
        elif lower.startswith("error") or "[error]" in lower:
            log_level = _VERBOSITY_LEVELS["error"]
        else:
            log_level = _VERBOSITY_LEVELS["info"]

    return log_level >= min_level


def _count_running_jobs() -> int:
    """Count the number of currently RUNNING jobs in runtime state."""
    return sum(
        1 for rt in _active_jobs.values()
        if rt.get("process") is not None and rt["process"].poll() is None
    )


# ── Endpoints ──────────────────────────────────────────
@router.get("/recipes")
def list_recipes():
    return {"recipes": DEMO_RECIPES}


@router.get("/history")
def list_history(
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Return completed/errored/stopped jobs (most recent first)."""
    completed_statuses = ("SUCCESS", "ERROR", "STOPPED", "CANCELED")
    query = (
        db.query(Job)
        .filter(Job.status.in_(completed_statuses))
        .order_by(Job.completed_at.desc())
    )
    total = query.count()
    jobs = query.offset(skip).limit(limit).all()
    return {
        "jobs": [_job_to_dict(j) for j in jobs],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/")
def list_jobs(
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """List all jobs with optional status filter and pagination."""
    query = db.query(Job).order_by(Job.created_at.desc())
    if status:
        query = query.filter(Job.status == status)
    total = query.count()
    jobs = query.offset(skip).limit(limit).all()

    result_jobs = []
    for j in jobs:
        d = _job_to_dict(j)
        # For active jobs, merge any buffered logs not yet flushed
        if j.id in _active_jobs and "log_buffer" in _active_jobs[j.id]:
            d["logs"] = d["logs"] + _active_jobs[j.id]["log_buffer"]
        result_jobs.append(d)

    return {
        "jobs": result_jobs,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/run")
async def run_job(
    recipe_id: str,
    agent_id: str = "a01",
    db: Session = Depends(get_db),
):
    recipe = next((r for r in DEMO_RECIPES if r["id"] == recipe_id), None)
    if not recipe:
        return {"error": "Recipe not found"}

    # Read current run settings for concurrency limit
    settings = get_run_settings()
    max_concurrent = settings.get("maxConcurrentAgents", 5)

    job_id = f"job_{uuid.uuid4().hex[:8]}"
    job = Job(
        id=job_id,
        recipe_id=recipe_id,
        recipe_name=recipe["name"],
        assigned_agent_id=agent_id,
        status="QUEUED",
        command=recipe["command"],
        args=json.dumps(recipe.get("args", [])),
        cwd=recipe.get("cwd") or None,
        logs="[]",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Initialize runtime state for this job
    _active_jobs[job_id] = {"log_buffer": [], "process": None}

    # Return the job dict immediately -- execution continues in background
    job_dict = _job_to_dict(job)

    # Check concurrency: if already at limit, keep as QUEUED and defer
    running_count = _count_running_jobs()
    if running_count >= max_concurrent:
        asyncio.create_task(_wait_and_execute(job_id, recipe, max_concurrent))
    else:
        asyncio.create_task(_execute_job(job_id, recipe))

    return {"job": job_dict}


async def _wait_and_execute(job_id: str, recipe: dict, max_concurrent: int):
    """Wait until a slot opens up, then execute the queued job."""
    from app.routers.ws import manager

    # Poll every 2 seconds to check if we can start
    for _ in range(150):  # up to ~5 minutes of waiting
        await asyncio.sleep(2)

        # Check if job was canceled while waiting
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job or job.status == "CANCELED":
                _active_jobs.pop(job_id, None)
                return
        finally:
            db.close()

        if _count_running_jobs() < max_concurrent:
            await _execute_job(job_id, recipe)
            return

    # Timed out waiting for a slot -- mark as error
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job and job.status == "QUEUED":
            job.status = "ERROR"
            job.error = "Timed out waiting for available concurrency slot"
            job.completed_at = _now_utc()
            db.commit()
            db.refresh(job)
            await manager.broadcast({"type": "JOB_UPDATE", "job": _job_to_dict(job)})
    finally:
        _active_jobs.pop(job_id, None)
        db.close()


@router.post("/stop")
def stop_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return {"error": "Job not found"}

    # Terminate the subprocess if it is still running
    runtime = _active_jobs.get(job_id, {})
    proc = runtime.get("process")
    if proc is not None:
        try:
            proc.terminate()
        except Exception:
            pass

    job.status = "CANCELED"
    job.completed_at = _now_utc()
    db.commit()
    db.refresh(job)

    job_dict = _job_to_dict(job)

    # Broadcast the cancellation to update the UI immediately
    from app.routers.ws import manager

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast({"type": "JOB_UPDATE", "job": job_dict}))
    except RuntimeError:
        pass  # No running event loop

    return {"job": job_dict}


@router.get("/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return {"error": "Job not found"}

    d = _job_to_dict(job)
    # Merge any buffered logs not yet flushed
    if job_id in _active_jobs and "log_buffer" in _active_jobs[job_id]:
        d["logs"] = d["logs"] + _active_jobs[job_id]["log_buffer"]
    return {"job": d}


# ── Execution ──────────────────────────────────────────
async def _flush_logs(job_id: str):
    """Periodically flush buffered logs to the DB to avoid per-line writes."""
    runtime = _active_jobs.get(job_id)
    if not runtime:
        return

    buffer = runtime.get("log_buffer", [])
    if not buffer:
        return

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
        existing = json.loads(job.logs) if job.logs else []
        merged = existing + buffer
        job.logs = _serialize_logs(merged)
        db.commit()
        # Clear the buffer after successful flush
        runtime["log_buffer"] = []
    except Exception:
        pass
    finally:
        db.close()


async def _execute_job(job_id: str, recipe: dict):
    from app.routers.ws import manager  # lazy import to avoid circular
    import subprocess
    import threading

    # Read run settings for timeout and log verbosity
    settings = get_run_settings()
    timeout_seconds = settings.get("runTimeoutSeconds", 300)
    log_verbosity = settings.get("logVerbosity", "info")

    # Open a dedicated session for this background task
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return

        job.status = "RUNNING"
        job.started_at = _now_utc()
        db.commit()
        db.refresh(job)

        job_dict = _job_to_dict(job)

        # Broadcast initial state change
        await manager.broadcast({
            "type": "AGENT_STATE_CHANGE",
            "agentId": job.assigned_agent_id,
            "state": "RUNNING",
        })
        await manager.broadcast({"type": "JOB_UPDATE", "job": job_dict})

        cwd = recipe.get("cwd") or None
        command = recipe["command"]
        args = recipe.get("args", [])
        full_command = f"{command} {' '.join(args)}"

        loop = asyncio.get_running_loop()
        timed_out = False

        try:
            proc = subprocess.Popen(
                full_command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd,
                text=True,
                bufsize=1,
                encoding="utf-8",
                errors="replace",
            )

            # Store process handle in runtime state
            runtime = _active_jobs.get(job_id, {})
            runtime["process"] = proc
            _active_jobs[job_id] = runtime

            def read_stream(stream, stream_name):
                try:
                    for line in iter(stream.readline, ""):
                        if not line:
                            break
                        text = line.rstrip()
                        log_entry = {
                            "ts": time.time(),
                            "stream": stream_name,
                            "text": text,
                            "jobId": job_id,
                        }

                        # Buffer logs in memory for batched DB writes
                        rt = _active_jobs.get(job_id)
                        if rt is not None:
                            rt["log_buffer"].append(log_entry)

                        # Broadcast each line in real-time via WebSocket
                        # (filtered by log verbosity setting)
                        async def do_broadcast(t=text, l=log_entry, sn=stream_name):
                            lower_text = t.lower()
                            if "[think]" in lower_text or "[plan]" in lower_text:
                                await manager.broadcast({
                                    "type": "AGENT_STATE_CHANGE",
                                    "agentId": job.assigned_agent_id,
                                    "state": "THINKING",
                                })
                            elif "[run]" in lower_text or "[build]" in lower_text or "[exec]" in lower_text:
                                await manager.broadcast({
                                    "type": "AGENT_STATE_CHANGE",
                                    "agentId": job.assigned_agent_id,
                                    "state": "RUNNING",
                                })
                            # Apply log verbosity filter before broadcasting
                            if _should_broadcast_log(t, sn, log_verbosity):
                                await manager.broadcast({"type": "JOB_LOG", "log": l})

                        asyncio.run_coroutine_threadsafe(do_broadcast(), loop)
                except Exception:
                    pass

            # Start reader threads
            t_out = threading.Thread(target=read_stream, args=(proc.stdout, "stdout"), daemon=True)
            t_err = threading.Thread(target=read_stream, args=(proc.stderr, "stderr"), daemon=True)
            t_out.start()
            t_err.start()

            # Periodically flush logs while process is running
            async def periodic_flush():
                while job_id in _active_jobs:
                    await asyncio.sleep(LOG_FLUSH_INTERVAL)
                    await _flush_logs(job_id)

            flush_task = asyncio.create_task(periodic_flush())

            # Wait for process completion without blocking the async loop
            # Apply timeout: kill process if it exceeds runTimeoutSeconds
            def wait_func():
                code = proc.wait()
                t_out.join(timeout=2)
                t_err.join(timeout=2)
                return code

            try:
                exit_code = await asyncio.wait_for(
                    asyncio.to_thread(wait_func),
                    timeout=timeout_seconds,
                )
            except asyncio.TimeoutError:
                # Process exceeded the configured timeout
                timed_out = True
                try:
                    proc.kill()
                except Exception:
                    pass
                # Wait briefly for cleanup
                t_out.join(timeout=1)
                t_err.join(timeout=1)
                exit_code = -1

                # Broadcast a timeout log entry
                timeout_log = {
                    "ts": time.time(),
                    "stream": "stderr",
                    "text": f"Job timed out after {timeout_seconds}s and was killed.",
                    "jobId": job_id,
                }
                rt = _active_jobs.get(job_id)
                if rt is not None:
                    rt["log_buffer"].append(timeout_log)
                await manager.broadcast({"type": "JOB_LOG", "log": timeout_log})

            # Stop periodic flushing
            flush_task.cancel()
            try:
                await flush_task
            except asyncio.CancelledError:
                pass

            # Re-read the job from DB in case stop_job updated it
            db.refresh(job)

            # Canceled jobs should ignore their natural exit code
            if job.status == "CANCELED":
                exit_code = -1

        except Exception as e:
            import traceback
            trace = traceback.format_exc()
            print(f"Exception starting process: {trace}")
            log_entry = {
                "ts": time.time(),
                "stream": "stderr",
                "text": f"Error starting process: {repr(e)}\n{trace}",
                "jobId": job_id,
            }
            rt = _active_jobs.get(job_id)
            if rt is not None:
                rt["log_buffer"].append(log_entry)
            await manager.broadcast({"type": "JOB_LOG", "log": log_entry})
            exit_code = -1

        # Final log flush -- write everything remaining to DB
        await _flush_logs(job_id)

        # Update job final state in DB
        db.refresh(job)
        is_success = (exit_code == 0) and (job.status != "CANCELED") and not timed_out

        if job.status != "CANCELED":
            if timed_out:
                job.status = "ERROR"
                job.error = f"Timed out after {timeout_seconds}s"
            else:
                job.status = "SUCCESS" if is_success else "ERROR"

        job.exit_code = exit_code
        job.completed_at = _now_utc()
        db.commit()
        db.refresh(job)

        final_dict = _job_to_dict(job)

        await manager.broadcast({
            "type": "AGENT_STATE_CHANGE",
            "agentId": job.assigned_agent_id,
            "state": "SUCCESS" if is_success else "ERROR",
        })
        await manager.broadcast({"type": "JOB_UPDATE", "job": final_dict})

        # Return to IDLE after 1.5s
        await asyncio.sleep(1.5)

        if job.status in ("SUCCESS", "ERROR", "CANCELED"):
            await manager.broadcast({
                "type": "AGENT_STATE_CHANGE",
                "agentId": job.assigned_agent_id,
                "state": "IDLE",
            })

    finally:
        # Cleanup runtime state
        _active_jobs.pop(job_id, None)
        db.close()
