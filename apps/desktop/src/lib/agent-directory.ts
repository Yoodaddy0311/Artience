import { DEFAULT_AGENTS, type AgentProfile } from '../types/platform';

const RACCOON_AGENT: AgentProfile = {
    id: 'raccoon',
    name: 'Dokba',
    role: 'AI 어시스턴트',
    sprite: '/assets/characters/dokba_profile.png',
    state: 'IDLE',
    currentJobId: null,
    home: { x: 20, y: 14 },
    pos: { x: 20, y: 14 },
};

const ALL_AGENTS: AgentProfile[] = [RACCOON_AGENT, ...DEFAULT_AGENTS];
const AGENT_BY_ID = new Map(ALL_AGENTS.map((agent) => [agent.id, agent]));

function normalizeAgentToken(value: string): string {
    return value
        .trim()
        .replace(/^@+/, '')
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

const ALIASES = new Map<string, string>();

for (const agent of ALL_AGENTS) {
    ALIASES.set(normalizeAgentToken(agent.id), agent.id);
    ALIASES.set(normalizeAgentToken(agent.name), agent.id);
}

ALIASES.set('dokba', 'raccoon');
ALIASES.set('raccoon', 'raccoon');
ALIASES.set('cto', 'raccoon');
ALIASES.set('main', 'raccoon');

export function getAgentProfile(agentId: string): AgentProfile | undefined {
    return AGENT_BY_ID.get(agentId);
}

export function getAgentDisplayName(agentId: string): string {
    return AGENT_BY_ID.get(agentId)?.name ?? agentId;
}

export function resolveAgentId(rawValue?: string | null): string | undefined {
    if (!rawValue) return undefined;
    return ALIASES.get(normalizeAgentToken(rawValue));
}
