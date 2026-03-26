import Store from 'electron-store';
import type {
    CharacterSheet,
    CharacterGrowthStoreSchema,
    PrimaryStats,
    SpecializationTree,
    SkillCandidate,
    GeneratedSkill,
    LevelUpEvent,
    LevelUpReward,
    AutonomyLevel,
} from '../src/types/character-growth';
import {
    createDefaultPrimaryStats,
    createDefaultSpecializations,
    calculateStatGain,
    getLevelUpReward,
    getMaxSkillSlots,
    getSpecCap,
    detectSkillCandidates,
    migrateGrowthProfile,
    LEVEL_EXP_TABLE_V2,
    CHARACTER_INITIAL_STATS,
    SPEC_TO_PRIMARY,
} from '../src/types/character-growth';
import type { AgentGrowthProfile, TaskHistoryEntry } from '../src/types/growth';
import { EVOLUTION_STAGES } from '../src/types/growth';
import type { EvolutionStage } from '../src/types/growth';

const CURRENT_SCHEMA_VERSION = 2;
const MAX_LEVEL_UP_HISTORY = 500;

/** Activity → which primary stats gain (with base gain values) */
const ACTIVITY_STAT_MAP: Record<
    string,
    Partial<Record<keyof PrimaryStats, number>>
> = {
    thinking: { analysis: 2, design: 1 },
    reading: { analysis: 2, review: 1 },
    writing: { coding: 2, writing: 1 },
    typing: { coding: 1, testing: 1 },
    working: { coding: 1, analysis: 1 },
    success: { review: 2, planning: 1 },
};

/** Tool → which specializations gain */
const TOOL_SPEC_MAP: Record<
    string,
    Partial<Record<keyof SpecializationTree, number>>
> = {
    Edit: { frontend: 0.5 },
    Write: { frontend: 0.5 },
    Read: { debugging: 0.3 },
    Grep: { debugging: 0.3 },
    Bash: { systems: 0.5 },
    Agent: { stakeholder: 0.5 },
};

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

class CharacterGrowthManager {
    private store: Store<CharacterGrowthStoreSchema> | null = null;

    private ensureInit(): void {
        if (this.store) return;
        this.store = new Store<CharacterGrowthStoreSchema>({
            name: 'dokba-character-growth',
            defaults: {
                version: CURRENT_SCHEMA_VERSION,
                sheets: {},
                skillCandidates: {},
                generatedSkills: {},
                levelUpHistory: [],
            },
        });
    }

    private getStore(): Store<CharacterGrowthStoreSchema> {
        this.ensureInit();
        if (!this.store)
            throw new Error('CharacterGrowth store failed to initialize');
        return this.store;
    }

    // ── Migration ──

    migrateIfNeeded(oldProfiles?: Record<string, AgentGrowthProfile>): void {
        const store = this.getStore();
        const version = store.get('version', 1);

        if (version < CURRENT_SCHEMA_VERSION && oldProfiles) {
            const newSheets: Record<string, CharacterSheet> = {};
            for (const [id, profile] of Object.entries(oldProfiles)) {
                const sheet = migrateGrowthProfile(profile);
                // Apply character-specific initial stats if higher
                const preset = CHARACTER_INITIAL_STATS[id];
                if (preset) {
                    for (const [stat, val] of Object.entries(preset) as [
                        keyof PrimaryStats,
                        number,
                    ][]) {
                        if (val > sheet.primaryStats[stat]) {
                            sheet.primaryStats[stat] = val;
                        }
                    }
                }
                newSheets[id] = sheet;
            }
            store.set('sheets', newSheets);
            store.set('version', CURRENT_SCHEMA_VERSION);
        }
    }

    // ── Sheet CRUD ──

    getSheet(agentId: string): CharacterSheet {
        const sheets = this.getStore().get('sheets');
        return sheets[agentId] ?? this.createDefaultSheet(agentId);
    }

    getAllSheets(): Record<string, CharacterSheet> {
        return this.getStore().get('sheets');
    }

    getOrCreateSheet(agentId: string): CharacterSheet {
        const store = this.getStore();
        const sheets = store.get('sheets');
        if (sheets[agentId]) return sheets[agentId];

        const sheet = this.createDefaultSheet(agentId);
        sheets[agentId] = sheet;
        store.set('sheets', sheets);
        return sheet;
    }

