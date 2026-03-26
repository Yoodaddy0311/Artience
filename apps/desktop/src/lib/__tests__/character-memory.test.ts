import { describe, it, expect, beforeEach } from 'vitest';
import {
    formatDateISO,
    coreToMarkdown,
    dailyLogToMarkdown,
    createEmptyDailyLog,
    createDefaultKnowledge,
    searchKnowledgeByKeyword,
    upsertSkillKnowledge,
    upsertRelationship,
    addExpertisePattern,
    derivePromotions,
    hasConsecutiveDays,
    extractToTier3,
} from '../../../electron/character-memory';
import type {
    CoreMemory,
    DailyLog,
    DailyTaskEntry,
    DailyInteraction,
    DailyError,
    DeepKnowledge,
} from '../../types/character-memory';
import { MEMORY_LIMITS } from '../../types/character-memory';

// ── Helper factories ────────────────────────────────────────────

function makeCoreMemory(overrides?: Partial<CoreMemory>): CoreMemory {
    return {
        agentId: 'sera',
        updatedAt: Date.now(),
        identity: 'Sera — PM / 총괄. 리더십 있고 전체 프로젝트를 조율하는 PM.',
        userFeedback: [],
        strengths: [],
        weaknesses: [],
        activeGoals: [],
        userPreferences: [],
        topRelationships: [],
        recentAchievements: [],
        notes: '',
        ...overrides,
    };
}

function makeTaskEntry(overrides?: Partial<DailyTaskEntry>): DailyTaskEntry {
    return {
        taskId: 'task-1',
        description: 'Fix login bug',
        status: 'success',
        startedAt: Date.now() - 60000,
        completedAt: Date.now(),
        durationMs: 60000,
        collaborators: [],
        skillsUsed: [],
        ...overrides,
    };
}

function makeInteraction(
    overrides?: Partial<DailyInteraction>,
): DailyInteraction {
    return {
        type: 'p2p_message',
        withAgentId: 'rio',
        timestamp: Date.now(),
        summary: 'Discussed API design',
        sentiment: 'positive',
        ...overrides,
    };
}

function makeDailyLog(date: string, overrides?: Partial<DailyLog>): DailyLog {
    return {
        ...createEmptyDailyLog('sera', date),
        ...overrides,
        agentId: overrides?.agentId ?? 'sera',
        date,
    };
}

// ── Tests ───────────────────────────────────────────────────────

describe('formatDateISO', () => {
    it('formats date as YYYY-MM-DD', () => {
        const d = new Date(2026, 2, 26); // March 26, 2026
        expect(formatDateISO(d)).toBe('2026-03-26');
    });

    it('pads single-digit months and days', () => {
        const d = new Date(2026, 0, 5); // Jan 5
        expect(formatDateISO(d)).toBe('2026-01-05');
    });
});

describe('coreToMarkdown', () => {
    it('includes identity section', () => {
        const core = makeCoreMemory();
        const md = coreToMarkdown(core);
        expect(md).toContain('## Identity');
        expect(md).toContain('Sera — PM / 총괄');
    });

    it('includes strengths when present', () => {
        const core = makeCoreMemory({ strengths: ['높은 완료율'] });
        const md = coreToMarkdown(core);
        expect(md).toContain('## Strengths');
        expect(md).toContain('- 높은 완료율');
    });

    it('omits empty sections', () => {
        const core = makeCoreMemory();
        const md = coreToMarkdown(core);
        expect(md).not.toContain('## Strengths');
        expect(md).not.toContain('## Weaknesses');
        expect(md).not.toContain('## Notes');
    });

    it('includes notes when present', () => {
        const core = makeCoreMemory({ notes: 'Test memo' });
        const md = coreToMarkdown(core);
        expect(md).toContain('## Notes');
        expect(md).toContain('Test memo');
    });

    it('includes relationships', () => {
        const core = makeCoreMemory({
            topRelationships: [
                { agentId: 'rio', summary: '백엔드 시너지 높음' },
            ],
        });
        const md = coreToMarkdown(core);
        expect(md).toContain('## Key Relationships');
        expect(md).toContain('rio: 백엔드 시너지 높음');
    });

    it('stays under ~100 lines for typical data', () => {
        const core = makeCoreMemory({
            strengths: ['A', 'B', 'C'],
            weaknesses: ['W1'],
            activeGoals: ['G1', 'G2'],
            userPreferences: ['P1'],
            topRelationships: [
                { agentId: 'rio', summary: 'Good' },
                { agentId: 'luna', summary: 'Fine' },
            ],
            recentAchievements: ['Ach1', 'Ach2'],
            userFeedback: ['FB1'],
            notes: 'A note.',
        });
        const md = coreToMarkdown(core);
        const lineCount = md.split('\n').length;
        expect(lineCount).toBeLessThan(100);
    });
});

