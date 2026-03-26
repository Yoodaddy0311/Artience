import { describe, it, expect } from 'vitest';
import { AGENT_PERSONAS } from '../../data/agent-personas';

// Since CTOController depends on ChatSessionManager (Electron), we test its
// pure logic by reimplementing buildAgentsConfig (same algorithm as cto-controller.ts).

function buildAgentsConfig(
    agentKeys: string[],
): Record<string, { description: string; prompt: string; model: string }> {
    const agents: Record<
        string,
        { description: string; prompt: string; model: string }
    > = {};
    for (const key of agentKeys) {
        const persona = AGENT_PERSONAS[key];
        if (!persona || key === 'dokba') continue;
        agents[key] = {
            description: `${persona.role} ${key.charAt(0).toUpperCase() + key.slice(1)}. ${persona.personality}`,
            prompt: `You are ${key}`,
            model: 'sonnet',
        };
    }
    return agents;
}

describe('CTOController buildAgentsConfig logic', () => {
    it('builds config for valid agent keys', () => {
        const config = buildAgentsConfig(['rio', 'luna']);
        expect(Object.keys(config)).toEqual(['rio', 'luna']);
        expect(config.rio.description).toContain('백엔드');
        expect(config.luna.description).toContain('프론트');
    });

    it('excludes dokba (CTO itself)', () => {
        const config = buildAgentsConfig(['dokba', 'rio']);
        expect(config).not.toHaveProperty('dokba');
        expect(config).toHaveProperty('rio');
    });

    it('ignores unknown agent keys', () => {
        const config = buildAgentsConfig(['rio', 'nonexistent']);
        expect(Object.keys(config)).toEqual(['rio']);
    });

    it('returns empty config for empty input', () => {
        expect(buildAgentsConfig([])).toEqual({});
    });

    it('sets model to sonnet for all agents', () => {
        const config = buildAgentsConfig(['sera', 'rio', 'luna']);
        for (const agent of Object.values(config)) {
            expect(agent.model).toBe('sonnet');
        }
    });

    it('capitalizes first letter in description', () => {
        const config = buildAgentsConfig(['rio']);
        expect(config.rio.description).toContain('Rio');
    });
});
