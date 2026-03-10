import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
    AgentGrowthProfile,
    AgentMemory,
    AgentTrait,
    SkillCategory,
    SkillProgress,
    TaskHistoryEntry,
    EvolutionStage,
} from '../types/growth';
import {
    createDefaultGrowthProfile,
    LEVEL_EXP_TABLE,
    EVOLUTION_STAGES,
} from '../types/growth';

// ── Helpers ──

function resolveEvolutionStage(level: number): EvolutionStage {
    const stages: EvolutionStage[] = [
        'legendary',
        'master',
        'expert',
        'journeyman',
        'apprentice',
        'novice',
    ];
    for (const stage of stages) {
        const { minLevel, maxLevel } = EVOLUTION_STAGES[stage];
        if (level >= minLevel && level <= maxLevel) return stage;
    }
    return 'novice';
}

function generateId(): string {
    return crypto.randomUUID();
}

const MAX_TASK_HISTORY = 500;
const MAX_MEMORIES = 200;

// ── Store Interface ──

interface LevelUpEntry {
    agentId: string;
    newLevel: number;
    agentName: string;
}

interface GrowthStore {
    profiles: Record<string, AgentGrowthProfile>;
    _hasHydrated: boolean;

    // Level-up notification queue (not persisted)
    levelUpQueue: LevelUpEntry[];
    pushLevelUp: (agentId: string, newLevel: number, agentName: string) => void;
    shiftLevelUp: () => void;

    // Profile management
    getOrCreateProfile: (agentId: string) => AgentGrowthProfile;

    // EXP and leveling
    addExp: (
        agentId: string,
        amount: number,
        taskType: string,
        toolsUsed: string[],
        skillCategory: SkillCategory,
    ) => void;

    // Skill management
    unlockSkill: (agentId: string, skillId: string) => void;
    addSkillExp: (agentId: string, skillId: string, amount: number) => void;

    // Memory management
    addMemory: (
        agentId: string,
        memory: Omit<
            AgentMemory,
            'id' | 'createdAt' | 'accessCount' | 'lastAccessedAt'
        >,
    ) => void;
    accessMemory: (agentId: string, memoryId: string) => void;

    // Trait management
    addTrait: (
        agentId: string,
        trait: Omit<AgentTrait, 'id' | 'acquiredAt'>,
    ) => void;

    // Relationship management
    updateRelationship: (
        agentId: string,
        targetId: string,
        delta: { affinity?: number; collaborationCount?: number },
    ) => void;

    // Task history
    recordTask: (
        agentId: string,
        entry: Omit<TaskHistoryEntry, 'timestamp'>,
    ) => void;
}

// ── Store Implementation ──