describe('dailyLogToMarkdown', () => {
    it('renders task status icons', () => {
        const log = makeDailyLog('2026-03-26', {
            tasks: [
                makeTaskEntry({
                    description: 'Success task',
                    status: 'success',
                }),
                makeTaskEntry({ description: 'Fail task', status: 'failure' }),
                makeTaskEntry({
                    description: 'Progress task',
                    status: 'in_progress',
                }),
            ],
        });
        const md = dailyLogToMarkdown(log);
        expect(md).toContain('[O] Success task');
        expect(md).toContain('[X] Fail task');
        expect(md).toContain('[-] Progress task');
    });

    it('renders learnings', () => {
        const log = makeDailyLog('2026-03-26', {
            learnings: ['Learned about hooks'],
        });
        const md = dailyLogToMarkdown(log);
        expect(md).toContain('**Learnings:**');
        expect(md).toContain('Learned about hooks');
    });

    it('renders errors with resolution', () => {
        const log = makeDailyLog('2026-03-26', {
            errors: [
                {
                    timestamp: Date.now(),
                    errorType: 'TypeError',
                    message: 'undefined is not a function',
                    resolution: 'Added null check',
                },
            ],
        });
        const md = dailyLogToMarkdown(log);
        expect(md).toContain('TypeError');
        expect(md).toContain('resolved: Added null check');
    });
});

describe('createEmptyDailyLog', () => {
    it('creates log with correct date and agentId', () => {
        const log = createEmptyDailyLog('rio', '2026-03-26');
        expect(log.agentId).toBe('rio');
        expect(log.date).toBe('2026-03-26');
        expect(log.tasks).toEqual([]);
        expect(log.metricsSnapshot.tasksCompleted).toBe(0);
    });
});

describe('searchKnowledgeByKeyword', () => {
    let knowledge: DeepKnowledge;

    beforeEach(() => {
        knowledge = createDefaultKnowledge('sera');
        knowledge.skills.push({
            skillId: 'react',
            skillName: 'React',
            proficiency: 80,
            usageCount: 10,
            lastUsed: Date.now(),
            lessons: ['Use hooks wisely'],
            commonPairings: ['typescript'],
        });
        knowledge.preferences.push({
            category: 'code_style',
            key: 'indent',
            value: '4 spaces',
            confidence: 0.9,
            observedAt: Date.now(),
            source: 'explicit',
        });
        knowledge.expertise.push({
            domain: 'css-grid',
            level: 'intermediate',
            patterns: ['Use grid-template-areas for layout'],
            taskCount: 5,
            updatedAt: Date.now(),
        });
    });

    it('finds matching skills by name', () => {
        const results = searchKnowledgeByKeyword(knowledge, 'react');
        expect(results.length).toBe(1);
        expect(results[0]).toContain('[Skill] React');
    });

    it('finds matching skills by lesson content', () => {
        const results = searchKnowledgeByKeyword(knowledge, 'hooks');
        expect(results.length).toBe(1);
        expect(results[0]).toContain('[Skill] React');
    });

    it('finds matching preferences', () => {
        const results = searchKnowledgeByKeyword(knowledge, 'indent');
        expect(results.length).toBe(1);
        expect(results[0]).toContain('[Preference] indent');
    });

    it('finds matching expertise', () => {
        const results = searchKnowledgeByKeyword(knowledge, 'grid');
        expect(results.length).toBe(1);
        expect(results[0]).toContain('[Expertise] css-grid');
    });

    it('returns empty for no match', () => {
        const results = searchKnowledgeByKeyword(knowledge, 'xyznonexistent');
        expect(results).toEqual([]);
    });

    it('case-insensitive search', () => {
        const results = searchKnowledgeByKeyword(knowledge, 'REACT');
        expect(results.length).toBe(1);
    });
});

