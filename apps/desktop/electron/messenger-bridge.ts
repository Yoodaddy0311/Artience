/**
 * MessengerBridge — 외부 메신저(Discord, Slack) 브릿지 매니저.
 *
 * 어댑터 패턴으로 메신저별 구현을 추상화하고,
 * electron-store로 설정을 영속화한다.
 *
 * 흐름:
 *   registerAdapter(adapter) → 어댑터 등록
 *   connect(adapterId, config) → 인증 + 폴링 시작
 *   send(adapterId, channel, message) → 메시지 전송
 *   disconnect(adapterId) → 폴링 중단 + 연결 해제
 */

import { EventEmitter } from 'events';
import { net } from 'electron';
import Store from 'electron-store';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MessengerAdapter {
    id: string;
    name: string;
    connected: boolean;
    connect(config: Record<string, string>): Promise<void>;
    disconnect(): Promise<void>;
    send(
        channel: string,
        message: string,
    ): Promise<{ success: boolean; error?: string }>;
}

export interface IncomingMessage {
    adapterId: string;
    channel: string;
    sender: string;
    content: string;
    timestamp: number;
    raw?: unknown;
}

// ── Electron-store for adapter configs ─────────────────────────────────────

const messengerStore = new Store({
    name: 'messenger-configs',
    defaults: {
        configs: {} as Record<string, Record<string, string>>,
    },
});

// ── Helper: HTTP request via Electron net ──────────────────────────────────

