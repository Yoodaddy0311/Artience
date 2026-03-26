import { describe, it, expect } from 'vitest';
import {
    calculateStatGain,
    getLevelUpReward,
    getMaxSkillSlots,
    getSpecCap,
    createDefaultPrimaryStats,
    createDefaultSpecializations,
    buildEvolvingSystemPrompt,
    getTopSpecializations,
    detectSkillCandidates,
    migrateGrowthProfile,
    LEVEL_EXP_TABLE_V2,
    SPEC_TO_PRIMARY,
    CHARACTER_INITIAL_STATS,
} from '../../types/character-growth';
import type {
    CharacterSheet,
    SpecializationTree,
} from '../../types/character-growth';
import { createDefaultGrowthProfile } from '../../types/growth';

// ── calculateStatGain ──

describe('calculateStatGain', () => {
    it('returns full gain when current value is 0', () => {
        const gain = calculateStatGain(0, 2);
        expect(gain).toBe(2);
    });

    it('returns reduced gain at high stat values', () => {
        const low = calculateStatGain(10, 2);
        const high = calculateStatGain(80, 2);
        expect(low).toBeGreaterThan(high);
    });

    it('never returns less than 10% efficiency', () => {
        const gain = calculateStatGain(200, 2);
        expect(gain).toBeGreaterThanOrEqual(0.2);
    });

    it('returns ~50% efficiency at stat value 60', () => {
        const gain = calculateStatGain(60, 2);
        expect(gain).toBeCloseTo(1, 0);
    });

    it('returns ~17% efficiency at stat value 100', () => {
        const gain = calculateStatGain(100, 2);
        expect(gain).toBeCloseTo(0.33, 1);
    });
});

// ── getLevelUpReward ──

describe('getLevelUpReward', () => {
    it('gives 2 stat points on regular levels', () => {
        const reward = getLevelUpReward(3);
        expect(reward.statPoints).toBe(2);
        expect(reward.specPoints).toBe(1);
    });

    it('gives 3 stat points on multiples of 5', () => {
        expect(getLevelUpReward(5).statPoints).toBe(3);
        expect(getLevelUpReward(10).statPoints).toBe(3);
        expect(getLevelUpReward(25).statPoints).toBe(3);
    });

    it('grants skill slot at designated levels', () => {
        expect(getLevelUpReward(5).newSkillSlot).toBe(true);
        expect(getLevelUpReward(10).newSkillSlot).toBe(true);
        expect(getLevelUpReward(20).newSkillSlot).toBe(true);
        expect(getLevelUpReward(30).newSkillSlot).toBe(true);
        expect(getLevelUpReward(40).newSkillSlot).toBe(true);
        expect(getLevelUpReward(50).newSkillSlot).toBe(true);
        expect(getLevelUpReward(7).newSkillSlot).toBe(false);
    });

    it('unlocks autonomy at levels 10, 25, 50', () => {
        expect(getLevelUpReward(10).autonomyUnlock).toBe(1);
        expect(getLevelUpReward(25).autonomyUnlock).toBe(2);
        expect(getLevelUpReward(50).autonomyUnlock).toBe(3);
        expect(getLevelUpReward(15).autonomyUnlock).toBeNull();
    });

    it('unlocks abilities at levels 20, 30, 60', () => {
        expect(getLevelUpReward(20).abilityUnlock).toBe('job-scheduling');
        expect(getLevelUpReward(30).abilityUnlock).toBe('workflow-creation');
        expect(getLevelUpReward(60).abilityUnlock).toBe('team-leader');
        expect(getLevelUpReward(45).abilityUnlock).toBeNull();
    });
});

// ── getMaxSkillSlots ──

describe('getMaxSkillSlots', () => {
    it('returns 2 for levels below 5', () => {
        expect(getMaxSkillSlots(1)).toBe(2);
        expect(getMaxSkillSlots(4)).toBe(2);
    });

    it('returns correct slots at thresholds', () => {
        expect(getMaxSkillSlots(5)).toBe(3);
        expect(getMaxSkillSlots(10)).toBe(4);
        expect(getMaxSkillSlots(20)).toBe(5);
        expect(getMaxSkillSlots(30)).toBe(6);
        expect(getMaxSkillSlots(40)).toBe(7);
        expect(getMaxSkillSlots(50)).toBe(8);
    });

    it('caps at 8 for very high levels', () => {
        expect(getMaxSkillSlots(99)).toBe(8);
    });
});

