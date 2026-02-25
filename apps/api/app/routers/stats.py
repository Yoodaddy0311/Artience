from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.job import Job

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/")
def get_stats(db: Session = Depends(get_db)):
    """Return real-time platform statistics."""
    from app.routers.ws import get_chat_stats, manager

    chat_stats = get_chat_stats()

    # Conversation count: total messages exchanged (sent + received)
    total_sent = chat_stats.get("total_messages_sent", 0)
    total_responses = chat_stats.get("total_responses", 0)
    conversations = total_sent + total_responses

    # Response rate: percentage of user messages that received a response
    if total_sent > 0:
        response_rate = round((total_responses / total_sent) * 100, 1)
    else:
        response_rate = 0.0

    # Active agents: count of currently connected WebSocket clients
    # (approximation -- each sidebar chat opens a connection)
    active_connections = len(manager.active_connections)

    # Job statistics from the database
    total_jobs = db.query(Job).count()
    success_jobs = db.query(Job).filter(Job.status == "SUCCESS").count()

    if total_jobs > 0:
        success_rate = round((success_jobs / total_jobs) * 100, 1)
    else:
        success_rate = 0.0

    return {
        "conversations": conversations,
        "responseRate": response_rate,
        "activeAgents": active_connections,
        "totalJobs": total_jobs,
        "successRate": success_rate,
    }