export const useGrowthStore = create<GrowthStore>()(
    persist(
        (set, get) => ({
            profiles: {},
            _hasHydrated: false,

            levelUpQueue: [],
            pushLevelUp: (agentId, newLevel, agentName) =>
                set((s) => ({
                    levelUpQueue: [
                        ...s.levelUpQueue,
                        { agentId, newLevel, agentName },
                    ],
                })),
            shiftLevelUp: () =>
                set((s) => ({
                    levelUpQueue: s.levelUpQueue.slice(1),
                })),

            getOrCreateProfile: (agentId) => {
                const existing = get().profiles[agentId];
                if (existing) return existing;

                const profile = createDefaultGrowthProfile(agentId);
                set((state) => ({
                    profiles: { ...state.profiles, [agentId]: profile },
                }));
                return profile;
            },

            addExp: (agentId, amount, taskType, toolsUsed, skillCategory) => {
                set((state) => {
                    const profile =
                        state.profiles[agentId] ??
                        createDefaultGrowthProfile(agentId);

                    let { level, exp, expToNext, totalExp } = profile;
                    exp += amount;
                    totalExp += amount;

                    // Multi-level-up loop
                    while (exp >= expToNext && level < 99) {
                        exp -= expToNext;
                        level++;
                        expToNext =
                            level < 99 ? LEVEL_EXP_TABLE[level - 1] : Infinity;
                    }

                    // Clamp at max level
                    if (level >= 99) {
                        level = 99;
                        exp = 0;
                        expToNext = Infinity;
                    }

                    const stage = resolveEvolutionStage(level);
                    const stageInfo = EVOLUTION_STAGES[stage];
                    const stageRange = stageInfo.maxLevel - stageInfo.minLevel;
                    const stageProgress =
                        stageRange > 0
                            ? (level - stageInfo.minLevel) / stageRange
                            : 1;

                    // Record task history entry
                    const entry: TaskHistoryEntry = {
                        timestamp: Date.now(),
                        taskType,
                        toolsUsed,
                        expEarned: amount,
                        skillCategory,
                        duration: 0,
                        success: true,
                    };
                    const taskHistory = [...profile.taskHistory, entry].slice(
                        -MAX_TASK_HISTORY,
                    );

                    return {
                        profiles: {
                            ...state.profiles,
                            [agentId]: {
                                ...profile,
                                level,
                                exp,
                                expToNext,
                                totalExp,
                                evolution: {
                                    ...profile.evolution,
                                    stage,
                                    stageProgress,
                                },
                                lastActiveAt: Date.now(),
                                taskHistory,
                            },
                        },
                    };
                });
            },

            unlockSkill: (agentId, skillId) => {
                set((state) => {
                    const profile = state.profiles[agentId];
                    if (!profile) return state;

                    const alreadyUnlocked = profile.skills.some(
                        (s) => s.skillId === skillId,
                    );
                    if (alreadyUnlocked) return state;

                    const newSkill: SkillProgress = {
                        skillId,
                        level: 1,
                        exp: 0,
                        unlockedAt: Date.now(),
                    };

                    return {
                        profiles: {
                            ...state.profiles,
                            [agentId]: {
                                ...profile,
                                skills: [...profile.skills, newSkill],
                            },
                        },
                    };
                });
            },

            addSkillExp: (agentId, skillId, amount) => {
                set((state) => {
                    const profile = state.profiles[agentId];
                    if (!profile) return state;

                    const skills = profile.skills.map((s) => {
                        if (s.skillId !== skillId) return s;
                        const newExp = s.exp + amount;
                        // Simple level-up: every 100 exp = 1 level, max 5
                        const levelsGained = Math.floor(newExp / 100);
                        const newLevel = Math.min(s.level + levelsGained, 5);
                        const remainingExp = newLevel >= 5 ? 0 : newExp % 100;
                        return { ...s, level: newLevel, exp: remainingExp };
                    });

                    return {
                        profiles: {
                            ...state.profiles,
                            [agentId]: { ...profile, skills },
                        },
                    };
                });
            },

            addMemory: (agentId, memory) => {
                set((state) => {
                    const profile =
                        state.profiles[agentId] ??
                        createDefaultGrowthProfile(agentId);

                    const newMemory: AgentMemory = {
                        ...memory,
                        id: generateId(),
                        createdAt: Date.now(),
                        accessCount: 0,
                        lastAccessedAt: Date.now(),
                    };

                    const memories = [...profile.memories, newMemory].slice(
                        -MAX_MEMORIES,
                    );

                    return {
                        profiles: {
                            ...state.profiles,
                            [agentId]: { ...profile, memories },
                        },
                    };
                });
            },

            accessMemory: (agentId, memoryId) => {
                set((state) => {
                    const profile = state.profiles[agentId];
                    if (!profile) return state;

                    const memories = profile.memories.map((m) =>
                        m.id === memoryId
                            ? {
                                  ...m,
                                  accessCount: m.accessCount + 1,
                                  lastAccessedAt: Date.now(),
                              }
                            : m,
                    );

                    return {
                        profiles: {
                            ...state.profiles,
                            [agentId]: { ...profile, memories },
                        },
                    };
                });
            },

            addTrait: (agentId, trait) => {
                set((state) => {
                    const profile =
                        state.profiles[agentId] ??
                        createDefaultGrowthProfile(agentId);

                    const newTrait: AgentTrait = {
                        ...trait,
                        id: generateId(),
                        acquiredAt: Date.now(),
                    };

                    return {
                        profiles: {
                            ...state.profiles,
                            [agentId]: {
                                ...profile,
                                traits: [...profile.traits, newTrait],
                            },
                        },
                    };
                });
            },

            updateRelationship: (agentId, targetId, delta) => {
                set((state) => {
                    const profile =
                        state.profiles[agentId] ??
                        createDefaultGrowthProfile(agentId);

                    const existingIdx = profile.relationships.findIndex(
                        (r) => r.targetAgentId === targetId,
                    );

                    let relationships;
                    if (existingIdx >= 0) {
                        relationships = profile.relationships.map((r, i) => {
                            if (i !== existingIdx) return r;
                            const affinity = Math.max(
                                -1,
                                Math.min(1, r.affinity + (delta.affinity ?? 0)),
                            );
                            const collaborationCount =
                                r.collaborationCount +
                                (delta.collaborationCount ?? 0);
                            const synergyBonus = Math.min(
                                0.5,
                                collaborationCount * 0.01,
                            );
                            return {
                                ...r,
                                affinity,
                                collaborationCount,
                                synergyBonus,
                                lastInteraction: Date.now(),
                            };
                        });
                    } else {
                        const affinity = Math.max(
                            -1,
                            Math.min(1, delta.affinity ?? 0),
                        );
                        const collaborationCount =
                            delta.collaborationCount ?? 0;
                        relationships = [
                            ...profile.relationships,
                            {
                                targetAgentId: targetId,
                                affinity,
                                collaborationCount,
                                synergyBonus: Math.min(
                                    0.5,
                                    collaborationCount * 0.01,
                                ),
                                lastInteraction: Date.now(),
                            },
                        ];
                    }

                    return {
                        profiles: {
                            ...state.profiles,
                            [agentId]: { ...profile, relationships },
                        },
                    };
                });
            },

            recordTask: (agentId, entry) => {
                set((state) => {
                    const profile =
                        state.profiles[agentId] ??
                        createDefaultGrowthProfile(agentId);

                    const fullEntry: TaskHistoryEntry = {
                        ...entry,
                        timestamp: Date.now(),
                    };

                    const taskHistory = [
                        ...profile.taskHistory,
                        fullEntry,
                    ].slice(-MAX_TASK_HISTORY);

                    return {
                        profiles: {
                            ...state.profiles,
                            [agentId]: {
                                ...profile,
                                taskHistory,
                                lastActiveAt: Date.now(),
                            },
                        },
                    };
                });
            },
        }),
        {
            name: 'dogba-growth-store',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                profiles: state.profiles,
            }),
            merge: (persisted: any, current) => {
                const merged = {
                    ...current,
                    ...(persisted as Partial<GrowthStore>),
                };
                // Patch profiles with missing array fields from schema evolution
                if (merged.profiles) {
                    for (const [id, profile] of Object.entries(
                        merged.profiles,
                    ) as [string, any][]) {
                        if (!profile) continue;
                        const defaults = createDefaultGrowthProfile(id);
                        profile.skills = profile.skills ?? defaults.skills;
                        profile.memories =
                            profile.memories ?? defaults.memories;
                        profile.traits = profile.traits ?? defaults.traits;
                        profile.relationships =
                            profile.relationships ?? defaults.relationships;
                        profile.taskHistory =
                            profile.taskHistory ?? defaults.taskHistory;
                        profile.evolution = {
                            ...defaults.evolution,
                            ...(profile.evolution ?? {}),
                            unlockedAbilities:
                                profile.evolution?.unlockedAbilities ??
                                defaults.evolution.unlockedAbilities,
                        };
                    }
                }
                return merged;
            },
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state._hasHydrated = true;
                }
            },
        },
    ),
);