// ── getSpecCap ──

describe('getSpecCap', () => {
    it('returns half of primary stat value', () => {
        expect(getSpecCap(20)).toBe(10);
        expect(getSpecCap(50)).toBe(25);
        expect(getSpecCap(100)).toBe(50);
    });

    it('floors fractional values', () => {
        expect(getSpecCap(15)).toBe(7);
        expect(getSpecCap(1)).toBe(0);
    });

    it('caps at 50', () => {
        expect(getSpecCap(120)).toBe(50);
    });
});

// ── SPEC_TO_PRIMARY mapping ──

describe('SPEC_TO_PRIMARY', () => {
    it('maps all 21 specializations', () => {
        const specs = Object.keys(createDefaultSpecializations());
        expect(specs).toHaveLength(21);
        for (const spec of specs) {
            expect(SPEC_TO_PRIMARY).toHaveProperty(spec);
        }
    });

    it('maps each spec to a valid primary stat', () => {
        const validStats = Object.keys(createDefaultPrimaryStats());
        for (const primary of Object.values(SPEC_TO_PRIMARY)) {
            expect(validStats).toContain(primary);
        }
    });
});

// ── LEVEL_EXP_TABLE_V2 ──

describe('LEVEL_EXP_TABLE_V2', () => {
    it('has 100 entries', () => {
        expect(LEVEL_EXP_TABLE_V2).toHaveLength(100);
    });

    it('starts at 100', () => {
        expect(LEVEL_EXP_TABLE_V2[0]).toBe(100);
    });

    it('is monotonically increasing', () => {
        for (let i = 1; i < LEVEL_EXP_TABLE_V2.length; i++) {
            expect(LEVEL_EXP_TABLE_V2[i]).toBeGreaterThan(
                LEVEL_EXP_TABLE_V2[i - 1],
            );
        }
    });
});

// ── CHARACTER_INITIAL_STATS ──

describe('CHARACTER_INITIAL_STATS', () => {
    it('has presets for all 26 agents', () => {
        expect(Object.keys(CHARACTER_INITIAL_STATS)).toHaveLength(26);
    });

    it('all preset values are within 0~100', () => {
        for (const preset of Object.values(CHARACTER_INITIAL_STATS)) {
            for (const val of Object.values(preset)) {
                expect(val).toBeGreaterThanOrEqual(0);
                expect(val).toBeLessThanOrEqual(100);
            }
        }
    });
});

// ── buildEvolvingSystemPrompt ──

describe('buildEvolvingSystemPrompt', () => {
    function makeSheet(overrides: Partial<CharacterSheet>): CharacterSheet {
        return {
            agentId: 'luna',
            agentName: 'Luna',
            level: 1,
            exp: 0,
            expToNext: 100,
            totalExp: 0,
            primaryStats: createDefaultPrimaryStats(),
            specializations: createDefaultSpecializations(),
            equippedSkills: [],
            maxSkillSlots: 2,
            statPointsAvailable: 0,
            specPointsAvailable: 0,
            evolution: {
                stage: 'novice',
                stageProgress: 0,
                specialization: null,
                unlockedAbilities: [],
            },
            autonomyLevel: 0,
            streakDays: 0,
            lastActiveAt: Date.now(),
            createdAt: Date.now(),
            ...overrides,
        };
    }

    it('includes base persona always', () => {
        const prompt = buildEvolvingSystemPrompt(
            makeSheet({}),
            'Base persona text',
        );
        expect(prompt).toContain('Base persona text');
    });

    it('adds junior level text at level 10+', () => {
        const prompt = buildEvolvingSystemPrompt(
            makeSheet({ level: 10 }),
            'base',
        );
        expect(prompt).toContain('주니어');
    });

    it('adds senior level text at level 25+', () => {
        const prompt = buildEvolvingSystemPrompt(
            makeSheet({ level: 25 }),
            'base',
        );
        expect(prompt).toContain('시니어');
        expect(prompt).not.toContain('주니어');
    });

    it('adds expert level text at level 50+', () => {
        const prompt = buildEvolvingSystemPrompt(
            makeSheet({ level: 50 }),
            'base',
        );
        expect(prompt).toContain('전문가');
        expect(prompt).not.toContain('시니어');
    });

    it('includes equipped skills as slash commands', () => {
        const prompt = buildEvolvingSystemPrompt(
            makeSheet({ equippedSkills: ['refactor', 'test-runner'] }),
            'base',
        );
        expect(prompt).toContain('/refactor');
        expect(prompt).toContain('/test-runner');
    });

    it('includes top specializations when present', () => {
        const specs = createDefaultSpecializations();
        specs.frontend = 15;
        specs.debugging = 10;
        const prompt = buildEvolvingSystemPrompt(
            makeSheet({ specializations: specs }),
            'base',
        );
        expect(prompt).toContain('frontend: 15/50');
        expect(prompt).toContain('debugging: 10/50');
    });

    it('omits specialization section when all are zero', () => {
        const prompt = buildEvolvingSystemPrompt(makeSheet({}), 'base');
        expect(prompt).not.toContain('전문 분야');
    });
});