describe('upsertSkillKnowledge', () => {
    let knowledge: DeepKnowledge;

    beforeEach(() => {
        knowledge = createDefaultKnowledge('sera');
    });

    it('creates new skill on first use', () => {
        const task = makeTaskEntry({ skillsUsed: ['react'] });
        upsertSkillKnowledge(knowledge, 'react', task);
        expect(knowledge.skills.length).toBe(1);
        expect(knowledge.skills[0].skillId).toBe('react');
        expect(knowledge.skills[0].usageCount).toBe(1);
    });

    it('increments usage count on repeated use', () => {
        const task = makeTaskEntry({ skillsUsed: ['react'] });
        upsertSkillKnowledge(knowledge, 'react', task);
        upsertSkillKnowledge(knowledge, 'react', task);
        expect(knowledge.skills[0].usageCount).toBe(2);
    });

    it('increases proficiency on success', () => {
        const task = makeTaskEntry({
            status: 'success',
            skillsUsed: ['react'],
        });
        upsertSkillKnowledge(knowledge, 'react', task);
        expect(knowledge.skills[0].proficiency).toBe(2);
    });

    it('decreases proficiency on failure', () => {
        const task1 = makeTaskEntry({
            status: 'success',
            skillsUsed: ['react'],
        });
        upsertSkillKnowledge(knowledge, 'react', task1);
        upsertSkillKnowledge(knowledge, 'react', task1);
        // proficiency = 4
        const task2 = makeTaskEntry({
            status: 'failure',
            skillsUsed: ['react'],
        });
        upsertSkillKnowledge(knowledge, 'react', task2);
        expect(knowledge.skills[0].proficiency).toBe(3);
    });

    it('caps proficiency at 100', () => {
        knowledge.skills.push({
            skillId: 'react',
            skillName: 'react',
            proficiency: 99,
            usageCount: 50,
            lastUsed: Date.now(),
            lessons: [],
            commonPairings: [],
        });
        const task = makeTaskEntry({
            status: 'success',
            skillsUsed: ['react'],
        });
        upsertSkillKnowledge(knowledge, 'react', task);
        expect(knowledge.skills[0].proficiency).toBe(100);
    });

    it('records common pairings', () => {
        const task = makeTaskEntry({ skillsUsed: ['react', 'typescript'] });
        upsertSkillKnowledge(knowledge, 'react', task);
        expect(knowledge.skills[0].commonPairings).toContain('typescript');
    });

    it('enforces MAX_SKILLS limit', () => {
        for (let i = 0; i < MEMORY_LIMITS.MAX_SKILLS + 5; i++) {
            const task = makeTaskEntry({
                skillsUsed: [`skill-${i}`],
                completedAt: Date.now() + i,
            });
            upsertSkillKnowledge(knowledge, `skill-${i}`, task);
        }
        expect(knowledge.skills.length).toBeLessThanOrEqual(
            MEMORY_LIMITS.MAX_SKILLS,
        );
    });
});

describe('upsertRelationship', () => {
    let knowledge: DeepKnowledge;

    beforeEach(() => {
        knowledge = createDefaultKnowledge('sera');
    });

    it('creates new relationship on first interaction', () => {
        upsertRelationship(knowledge, makeInteraction({ withAgentId: 'rio' }));
        expect(knowledge.relationships.length).toBe(1);
        expect(knowledge.relationships[0].withAgentId).toBe('rio');
        expect(knowledge.relationships[0].totalInteractions).toBe(1);
    });

    it('increments interaction count', () => {
        upsertRelationship(knowledge, makeInteraction({ withAgentId: 'rio' }));
        upsertRelationship(knowledge, makeInteraction({ withAgentId: 'rio' }));
        expect(knowledge.relationships[0].totalInteractions).toBe(2);
    });
});

describe('addExpertisePattern', () => {
    let knowledge: DeepKnowledge;

    beforeEach(() => {
        knowledge = createDefaultKnowledge('sera');
    });

    it('creates new expertise domain', () => {
        const error: DailyError = {
            timestamp: Date.now(),
            errorType: 'TypeError',
            message: 'Cannot read property',
            resolution: 'Added optional chaining',
        };
        addExpertisePattern(knowledge, error);
        expect(knowledge.expertise.length).toBe(1);
        expect(knowledge.expertise[0].domain).toBe('TypeError');
        expect(knowledge.expertise[0].patterns).toContain(
            'Cannot read property → Added optional chaining',
        );
    });

    it('does not duplicate patterns', () => {
        const error: DailyError = {
            timestamp: Date.now(),
            errorType: 'TypeError',
            message: 'Cannot read property',
            resolution: 'Added optional chaining',
        };
        addExpertisePattern(knowledge, error);
        addExpertisePattern(knowledge, error);
        expect(knowledge.expertise[0].patterns.length).toBe(1);
        expect(knowledge.expertise[0].taskCount).toBe(2);
    });

    it('upgrades level based on task count', () => {
        const error: DailyError = {
            timestamp: Date.now(),
            errorType: 'TypeError',
            message: 'err',
            resolution: 'fix',
        };
        for (let i = 0; i < 5; i++) {
            // Each call has a unique pattern to avoid dedup
            addExpertisePattern(knowledge, {
                ...error,
                message: `err-${i}`,
            });
        }
        expect(knowledge.expertise[0].level).toBe('intermediate');
    });
});

