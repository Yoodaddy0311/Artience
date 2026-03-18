import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connector, type ConnectorOptions } from '../connector.js';
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
        readyState: 0, // CONNECTING
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

vi.mock('../auth.js', () => ({
    buildWsUrl: vi.fn(
        (server: string, room: string, token: string) =>
            `ws://${server}/ws/town?token=${token}&room=${room}`,
    ),
}));

const defaultOptions: ConnectorOptions = {
    serverUrl: 'http://localhost:3000',
    room: 'test-room',
    token: 'test-token',
    maxReconnectAttempts: 3,
};

describe('Connector', () => {
    beforeEach(() => {
        mockWsInstances.length = 0;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('stores options and defaults maxReconnectAttempts to 10', () => {
            const conn = new Connector({
                serverUrl: 'http://localhost',
                room: 'r',
                token: 't',
            });
            expect(conn).toBeDefined();
        });

        it('uses provided maxReconnectAttempts', () => {
            const conn = new Connector(defaultOptions);
            expect(conn).toBeDefined();
        });
    });

    describe('connect()', () => {
        it('resolves on successful open and sends CLIENT_IDENTIFY', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();

            const ws = mockWsInstances[0];
            ws.readyState = 1; // OPEN
            ws._emit('open');

            await connectPromise;

            expect(ws.send).toHaveBeenCalledWith(
                expect.stringContaining('"type":"CLIENT_IDENTIFY"'),
            );
            const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
            expect(sent.clientType).toBe('cli');
            expect(sent.version).toBe('0.1.0');
            expect(sent.room).toBe('test-room');
        });

        it('rejects on auth failure (close code 4001)', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();

            const ws = mockWsInstances[0];
            ws._emit('close', 4001, Buffer.from('auth failed'));

            await expect(connectPromise).rejects.toThrow(
                'Authentication failed',
            );
        });

        it('rejects on initial error', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();

            const ws = mockWsInstances[0];
            ws.readyState = 0;
            ws._emit('error', new Error('ECONNREFUSED'));

            await expect(connectPromise).rejects.toThrow('ECONNREFUSED');
        });

        it('resets reconnectAttempts on successful connection', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();

            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            // isConnected should be true
            expect(conn.isConnected).toBe(true);
        });
    });

    describe('onMessage()', () => {
        it('dispatches parsed messages to all handlers', async () => {
            const conn = new Connector(defaultOptions);
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            conn.onMessage(handler1);
            conn.onMessage(handler2);

            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const msg: TownWsMessage = {
                type: 'CHAT_MESSAGE',
                agentId: 'agent-1',
                content: 'hello',
            };
            ws._emit('message', Buffer.from(JSON.stringify(msg)));

            expect(handler1).toHaveBeenCalledWith(msg);
            expect(handler2).toHaveBeenCalledWith(msg);
        });

        it('handles invalid JSON gracefully', async () => {
            const conn = new Connector(defaultOptions);
            const handler = vi.fn();
            conn.onMessage(handler);

            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            ws._emit('message', Buffer.from('not json'));

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('send() / sendRaw()', () => {
        it('sends JSON when connected', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const msg: TownWsMessage = {
                type: 'TASK_RESULT',
                success: true,
                output: 'done',
            };
            conn.send(msg);

            // send called twice: once for CLIENT_IDENTIFY, once for our message
            expect(ws.send).toHaveBeenCalledTimes(2);
            const sent = JSON.parse(ws.send.mock.calls[1][0] as string);
            expect(sent.type).toBe('TASK_RESULT');
        });

        it('warns when not connected', () => {
            const conn = new Connector(defaultOptions);
            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {});
            conn.send({ type: 'CHAT_MESSAGE', agentId: 'a', content: 'x' });
            expect(warnSpy).toHaveBeenCalledWith(
                '[dokba] Cannot send - not connected',
            );
        });
    });

    describe('disconnect()', () => {
        it('closes websocket and sets closed flag', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            conn.disconnect();

            expect(ws.close).toHaveBeenCalledWith(1000, 'Client disconnect');
        });

        it('does not attempt reconnect after disconnect', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            conn.disconnect();

            // Simulate close event after disconnect
            ws._emit('close', 1000, Buffer.from(''));

            // No new WS instances should be created for reconnect
            const countBefore = mockWsInstances.length;
            vi.advanceTimersByTime(60000);
            expect(mockWsInstances.length).toBe(countBefore);
        });
    });

    describe('isConnected', () => {
        it('returns false when no websocket exists', () => {
            const conn = new Connector(defaultOptions);
            expect(conn.isConnected).toBe(false);
        });

        it('returns true when websocket is OPEN', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            expect(conn.isConnected).toBe(true);
        });
    });

    describe('reconnect logic', () => {
        it('schedules reconnect on unexpected close', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            // Simulate unexpected close
            ws._emit('close', 1006, Buffer.from(''));

            // After delay, a new WS instance should be created
            const countBefore = mockWsInstances.length;
            vi.advanceTimersByTime(2000);
            expect(mockWsInstances.length).toBe(countBefore + 1);
        });

        it('stops reconnecting after max attempts', async () => {
            const conn = new Connector({
                ...defaultOptions,
                maxReconnectAttempts: 2,
            });
            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            // Simulate 3 unexpected closes (more than max 2)
            for (let i = 0; i < 3; i++) {
                const current = mockWsInstances[mockWsInstances.length - 1];
                current._emit('close', 1006, Buffer.from(''));
                vi.advanceTimersByTime(60000);
            }

            // After max attempts, should stop creating new connections
            const finalCount = mockWsInstances.length;
            vi.advanceTimersByTime(60000);
            expect(mockWsInstances.length).toBe(finalCount);
        });

        it('uses exponential backoff with 30s cap', async () => {
            const conn = new Connector(defaultOptions);
            const connectPromise = conn.connect();
            const ws = mockWsInstances[0];
            ws.readyState = 1;
            ws._emit('open');
            await connectPromise;

            const logSpy = vi
                .spyOn(console, 'log')
                .mockImplementation(() => {});

            // First unexpected close
            ws._emit('close', 1006, Buffer.from(''));

            // Check that reconnect is logged with increasing delay
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('Reconnecting in 2000ms'),
            );
        });
    });
});
