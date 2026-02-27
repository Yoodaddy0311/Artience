/**
 * Ranking and Social types.
 * Aligned with: apps/api/app/models/ranking.py, apps/api/app/services/ranking_service.py
 */

// ── Weekly Score ──

export interface WeeklyScore {
  id: string;
  user_id: string;
  week: string; // ISO week: "2026-W09"
  job_type: string;
  score: number;
  task_count: number;
  quality_avg: number;
  created_at: string;
  updated_at: string;
}

// ── Achievement ──

export type AchievementConditionType =
  | "task_count"
  | "streak_days"
  | "job_level"
  | "collab_count"
  | "quality_avg"
  | "speed_complete"
  | "error_free_streak";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition_type: AchievementConditionType;
  condition_value: number;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

/** Combined view for frontend display. */
export interface AchievementWithStatus extends Achievement {
  unlocked_at?: string | null;
}

// ── Leaderboard ──

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  score: number;
  task_count: number;
  quality_avg: number;
  job_type: string;
  week: string;
}

export type RankingPeriod = "weekly" | "monthly" | "all_time";

export type RankingCategory =
  | "all"
  | "PM"
  | "backend"
  | "frontend"
  | "data"
  | "qa"
  | "devops"
  | "design";
