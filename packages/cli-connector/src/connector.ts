/**
 * WebSocket connection manager with auto-reconnect.
 */

import WebSocket from "ws";
import { buildWsUrl } from "./auth.js";

export interface ConnectorOptions {
  serverUrl: string;
  room: string;
  token: string;
  maxReconnectAttempts?: number;
}

export type MessageHandler = (message: ServerMessage) => void;

/** Messages the server can send to us. */
export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

export class Connector {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private handlers: MessageHandler[] = [];
  private closed = false;

  private readonly serverUrl: string;
  private readonly room: string;
  private readonly token: string;

  constructor(options: ConnectorOptions) {
    this.serverUrl = options.serverUrl;
    this.room = options.room;
    this.token = options.token;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = buildWsUrl(this.serverUrl, this.room, this.token);
      console.log(`[dokba] Connecting to ${this.serverUrl}/ws/town ...`);

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        console.log("[dokba] Connected to Artifarm server");
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as ServerMessage;
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {
          console.error("[dokba] Failed to parse server message");
        }
      });

      this.ws.on("close", (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        console.log(
          `[dokba] Connection closed (code=${code}, reason=${reasonStr})`,
        );

        if (code === 4001) {
          console.error("[dokba] Authentication failed. Check your token.");
          this.closed = true;
          reject(new Error("Authentication failed"));
          return;
        }

        if (!this.closed) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (err: Error) => {
        console.error(`[dokba] WebSocket error: ${err.message}`);
        if (this.reconnectAttempts === 0 && !this.ws?.readyState) {
          reject(err);
        }
      });
    });
  }

  send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("[dokba] Cannot send - not connected");
    }
  }

  disconnect(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `[dokba] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`,
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    console.log(
      `[dokba] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
    );

    setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // connect() already handles scheduling next reconnect
      }
    }, delay);
  }
}
