import { AGENT_PERSONAS } from '../src/data/agent-personas';
import { recommendAgents } from './agent-recommender';

export interface TeamSelectionOptions {
    seedTask?: string;
    preferredAgents?: string[];
    maxAgents?: number;
}

export const DEFAULT_TEAM_AGENT_KEYS = ['sera', 'rio', 'luna', 'ara'] as const;
export const DEFAULT_TEAM_MAX_AGENTS = 4;

const PERSONA_TOKEN_MAP = new Map<string, string>();

function normalizeAgentToken(value: string): string {
    return value
        .trim()
        .replace(/^@+/, '')
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

for (const agentKey of Object.keys(AGENT_PERSONAS)) {
    PERSONA_TOKEN_MAP.set(normalizeAgentToken(agentKey), agentKey);
}

export function resolvePersonaKey(value: string): string | undefined {
    return PERSONA_TOKEN_MAP.get(normalizeAgentToken(value));
}

export function selectTeamAgentKeys(
    options: TeamSelectionOptions = {},
): string[] {
    const {
        seedTask = '',
        preferredAgents = [],
        maxAgents = DEFAULT_TEAM_MAX_AGENTS,
    } = options;

    const selected: string[] = [];
    const seen = new Set<string>();

    const addAgent = (agentKey?: string) => {
        if (!agentKey || agentKey === 'dokba' || seen.has(agentKey)) return;
        seen.add(agentKey);
        selected.push(agentKey);
    };

    for (const preferredAgent of preferredAgents) {
        addAgent(resolvePersonaKey(preferredAgent));
    }

    if (seedTask.trim()) {
        const recommendedAgents = recommendAgents(seedTask, maxAgents + 2);
        for (const recommendation of recommendedAgents) {
            addAgent(recommendation.agentId.toLowerCase());
            if (selected.length >= maxAgents) {
                return selected.slice(0, maxAgents);
            }
        }
    }

    for (const fallbackAgent of DEFAULT_TEAM_AGENT_KEYS) {
        addAgent(fallbackAgent);
        if (selected.length >= maxAgents) {
            break;
        }
    }

    return selected.slice(0, maxAgents);
}

export function buildCompactTeamPrompt(agentKey: string): string {
    const persona = AGENT_PERSONAS[agentKey];
    if (!persona) {
        return [
            `You are ${agentKey}.`,
            'Stay within your specialty.',
            'Return short, concrete results.',
        ].join('\n');
    }

    const name = agentKey.charAt(0).toUpperCase() + agentKey.slice(1);
    return [
        `You are ${name}.`,
        `Role: ${persona.role}.`,
        `Style: ${persona.personality}.`,
        'Stay in your specialty and avoid broad orchestration.',
        'Return concise, concrete implementation notes or findings.',
    ].join('\n');
}
