// ── Character Growth System Types ──
// Extends the base growth system (growth.ts) with RPG character sheet mechanics.

import type {
    AgentGrowthProfile,
    EvolutionState,
    TaskHistoryEntry,
} from './growth';

// ── Primary Stats (7 axes, 0~100) ──

export interface PrimaryStats {
    coding: number;
    analysis: number;
    writing: number;
    design: number;
    testing: number;
    review: number;
    planning: number;
}

// ── Specialization Tree (21 sub-fields, 0~50, capped at primaryStat/2) ──

export interface SpecializationTree {
    // coding subtree
    frontend: number;
    backend: number;
    systems: number;
    // analysis subtree
    debugging: number;
    performance: number;
    security: number;
    // writing subtree
    documentation: number;
    communication: number;
    content: number;
    // design subtree
    architecture: number;
    database: number;
    api: number;
    // testing subtree
    unitTesting: number;
    integration: number;
    automation: number;
    // review subtree
    codeQuality: number;
    securityReview: number;
    performanceReview: number;
    // planning subtree
    taskDecomposition: number;
    estimation: number;
    stakeholder: number;
}

/** Which primary stat each specialization belongs to */
export const SPEC_TO_PRIMARY: Record<
    keyof SpecializationTree,
    keyof PrimaryStats
> = {
    frontend: 'coding',
    backend: 'coding',
    systems: 'coding',
    debugging: 'analysis',
    performance: 'analysis',
    security: 'analysis',
    documentation: 'writing',
    communication: 'writing',
    content: 'writing',
    architecture: 'design',
    database: 'design',
    api: 'design',
    unitTesting: 'testing',
    integration: 'testing',
    automation: 'testing',
    codeQuality: 'review',
    securityReview: 'review',
    performanceReview: 'review',
    taskDecomposition: 'planning',
    estimation: 'planning',
    stakeholder: 'planning',
};

// ── Autonomy Level ──

export type AutonomyLevel = 0 | 1 | 2 | 3;

// ── Character Sheet ──

export interface CharacterSheet {
    agentId: string;
    agentName: string;

    // Level & EXP
    level: number; // 1~100
    exp: number;
    expToNext: number;
    totalExp: number;

    // Stats
    primaryStats: PrimaryStats;
    specializations: SpecializationTree;

    // Skills
    equippedSkills: string[];
    maxSkillSlots: number; // 2~8 based on level

    // Growth points
    statPointsAvailable: number;
    specPointsAvailable: number;

    // Evolution
    evolution: EvolutionState;
    autonomyLevel: AutonomyLevel;

    // Meta
    streakDays: number;
    lastActiveAt: number;
    createdAt: number;
}

// ── Skill Candidate (pattern detection) ──

export interface SkillCandidate {
    name: string;
    description: string;
    detectedPattern: {
        toolSequence: string[];
        filePattern: string;
        frequency: number;
    };
    requiredLevel: number;
    category: string;
    statRequirements: Partial<PrimaryStats>;
}

// ── Generated Skill ──

export interface GeneratedSkill {
    skillId: string;
    agentId: string;
    name: string;
    filePath: string;
    detectedAt: number;
    generatedAt: number;
    usageCount: number;
}

// ── Level-Up ──

export interface LevelUpReward {
    statPoints: number;
    specPoints: number;
    newSkillSlot: boolean;
    autonomyUnlock: AutonomyLevel | null;
    abilityUnlock: string | null;
}

export interface LevelUpEvent {
    agentId: string;
    oldLevel: number;
    newLevel: number;
    reward: LevelUpReward;
    timestamp: number;
}

// ── Storage Schema (electron-store) ──

export interface CharacterGrowthStoreSchema {
    version: number;
    sheets: Record<string, CharacterSheet>;
    skillCandidates: Record<string, SkillCandidate[]>;
    generatedSkills: Record<string, GeneratedSkill[]>;
    levelUpHistory: LevelUpEvent[];
}

// ── Constants ──

export const LEVEL_EXP_TABLE_V2: number[] = Array.from(
    { length: 100 },
    (_, i) => Math.round(100 * Math.pow(1.15, i)),
);

/** Level thresholds where skill slots are gained */
export const SKILL_SLOT_LEVELS = [5, 10, 20, 30, 40, 50] as const;

