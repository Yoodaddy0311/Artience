import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

const mockState = vi.hoisted(() => ({
    storeData: {
        sessionIds: {} as Record<string, string>,
    } as Record<string, unknown>,
    spawnCalls: [] as {
        command: string;
        args: string[];
        proc: FakeProc;
    }[],
}));

class FakeStream extends EventEmitter {
    write = vi.fn();
    writable = true;
}

class FakeProc extends EventEmitter {
    pid = 1234;
    stdout = new FakeStream();
    stderr = new FakeStream();
    stdin = new FakeStream();
    kill = vi.fn();
}

vi.mock('child_process', async () => {
    const spawn = vi.fn((command: string, args: string[]) => {
        const proc = new FakeProc();
        mockState.spawnCalls.push({
            command,
            args: [...args],
            proc,
        });
        return proc;
    });

    return {
        default: { spawn },
        spawn,
    };
});

vi.mock('electron-store', () => ({
    default: class MockStore {
        constructor(options?: { defaults?: Record<string, unknown> }) {
            const defaults = options?.defaults ?? {};
            for (const [key, value] of Object.entries(defaults)) {
                if (!(key in mockState.storeData)) {
                    mockState.storeData[key] = JSON.parse(
                        JSON.stringify(value),
                    );
                }
            }
        }

        get(key: string) {
            return mockState.storeData[key];
        }

        set(key: string, value: unknown) {
            mockState.storeData[key] = value;
        }
    },
}));

async function createReadySession(
    manager: { createSession: (...args: any[]) => Promise<string> },
    agentId: string,
    cwd: string,
    extraArgs?: string[],
) {
    const promise = manager.createSession(agentId, 'Rio', cwd, extraArgs);
    await vi.advanceTimersByTimeAsync(200);
    await promise;
}

function emitJson(proc: FakeProc, payload: unknown) {
    proc.stdout.emit('data', Buffer.from(`${JSON.stringify(payload)}\n`));
}

describe('ChatSessionManager', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();
        mockState.spawnCalls.length = 0;
        mockState.storeData = {
            sessionIds: {},
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('builds different session keys for different projects and modes', async () => {
        const { buildChatSessionKey } =
            await import('../../../electron/chat-session-manager');

        expect(
            buildChatSessionKey('a02', 'C:/Repo-A', ['--agents', '{}']),
        ).not.toBe(buildChatSessionKey('a02', 'C:/Repo-B', ['--agents', '{}']));

        expect(buildChatSessionKey('a02', 'C:/Repo-A')).not.toBe(
            buildChatSessionKey('a02', 'C:/Repo-A', ['--agents', '{}']),
        );
    });

    it('resumes only when the saved session belongs to the same scoped project', async () => {
        const { ChatSessionManager } =
            await import('../../../electron/chat-session-manager');
        const manager = new ChatSessionManager();

        await createReadySession(manager, 'a02', 'C:/Repo-A');
        emitJson(mockState.spawnCalls[0].proc, {
            session_id: 'session-repo-a',
            type: 'result',
            result: 'done',
        });
        manager.closeSession('a02');

        await createReadySession(manager, 'a02', 'C:/Repo-A');
        expect(mockState.spawnCalls[1].args).toContain('--resume');
        expect(mockState.spawnCalls[1].args).toContain('session-repo-a');

        manager.closeSession('a02');
        await createReadySession(manager, 'a02', 'C:/Repo-B');
        expect(mockState.spawnCalls[2].args).not.toContain('session-repo-a');
    });

    it('queues messages FIFO and drains only after the active response ends', async () => {
        const { ChatSessionManager } =
            await import('../../../electron/chat-session-manager');
        const manager = new ChatSessionManager();

        await createReadySession(manager, 'a02', 'C:/Repo-A');

        manager.sendMessage('a02', 'first message');
        manager.sendMessage('a02', 'second message');

        const proc = mockState.spawnCalls[0].proc;
        expect(proc.stdin.write).toHaveBeenCalledTimes(1);
        expect(String(proc.stdin.write.mock.calls[0][0])).toContain(
            'first message',
        );

        emitJson(proc, {
            type: 'result',
            result: 'done',
        });

        expect(proc.stdin.write).toHaveBeenCalledTimes(2);
        expect(String(proc.stdin.write.mock.calls[1][0])).toContain(
            'second message',
        );
    });

    it('preserves extra args when a session falls back to per-message spawns', async () => {
        const { ChatSessionManager } =
            await import('../../../electron/chat-session-manager');
        const manager = new ChatSessionManager();

        await createReadySession(manager, 'a02', 'C:/Repo-A', [
            '--agents',
            '{"reviewer":true}',
        ]);

        const session = manager.getSession('a02');
        expect(session).toBeDefined();
        session!.mode = 'fallback';
        session!.proc = null;

        manager.sendMessage('a02', 'delegate work');

        expect(mockState.spawnCalls).toHaveLength(2);
        expect(mockState.spawnCalls[1].args).toContain('--agents');
        expect(mockState.spawnCalls[1].args).toContain(
            '{"reviewer":true}',
        );
    });
});
