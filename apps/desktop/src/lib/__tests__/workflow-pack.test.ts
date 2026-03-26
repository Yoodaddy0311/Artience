import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('fs', () => ({
    default: {},
    existsSync: () => false,
}));
vi.mock('path', () => ({
    default: { join: (...args: string[]) => args.join('/') },
    join: (...args: string[]) => args.join('/'),
}));

import {
    DEFAULT_PACKS,
    workflowPackManager,
} from '../../../electron/workflow-pack';
import type { WorkflowPack } from '../../../electron/workflow-pack';

describe('DEFAULT_PACKS', () => {
    it('has 6 packs', () => {
        expect(DEFAULT_PACKS).toHaveLength(6);
    });

    it('each pack has required fields', () => {
        for (const pack of DEFAULT_PACKS) {
            expect(pack.id).toBeTruthy();
            expect(pack.name).toBeTruthy();
            expect(pack.description).toBeTruthy();
            expect(pack.icon).toBeTruthy();
            expect(pack.agents.length).toBeGreaterThan(0);
            expect(pack.triggers.length).toBeGreaterThan(0);
            expect(pack.settings).toBeDefined();
            expect(pack.settings.maxConcurrentAgents).toBeGreaterThan(0);
        }
    });

    it('has unique IDs', () => {
        const ids = DEFAULT_PACKS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes dev, report, novel, video, web_research, roleplay', () => {
        const ids = DEFAULT_PACKS.map((p) => p.id);
        expect(ids).toContain('dev');
        expect(ids).toContain('report');
        expect(ids).toContain('novel');
        expect(ids).toContain('video');
        expect(ids).toContain('web_research');
        expect(ids).toContain('roleplay');
    });
});

describe('workflowPackManager', () => {
    describe('list', () => {
        it('returns all packs', () => {
            expect(workflowPackManager.list()).toHaveLength(6);
        });
    });

    describe('get', () => {
        it('returns pack by id', () => {
            const pack = workflowPackManager.get('dev');
            expect(pack).toBeDefined();
            expect(pack!.name).toBe('개발 팩');
        });

        it('returns undefined for unknown id', () => {
            expect(workflowPackManager.get('nonexistent')).toBeUndefined();
        });
    });

    describe('apply', () => {
        it('applies pack successfully', () => {
            const result = workflowPackManager.apply('dev');
            expect(result.success).toBe(true);
            expect(result.packId).toBe('dev');
            expect(result.agentsAdded.length).toBeGreaterThan(0);
        });

        it('returns error for unknown pack', () => {
            const result = workflowPackManager.apply('nonexistent');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Pack not found');
        });

        it('sets active pack id', () => {
            workflowPackManager.apply('report');
            expect(workflowPackManager.getActive()).toBe('report');
        });
    });

    describe('getActive / setActive', () => {
        it('starts with no active pack', () => {
            workflowPackManager.setActive(null);
            expect(workflowPackManager.getActive()).toBeNull();
        });

        it('can set and get active pack', () => {
            workflowPackManager.setActive('novel');
            expect(workflowPackManager.getActive()).toBe('novel');
        });
    });

    describe('dev pack details', () => {
        it('has correct agents for dev pack', () => {
            const pack = workflowPackManager.get('dev')!;
            expect(pack.agents).toContain('rio');
            expect(pack.agents).toContain('luna');
            expect(pack.agents).toContain('ara');
        });

        it('has correct triggers for dev pack', () => {
            const pack = workflowPackManager.get('dev')!;
            expect(pack.triggers).toContain('package.json');
            expect(pack.triggers).toContain('tsconfig.json');
        });
    });
});