function httpRequest(
    url: string,
    options: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    } = {},
): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = net.request({
            url,
            method: options.method || 'GET',
        });

        if (options.headers) {
            for (const [key, val] of Object.entries(options.headers)) {
                req.setHeader(key, val);
            }
        }

        req.on('response', (response) => {
            let data = '';
            response.on('data', (chunk: Buffer) => {
                data += chunk.toString();
            });
            response.on('end', () => {
                resolve({ status: response.statusCode, body: data });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

// ── Discord Adapter (REST API only) ────────────────────────────────────────

const DISCORD_API = 'https://discord.com/api/v10';
const DEFAULT_POLL_INTERVAL_MS = 30_000;

class DiscordAdapter implements MessengerAdapter {
    id = 'discord';
    name = 'Discord';
    connected = false;

    private token = '';
    private pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    private pollTimers = new Map<string, ReturnType<typeof setInterval>>();
    private lastMessageIds = new Map<string, string>();
    private onMessage: ((msg: IncomingMessage) => void) | null = null;

    setMessageHandler(handler: (msg: IncomingMessage) => void): void {
        this.onMessage = handler;
    }

    setPollInterval(ms: number): void {
        this.pollIntervalMs = ms;
    }

    async connect(config: Record<string, string>): Promise<void> {
        const token = config.token;
        if (!token) throw new Error('Discord Bot Token is required');

        // Verify token with /users/@me
        const res = await httpRequest(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bot ${token}` },
        });

        if (res.status !== 200) {
            throw new Error(
                `Discord auth failed (status ${res.status}): ${res.body.slice(0, 200)}`,
            );
        }

        this.token = token;
        this.connected = true;

        if (config.pollInterval) {
            this.pollIntervalMs =
                parseInt(config.pollInterval, 10) || DEFAULT_POLL_INTERVAL_MS;
        }

        // Start polling configured channels
        if (config.channels) {
            const channels = config.channels
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean);
            for (const ch of channels) {
                this.startPolling(ch);
            }
        }

        console.log('[DiscordAdapter] Connected');
    }

    async disconnect(): Promise<void> {
        for (const [, timer] of this.pollTimers) {
            clearInterval(timer);
        }
        this.pollTimers.clear();
        this.lastMessageIds.clear();
        this.connected = false;
        this.token = '';
        console.log('[DiscordAdapter] Disconnected');
    }

    async send(
        channel: string,
        message: string,
    ): Promise<{ success: boolean; error?: string }> {
        if (!this.connected || !this.token) {
            return { success: false, error: 'Not connected' };
        }

        try {
            const res = await httpRequest(
                `${DISCORD_API}/channels/${channel}/messages`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bot ${this.token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content: message }),
                },
            );

            if (res.status >= 200 && res.status < 300) {
                return { success: true };
            }
            return {
                success: false,
                error: `Discord API error (${res.status})`,
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    // ── Polling ────────────────────────────────────────────────────────────

    private startPolling(channelId: string): void {
        if (this.pollTimers.has(channelId)) return;

        const timer = setInterval(() => {
            this.pollChannel(channelId).catch((err) => {
                console.warn(
                    `[DiscordAdapter] Poll error for ${channelId}:`,
                    err.message,
                );
            });
        }, this.pollIntervalMs);

        this.pollTimers.set(channelId, timer);
    }

    private async pollChannel(channelId: string): Promise<void> {
        if (!this.connected || !this.token) return;

        let url = `${DISCORD_API}/channels/${channelId}/messages?limit=10`;
        const lastId = this.lastMessageIds.get(channelId);
        if (lastId) {
            url += `&after=${lastId}`;
        }

        try {
            const res = await httpRequest(url, {
                headers: { Authorization: `Bot ${this.token}` },
            });

            if (res.status !== 200) return;

            const messages = JSON.parse(res.body);
            if (!Array.isArray(messages) || messages.length === 0) return;

            // Messages come newest-first, reverse for chronological order
            messages.reverse();

            // Track last message ID
            this.lastMessageIds.set(
                channelId,
                messages[messages.length - 1].id,
            );

            for (const msg of messages) {
                // Skip bot's own messages
                if (msg.author?.bot) continue;

                const incoming: IncomingMessage = {
                    adapterId: this.id,
                    channel: channelId,
                    sender: msg.author?.username || 'unknown',
                    content: msg.content || '',
                    timestamp: new Date(msg.timestamp).getTime(),
                    raw: msg,
                };

                this.onMessage?.(incoming);
            }
        } catch {
            /* silently ignore poll errors */
        }
    }
}

// ── Slack Adapter (Webhook + API) ──────────────────────────────────────────

class SlackAdapter implements MessengerAdapter {
    id = 'slack';
    name = 'Slack';
    connected = false;

    private webhookUrl = '';
    private botToken = '';
    private pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    private pollTimers = new Map<string, ReturnType<typeof setInterval>>();
    private lastTimestamps = new Map<string, string>();
    private onMessage: ((msg: IncomingMessage) => void) | null = null;

    setMessageHandler(handler: (msg: IncomingMessage) => void): void {
        this.onMessage = handler;
    }

    setPollInterval(ms: number): void {
        this.pollIntervalMs = ms;
    }

    async connect(config: Record<string, string>): Promise<void> {
        const webhookUrl = config.webhookUrl;
        const botToken = config.botToken;

        if (!webhookUrl && !botToken) {
            throw new Error('Slack webhookUrl or botToken is required');
        }

        // Verify botToken if provided
        if (botToken) {
            const res = await httpRequest('https://slack.com/api/auth.test', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${botToken}`,
                    'Content-Type': 'application/json',
                },
            });

            if (res.status !== 200) {
                throw new Error(`Slack auth failed (status ${res.status})`);
            }

            const data = JSON.parse(res.body);
            if (!data.ok) {
                throw new Error(
                    `Slack auth failed: ${data.error || 'unknown'}`,
                );
            }

            this.botToken = botToken;
        }

        if (webhookUrl) {
            this.webhookUrl = webhookUrl;
        }

        this.connected = true;

        if (config.pollInterval) {
            this.pollIntervalMs =
                parseInt(config.pollInterval, 10) || DEFAULT_POLL_INTERVAL_MS;
        }

        // Start polling configured channels
        if (config.channels && this.botToken) {
            const channels = config.channels
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean);
            for (const ch of channels) {
                this.startPolling(ch);
            }
        }

        console.log('[SlackAdapter] Connected');
    }

    async disconnect(): Promise<void> {
        for (const [, timer] of this.pollTimers) {
            clearInterval(timer);
        }
        this.pollTimers.clear();
        this.lastTimestamps.clear();
        this.connected = false;
        this.webhookUrl = '';
        this.botToken = '';
        console.log('[SlackAdapter] Disconnected');
    }

    async send(
        channel: string,
        message: string,
    ): Promise<{ success: boolean; error?: string }> {
        if (!this.connected) {
            return { success: false, error: 'Not connected' };
        }

        // Prefer webhook if available
        if (this.webhookUrl) {
            try {
                const res = await httpRequest(this.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: message, channel }),
                });

                if (res.status >= 200 && res.status < 300) {
                    return { success: true };
                }
                return {
                    success: false,
                    error: `Slack webhook error (${res.status})`,
                };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        }

        // Fallback to chat.postMessage with botToken
        if (this.botToken) {
            try {
                const res = await httpRequest(
                    'https://slack.com/api/chat.postMessage',
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${this.botToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ channel, text: message }),
                    },
                );

                const data = JSON.parse(res.body);
                if (data.ok) {
                    return { success: true };
                }
                return {
                    success: false,
                    error: `Slack API error: ${data.error}`,
                };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        }

        return { success: false, error: 'No webhook or token configured' };
    }

    // ── Polling ────────────────────────────────────────────────────────────

    private startPolling(channelId: string): void {
        if (this.pollTimers.has(channelId)) return;

        const timer = setInterval(() => {
            this.pollChannel(channelId).catch((err) => {
                console.warn(
                    `[SlackAdapter] Poll error for ${channelId}:`,
                    err.message,
                );
            });
        }, this.pollIntervalMs);

        this.pollTimers.set(channelId, timer);
    }

    private async pollChannel(channelId: string): Promise<void> {
        if (!this.connected || !this.botToken) return;

        let url = `https://slack.com/api/conversations.history?channel=${channelId}&limit=10`;
        const oldest = this.lastTimestamps.get(channelId);
        if (oldest) {
            url += `&oldest=${oldest}`;
        }

        try {
            const res = await httpRequest(url, {
                headers: { Authorization: `Bearer ${this.botToken}` },
            });

            if (res.status !== 200) return;

            const data = JSON.parse(res.body);
            if (!data.ok || !Array.isArray(data.messages)) return;

            // Slack returns newest first, reverse
            const messages = data.messages.reverse();
            if (messages.length === 0) return;

            // Track latest timestamp
            this.lastTimestamps.set(
                channelId,
                messages[messages.length - 1].ts,
            );

            for (const msg of messages) {
                // Skip bot messages
                if (msg.bot_id) continue;

                const incoming: IncomingMessage = {
                    adapterId: this.id,
                    channel: channelId,
                    sender: msg.user || 'unknown',
                    content: msg.text || '',
                    timestamp: parseFloat(msg.ts) * 1000,
                    raw: msg,
                };

                this.onMessage?.(incoming);
            }
        } catch {
            /* silently ignore poll errors */
        }
    }
}

