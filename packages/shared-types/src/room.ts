/**
 * Room-related shared types.
 * Aligned with: apps/api/app/models/room.py, apps/desktop/src/store/useRoomStore.ts
 */

// ── Room ──

export type RoomStatus = "active" | "closed";

export interface Room {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  max_members: number;
  status: RoomStatus;
  created_at: string;

  /** Frontend-only computed fields */
  memberCount?: number;
  onlineCount?: number;
  ctoName?: string;
}

// ── Member ──

export type MemberStatus = "online" | "offline" | "busy" | "away";

export interface Member {
  id: string;
  room_id: string;
  user_id: string;
  character_name: string;
  character_role: string;
  job_slot: string | null;
  joined_at: string;
  is_online: boolean;
}

/** Frontend-enriched member with display info. */
export interface RoomMember {
  id: string;
  name: string;
  job: JobType;
  status: MemberStatus;
  avatarUrl?: string;
  isCTO: boolean;
  currentTask?: string;
}

// ── Character ──

export interface AvatarConfig {
  sprite?: string;
  color?: string;
  accessories?: string[];
}

export interface Character {
  id: string;
  member_id: string;
  avatar_config: AvatarConfig;
  level: number;
  xp: number;
  coins: number;
  diamonds: number;
}

// ── Job Types ──

/** High-level job categories used in the frontend store. */
export type JobType =
  | "CTO"
  | "Frontend"
  | "Backend"
  | "Designer"
  | "PM"
  | "QA"
  | "DevOps"
  | "Data";

/** Job category groupings from the backend. */
export type JobCategory =
  | "management"
  | "engineering"
  | "design"
  | "qa"
  | "ops"
  | "general";

/**
 * 25 job definition IDs matching the backend seed data.
 * Maps to agent slots a01-a25 in ws.py _AGENT_ID_MAP.
 */
export type JobDefinitionId =
  // Management (4)
  | "PM"
  | "PO"
  | "SCRUM"
  | "CTO"
  // Frontend Engineering (4)
  | "FE_DEV"
  | "FE_LEAD"
  | "MOBILE"
  | "UI_ENG"
  // Backend Engineering (4)
  | "BE_DEV"
  | "BE_LEAD"
  | "API_DEV"
  | "DATA_ENG"
  // Design (4)
  | "UX"
  | "UI"
  | "BRAND"
  | "MOTION"
  // QA & Testing (3)
  | "QA"
  | "QA_AUTO"
  | "PERF"
  // DevOps & Infra (3)
  | "DEVOPS"
  | "SRE"
  | "INFRA"
  // Specialized (3)
  | "AI_ENG"
  | "SEC"
  | "TECH_WRITER";

export interface JobDefinition {
  id: JobDefinitionId;
  name: string;
  description: string;
  icon: string;
  category: JobCategory;
  required_level: number;
}

// ── DTOs ──

export type MemberRole = "CTO" | "member";

export interface RoomCreate {
  name: string;
  max_members?: number;
}

export interface RoomJoin {
  code: string;
}

export interface RoomJoinResponse {
  room: Room;
  members: RoomMember[];
  role: JobType;
}
