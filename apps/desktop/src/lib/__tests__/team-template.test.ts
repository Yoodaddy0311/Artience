import { describe, it, expect, vi } from 'vitest';

vi.mock('electron-store', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            get: vi.fn(() => ({})),
            set: vi.fn(),
        })),
    };
});

import {
    DEFAULT_TEMPLATES,
    teamTemplateManager,
} from '../../../electron/team-template';

describe('DEFAULT_TEMPLATES', () => {
    it('has 5 templates', () => {
        expect(DEFAULT_TEMPLATES).toHaveLength(5);
    });

    it('each template has required fields', () => {
        for (const tpl of DEFAULT_TEMPLATES) {
            expect(tpl.id).toBeTruthy();
            expect(tpl.name).toBeTruthy();
            expect(tpl.description).toBeTruthy();
            expect(tpl.agents.length).toBeGreaterThan(0);
            expect(tpl.suggestedFor.length).toBeGreaterThan(0);
        }
    });

    it('has unique IDs', () => {
        const ids = DEFAULT_TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes fullstack-dev, security-audit, content-team, architecture-review, rapid-prototype', () => {
        const ids = DEFAULT_TEMPLATES.map((t) => t.id);
        expect(ids).toContain('fullstack-dev');
        expect(ids).toContain('security-audit');
        expect(ids).toContain('content-team');
        expect(ids).toContain('architecture-review');
        expect(ids).toContain('rapid-prototype');
    });
});

describe('teamTemplateManager', () => {
    describe('getTemplate', () => {
        it('returns template by id', () => {
            const tpl = teamTemplateManager.getTemplate('fullstack-dev');
            expect(tpl).toBeDefined();
            expect(tpl!.name).toBe('풀스택 개발');
        });

        it('returns undefined for unknown id', () => {
            expect(
                teamTemplateManager.getTemplate('nonexistent'),
            ).toBeUndefined();
        });
    });

    describe('listTemplates', () => {
        it('returns at least default templates', () => {
            const list = teamTemplateManager.listTemplates();
            expect(list.length).toBeGreaterThanOrEqual(5);
        });
    });

    describe('suggestTemplate', () => {
        it('suggests fullstack-dev for "react frontend backend"', () => {
            const tpl = teamTemplateManager.suggestTemplate(
                'react frontend backend',
            );
            expect(tpl).toBeTruthy();
            expect(tpl!.id).toBe('fullstack-dev');
        });

        it('suggests security-audit for "보안 감사 vulnerability"', () => {
            const tpl = teamTemplateManager.suggestTemplate(
                '보안 감사 vulnerability',
            );
            expect(tpl).toBeTruthy();
            expect(tpl!.id).toBe('security-audit');
        });

        it('suggests architecture-review for "성능 아키텍처"', () => {
            const tpl = teamTemplateManager.suggestTemplate('성능 아키텍처');
            expect(tpl).toBeTruthy();
            expect(tpl!.id).toBe('architecture-review');
        });

        it('suggests rapid-prototype for "mvp prototype quick"', () => {
            const tpl = teamTemplateManager.suggestTemplate(
                'mvp prototype quick',
            );
            expect(tpl).toBeTruthy();
            expect(tpl!.id).toBe('rapid-prototype');
        });

        it('returns null for completely unrelated description', () => {
            const tpl = teamTemplateManager.suggestTemplate(
                'xyzzy alien invasion',
            );
            expect(tpl).toBeNull();
        });
    });

    describe('validateTemplate', () => {
        it('valid template with all known agents', () => {
            const tpl = teamTemplateManager.getTemplate('fullstack-dev')!;
            const result = teamTemplateManager.validateTemplate(tpl);
            expect(result.valid).toBe(true);
            expect(result.missing).toEqual([]);
        });

        it('invalid template with unknown agent', () => {
            const result = teamTemplateManager.validateTemplate({
                id: 'test',
                name: 'Test',
                description: 'test',
                agents: [
                    {
                        role: 'Unknown',
                        agentId: 'nonexistent_agent',
                        required: true,
                    },
                ],
                suggestedFor: [],
            });
            expect(result.valid).toBe(false);
            expect(result.missing).toContain('nonexistent_agent');
        });
    });
});