    private createDefaultSheet(agentId: string): CharacterSheet {
        const preset = CHARACTER_INITIAL_STATS[agentId];
        const primaryStats = createDefaultPrimaryStats();
        if (preset) {
            for (const [stat, val] of Object.entries(preset) as [
                keyof PrimaryStats,
                number,
            ][]) {
                primaryStats[stat] = val;
            }
        }

        return {
            agentId,
            agentName: agentId,
            level: 1,
            exp: 0,
            expToNext: LEVEL_EXP_TABLE_V2[0],
            totalExp: 0,
            primaryStats,
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
        };
    }

    private saveSheet(sheet: CharacterSheet): void {
        const store = this.getStore();
        const sheets = store.get('sheets');
        sheets[sheet.agentId] = sheet;
        store.set('sheets', sheets);
    }

    // ── EXP & Level Up ──

    /**
     * Add EXP to a character, process level-ups, and return any level-up events.
     */
    addExp(agentId: string, amount: number): LevelUpEvent[] {
        const sheet = this.getOrCreateSheet(agentId);
        const events: LevelUpEvent[] = [];

        sheet.exp += amount;
        sheet.totalExp += amount;

        while (sheet.exp >= sheet.expToNext && sheet.level < 100) {
            sheet.exp -= sheet.expToNext;
            const oldLevel = sheet.level;
            sheet.level++;
            sheet.expToNext =
                sheet.level < 100
                    ? LEVEL_EXP_TABLE_V2[sheet.level - 1]
                    : Infinity;

            const reward = getLevelUpReward(sheet.level);
            sheet.statPointsAvailable += reward.statPoints;
            sheet.specPointsAvailable += reward.specPoints;

            if (reward.newSkillSlot) {
                sheet.maxSkillSlots = getMaxSkillSlots(sheet.level);
            }
            if (reward.autonomyUnlock !== null) {
                sheet.autonomyLevel = reward.autonomyUnlock;
            }
            if (reward.abilityUnlock) {
                if (
                    !sheet.evolution.unlockedAbilities.includes(
                        reward.abilityUnlock,
                    )
                ) {
                    sheet.evolution.unlockedAbilities.push(
                        reward.abilityUnlock,
                    );
                }
            }

            const event: LevelUpEvent = {
                agentId,
                oldLevel,
                newLevel: sheet.level,
                reward,
                timestamp: Date.now(),
            };
            events.push(event);
        }

        if (sheet.level >= 100) {
            sheet.level = 100;
            sheet.exp = 0;
            sheet.expToNext = Infinity;
        }

        // Update evolution stage
        const stage = resolveEvolutionStage(sheet.level);
        const stageInfo = EVOLUTION_STAGES[stage];
        const stageRange = stageInfo.maxLevel - stageInfo.minLevel;
        sheet.evolution.stage = stage;
        sheet.evolution.stageProgress =
            stageRange > 0
                ? (sheet.level - stageInfo.minLevel) / stageRange
                : 1;

        sheet.lastActiveAt = Date.now();
        this.saveSheet(sheet);

        // Persist level-up history
        if (events.length > 0) {
            this.appendLevelUpHistory(events);
        }

        return events;
    }

    // ── Stat Gains ──

    /**
     * Apply stat gains from an activity to a character sheet.
     * Uses diminishing returns: low stats grow faster.
     */
    applyActivityGains(
        agentId: string,
        activity: string,
        toolName?: string,
    ): void {
        const sheet = this.getOrCreateSheet(agentId);

        // Apply primary stat gains
        const statGains = ACTIVITY_STAT_MAP[activity];
        if (statGains) {
            for (const [stat, baseGain] of Object.entries(statGains) as [
                keyof PrimaryStats,
                number,
            ][]) {
                const gain = calculateStatGain(
                    sheet.primaryStats[stat],
                    baseGain,
                );
                sheet.primaryStats[stat] = Math.min(
                    100,
                    sheet.primaryStats[stat] + gain,
                );
            }
        }

        // Apply specialization gains from tool usage
        if (toolName) {
            const specGains = TOOL_SPEC_MAP[toolName];
            if (specGains) {
                for (const [spec, baseGain] of Object.entries(specGains) as [
                    keyof SpecializationTree,
                    number,
                ][]) {
                    const parentStat = SPEC_TO_PRIMARY[spec];
                    const cap = getSpecCap(sheet.primaryStats[parentStat]);
                    const gain = calculateStatGain(
                        sheet.specializations[spec],
                        baseGain,
                    );
                    sheet.specializations[spec] = Math.min(
                        cap,
                        sheet.specializations[spec] + gain,
                    );
                }
            }
        }

        sheet.lastActiveAt = Date.now();
        this.saveSheet(sheet);
    }