// ── MessengerBridge ────────────────────────────────────────────────────────

class MessengerBridge extends EventEmitter {
    private adapters = new Map<string, MessengerAdapter>();

    constructor() {
        super();
        // Register built-in adapters
        this.registerBuiltinAdapters();
    }

    private registerBuiltinAdapters(): void {
        const discord = new DiscordAdapter();
        discord.setMessageHandler((msg) => this.handleIncomingMessage(msg));

        const slack = new SlackAdapter();
        slack.setMessageHandler((msg) => this.handleIncomingMessage(msg));

        this.adapters.set('discord', discord);
        this.adapters.set('slack', slack);
    }

    /**
     * Register a custom adapter.
     */
    registerAdapter(adapter: MessengerAdapter): void {
        this.adapters.set(adapter.id, adapter);
    }

    /**
     * Get adapter by ID.
     */
    getAdapter(id: string): MessengerAdapter | undefined {
        return this.adapters.get(id);
    }

    /**
     * List all adapters with connection status.
     */
    listAdapters(): { id: string; name: string; connected: boolean }[] {
        return [...this.adapters.values()].map((a) => ({
            id: a.id,
            name: a.name,
            connected: a.connected,
        }));
    }

    /**
     * Connect an adapter with config. Persists config to electron-store.
     */
    async connect(
        adapterId: string,
        config: Record<string, string>,
    ): Promise<{ success: boolean; error?: string }> {
        const adapter = this.adapters.get(adapterId);
        if (!adapter) {
            return { success: false, error: `Unknown adapter: ${adapterId}` };
        }

        try {
            await adapter.connect(config);

            // Persist config (redact tokens for logging, but store full config)
            const configs = messengerStore.get('configs') as Record<
                string,
                Record<string, string>
            >;
            configs[adapterId] = config;
            messengerStore.set('configs', configs);

            this.emit('adapter:connected', adapterId);
            console.log(`[MessengerBridge] ${adapterId} connected`);
            return { success: true };
        } catch (err: any) {
            console.error(
                `[MessengerBridge] Failed to connect ${adapterId}:`,
                err.message,
            );
            return { success: false, error: err.message };
        }
    }

    /**
     * Disconnect an adapter.
     */
    async disconnect(
        adapterId: string,
    ): Promise<{ success: boolean; error?: string }> {
        const adapter = this.adapters.get(adapterId);
        if (!adapter) {
            return { success: false, error: `Unknown adapter: ${adapterId}` };
        }

        try {
            await adapter.disconnect();
            this.emit('adapter:disconnected', adapterId);
            console.log(`[MessengerBridge] ${adapterId} disconnected`);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Send a message via an adapter.
     */
    async send(
        adapterId: string,
        channel: string,
        message: string,
    ): Promise<{ success: boolean; error?: string }> {
        const adapter = this.adapters.get(adapterId);
        if (!adapter) {
            return { success: false, error: `Unknown adapter: ${adapterId}` };
        }
        if (!adapter.connected) {
            return { success: false, error: `${adapterId} is not connected` };
        }

        return adapter.send(channel, message);
    }

    /**
     * Disconnect all adapters (app shutdown).
     */
    async disconnectAll(): Promise<void> {
        for (const [id, adapter] of this.adapters) {
            if (adapter.connected) {
                try {
                    await adapter.disconnect();
                } catch {
                    /* ignore cleanup errors */
                }
                console.log(`[MessengerBridge] ${id} disconnected (cleanup)`);
            }
        }
    }

    // ── Internal ───────────────────────────────────────────────────────────

    private handleIncomingMessage(msg: IncomingMessage): void {
        this.emit('message:received', msg);
    }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const messengerBridge = new MessengerBridge();
