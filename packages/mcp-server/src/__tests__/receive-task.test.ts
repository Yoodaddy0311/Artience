import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerReceiveTask } from '../tools/receive-task.js';
import type { WsBridge } from '../transport/ws-bridge.js';
import type { AgentRegistry } from '../agent-registry.js';

// ── Mock skill-injector ──
vi.mock('../skill-injector.js', () => ({
    injectSkillContext: vi.fn((desc: string) => {
        if (desc.includes('frontend')) {
            return [{ skillName: 'frontend-patterns', summary: 'FE patterns' }];
        }
        return [];
    }),
}));

// ── Helper types ──
type ToolCallback = () => Promise<{
    content: { type: string; text: string }[];
    isError?: boolean;
}>;

interface MockMcpServer {
    tool: ReturnType<typeof vi.fn>;
}

function createMockServer(): MockMcpServer {
    return { tool: vi.fn() };
}

function getToolCallback(server: MockMcpServer): ToolCallback {
    return server.tool.mock.calls[0][3] as ToolCallback;
}

function createMockBridge(
    overrides: Partial<{ isConnected: boolean; taskQueue: unknown[] }> = {},
): WsBridge {
    return {
        isConnected: overrides.isConnected ?? true,
        taskQueue: (overrides.taskQueue ?? []) as WsBridge['taskQueue'],
    } as WsBridge;
}

function createMockRegistry(
    recommendation: ReturnType<AgentRegistry['recommendJob']> = null,
    size = 1,
): AgentRegistry {
    return {
        size,
        recommendJob: vi.fn(() => recommendation),
    } as unknown as AgentRegistry;
}

describe('registerReceiveTask', () => {
    let server: MockMcpServer;

    beforeEach(() => {
        server = createMockServer();
        vi.clearAllMocks();
    });

    it('registers tool with correct name and description', () => {
        registerReceiveTask(
            server as unknown as Parameters<typeof registerReceiveTask>[0],
            () => null,
        );

        expect(server.tool).toHaveBeenCalledWith(
            'receive-task',
            expect.any(String),
            {},
            expect.any(Function),
        );
    });

    describe('when bridge is not connected', () => {
        it('returns error when bridge is null', async () => {
            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => null,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Not connected');
        });

        it('returns error when bridge is disconnected', async () => {
            const bridge = createMockBridge({ isConnected: false });
            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Not connected');
        });
    });

    describe('when queue is empty', () => {
        it('returns waiting message', async () => {
            const bridge = createMockBridge({ taskQueue: [] });
            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('No pending tasks');
        });
    });

    describe('when queue has tasks', () => {
        it('shifts and returns TASK_ASSIGN task with prompt field', async () => {
            const task = {
                type: 'TASK_ASSIGN' as const,
                taskId: 't1',
                prompt: 'Build a button',
                agentId: 'a1',
            };
            const bridge = createMockBridge({ taskQueue: [task] });
            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.type).toBe('TASK_ASSIGN');
            expect(parsed.prompt).toBe('Build a button');
            expect(bridge.taskQueue.length).toBe(0);
        });

        it('returns CHAT_COMMAND task with text field', async () => {
            const task = {
                type: 'CHAT_COMMAND' as const,
                target_agent: 'dev',
                text: 'Fix the frontend bug',
            };
            const bridge = createMockBridge({ taskQueue: [task] });
            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.type).toBe('CHAT_COMMAND');
            expect(parsed.text).toBe('Fix the frontend bug');
        });

        it('extracts prompt from taskContent field (TaskAssigned)', async () => {
            const task = {
                type: 'TASK_ASSIGNED',
                agent: 'dev',
                taskContent: 'Deploy the frontend app',
            };
            const bridge = createMockBridge({ taskQueue: [task] });
            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.taskContent).toBe('Deploy the frontend app');
        });
    });

    describe('enrichment', () => {
        it('adds agent recommendation when registry is available', async () => {
            const task = {
                type: 'TASK_ASSIGN' as const,
                taskId: 't1',
                prompt: 'Build a react component',
                agentId: 'a1',
            };
            const bridge = createMockBridge({ taskQueue: [task] });
            const registry = createMockRegistry({
                agentName: 'frontend-developer',
                jobId: 'FE_DEV' as const,
                category: 'expert',
                tier: 'high' as const,
            });

            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
                () => registry,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed._enrichment).toBeDefined();
            expect(parsed._enrichment.recommendedAgent.agentName).toBe(
                'frontend-developer',
            );
            expect(parsed._enrichment.recommendedAgent.jobId).toBe('FE_DEV');
        });

        it('adds skill context when keywords match', async () => {
            const task = {
                type: 'TASK_ASSIGN' as const,
                taskId: 't1',
                prompt: 'Implement frontend login',
                agentId: 'a1',
            };
            const bridge = createMockBridge({ taskQueue: [task] });

            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed._enrichment).toBeDefined();
            expect(parsed._enrichment.skillContext).toHaveLength(1);
            expect(parsed._enrichment.skillContext[0].skillName).toBe(
                'frontend-patterns',
            );
        });

        it('skips enrichment when no matches', async () => {
            const task = {
                type: 'TASK_ASSIGN' as const,
                taskId: 't1',
                prompt: 'Do something generic',
                agentId: 'a1',
            };
            const bridge = createMockBridge({ taskQueue: [task] });
            const registry = createMockRegistry(null, 1);

            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
                () => registry,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed._enrichment).toBeUndefined();
        });

        it('skips registry when size is 0', async () => {
            const task = {
                type: 'TASK_ASSIGN' as const,
                taskId: 't1',
                prompt: 'Build a react component',
                agentId: 'a1',
            };
            const bridge = createMockBridge({ taskQueue: [task] });
            const registry = createMockRegistry(null, 0);

            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
                () => registry,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            const parsed = JSON.parse(result.content[0].text);
            // No agent recommendation (registry size 0), no skill match (no frontend keyword)
            expect(parsed._enrichment).toBeUndefined();
            expect(registry.recommendJob).not.toHaveBeenCalled();
        });

        it('skips registry when getRegistry is not provided', async () => {
            const task = {
                type: 'TASK_ASSIGN' as const,
                taskId: 't1',
                prompt: 'Build something',
                agentId: 'a1',
            };
            const bridge = createMockBridge({ taskQueue: [task] });

            registerReceiveTask(
                server as unknown as Parameters<typeof registerReceiveTask>[0],
                () => bridge,
            );
            const callback = getToolCallback(server);
            const result = await callback();

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed._enrichment).toBeUndefined();
        });
    });
});
