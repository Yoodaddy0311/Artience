/**
 * @dokba/shared-types
 *
 * Shared type definitions for Room, Task, Job, Rankings, and WebSocket events.
 * Used by: apps/desktop (frontend), apps/api (backend), packages/cli-connector, packages/mcp-server
 */

// ── Room, Member, Character ──
export type {
  Room,
  RoomStatus,
  Member,
  MemberStatus,
  RoomMember,
  AvatarConfig,
  Character,
  JobType,
  JobCategory,
  JobDefinitionId,
  MemberRole,
  RoomCreate,
  RoomJoin,
  RoomJoinResponse,
} from "./room.js";

// ── Task, Assignment ──
export type {
  Task,
  TaskStatus,
  TaskPriority,
  RoomTask,
  Assignment,
  AssignmentStatus,
  TaskCreate,
  TaskUpdate,
} from "./task.js";
export { TASK_PRIORITY_LABELS } from "./task.js";

// ── Job, Leveling ──
export type {
  JobDefinition,
  JobUnlockStatus,
  LevelCurveResponse,
  JobGrade,
  LevelProfile,
  CharacterProfile,
  JobProficiency,
  XpRewardRequest,
  XpReward,
  XpRewardResponse,
} from "./job.js";
export { LEVEL_CURVE, MAX_LEVEL, JOB_GRADES } from "./job.js";

// ── Ranking, Achievements ──
export type {
  WeeklyScore,
  Achievement,
  AchievementConditionType,
  UserAchievement,
  AchievementWithStatus,
  LeaderboardEntry,
  RankingPeriod,
  RankingCategory,
} from "./ranking.js";

// ── WebSocket Events ──
export type {
  RoomEventType,
  RoomWsMessage,
  TownEventType,
  AgentState,
  ChatMessage,
  ChatResponse,
  ChatCommand,
  AgentStateChange,
  TaskAssigned,
  TaskAssign,
  TaskResult,
  TaskProgress,
  TownWsMessage,
  WsMessage,
} from "./ws-events.js";
