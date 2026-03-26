import { describe, expect, it } from 'vitest';
import {
    buildCompactTeamPrompt,
    DEFAULT_TEAM_AGENT_KEYS,
    resolvePersonaKey,
    selectTeamAgentKeys,
} from '../../../electron/team-agent-selection';

describe('team-agent-selection', () => {
    it('returns the default lightweight core team when no task is provided', () => {
        expect(selectTeamAgentKeys()).toEqual([...DEFAULT_TEAM_AGENT_KEYS]);
    });

    it('keeps preferred agents in the selected team', () => {
        const selected = selectTeamAgentKeys({
            seedTask: 'fix backend api latency',
            preferredAgents: ['Rio'],
        });

        expect(selected[0]).toBe('rio');
        expect(selected).toHaveLength(4);
    });

    it('pulls in non-core specialists for matching tasks', () => {
        const selected = selectTeamAgentKeys({
            seedTask: 'security review auth vulnerability and xss audit',
        });

        expect(selected).toContain('duri');
    });

    it('resolves persona keys from user-facing names', () => {
        expect(resolvePersonaKey('Rio')).toBe('rio');
        expect(resolvePersonaKey('@Luna')).toBe('luna');
    });

    it('builds a compact prompt instead of a long orchestration prompt', () => {
        const prompt = buildCompactTeamPrompt('rio');
        expect(prompt).toContain('Role:');
        expect(prompt).toContain('Stay in your specialty');
    });

    it('builds generic prompt for unknown agent', () => {
        const prompt = buildCompactTeamPrompt('unknownagent');
        expect(prompt).toContain('unknownagent');
        expect(prompt).toContain('specialty');
        expect(prompt).not.toContain('Role:');
    });

    it('excludes dokba from team selection', () => {
        const result = selectTeamAgentKeys({
            preferredAgents: ['dokba', 'sera'],
            maxAgents: 4,
        });
        expect(result).not.toContain('dokba');
    });

    it('respects maxAgents limit', () => {
        const result = selectTeamAgentKeys({ maxAgents: 2 });
        expect(result.length).toBeLessThanOrEqual(2);
    });

    it('strips @ prefix in resolvePersonaKey', () => {
        expect(resolvePersonaKey('@sera')).toBe('sera');
        expect(resolvePersonaKey('@@rio')).toBe('rio');
    });

    it('returns undefined for unknown persona', () => {
        expect(resolvePersonaKey('nonexistentagent')).toBeUndefined();
    });

    it('does not duplicate agents in selection', () => {
        const result = selectTeamAgentKeys({
            preferredAgents: ['sera', 'sera', 'rio'],
            maxAgents: 4,
        });
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
    });
});