    // ── Point Allocation ──

    allocateStatPoint(agentId: string, stat: keyof PrimaryStats): boolean {
        const sheet = this.getOrCreateSheet(agentId);
        if (sheet.statPointsAvailable <= 0) return false;
        if (sheet.primaryStats[stat] >= 100) return false;

        sheet.primaryStats[stat] = Math.min(100, sheet.primaryStats[stat] + 1);
        sheet.statPointsAvailable--;
        this.saveSheet(sheet);
        return true;
    }

    allocateSpecPoint(
        agentId: string,
        spec: keyof SpecializationTree,
    ): boolean {
        const sheet = this.getOrCreateSheet(agentId);
        if (sheet.specPointsAvailable <= 0) return false;

        const parentStat = SPEC_TO_PRIMARY[spec];
        const cap = getSpecCap(sheet.primaryStats[parentStat]);

        if (sheet.specializations[spec] >= cap) return false;
        if (sheet.primaryStats[parentStat] < 10) return false; // min 10 to unlock specialization

        sheet.specializations[spec] = Math.min(
            cap,
            sheet.specializations[spec] + 1,
        );
        sheet.specPointsAvailable--;
        this.saveSheet(sheet);
        return true;
    }

    /**
     * Auto-allocate all available stat and spec points based on most-used activity patterns.
     * Returns a summary of what was allocated.
     */
    autoAllocate(agentId: string): Record<string, number> {
        const sheet = this.getOrCreateSheet(agentId);
        const allocated: Record<string, number> = {};

        // Auto-allocate stat points: distribute to lowest stats to balance
        while (sheet.statPointsAvailable > 0) {
            let minStat: keyof PrimaryStats = 'coding';
            let minVal = Infinity;
            for (const [stat, val] of Object.entries(sheet.primaryStats) as [
                keyof PrimaryStats,
                number,
            ][]) {
                if (val < minVal && val < 100) {
                    minVal = val;
                    minStat = stat;
                }
            }
            if (minVal >= 100) break;

            sheet.primaryStats[minStat] = Math.min(
                100,
                sheet.primaryStats[minStat] + 1,
            );
            sheet.statPointsAvailable--;
            allocated[minStat] = (allocated[minStat] ?? 0) + 1;
        }

        // Auto-allocate spec points: invest in highest non-capped spec
        while (sheet.specPointsAvailable > 0) {
            let bestSpec: keyof SpecializationTree | null = null;
            let bestVal = -1;

            for (const [spec, val] of Object.entries(sheet.specializations) as [
                keyof SpecializationTree,
                number,
            ][]) {
                const parentStat = SPEC_TO_PRIMARY[spec];
                if (sheet.primaryStats[parentStat] < 10) continue;
                const cap = getSpecCap(sheet.primaryStats[parentStat]);
                if (val >= cap) continue;
                if (val > bestVal) {
                    bestVal = val;
                    bestSpec = spec;
                }
            }

            if (!bestSpec) break;

            const parentStat = SPEC_TO_PRIMARY[bestSpec];
            const cap = getSpecCap(sheet.primaryStats[parentStat]);
            sheet.specializations[bestSpec] = Math.min(
                cap,
                sheet.specializations[bestSpec] + 1,
            );
            sheet.specPointsAvailable--;
            allocated[bestSpec] = (allocated[bestSpec] ?? 0) + 1;
        }

        this.saveSheet(sheet);
        return allocated;
    }

    // ── Skill Management ──

    equipSkill(agentId: string, skillId: string): boolean {
        const sheet = this.getOrCreateSheet(agentId);
        if (sheet.equippedSkills.includes(skillId)) return false;
        if (sheet.equippedSkills.length >= sheet.maxSkillSlots) return false;

        sheet.equippedSkills.push(skillId);
        this.saveSheet(sheet);
        return true;
    }

