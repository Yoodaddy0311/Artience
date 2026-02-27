import { useAppStore } from '../store/useAppStore';

// Lazy import to avoid circular dependency at module parse time
function syncConnected(connected: boolean): void {
    // Dynamic import of useRoomStore to update isConnected
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useRoomStore } = require('../store/useRoomStore');
        useRoomStore.getState().setConnected(connected);
    } catch {
        // Store not yet initialized — skip
    }
}

// ── Room WebSocket Event Types ──

export type RoomEventType =
    | 'ROOM_MEMBER_JOIN'
    | 'ROOM_MEMBER_LEAVE'
    | 'ROOM_TASK_CREATED'
    | 'ROOM_TASK_ASSIGNED'
    | 'ROOM_TASK_COMPLETED'
    | 'ROOM_STATUS_UPDATE';

export interface RoomWsMessage {
    type: RoomEventType;
    payload: Record<string, unknown>;
    timestamp: string;
}

export type RoomSocketListener = (msg: RoomWsMessage) => void;

// ── Room WebSocket Manager ──

export class RoomSocketManager {
    private ws: WebSocket | null = null;
    private roomId: string | null = null;
    private listeners: Set<RoomSocketListener> = new Set();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectDelay = 1000;
    private maxReconnectDelay = 30000;
    private intentionalClose = false;

    /** Connect to a room's WebSocket channel. */
    connect(roomId: string): void {
        this.disconnect();
        this.roomId = roomId;
        this.intentionalClose = false;
        this.doConnect();
    }

    /** Disconnect and stop reconnecting. */
    disconnect(): void {
        this.intentionalClose = true;
        this.roomId = null;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.reconnectDelay = 1000;
    }

    /** Register an event listener. Returns unsubscribe function. */
    on(listener: RoomSocketListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Send a message to the room WS. */
    send(data: Record<string, unknown>): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    get connected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    // ── Internal ──

    private doConnect(): void {
        if (!this.roomId) return;

        const apiUrl = useAppStore.getState().appSettings.apiUrl;
        const wsUrl = apiUrl.replace(/^http/, 'ws');
        const ws = new WebSocket(`${wsUrl}/ws/room/${this.roomId}`);
        this.ws = ws;

        ws.onopen = () => {
            this.reconnectDelay = 1000;
            syncConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as RoomWsMessage;
                for (const listener of this.listeners) {
                    listener(msg);
                }
            } catch {
                // ignore malformed messages
            }
        };

        ws.onclose = () => {
            this.ws = null;
            syncConnected(false);
            if (!this.intentionalClose && this.roomId) {
                this.scheduleReconnect();
            }
        };

        ws.onerror = () => {
            // onclose will fire after onerror
        };
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.doConnect();
        }, this.reconnectDelay);
        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }
}

/** Singleton instance. */
export const roomSocket = new RoomSocketManager();