/** Character-role initial stat presets */
export const CHARACTER_INITIAL_STATS: Record<string, Partial<PrimaryStats>> = {
    sera: { planning: 15, writing: 12, design: 8 },
    rio: { coding: 15, analysis: 10, testing: 8 },
    luna: { coding: 15, design: 10, review: 8 },
    ara: { testing: 15, analysis: 12, review: 8 },
    duri: { analysis: 15, review: 12, testing: 8 },
    podo: { review: 15, analysis: 10, coding: 8 },
    namu: { design: 15, planning: 12, analysis: 8 },
    miso: { coding: 12, testing: 10, planning: 8 },
    toto: { design: 15, analysis: 12, coding: 8 },
    somi: { analysis: 15, coding: 12, testing: 8 },
    alex: { analysis: 15, writing: 12, planning: 8 },
    bomi: { writing: 15, design: 10, planning: 8 },
    hana: { design: 15, writing: 12, coding: 8 },
    dari: { writing: 15, analysis: 10, planning: 8 },
    nari: { design: 12, coding: 10, analysis: 8 },
    ruru: { coding: 12, planning: 10, testing: 8 },
    choco: { testing: 12, coding: 10, planning: 8 },
    maru: { analysis: 12, testing: 10, writing: 8 },
    jelly: { analysis: 15, coding: 10, writing: 8 },
    gomi: { coding: 12, testing: 10, design: 8 },
    ppuri: { coding: 12, testing: 10, planning: 8 },
    kongbi: { analysis: 12, coding: 10, planning: 8 },
    baduk: { coding: 12, analysis: 10, testing: 8 },
    tangi: { analysis: 12, coding: 10, design: 8 },
    moong: { coding: 12, analysis: 10, review: 8 },
    dokba: { coding: 10, analysis: 10, writing: 10 },
};

// ── Pure Functions ──

export function createDefaultPrimaryStats(): PrimaryStats {
    return {
        coding: 1,
        analysis: 1,
        writing: 1,
        design: 1,
        testing: 1,
        review: 1,
        planning: 1,
    };
}

export function createDefaultSpecializations(): SpecializationTree {
    return {
        frontend: 0,
        backend: 0,
        systems: 0,
        debugging: 0,
        performance: 0,
        security: 0,
        documentation: 0,
        communication: 0,
        content: 0,
        architecture: 0,
        database: 0,
        api: 0,
        unitTesting: 0,
        integration: 0,
        automation: 0,
        codeQuality: 0,
        securityReview: 0,
        performanceReview: 0,
        taskDecomposition: 0,
        estimation: 0,
        stakeholder: 0,
    };
}

/**
 * Diminishing-returns stat gain.
 * Low stats grow fast, high stats grow slowly.
 * currentValue=0 → 100% efficiency, currentValue=100 → ~17% efficiency
 */
export function calculateStatGain(
    currentValue: number,
    baseGain: number,
): number {
    const efficiency = Math.max(0.1, 1 - currentValue / 120);
    return Math.round(baseGain * efficiency * 100) / 100;
}

/**
 * Compute level-up reward for reaching a given level.
 */
export function getLevelUpReward(newLevel: number): LevelUpReward {
    const isMultipleOf5 = newLevel % 5 === 0;
    return {
        statPoints: isMultipleOf5 ? 3 : 2,
        specPoints: 1,
        newSkillSlot: (SKILL_SLOT_LEVELS as readonly number[]).includes(
            newLevel,
        ),
        autonomyUnlock:
            newLevel === 10
                ? 1
                : newLevel === 25
                  ? 2
                  : newLevel === 50
                    ? 3
                    : null,
        abilityUnlock:
            newLevel === 20
                ? 'job-scheduling'
                : newLevel === 30
                  ? 'workflow-creation'
                  : newLevel === 60
                    ? 'team-leader'
                    : null,
    };
}

/**
 * Calculate max skill slots for a given level.
 */
export function getMaxSkillSlots(level: number): number {
    let slots = 2;
    for (const threshold of SKILL_SLOT_LEVELS) {
        if (level >= threshold) slots++;
    }
    return Math.min(slots, 8);
}

/**
 * Get the specialization cap based on its parent primary stat value.
 * Spec values cannot exceed primaryStat / 2, max 50.
 */
export function getSpecCap(primaryStatValue: number): number {
    return Math.min(Math.floor(primaryStatValue / 2), 50);
}

/**
 * Build evolving system prompt based on character sheet and base persona.
 */
