import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsBridge, type WsBridgeOptions } from '../transport/ws-bridge.js';
import type { TownWsMessage } from '@dokba/shared-types';

// ── Mock WebSocket ──

const mockWsInstances: MockWsInstance[] = [];

interface MockWsInstance {
    url: string;
    listeners: Record<string, ((...args: unknown[]) => void)[]>;
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    on(event: string, cb: (...args: unknown[]) => void): void;
    _emit(event: string, ...args: unknown[]): void;
}

function createMockWs(url: string): MockWsInstance {
    const instance: MockWsInstance = {
        url,
        listeners: {},
        readyState: 0,
        send: vi.fn(),
        close: vi.fn(),
        on(event: string, cb: (...args: unknown[]) => void) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(cb);
        },
        _emit(event: string, ...args: unknown[]) {
            for (const cb of this.listeners[event] ?? []) {
                cb(...args);
            }
        },
    };
    mockWsInstances.push(instance);
    return instance;
}

vi.mock('ws', () => {
    function MockWebSocket(url: string) {
        return createMockWs(url);
    }
    const WS = MockWebSocket as unknown as {
        new (url: string): MockWsInstance;
        OPEN: number;
        CLOSED: number;
    };
    (WS as unknown as Record<string, unknown>).OPEN = 1;
    (WS as unknown as Record<string, unknown>).CLOSED = 3;
    return { default: WS };
});

const defaultOptions: WsBridgeOptions = {
    serverUrl: 'http://localhost:3000',
    room: 'test-room',
    token: 'test-token',
};

