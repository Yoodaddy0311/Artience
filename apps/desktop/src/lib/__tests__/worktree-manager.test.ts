import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => {
    const fn = Object.assign(() => {}, { __promisify__: vi.fn() });
    return { default: { execFile: fn }, execFile: fn };
});
vi.mock('util', () => ({
    default: { promisify: vi.fn(() => vi.fn()) },
    promisify: vi.fn(() => vi.fn()),
}));
vi.mock('fs', () => ({
    default: {},
    existsSync: () => false,
    mkdirSync: () => {},
    rmSync: () => {},
}));
vi.mock('path', () => ({
    default: {
        join: (...args: string[]) => args.join('/'),
        dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
    },
    join: (...args: string[]) => args.join('/'),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
}));

import {
    validateAgentId,
    worktreeManager,
} from '../../../electron/worktree-manager';

describe('validateAgentId', () => {
    it('accepts alphanumeric ids', () => {
        expect(validateAgentId('sera')).toBe(true);
        expect(validateAgentId('rio123')).toBe(true);
    });

    it('accepts hyphens and underscores', () => {
        expect(validateAgentId('agent-1')).toBe(true);
        expect(validateAgentId('agent_2')).toBe(true);
        expect(validateAgentId('my-agent_3')).toBe(true);
    });

    it('rejects empty string', () => {
        expect(validateAgentId('')).toBe(false);
    });

    it('rejects path traversal characters', () => {
        expect(validateAgentId('../evil')).toBe(false);
        expect(validateAgentId('a/b')).toBe(false);
        expect(validateAgentId('a\\b')).toBe(false);
    });

    it('rejects special characters', () => {
        expect(validateAgentId('agent;rm -rf')).toBe(false);
        expect(validateAgentId('agent$(cmd)')).toBe(false);
        expect(validateAgentId('agent name')).toBe(false);
        expect(validateAgentId('agent.name')).toBe(false);
    });

    it('rejects ids longer than 64 characters', () => {
        const longId = 'a'.repeat(65);
        expect(validateAgentId(longId)).toBe(false);
    });

    it('accepts id exactly 64 characters', () => {
        const maxId = 'a'.repeat(64);
        expect(validateAgentId(maxId)).toBe(true);
    });
});

describe('worktreeManager.getWorktreePath', () => {
    it('constructs correct path', () => {
        const result = worktreeManager.getWorktreePath('sera', '/project');
        expect(result).toContain('.claude');
        expect(result).toContain('worktrees');
        expect(result).toContain('sera');
    });

    it('handles different agent ids', () => {
        const path1 = worktreeManager.getWorktreePath('luna', '/project');
        const path2 = worktreeManager.getWorktreePath('rio', '/project');
        expect(path1).not.toBe(path2);
    });

    it('uses project dir as base', () => {
        const result = worktreeManager.getWorktreePath('test', '/my/project');
        expect(result.startsWith('/my/project')).toBe(true);
    });
});
