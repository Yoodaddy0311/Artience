/**
 * Claude Code team member name → Dokba character (agentId) mapping.
 *
 * When a /team session spawns teammates (e.g. @frontend-dev, @planner),
 * this module resolves each name to a Dokba agent so the character can
 * appear in BottomDock / AgentTown automatically.
 */

import { DEFAULT_AGENTS } from '../types/platform';

// Claude Code teammate name (or role keyword) → Dokba agentId
export const TEAM_ROLE_TO_AGENT: Record<string, string> = {
    'frontend-dev': 'a03',           // Luna (프론트엔드 개발)
    'frontend-developer': 'a03',
    'backend-dev': 'a02',            // Rio (백엔드 개발)
    'backend-developer': 'a02',
    'planner': 'a01',                // Sera (PM / 총괄)
    'code-reviewer': 'a16',          // Podo (코드 리뷰)
    'inspector': 'a16',
    'security-reviewer': 'a08',      // Duri (보안 감사)
    'database-reviewer': 'a10',      // Toto (DB 관리)
    'devops-engineer': 'a06',        // Miso (DevOps)
    'build-error-resolver': 'a19',   // Gomi (빌드 관리)
    'doc-updater': 'a09',            // Bomi (기술 문서화)
    'tdd-guide': 'a05',              // Ara (QA 테스트)
    'e2e-runner': 'a17',             // Jelly (로그 분석 → E2E)
    'performance-engineer': 'a13',   // Somi (성능 최적화)
    'refactor-cleaner': 'a22',       // Kongbi (의존성 관리)
    'typescript-pro': 'a11',         // Nari (API 설계 → TS)
    'architect': 'a18',              // Namu (아키텍처)
    'main': 'raccoon',               // Dokba (CTO) — @main은 리더
};

// All agent IDs from DEFAULT_AGENTS (for random fallback)
const ALL_AGENT_IDS = DEFAULT_AGENTS
    .filter(a => a.id !== 'cto')
    .map(a => a.id);

// Track randomly assigned agents within a session to avoid duplicates
const randomAssignments = new Map<string, string>();

/**
 * Resolve a Claude Code team member name to a Dokba agentId.
 * Falls back to a random unassigned character if no explicit mapping exists.
 */
export function resolveTeamMember(name: string, currentDockAgents: string[]): string {
    const normalized = name.toLowerCase().trim();

    // Exact match in mapping table
    if (TEAM_ROLE_TO_AGENT[normalized]) {
        return TEAM_ROLE_TO_AGENT[normalized];
    }

    // Already randomly assigned in this session
    if (randomAssignments.has(normalized)) {
        return randomAssignments.get(normalized)!;
    }

    // Pick a random agent not already in dock or assigned
    const usedIds = new Set([
        ...currentDockAgents,
        ...Object.values(TEAM_ROLE_TO_AGENT),
        ...randomAssignments.values(),
    ]);
    const available = ALL_AGENT_IDS.filter(id => !usedIds.has(id));

    const agentId = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : ALL_AGENT_IDS[Math.floor(Math.random() * ALL_AGENT_IDS.length)];

    randomAssignments.set(normalized, agentId);
    return agentId;
}

/**
 * Resolve an array of team member names to a name→agentId map.
 */
export function resolveTeamMembers(
    names: string[],
    currentDockAgents: string[],
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const name of names) {
        result[name] = resolveTeamMember(name, currentDockAgents);
    }
    return result;
}