    unequipSkill(agentId: string, skillId: string): boolean {
        const sheet = this.getOrCreateSheet(agentId);
        const idx = sheet.equippedSkills.indexOf(skillId);
        if (idx === -1) return false;

        sheet.equippedSkills.splice(idx, 1);
        this.saveSheet(sheet);
        return true;
    }

    // ── Skill Detection ──

    runSkillDetection(
        agentId: string,
        taskHistory: TaskHistoryEntry[],
    ): SkillCandidate[] {
        const store = this.getStore();
        const existingSkills = store.get('generatedSkills')[agentId] ?? [];
        const existingIds = existingSkills.map((s) => s.skillId);

        const candidates = detectSkillCandidates(taskHistory, existingIds);

        // Persist detected candidates
        const allCandidates = store.get('skillCandidates');
        allCandidates[agentId] = candidates;
        store.set('skillCandidates', allCandidates);

        return candidates;
    }

    getSkillCandidates(agentId: string): SkillCandidate[] {
        return this.getStore().get('skillCandidates')[agentId] ?? [];
    }

    /**
     * Promote a detected skill candidate to a generated skill.
     * Returns the generated skill metadata (actual SKILL.md file creation is delegated to skill-manager).
     */
    generateSkill(
        agentId: string,
        candidateIndex: number,
    ): GeneratedSkill | null {
        const store = this.getStore();
        const candidates = store.get('skillCandidates')[agentId] ?? [];
        if (candidateIndex < 0 || candidateIndex >= candidates.length)
            return null;

        const candidate = candidates[candidateIndex];
        const skillId = `growth-${agentId}-${candidate.name}`;
        const filePath = `.claude/skills/growth/${agentId}-${candidate.name}/SKILL.md`;

        const generated: GeneratedSkill = {
            skillId,
            agentId,
            name: candidate.name,
            filePath,
            detectedAt: Date.now(),
            generatedAt: Date.now(),
            usageCount: 0,
        };

        // Persist generated skill
        const allGenerated = store.get('generatedSkills');
        const agentGenerated = allGenerated[agentId] ?? [];
        agentGenerated.push(generated);
        allGenerated[agentId] = agentGenerated;
        store.set('generatedSkills', allGenerated);

        // Remove from candidates
        candidates.splice(candidateIndex, 1);
        const allCandidates = store.get('skillCandidates');
        allCandidates[agentId] = candidates;
        store.set('skillCandidates', allCandidates);

        return generated;
    }

    getGeneratedSkills(agentId: string): GeneratedSkill[] {
        return this.getStore().get('generatedSkills')[agentId] ?? [];
    }

    // ── Level-Up History ──

    private appendLevelUpHistory(events: LevelUpEvent[]): void {
        const store = this.getStore();
        const history = store.get('levelUpHistory');
        history.push(...events);
        if (history.length > MAX_LEVEL_UP_HISTORY) {
            store.set('levelUpHistory', history.slice(-MAX_LEVEL_UP_HISTORY));
        } else {
            store.set('levelUpHistory', history);
        }
    }

    getLevelUpHistory(): LevelUpEvent[] {
        return this.getStore().get('levelUpHistory');
    }

    // ── Queries ──

    getStats(agentId: string): PrimaryStats {
        return this.getSheet(agentId).primaryStats;
    }

    getSpecializations(agentId: string): SpecializationTree {
        return this.getSheet(agentId).specializations;
    }

    getLevelInfo(agentId: string): {
        level: number;
        exp: number;
        expToNext: number;
        totalExp: number;
    } {
        const sheet = this.getSheet(agentId);
        return {
            level: sheet.level,
            exp: sheet.exp,
            expToNext: sheet.expToNext,
            totalExp: sheet.totalExp,
        };
    }

    getAutonomyLevel(agentId: string): AutonomyLevel {
        return this.getSheet(agentId).autonomyLevel;
    }

    // ── Delete ──

    deleteSheet(agentId: string): void {
        const store = this.getStore();
        const sheets = store.get('sheets');
        delete sheets[agentId];
        store.set('sheets', sheets);

        const candidates = store.get('skillCandidates');
        delete candidates[agentId];
        store.set('skillCandidates', candidates);

        const generated = store.get('generatedSkills');
        delete generated[agentId];
        store.set('generatedSkills', generated);
    }
}

export const characterGrowthManager = new CharacterGrowthManager();