describe('hasConsecutiveDays', () => {
    it('returns true for 3 consecutive days', () => {
        expect(
            hasConsecutiveDays(['2026-03-24', '2026-03-25', '2026-03-26'], 3),
        ).toBe(true);
    });

    it('returns false for non-consecutive days', () => {
        expect(
            hasConsecutiveDays(['2026-03-20', '2026-03-22', '2026-03-26'], 3),
        ).toBe(false);
    });

    it('returns false when fewer dates than required', () => {
        expect(hasConsecutiveDays(['2026-03-25'], 3)).toBe(false);
    });

    it('handles unsorted dates', () => {
        expect(
            hasConsecutiveDays(['2026-03-26', '2026-03-24', '2026-03-25'], 3),
        ).toBe(true);
    });
});

describe('derivePromotions', () => {
    let knowledge: DeepKnowledge;

    beforeEach(() => {
        knowledge = createDefaultKnowledge('sera');
    });

    it('returns empty promotions for empty logs', () => {
        const result = derivePromotions([], knowledge);
        expect(result.strengths).toEqual([]);
        expect(result.weaknesses).toEqual([]);
        expect(result.achievements).toEqual([]);
        expect(result.relationships).toEqual([]);
    });

    it('promotes skill used 3 consecutive days to strengths', () => {
        const logs = [
            makeDailyLog('2026-03-24', {
                tasks: [makeTaskEntry({ skillsUsed: ['react'] })],
            }),
            makeDailyLog('2026-03-25', {
                tasks: [makeTaskEntry({ skillsUsed: ['react'] })],
            }),
            makeDailyLog('2026-03-26', {
                tasks: [makeTaskEntry({ skillsUsed: ['react'] })],
            }),
        ];
        knowledge.skills.push({
            skillId: 'react',
            skillName: 'React',
            proficiency: 50,
            usageCount: 10,
            lastUsed: Date.now(),
            lessons: [],
            commonPairings: [],
        });

        const result = derivePromotions(logs, knowledge);
        expect(result.strengths).toContain('React 스킬에 능숙');
    });

    it('promotes repeated errors to weaknesses', () => {
        const logs = [
            makeDailyLog('2026-03-25', {
                errors: [
                    {
                        timestamp: Date.now(),
                        errorType: 'TypeError',
                        message: 'err1',
                    },
                ],
            }),
            makeDailyLog('2026-03-26', {
                errors: [
                    {
                        timestamp: Date.now(),
                        errorType: 'TypeError',
                        message: 'err2',
                    },
                ],
            }),
        ];

        const result = derivePromotions(logs, knowledge);
        expect(result.weaknesses.length).toBeGreaterThan(0);
        expect(result.weaknesses[0]).toContain('TypeError');
    });

    it('promotes consecutive success to achievements', () => {
        const tasks = Array.from({ length: 10 }, (_, i) =>
            makeTaskEntry({ taskId: `task-${i}`, status: 'success' }),
        );
        const logs = [makeDailyLog('2026-03-26', { tasks })];

        const result = derivePromotions(logs, knowledge);
        expect(result.achievements.length).toBeGreaterThan(0);
        expect(result.achievements[0]).toContain('연속 성공');
    });
});

describe('extractToTier3', () => {
    it('extracts skills from daily log tasks', () => {
        const knowledge = createDefaultKnowledge('sera');
        const log = makeDailyLog('2026-03-26', {
            tasks: [makeTaskEntry({ skillsUsed: ['react', 'typescript'] })],
        });

        extractToTier3(log, knowledge);
        expect(knowledge.skills.length).toBe(2);
        expect(knowledge.skills.map((s) => s.skillId)).toContain('react');
        expect(knowledge.skills.map((s) => s.skillId)).toContain('typescript');
    });

    it('extracts relationships from interactions', () => {
        const knowledge = createDefaultKnowledge('sera');
        const log = makeDailyLog('2026-03-26', {
            interactions: [makeInteraction({ withAgentId: 'luna' })],
        });

        extractToTier3(log, knowledge);
        expect(knowledge.relationships.length).toBe(1);
        expect(knowledge.relationships[0].withAgentId).toBe('luna');
    });

    it('extracts error patterns with resolution', () => {
        const knowledge = createDefaultKnowledge('sera');
        const log = makeDailyLog('2026-03-26', {
            errors: [
                {
                    timestamp: Date.now(),
                    errorType: 'SyntaxError',
                    message: 'Unexpected token',
                    resolution: 'Fixed import path',
                },
            ],
        });

        extractToTier3(log, knowledge);
        expect(knowledge.expertise.length).toBe(1);
        expect(knowledge.expertise[0].patterns.length).toBe(1);
    });

    it('skips errors without resolution', () => {
        const knowledge = createDefaultKnowledge('sera');
        const log = makeDailyLog('2026-03-26', {
            errors: [
                {
                    timestamp: Date.now(),
                    errorType: 'SyntaxError',
                    message: 'Unexpected token',
                },
            ],
        });

        extractToTier3(log, knowledge);
        expect(knowledge.expertise.length).toBe(0);
    });
});