export function buildEvolvingSystemPrompt(
    sheet: CharacterSheet,
    basePersona: string,
): string {
    const sections: string[] = [basePersona];

    if (sheet.level >= 50) {
        sections.push(
            '## 경험 수준\n당신은 전문가입니다. 독립적으로 의사결정하고, 중요한 사항만 보고하세요.',
        );
    } else if (sheet.level >= 25) {
        sections.push(
            '## 경험 수준\n당신은 시니어 레벨입니다. 복잡한 판단을 자율적으로 내리고, 실행 후 결과를 보고하세요.',
        );
    } else if (sheet.level >= 10) {
        sections.push(
            '## 경험 수준\n당신은 초보를 벗어난 주니어입니다. 기본적인 판단을 자율적으로 내릴 수 있습니다.',
        );
    }

    const topSpecs = getTopSpecializations(sheet.specializations, 3);
    if (topSpecs.length > 0) {
        const specDesc = topSpecs
            .map((s) => `- ${s.name}: ${s.value}/50`)
            .join('\n');
        sections.push(
            `## 전문 분야\n다음 분야에 특화되어 있습니다:\n${specDesc}`,
        );
    }

    if (sheet.equippedSkills.length > 0) {
        sections.push(
            `## 활성 스킬\n/${sheet.equippedSkills.join(', /')} 명령어를 사용할 수 있습니다.`,
        );
    }

    return sections.join('\n\n');
}

/**
 * Get the top N specializations by value (excluding zeros).
 */
export function getTopSpecializations(
    specs: SpecializationTree,
    limit: number,
): { name: string; value: number }[] {
    return (Object.entries(specs) as [string, number][])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, value]) => ({ name, value }));
}

/**
 * Detect skill candidates from task history by analyzing tool sequence patterns.
 * Returns patterns that repeat >= minFrequency times and aren't already known skills.
 */
export function detectSkillCandidates(
    taskHistory: TaskHistoryEntry[],
    existingSkillIds: string[],
    minFrequency = 5,
): SkillCandidate[] {
    if (taskHistory.length < minFrequency) return [];

    // Build 3-gram tool sequences
    const ngramCounts = new Map<
        string,
        { tools: string[]; filePatterns: Set<string>; count: number }
    >();

    for (let i = 0; i <= taskHistory.length - 3; i++) {
        const window = taskHistory.slice(i, i + 3);
        const tools = window.flatMap((t) => t.toolsUsed).filter(Boolean);
        if (tools.length < 2) continue;

        const key = tools.sort().join('+');
        const existing = ngramCounts.get(key);
        if (existing) {
            existing.count++;
            const category = window[0]?.skillCategory;
            if (category) existing.filePatterns.add(category);
        } else {
            const category = window[0]?.skillCategory;
            ngramCounts.set(key, {
                tools: [...new Set(tools)],
                filePatterns: new Set(category ? [category] : []),
                count: 1,
            });
        }
    }

    const candidates: SkillCandidate[] = [];

    for (const [key, data] of ngramCounts) {
        if (data.count < minFrequency) continue;

        const skillId = key.toLowerCase().replace(/\+/g, '-');
        if (existingSkillIds.includes(skillId)) continue;

        candidates.push({
            name: skillId,
            description: `Auto-detected pattern: ${data.tools.join(' → ')} (${data.count} occurrences)`,
            detectedPattern: {
                toolSequence: data.tools,
                filePattern: [...data.filePatterns].join(',') || '*',
                frequency: data.count,
            },
            requiredLevel: 1,
            category: [...data.filePatterns][0] || 'backend',
            statRequirements: {},
        });
    }

    return candidates.sort(
        (a, b) => b.detectedPattern.frequency - a.detectedPattern.frequency,
    );
}

/**
 * Migrate old AgentGrowthProfile to new CharacterSheet format.
 */
export function migrateGrowthProfile(
    profile: AgentGrowthProfile,
): CharacterSheet {
    return {
        agentId: profile.agentId,
        agentName: profile.agentId,
        level: profile.level,
        exp: profile.exp,
        expToNext: profile.expToNext,
        totalExp: profile.totalExp,
        primaryStats: {
            coding: profile.stats.coding,
            analysis: profile.stats.analysis,
            writing: 1,
            design: profile.stats.creativity,
            testing: 1,
            review: profile.stats.accuracy,
            planning: profile.stats.teamwork,
        },
        specializations: createDefaultSpecializations(),
        equippedSkills: profile.skills.map((s) => s.skillId),
        maxSkillSlots: getMaxSkillSlots(profile.level),
        statPointsAvailable: 0,
        specPointsAvailable: 0,
        evolution: profile.evolution,
        autonomyLevel: 0,
        streakDays: profile.streakDays,
        lastActiveAt: profile.lastActiveAt,
        createdAt: profile.createdAt,
    };
}
