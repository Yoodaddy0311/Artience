"""Orchestrator service for agent task assignment and lifecycle management.

Matches incoming tasks to the best available agent by role affinity,
tracks agent busy/idle state, and provides queue introspection.
"""

from typing import Any, Dict, List, Optional
import time
import uuid
import logging

_logger = logging.getLogger(__name__)

# Maps task types to agent roles that can handle them.
# Keys are normalised to lowercase.  Values are ordered by preference.
ROLE_AFFINITY: Dict[str, list[str]] = {
    "code":          ["backend", "developer", "frontend", "fullstack"],
    "backend":       ["backend", "developer", "api"],
    "frontend":      ["frontend", "developer", "ux"],
    "test":          ["qa", "test"],
    "review":        ["review", "code review"],
    "deploy":        ["devops", "deploy", "ci/cd", "infra"],
    "design":        ["ux", "design", "frontend"],
    "data":          ["data", "db", "database"],
    "docs":          ["docs", "document", "technical"],
    "security":      ["security", "audit"],
    "performance":   ["performance", "optimization"],
    "architecture":  ["architecture", "architect"],
    "monitoring":    ["monitoring", "log"],
    "build":         ["build", "ci/cd", "devops"],
    "migration":     ["migration", "db"],
    "error":         ["error", "debug"],
}

# Agent lifecycle states
AGENT_IDLE = "IDLE"
AGENT_BUSY = "BUSY"
AGENT_ERROR = "ERROR"

# Task states
TASK_PENDING = "PENDING"
TASK_ASSIGNED = "ASSIGNED"
TASK_COMPLETED = "COMPLETED"
TASK_FAILED = "FAILED"


