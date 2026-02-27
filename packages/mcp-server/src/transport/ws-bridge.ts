/**
 * WebSocket <-> MCP bridge.
 * Manages the WebSocket connection to the Artifarm server and translates
 * between WS messages and MCP tool/resource state.
 *
 * Protocol: Uses @dokba/shared-types TownWsMessage for all messages.
 * The server treats CLI and MCP clients identically — both connect to
 * /ws/town and exchange the same message types. The CLIENT_IDENTIFY
 * message on connect lets the server distinguish client types for
 * logging/routing purposes.
 *
 * Migration path (CLI → MCP):
 *   1. User runs `dokba login` to cache token (shared ~/.dokba/config.json)
 *   2. User switches from CLI daemon (`dokba start`) to MCP server config
 *   3. MCP server reads same config, connects with same protocol
 *   4. No server-side changes needed — same WS endpoint, same messages
 */

import WebSocket from "ws";
import type {
  TownWsMessage,
  AgentStateChange,
  ChatCommand,
  TaskAssign,
  ClientIdentify,
  AgentState,
} from "@dokba/shared-types";

export interface WsBridgeOptions {
  serverUrl: string;
  room: string;
  token: string;
}

export type WsMessageHandler = (msg: TownWsMessage) => void;

export class WsBridge {
  private ws: WebSocket | null = null;
  private handlers: WsMessageHandler[] = [];
  private reconnectAttempts = 0;
  private closed = false;
  private connected = false;

  /** Latest known room state, updated by incoming messages. */
  public roomState: Record<string, unknown> = {};
  /** Pending tasks received from server. */
  public taskQueue: TownWsMessage[] = [];

  private readonly wsUrl: string;

  constructor(private readonly options: WsBridgeOptions) {
    const base = options.serverUrl.replace(/^http/, "ws").replace(/\/+$/, "");
    const url = new URL(`${base}/ws/town`);
    url.searchParams.set("token", options.token);
    url.searchParams.set("room", options.room);
    this.wsUrl = url.toString();
  }

  onMessage(handler: WsMessageHandler): void {
    this.handlers.push(handler);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.error(`[dokba-mcp] Connecting to ${this.options.serverUrl}...`);

      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.error("[dokba-mcp] WebSocket connected");
        this.connected = true;
        this.reconnectAttempts = 0;

        // Identify as MCP client
        this.sendRaw({
          type: "CLIENT_IDENTIFY",
          clientType: "mcp",
          version: "0.1.0",
          room: this.options.room,
        } satisfies ClientIdentify);

        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as TownWsMessage;
          this.processIncoming(msg);
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {
          console.error("[dokba-mcp] Failed to parse message");
        }
      });

      this.ws.on("close", (code: number) => {
        this.connected = false;
        if (code === 4001) {
          console.error("[dokba-mcp] Auth failed");
          reject(new Error("Authentication failed"));
          return;
        }
        if (!this.closed) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (err: Error) => {
        console.error(`[dokba-mcp] WS error: ${err.message}`);
        if (!this.connected) {
          reject(err);
        }
      });
    });
  }

  /**
   * Send a typed TownWsMessage to the server.
   */
  send(message: TownWsMessage): boolean {
    return this.sendRaw(message);
  }

  /**
   * Send a raw message (for backward compat or extensions).
   */
  sendRaw(message: Record<string, unknown>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  disconnect(): void {
    this.closed = true;
    this.ws?.close(1000, "MCP server shutdown");
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Wait for a message matching a predicate, with timeout.
   */
  waitForMessage(
    predicate: (msg: TownWsMessage) => boolean,
    timeoutMs = 30000,
  ): Promise<TownWsMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timeout waiting for message"));
      }, timeoutMs);

      const handler = (msg: TownWsMessage) => {
        if (predicate(msg)) {
          cleanup();
          resolve(msg);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        const idx = this.handlers.indexOf(handler);
        if (idx >= 0) this.handlers.splice(idx, 1);
      };

      this.handlers.push(handler);
    });
  }

  private processIncoming(msg: TownWsMessage): void {
    // Update room state from agent state changes
    if (msg.type === "AGENT_STATE_CHANGE") {
      const { agentId, state } = msg as AgentStateChange;
      if (!this.roomState.agents) {
        this.roomState.agents = {};
      }
      (this.roomState.agents as Record<string, { state: AgentState }>)[agentId] = { state };
    }

    // Queue incoming tasks (both legacy CHAT_COMMAND and new TASK_ASSIGN)
    if (msg.type === "TASK_ASSIGN" || msg.type === "CHAT_COMMAND") {
      this.taskQueue.push(msg);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= 10) {
      console.error("[dokba-mcp] Max reconnect attempts reached");
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    console.error(
      `[dokba-mcp] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/10)...`,
    );
    setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }
}
