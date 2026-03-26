import { describe, it, expect } from 'vitest';
import { AGENT_PERSONAS } from '../../data/agent-personas';

/**
 * agent-db.ts uses electron-store which is unavailable in jsdom.
 * We test the patterns and data it depends on (AGENT_PERSONAS).
 */

describe('agent-db data source (AGENT_PERSONAS)', () => {
    it('has at least 26 agent entries', () => {
        expect(Object.keys(AGENT_PERSONAS).length).toBeGreaterThanOrEqual(26);
    });

    it('each persona has role and personality strings', () => {
        for (const [key, persona] of Object.entries(AGENT_PERSONAS)) {
            expect(persona.role, `${key} missing role`).toBeTruthy();
            expect(typeof persona.role).toBe('string');
            expect(
                persona.personality,
                `${key} missing personality`,
            ).toBeTruthy();
            expect(typeof persona.personality).toBe('string');
        }
    });

    it('includes known core agents', () => {
        const coreAgents = [
            'sera',
            'rio',
            'luna',
            'alex',
            'ara',
            'miso',
            'dokba',
        ];
        for (const id of coreAgents) {
            expect(
                AGENT_PERSONAS[id],
                `Missing core agent: ${id}`,
            ).toBeDefined();
        }
    });

    it('does not have empty role or personality', () => {
        for (const [key, persona] of Object.entries(AGENT_PERSONAS)) {
            expect(
                persona.role.trim().length,
                `${key} has empty role`,
            ).toBeGreaterThan(0);
            expect(
                persona.personality.trim().length,
                `${key} has empty personality`,
            ).toBeGreaterThan(0);
        }
    });
});