class OrchestratorService:
    """Manages agent-to-task assignment with role-based matching.

    Accepts a list of agent profile dicts (matching the shape defined in
    platform.ts ``AgentProfile``) and provides task routing, queue
    tracking, and status introspection.
    """

    def __init__(self, agents: Optional[List[Dict[str, Any]]] = None):
        # Normalise agent list -- each entry must have at least id and role
        self.agents: Dict[str, Dict[str, Any]] = {}
        self._agent_states: Dict[str, str] = {}
        self.task_queue: List[Dict[str, Any]] = []
        self._completed_tasks: List[Dict[str, Any]] = []

        if agents:
            for agent in agents:
                self.register_agent(agent)

    # ------------------------------------------------------------------
    # Agent management
    # ------------------------------------------------------------------

    def register_agent(self, agent: Dict[str, Any]) -> None:
        """Register (or re-register) an agent profile."""
        agent_id = agent.get("id", "")
        if not agent_id:
            raise ValueError("Agent must have an 'id' field")

        self.agents[agent_id] = {
            "id": agent_id,
            "name": agent.get("name", agent_id),
            "role": agent.get("role", "General"),
            "sprite": agent.get("sprite", ""),
        }
        # Initialise state to IDLE unless already tracked
        if agent_id not in self._agent_states:
            self._agent_states[agent_id] = AGENT_IDLE

    def get_agent_status(self, agent_id: str) -> str:
        """Return current status of an agent (IDLE, BUSY, ERROR).

        Args:
            agent_id: The unique agent identifier.

        Returns:
            Status string.  Returns 'UNKNOWN' if agent_id is not registered.
        """
        return self._agent_states.get(agent_id, "UNKNOWN")

    def list_agents(self) -> List[Dict[str, Any]]:
        """Return all agents with their current status."""
        result: list[dict] = []
        for agent_id, profile in self.agents.items():
            result.append({
                **profile,
                "status": self._agent_states.get(agent_id, AGENT_IDLE),
            })
        return result

    # ------------------------------------------------------------------
    # Task assignment
    # ------------------------------------------------------------------

    def assign_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Find the best available agent for *task* and assign it.

        Task dict should include at least:
          - ``type`` (str): e.g. "code", "test", "deploy"
          - ``name`` (str): human-readable task description

        Returns:
            Assignment dict: ``{ agent_id, task_id, status, matched_by }``.
            If no agent is available the task is queued and status is PENDING.
        """
        task_id = task.get("id", f"task_{uuid.uuid4().hex[:8]}")
        task_type = (task.get("type", "general")).lower()
        task_name = task.get("name", "Unnamed task")

        task_record = {
            "id": task_id,
            "type": task_type,
            "name": task_name,
            "status": TASK_PENDING,
            "agent_id": None,
            "assigned_at": None,
            "created_at": time.time(),
        }

        # Find a matching idle agent
        best_agent = self._find_best_agent(task_type)

        if best_agent is None:
            # No available agent -- queue the task
            self.task_queue.append(task_record)
            _logger.info("Task '%s' queued (no idle agent for type '%s')", task_name, task_type)
            return {
                "task_id": task_id,
                "agent_id": None,
                "status": TASK_PENDING,
                "matched_by": None,
                "message": "No available agent -- task queued",
            }

        # Assign
        task_record["agent_id"] = best_agent["id"]
        task_record["status"] = TASK_ASSIGNED
        task_record["assigned_at"] = time.time()
        self._agent_states[best_agent["id"]] = AGENT_BUSY
        self.task_queue.append(task_record)

        _logger.info(
            "Task '%s' assigned to agent '%s' (%s)",
            task_name,
            best_agent["name"],
            best_agent["role"],
        )

        return {
            "task_id": task_id,
            "agent_id": best_agent["id"],
            "agent_name": best_agent["name"],
            "status": TASK_ASSIGNED,
            "matched_by": "role_affinity",
        }

    def complete_task(self, task_id: str, success: bool = True) -> Dict[str, Any]:
        """Mark a task as completed and release its agent back to IDLE.

        Args:
            task_id: The task identifier.
            success: Whether the task completed successfully.

        Returns:
            Updated task record or error dict.
        """
        task_record = next((t for t in self.task_queue if t["id"] == task_id), None)
        if task_record is None:
            return {"error": f"Task {task_id} not found"}

        agent_id = task_record.get("agent_id")
        task_record["status"] = TASK_COMPLETED if success else TASK_FAILED
        task_record["completed_at"] = time.time()

        # Release agent
        if agent_id and agent_id in self._agent_states:
            self._agent_states[agent_id] = AGENT_IDLE if success else AGENT_ERROR

        # Move to completed list
        self.task_queue.remove(task_record)
        self._completed_tasks.append(task_record)

        return {
            "task_id": task_id,
            "agent_id": agent_id,
            "status": task_record["status"],
        }

    # ------------------------------------------------------------------
    # Queue introspection
    # ------------------------------------------------------------------

    def get_queue_status(self) -> Dict[str, Any]:
        """Return queue statistics.

        Returns:
            Dict with counts for pending, assigned, completed, failed tasks
            and a list of idle agent ids.
        """
        pending = sum(1 for t in self.task_queue if t["status"] == TASK_PENDING)
        assigned = sum(1 for t in self.task_queue if t["status"] == TASK_ASSIGNED)
        completed = sum(1 for t in self._completed_tasks if t["status"] == TASK_COMPLETED)
        failed = sum(1 for t in self._completed_tasks if t["status"] == TASK_FAILED)
        idle_agents = [
            aid for aid, state in self._agent_states.items() if state == AGENT_IDLE
        ]

        return {
            "pending": pending,
            "assigned": assigned,
            "completed": completed,
            "failed": failed,
            "total_agents": len(self.agents),
            "idle_agents": idle_agents,
            "idle_count": len(idle_agents),
            "busy_count": sum(1 for s in self._agent_states.values() if s == AGENT_BUSY),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _find_best_agent(self, task_type: str) -> Optional[Dict[str, Any]]:
        """Select the best idle agent for *task_type* using role affinity.

        Scoring:
        1. Exact role keyword match in the agent's role string  -> score 10
        2. Affinity list match (position-weighted)                -> score 5..1
        3. Any idle agent (fallback)                              -> score 0

        Returns the highest-scoring idle agent, or None if all are busy.
        """
        preferred_roles = ROLE_AFFINITY.get(task_type, [])
        idle_agents = [
            self.agents[aid]
            for aid, state in self._agent_states.items()
            if state == AGENT_IDLE and aid in self.agents
        ]

        if not idle_agents:
            return None

        def _score(agent: Dict[str, Any]) -> int:
            role_lower = agent.get("role", "").lower()
            # Exact task_type appears in agent role
            if task_type in role_lower:
                return 10
            # Check affinity list
            for idx, keyword in enumerate(preferred_roles):
                if keyword in role_lower:
                    return max(5 - idx, 1)
            return 0

        idle_agents.sort(key=_score, reverse=True)
        return idle_agents[0]
