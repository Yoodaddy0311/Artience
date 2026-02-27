/**
 * Task and Assignment shared types.
 * Aligned with: apps/api/app/models/task.py, apps/desktop/src/store/useRoomStore.ts
 */

// ── Task Status ──

export type TaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "failed";

export type TaskPriority = 0 | 1 | 2;

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  0: "Normal",
  1: "High",
  2: "Urgent",
};

// ── Task ──

export interface Task {
  id: string;
  room_id: string;
  title: string;
  description: string;
  prompt: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_by: string | null;
  created_at: string;
}

/** Frontend-enriched task with display info. */
export interface RoomTask {
  id: string;
  title: string;
  prompt?: string;
  status: TaskStatus;
  assigneeId?: string;
  assigneeName?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Assignment ──

export type AssignmentStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "failed";

export interface Assignment {
  id: string;
  task_id: string;
  member_id: string;
  job_type: string;
  status: AssignmentStatus;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown>;
}

// ── DTOs ──

export interface TaskCreate {
  title: string;
  description?: string;
  prompt?: string;
  priority?: TaskPriority;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  prompt?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}
