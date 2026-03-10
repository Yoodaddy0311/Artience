// ── Agent Stats (6 dimensions) ──

export interface AgentStats {
    coding: number;
    analysis: number;
    speed: number;
    accuracy: number;
    creativity: number;
    teamwork: number;
}

// ── Growth Profile ──

export interface AgentGrowthProfile {
    agentId: string;
    level: number;
    exp: number;
    expToNext: number;
    totalExp: number;
    stats: AgentStats;
    skills: SkillProgress[];
    memories: AgentMemory[];
    traits: AgentTrait[];
    relationships: AgentRelationship[];
    evolution: EvolutionState;
    streakDays: number;
    lastActiveAt: number;
    createdAt: number;
    taskHistory: TaskHistoryEntry[];
}

// ── Skill Tree ──

export interface SkillNode {
    id: string;
    name: string;
    category: SkillCategory;
    description: string;
    maxLevel: number;
    prerequisites: string[];
    statBonuses: Partial<AgentStats>;
}

export interface SkillProgress {
    skillId: string;
    level: number;
    exp: number;
    unlockedAt?: number;
}

export type SkillCategory =
    | 'frontend'
    | 'backend'
    | 'testing'
    | 'devops'
    | 'architecture'
    | 'communication';

// ── Agent Memory ──

export interface AgentMemory {
    id: string;
    type: MemoryType;
    content: string;
    context: string;
    importance: number;
    createdAt: number;
    accessCount: number;
    lastAccessedAt: number;
}

export type MemoryType =
    | 'pattern'
    | 'preference'
    | 'lesson'
    | 'shortcut'
    | 'relationship';

// ── Agent Trait ──

export interface AgentTrait {
    id: string;
    name: string;
    description: string;
    strength: number;
    acquiredAt: number;
    source: string;
}

// ── Agent Relationship ──

export interface AgentRelationship {
    targetAgentId: string;
    affinity: number;
    collaborationCount: number;
    synergyBonus: number;
    lastInteraction: number;
}

// ── Evolution ──

export interface EvolutionState {
    stage: EvolutionStage;
    stageProgress: number;
    specialization: string | null;
    unlockedAbilities: string[];
}

export type EvolutionStage =
    | 'novice'
    | 'apprentice'
    | 'journeyman'
    | 'expert'
    | 'master'
    | 'legendary';

// ── Task History ──

export interface TaskHistoryEntry {
    timestamp: number;
    taskType: string;
    toolsUsed: string[];
    expEarned: number;
    skillCategory: SkillCategory;
    duration: number;
    success: boolean;
}

// ── Constants ──

export const LEVEL_EXP_TABLE: number[] = Array.from({ length: 99 }, (_, i) =>
    Math.round(100 * Math.pow(1.15, i)),
);

export const EVOLUTION_STAGES: Record<
    EvolutionStage,
    { minLevel: number; maxLevel: number }
> = {
    novice: { minLevel: 1, maxLevel: 10 },
    apprentice: { minLevel: 11, maxLevel: 25 },
    journeyman: { minLevel: 26, maxLevel: 50 },
    expert: { minLevel: 51, maxLevel: 75 },
    master: { minLevel: 76, maxLevel: 99 },
    legendary: { minLevel: 99, maxLevel: 99 },
};

// ── Factory ──

export function createDefaultGrowthProfile(
    agentId: string,
): AgentGrowthProfile {
    return {
        agentId,
        level: 1,
        exp: 0,
        expToNext: LEVEL_EXP_TABLE[0],
        totalExp: 0,
        stats: {
            coding: 1,
            analysis: 1,
            speed: 1,
            accuracy: 1,
            creativity: 1,
            teamwork: 1,
        },
        skills: [],
        memories: [],
        traits: [],
        relationships: [],
        evolution: {
            stage: 'novice',
            stageProgress: 0,
            specialization: null,
            unlockedAbilities: [],
        },
        streakDays: 0,
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
        taskHistory: [],
    };
}
