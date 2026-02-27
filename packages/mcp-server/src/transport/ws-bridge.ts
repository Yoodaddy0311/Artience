/**
 * WebSocket <-> MCP bridge.
 * Manages the WebSocket connection to the Artifarm server and translates
 * between WS messages and MCP tool/resource state.
 */

import WebSocket from "ws";

export interface WsBridgeOptions {
  serverUrl: string;
  room: string;
  token: string;
}

export type WsMessageHandler = (msg: Record<string, unknown>) => void;

export class WsBridge {
  private ws: WebSocket | null = null;
  private handlers: WsMessageHandler[] = [];
  private reconnectAttempts = 0;
  private closed = false;
  private connected = false;

  /** Latest known room state, updated by incoming messages. */
  public roomState: Record<string, unknown> = {};
  /** Pending tasks received from server. */
  public taskQueue: Array<Record<string, unknown>> = [];

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
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
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

  send(message: Record<string, unknown>): boolean {
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
    predicate: (msg: Record<string, unknown>) => boolean,
    timeoutMs = 30000,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timeout waiting for message"));
      }, timeoutMs);

      const handler = (msg: Record<string, unknown>) => {
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

  private processIncoming(msg: Record<string, unknown>): void {
    const type = msg.type as string;

    // Update room state from state-related messages
    if (type === "AGENT_STATE_CHANGE") {
      const agentId = msg.agentId as string;
      const state = msg.state as string;
      if (!this.roomState.agents) {
        this.roomState.agents = {};
      }
      (this.roomState.agents as Record<string, unknown>)[agentId] = { state };
    }

    // Queue incoming tasks
    if (type === "TASK_ASSIGN" || type === "CHAT_COMMAND") {
      this.taskQueue.push(msg);
    }

    // Update general room state
    if (type === "ROOM_STATE") {
      this.roomState = { ...this.roomState, ...msg };
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