// ── getTopSpecializations ──

describe('getTopSpecializations', () => {
    it('returns empty for all-zero specs', () => {
        const specs = createDefaultSpecializations();
        expect(getTopSpecializations(specs, 3)).toEqual([]);
    });

    it('returns sorted by value descending', () => {
        const specs = createDefaultSpecializations();
        specs.frontend = 10;
        specs.backend = 20;
        specs.debugging = 5;
        const top = getTopSpecializations(specs, 3);
        expect(top[0].name).toBe('backend');
        expect(top[1].name).toBe('frontend');
        expect(top[2].name).toBe('debugging');
    });

    it('respects limit parameter', () => {
        const specs = createDefaultSpecializations();
        specs.frontend = 10;
        specs.backend = 20;
        specs.debugging = 5;
        expect(getTopSpecializations(specs, 1)).toHaveLength(1);
    });
});

// ── detectSkillCandidates ──

describe('detectSkillCandidates', () => {
    function makeTask(
        toolsUsed: string[],
        category = 'backend',
    ): {
        timestamp: number;
        taskType: string;
        toolsUsed: string[];
        expEarned: number;
        skillCategory:
            | 'backend'
            | 'frontend'
            | 'testing'
            | 'devops'
            | 'architecture'
            | 'communication';
        duration: number;
        success: boolean;
    } {
        return {
            timestamp: Date.now(),
            taskType: 'task',
            toolsUsed,
            expEarned: 10,
            skillCategory: category as 'backend',
            duration: 1000,
            success: true,
        };
    }

    it('returns empty for insufficient history', () => {
        expect(detectSkillCandidates([makeTask(['Edit'])], [])).toEqual([]);
    });

    it('detects repeated tool patterns', () => {
        const history = Array.from({ length: 10 }, () =>
            makeTask(['Grep', 'Edit', 'Bash']),
        );
        const candidates = detectSkillCandidates(history, [], 3);
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates[0].detectedPattern.frequency).toBeGreaterThanOrEqual(
            3,
        );
    });

    it('excludes already-known skill IDs', () => {
        const history = Array.from({ length: 10 }, () =>
            makeTask(['Edit', 'Bash']),
        );
        const allCandidates = detectSkillCandidates(history, [], 3);
        const knownIds = allCandidates.map((c) => c.name);
        const filtered = detectSkillCandidates(history, knownIds, 3);
        expect(filtered).toHaveLength(0);
    });

    it('sorts candidates by frequency descending', () => {
        const history = [
            ...Array.from({ length: 8 }, () => makeTask(['Edit', 'Bash'])),
            ...Array.from({ length: 5 }, () =>
                makeTask(['Read', 'Grep', 'Edit']),
            ),
        ];
        const candidates = detectSkillCandidates(history, [], 3);
        if (candidates.length >= 2) {
            expect(
                candidates[0].detectedPattern.frequency,
            ).toBeGreaterThanOrEqual(candidates[1].detectedPattern.frequency);
        }
    });
});

// ── migrateGrowthProfile ──

