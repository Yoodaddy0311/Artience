/**
 * Job, Leveling, and Proficiency types.
 * Aligned with: apps/api/app/models/job_definition.py, apps/api/app/services/leveling_service.py
 */

import type { JobDefinitionId, JobCategory } from "./room.js";

// ── Job Definition (re-export base from room.ts, extend here) ──

export type { JobDefinitionId, JobCategory } from "./room.js";

export interface JobDefinition {
  id: JobDefinitionId;
  name: string;
  description: string;
  icon: string;
  category: JobCategory;
  required_level: number;
}

/** Job unlock status for a user (from GET /api/leveling/jobs). */
export interface JobUnlockStatus extends JobDefinition {
  unlocked: boolean;
  user_level: number;
}

// ── Level Curve ──

/**
 * Level -> cumulative XP required.
 * Matches leveling_service.py LEVEL_CURVE.
 */
export const LEVEL_CURVE: Record<number, number> = {
  1: 0,
  2: 100,
  3: 300,
  4: 600,
  5: 1000,
  6: 1600,
  7: 2500,
  8: 3800,
  9: 5800,
  10: 10000,
};

export const MAX_LEVEL = 10;

export interface LevelCurveResponse {
  levels: Record<number, number>;
  max_level: number;
  grades: JobGrade[];
}

// ── Job Grades ──

export interface JobGrade {
  min_level: number;
  grade: "intern" | "junior" | "mid" | "senior" | "lead";
  title_ko: string;
  title_en: string;
}

export const JOB_GRADES: JobGrade[] = [
  { min_level: 1, grade: "intern", title_ko: "인턴", title_en: "Intern" },
  { min_level: 3, grade: "junior", title_ko: "주니어", title_en: "Junior" },
  { min_level: 5, grade: "mid", title_ko: "미드레벨", title_en: "Mid-Level" },
  { min_level: 7, grade: "senior", title_ko: "시니어", title_en: "Senior" },
  { min_level: 10, grade: "lead", title_ko: "리드", title_en: "Lead" },
];

// ── Level Profile ──

export interface LevelProfile {
  user_id: string;
  summary: {
    highest_level: number;
    grade: JobGrade;
    total_xp: number;
    total_coins: number;
    total_diamonds: number;
  };
  characters: CharacterProfile[];
}

export interface CharacterProfile {
  member_id: string;
  room_id: string;
  job_slot: string | null;
  level: number;
  xp: number;
  xp_to_next: number;
  progress: number;
  coins: number;
  diamonds: number;
  grade: JobGrade;
}

// ── Job Proficiency ──

export interface JobProficiency {
  job_id: JobDefinitionId;
  job_name: string;
  level: number;
  xp: number;
  tasks_completed: number;
}

// ── XP Reward DTO ──

export interface XpRewardRequest {
  member_id: string;
  job_type: string;
  priority?: number;
  quality?: number;
}

export interface XpReward {
  xp: number;
  coins: number;
  diamonds: number;
}

export interface XpRewardResponse {
  reward: XpReward;
  character: CharacterProfile;
  leveled_up: boolean;
  old_level: number;
  new_level: number;
  new_achievements: Achievement[];
}

// Avoid circular import — inline for this file
interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
}
