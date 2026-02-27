/**
 * WebSocket event types shared between frontend, backend, CLI, and MCP server.
 * Aligned with: apps/api/app/routers/ws.py, apps/desktop/src/services/roomSocket.ts
 */

// ── Room Events (roomSocket — /ws/room/{room_id}) ──

export type RoomEventType =
  | "ROOM_MEMBER_JOIN"
  | "ROOM_MEMBER_LEAVE"
  | "ROOM_TASK_CREATED"
  | "ROOM_TASK_ASSIGNED"
  | "ROOM_TASK_COMPLETED"
  | "ROOM_STATUS_UPDATE";

export interface RoomWsMessage {
  type: RoomEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ── Town Events (ws.py /ws/town) ──

export type TownEventType =
  | "CHAT_MESSAGE"
  | "CHAT_RESPONSE"
  | "CHAT_COMMAND"
  | "AGENT_STATE_CHANGE"
  | "TASK_ASSIGNED"
  | "TASK_ASSIGN"
  | "TASK_RESULT"
  | "TASK_PROGRESS"
  | "ROOM_STATE";

/** Agent state in the Town view. */
export type AgentState =
  | "IDLE"
  | "THINKING"
  | "CODING"
  | "SUCCESS"
  | "ERROR"
  | "DONE";

// ── Town Event Payloads ──

export interface ChatMessage {
  type: "CHAT_MESSAGE";
  agentId: string;
  agentName?: string;
  agentRole?: string;
  content: string;
}

export interface ChatResponse {
  type: "CHAT_RESPONSE";
  agentId: string;
  content: string;
}

export interface ChatCommand {
  type: "CHAT_COMMAND";
  target_agent: string;
  text: string;
  taskId?: string;
}

export interface AgentStateChange {
  type: "AGENT_STATE_CHANGE";
  agentId: string;
  state: AgentState;
}

export interface TaskAssigned {
  type: "TASK_ASSIGNED";
  agent: string;
  taskContent: string;
}

export interface TaskAssign {
  type: "TASK_ASSIGN";
  taskId: string;
  prompt: string;
  agentId: string;
}

export interface TaskResult {
  type: "TASK_RESULT";
  taskId?: string;
  agentId?: string;
  agent?: string;
  success: boolean;
  output: string;
}

export interface TaskProgress {
  type: "TASK_PROGRESS";
  taskId: string;
  agentId: string;
  state: AgentState;
  partial?: string;
}

/** Union of all Town WebSocket messages. */
export type TownWsMessage =
  | ChatMessage
  | ChatResponse
  | ChatCommand
  | AgentStateChange
  | TaskAssigned
  | TaskAssign
  | TaskResult
  | TaskProgress;

/** Union of all WebSocket messages (both Room and Town). */
export type WsMessage = RoomWsMessage | TownWsMessage;
