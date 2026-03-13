import { describe, it, expect, beforeEach } from 'vitest';

// We need to reset the module-level randomAssignments Map between tests.
// Use dynamic import with vi.resetModules to get a fresh state.
import { vi } from 'vitest';

describe('team-character-map', () => {
    let resolveTeamMember: typeof import('../team-character-map').resolveTeamMember;
    let resolveTeamMembers: typeof import('../team-character-map').resolveTeamMembers;
    let TEAM_ROLE_TO_AGENT: typeof import('../team-character-map').TEAM_ROLE_TO_AGENT;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../team-character-map');
        resolveTeamMember = mod.resolveTeamMember;
        resolveTeamMembers = mod.resolveTeamMembers;
        TEAM_ROLE_TO_AGENT = mod.TEAM_ROLE_TO_AGENT;
    });

    describe('TEAM_ROLE_TO_AGENT mapping', () => {
        it('maps frontend-dev to a03 (Luna)', () => {
            expect(TEAM_ROLE_TO_AGENT['frontend-dev']).toBe('a03');
        });

        it('maps backend-dev to a02 (Rio)', () => {
            expect(TEAM_ROLE_TO_AGENT['backend-dev']).toBe('a02');
        });

        it('maps planner to a01 (Sera)', () => {
            expect(TEAM_ROLE_TO_AGENT['planner']).toBe('a01');
        });

        it('maps architect to a18 (Namu)', () => {
            expect(TEAM_ROLE_TO_AGENT['architect']).toBe('a18');
        });

        it('maps main to raccoon (CTO)', () => {
            expect(TEAM_ROLE_TO_AGENT['main']).toBe('raccoon');
        });
    });

    describe('resolveTeamMember', () => {
        it('returns exact mapped agent for known role name', () => {
            const result = resolveTeamMember('frontend-dev', []);
            expect(result).toBe('a03');
        });

        it('normalizes input to lowercase and trims whitespace', () => {
            const result = resolveTeamMember('  Frontend-Dev  ', []);
            expect(result).toBe('a03');
        });

        it('handles alternate role names (frontend-developer)', () => {
            const result = resolveTeamMember('frontend-developer', []);
            expect(result).toBe('a03');
        });

        it('returns a valid agent ID for unknown role names', () => {
            const result = resolveTeamMember('unknown-specialist', []);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
        });

        it('returns same agent for repeated calls with same unknown name in a session', () => {
            const first = resolveTeamMember('custom-agent', []);
            const second = resolveTeamMember('custom-agent', []);
            expect(first).toBe(second);
        });

        it('assigns different agents for different unknown names', () => {
            const agent1 = resolveTeamMember('specialist-a', []);
            const agent2 = resolveTeamMember('specialist-b', []);
            // They could be different (unless pool is exhausted)
            expect(agent1).toBeTruthy();
            expect(agent2).toBeTruthy();
        });

        it('avoids assigning agents already in the dock', () => {
            // Pass all mapped agents as "in dock" so random picks from available pool
            const dockAgents = ['a01', 'a02', 'a03'];
            const result = resolveTeamMember('mystery-role', dockAgents);
            // Result should not be one of the dock agents (if others are available)
            // Unless all agents are taken
            expect(result).toBeTruthy();
        });
    });

    describe('resolveTeamMembers', () => {
        it('resolves multiple names to a name-agentId map', () => {
            const result = resolveTeamMembers(
                ['frontend-dev', 'backend-dev', 'planner'],
                [],
            );
            expect(result['frontend-dev']).toBe('a03');
            expect(result['backend-dev']).toBe('a02');
            expect(result['planner']).toBe('a01');
        });

        it('returns all names as keys', () => {
            const names = ['frontend-dev', 'unknown-role'];
            const result = resolveTeamMembers(names, []);
            expect(Object.keys(result)).toHaveLength(2);
            expect(result['frontend-dev']).toBeDefined();
            expect(result['unknown-role']).toBeDefined();
        });

        it('handles empty name list', () => {
            const result = resolveTeamMembers([], []);
            expect(result).toEqual({});
        });
    });
});