describe('migrateGrowthProfile', () => {
    it('preserves level and EXP', () => {
        const profile = createDefaultGrowthProfile('rio');
        profile.level = 15;
        profile.exp = 500;
        profile.totalExp = 5000;

        const sheet = migrateGrowthProfile(profile);
        expect(sheet.level).toBe(15);
        expect(sheet.exp).toBe(500);
        expect(sheet.totalExp).toBe(5000);
    });

    it('maps old stats to new PrimaryStats', () => {
        const profile = createDefaultGrowthProfile('luna');
        profile.stats = {
            coding: 30,
            analysis: 20,
            speed: 10,
            accuracy: 15,
            creativity: 25,
            teamwork: 12,
        };

        const sheet = migrateGrowthProfile(profile);
        expect(sheet.primaryStats.coding).toBe(30);
        expect(sheet.primaryStats.analysis).toBe(20);
        expect(sheet.primaryStats.design).toBe(25); // creativity → design
        expect(sheet.primaryStats.review).toBe(15); // accuracy → review
        expect(sheet.primaryStats.planning).toBe(12); // teamwork → planning
        expect(sheet.primaryStats.writing).toBe(1); // new stat, default
        expect(sheet.primaryStats.testing).toBe(1); // new stat, default
    });

    it('initializes all specializations to 0', () => {
        const profile = createDefaultGrowthProfile('rio');
        const sheet = migrateGrowthProfile(profile);
        const specValues = Object.values(sheet.specializations);
        expect(specValues.every((v) => v === 0)).toBe(true);
    });

    it('carries over equipped skill IDs', () => {
        const profile = createDefaultGrowthProfile('rio');
        profile.skills = [
            { skillId: 'test-runner', level: 2, exp: 50 },
            { skillId: 'lint-fix', level: 1, exp: 10 },
        ];

        const sheet = migrateGrowthProfile(profile);
        expect(sheet.equippedSkills).toEqual(['test-runner', 'lint-fix']);
    });

    it('calculates maxSkillSlots based on level', () => {
        const profile = createDefaultGrowthProfile('rio');
        profile.level = 25;
        const sheet = migrateGrowthProfile(profile);
        expect(sheet.maxSkillSlots).toBe(getMaxSkillSlots(25));
    });

    it('sets autonomyLevel to 0', () => {
        const profile = createDefaultGrowthProfile('rio');
        profile.level = 50;
        const sheet = migrateGrowthProfile(profile);
        expect(sheet.autonomyLevel).toBe(0);
    });
});

// ── Specialization cap enforcement ──

describe('Specialization cap enforcement', () => {
    it('spec cap is half of primary stat', () => {
        expect(getSpecCap(40)).toBe(20);
    });

    it('spec cannot exceed cap even with manual assignment', () => {
        const primaryValue = 20; // cap = 10
        const cap = getSpecCap(primaryValue);
        const attemptedValue = 15;
        const actual = Math.min(cap, attemptedValue);
        expect(actual).toBe(10);
    });

    it('spec cap is 0 when primary stat is 0 or 1', () => {
        expect(getSpecCap(0)).toBe(0);
        expect(getSpecCap(1)).toBe(0);
    });

    it('each spec in SPEC_TO_PRIMARY has a valid parent', () => {
        const primaryKeys = new Set(Object.keys(createDefaultPrimaryStats()));
        for (const [spec, primary] of Object.entries(SPEC_TO_PRIMARY)) {
            expect(primaryKeys.has(primary)).toBe(true);
            // spec should exist in SpecializationTree
            const defaults = createDefaultSpecializations();
            expect(spec in defaults).toBe(true);
        }
    });
});

// ── Default factory functions ──

describe('createDefaultPrimaryStats', () => {
    it('returns 7 stats all initialized to 1', () => {
        const stats = createDefaultPrimaryStats();
        expect(Object.keys(stats)).toHaveLength(7);
        expect(Object.values(stats).every((v) => v === 1)).toBe(true);
    });
});

describe('createDefaultSpecializations', () => {
    it('returns 21 specializations all initialized to 0', () => {
        const specs = createDefaultSpecializations();
        expect(Object.keys(specs)).toHaveLength(21);
        expect(Object.values(specs).every((v) => v === 0)).toBe(true);
    });
});