describe('WsBridge', () => {
    beforeEach(() => {
        mockWsInstances.length = 0;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('builds correct WS URL from http serverUrl', () => {
            const bridge = new WsBridge(defaultOptions);
            expect(bridge).toBeDefined();
        });

        it('handles https to wss conversion', () => {
            const bridge = new WsBridge({
                ...defaultOptions,
                serverUrl: 'https://example.com',
            });
            expect(bridge).toBeDefined();
        });

        it('strips trailing slashes from serverUrl', () => {
            const bridge = new WsBridge({
                ...defaultOptions,
                serverUrl: 'http://localhost:3000///',
            });
            expect(bridge).toBeDefined();
        });

        it('initializes empty roomState and taskQueue', () => {
            const bridge = new WsBridge(defaultOptions);
            expect(bridge.roomState).toEqual({});
            expect(bridge.taskQueue).toEqual([]);
        });
    });

    describe('connect()', () => {
        it('resolves and sends CLIENT_IDENTIFY on open', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();

            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');

            await connectPromise;

            expect(ws.send).toHaveBeenCalledWith(
                expect.stringContaining('"type":"CLIENT_IDENTIFY"'),
            );
            const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
            expect(sent.clientType).toBe('mcp');
            expect(sent.room).toBe('test-room');
        });

        it('rejects on auth failure (code 4001)', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();

            const ws = mockWsInstances[0];
            ws._emit('close', 4001);

            await expect(connectPromise).rejects.toThrow(
                'Authentication failed',
            );
        });

        it('rejects on initial error before connected', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();

            const ws = mockWsInstances[0];
            ws._emit('error', new Error('Connection refused'));

            await expect(connectPromise).rejects.toThrow('Connection refused');
        });
    });

    describe('message handling', () => {
        it('dispatches parsed messages to handlers', async () => {
            const bridge = new WsBridge(defaultOptions);
            const handler = vi.fn();
            bridge.onMessage(handler);

            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const msg: TownWsMessage = {
                type: 'CHAT_MESSAGE',
                agentId: 'a1',
                content: 'hello',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            expect(handler).toHaveBeenCalledWith(msg);
        });

        it('handles invalid JSON gracefully', async () => {
            const bridge = new WsBridge(defaultOptions);
            const handler = vi.fn();
            bridge.onMessage(handler);

            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            ws._emit('message', Buffer.from('{invalid}'));

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('processIncoming', () => {
        it('updates roomState on AGENT_STATE_CHANGE', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const msg: TownWsMessage = {
                type: 'AGENT_STATE_CHANGE',
                agentId: 'agent-1',
                state: 'CODING',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            expect(bridge.roomState.agents).toBeDefined();
            const agents = bridge.roomState.agents as Record<
                string,
                { state: string }
            >;
            expect(agents['agent-1'].state).toBe('CODING');
        });

        it('queues TASK_ASSIGN messages', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const msg: TownWsMessage = {
                type: 'TASK_ASSIGN',
                taskId: 't1',
                prompt: 'Do something',
                agentId: 'a1',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            expect(bridge.taskQueue).toHaveLength(1);
            expect(bridge.taskQueue[0]).toEqual(msg);
        });

        it('queues CHAT_COMMAND messages', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const msg: TownWsMessage = {
                type: 'CHAT_COMMAND',
                target_agent: 'dev',
                text: 'Fix bug',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            expect(bridge.taskQueue).toHaveLength(1);
        });

        it('does not queue other message types', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const msg: TownWsMessage = {
                type: 'CHAT_MESSAGE',
                agentId: 'a1',
                content: 'hello',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            expect(bridge.taskQueue).toHaveLength(0);
        });
    });

    describe('send() / sendRaw()', () => {
        it('returns true and sends when connected', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const msg: TownWsMessage = {
                type: 'TASK_RESULT',
                success: true,
                output: 'done',
            };
            const result = bridge.send(msg);

            expect(result).toBe(true);
            expect(ws.send).toHaveBeenCalledTimes(2); // CLIENT_IDENTIFY + our msg
        });

        it('returns false when not connected', () => {
            const bridge = new WsBridge(defaultOptions);
            const result = bridge.sendRaw({ type: 'test' });
            expect(result).toBe(false);
        });
    });

    describe('disconnect()', () => {
        it('closes websocket and prevents reconnect', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            bridge.disconnect();

            expect(ws.close).toHaveBeenCalledWith(1000, 'MCP server shutdown');

            // No reconnect after explicit disconnect
            ws._emit('close', 1000);
            const countBefore = mockWsInstances.length;
            vi.advanceTimersByTime(60000);
            expect(mockWsInstances.length).toBe(countBefore);
        });
    });

    describe('isConnected', () => {
        it('returns false initially', () => {
            const bridge = new WsBridge(defaultOptions);
            expect(bridge.isConnected).toBe(false);
        });

        it('returns true when OPEN', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            expect(bridge.isConnected).toBe(true);
        });
    });

    describe('waitForMessage()', () => {
        it('resolves when matching message arrives', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const waitPromise = bridge.waitForMessage(
                (msg) => msg.type === 'TASK_RESULT',
            );

            const msg: TownWsMessage = {
                type: 'TASK_RESULT',
                success: true,
                output: 'result',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            const result = await waitPromise;
            expect(result.type).toBe('TASK_RESULT');
        });

        it('rejects on timeout', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const waitPromise = bridge.waitForMessage(() => false, 1000);

            vi.advanceTimersByTime(1001);

            await expect(waitPromise).rejects.toThrow(
                'Timeout waiting for message',
            );
        });

        it('ignores non-matching messages', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const waitPromise = bridge.waitForMessage(
                (msg) => msg.type === 'TASK_RESULT',
            );

            // Send non-matching message
            ws._emit(
                'message',
                Buffer.from(
                    JSON.stringify({
                        type: 'CHAT_MESSAGE',
                        agentId: 'a1',
                        content: 'hi',
                    }),
                ),
            );

            // Send matching message
            const msg: TownWsMessage = {
                type: 'TASK_RESULT',
                success: true,
                output: 'done',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            const result = await waitPromise;
            expect(result.type).toBe('TASK_RESULT');
        });

        it('cleans up handler after resolving', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const waitPromise = bridge.waitForMessage(
                (msg) => msg.type === 'TASK_RESULT',
            );

            const msg: TownWsMessage = {
                type: 'TASK_RESULT',
                success: true,
                output: 'done',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            await waitPromise;

            // Handler should have been cleaned up - no error on further messages
            ws._emit(
                'message',
                Buffer.from(
                    JSON.stringify({
                        type: 'CHAT_MESSAGE',
                        agentId: 'a1',
                        content: 'no error',
                    }),
                ),
            );
        });
    });

    describe('reconnect logic', () => {
        it('schedules reconnect on non-auth close', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            ws._emit('close', 1006);

            const countBefore = mockWsInstances.length;
            vi.advanceTimersByTime(2000);
            expect(mockWsInstances.length).toBe(countBefore + 1);
        });

        it('stops after 10 reconnect attempts', async () => {
            const bridge = new WsBridge(defaultOptions);
            const connectPromise = bridge.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            // Simulate 11 closes (exceeds max of 10)
            for (let i = 0; i < 11; i++) {
                const current = mockWsInstances[mockWsInstances.length - 1];
                current._emit('close', 1006);
                vi.advanceTimersByTime(60000);
            }

            const finalCount = mockWsInstances.length;
            vi.advanceTimersByTime(60000);
            expect(mockWsInstances.length).toBe(finalCount);
        });
    });
});
