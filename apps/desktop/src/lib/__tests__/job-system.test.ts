import { describe, it, expect } from 'vitest';
import {
    resolvePromptTemplate,
    evaluateCondition,
    validateInputs,
    getDifficultyPriority,
    calculateMasteryBonus,
    getProgress,
    validateWorkflow,
    groupStepsByOrder,
    createInitialStepRun,
    createJobRun,
    canRunJob,
    DIFFICULTY_LEVEL_MAP,
    DIFFICULTY_PRIORITY_MAP,
} from '../../types/job-system';
import type {
    JobDefinition,
    JobRun,
    StepRun,
    StepCondition,
    JobInput,
    JobStep,
    JobWorkflow,
} from '../../types/job-system';

// ── resolvePromptTemplate ──

describe('resolvePromptTemplate', () => {
    const ctx = { jobName: 'TestJob', agentName: 'Rio', cwd: '/project' };

    it('replaces {{input.key}} with input values', () => {
        const result = resolvePromptTemplate(
            'Target: {{input.dir}}, Lang: {{input.lang}}',
            { dir: '/src', lang: 'ts' },
            {},
            ctx,
        );
        expect(result).toBe('Target: /src, Lang: ts');
    });

    it('replaces {{step.stepId.output.key}} with step outputs', () => {
        const result = resolvePromptTemplate(
            'Plan: {{step.plan.output.result}}',
            {},
            { plan: { result: 'Build a component' } },
            ctx,
        );
        expect(result).toBe('Plan: Build a component');
    });

    it('replaces {{job.name}} and {{agent.name}}', () => {
        const result = resolvePromptTemplate(
            'Job: {{job.name}}, Agent: {{agent.name}}',
            {},
            {},
            ctx,
        );
        expect(result).toBe('Job: TestJob, Agent: Rio');
    });

    it('replaces {{cwd}}', () => {
        const result = resolvePromptTemplate('Dir: {{cwd}}', {}, {}, ctx);
        expect(result).toBe('Dir: /project');
    });

    it('replaces {{timestamp}} with ISO date', () => {
        const result = resolvePromptTemplate(
            'Time: {{timestamp}}',
            {},
            {},
            ctx,
        );
        expect(result).toMatch(/Time: \d{4}-\d{2}-\d{2}T/);
    });

    it('replaces missing values with empty string', () => {
        const result = resolvePromptTemplate(
            'Value: {{input.missing}}',
            {},
            {},
            ctx,
        );
        expect(result).toBe('Value: ');
    });

    it('handles multiple replacements in one template', () => {
        const result = resolvePromptTemplate(
            '{{input.a}} + {{step.s1.output.x}} at {{cwd}}',
            { a: 'hello' },
            { s1: { x: 'world' } },
            ctx,
        );
        expect(result).toBe('hello + world at /project');
    });
});

// ── evaluateCondition ──

describe('evaluateCondition', () => {
    function makeStepRun(
        stepId: string,
        status: StepRun['status'],
        output: Record<string, string> = {},
    ): StepRun {
        return {
            stepId,
            status,
            agentId: 'rio',
            resolvedPrompt: '',
            output,
            retryCount: 0,
        };
    }

    it('returns true for "succeeded" when step completed', () => {
        const cond: StepCondition = { stepId: 'plan', type: 'succeeded' };
        expect(
            evaluateCondition(cond, [makeStepRun('plan', 'completed')], {}),
        ).toBe(true);
    });

    it('returns false for "succeeded" when step failed', () => {
        const cond: StepCondition = { stepId: 'plan', type: 'succeeded' };
        expect(
            evaluateCondition(cond, [makeStepRun('plan', 'failed')], {}),
        ).toBe(false);
    });

    it('returns true for "failed" when step failed', () => {
        const cond: StepCondition = { stepId: 'plan', type: 'failed' };
        expect(
            evaluateCondition(cond, [makeStepRun('plan', 'failed')], {}),
        ).toBe(true);
    });

    it('returns true for "output_contains" when output matches', () => {
        const cond: StepCondition = {
            stepId: 'analyze',
            type: 'output_contains',
            value: 'test files found',
        };
        const sr = makeStepRun('analyze', 'completed', {
            result: 'analysis: test files found in /src',
        });
        expect(evaluateCondition(cond, [sr], {})).toBe(true);
    });

    it('returns false for "output_contains" when output does not match', () => {
        const cond: StepCondition = {
            stepId: 'analyze',
            type: 'output_contains',
            value: 'test files found',
        };
        const sr = makeStepRun('analyze', 'completed', { result: 'no tests' });
        expect(evaluateCondition(cond, [sr], {})).toBe(false);
    });

    it('returns true for "output_not_contains"', () => {
        const cond: StepCondition = {
            stepId: 'analyze',
            type: 'output_not_contains',
            value: 'error',
        };
        const sr = makeStepRun('analyze', 'completed', { result: 'all good' });
        expect(evaluateCondition(cond, [sr], {})).toBe(true);
    });

    it('handles __input__ stepId for job input conditions', () => {
        const cond: StepCondition = {
            stepId: '__input__',
            type: 'output_contains',
            value: 'includeTests:true',
        };
        expect(evaluateCondition(cond, [], { includeTests: 'true' })).toBe(
            true,
        );
        expect(evaluateCondition(cond, [], { includeTests: 'false' })).toBe(
            false,
        );
    });

    it('returns true when referenced step not found', () => {
        const cond: StepCondition = {
            stepId: 'nonexistent',
            type: 'succeeded',
        };
        expect(evaluateCondition(cond, [], {})).toBe(true);
    });
});

// ── validateInputs ──

describe('validateInputs', () => {
    it('returns error for missing required input', () => {
        const inputs: JobInput[] = [
            { key: 'name', label: 'Name', type: 'text', required: true },
        ];
        const errors = validateInputs(inputs, {});
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Name');
    });

    it('returns no errors when all required inputs provided', () => {
        const inputs: JobInput[] = [
            { key: 'name', label: 'Name', type: 'text', required: true },
        ];
        expect(validateInputs(inputs, { name: 'test' })).toEqual([]);
    });

    it('allows missing optional inputs', () => {
        const inputs: JobInput[] = [
            { key: 'opt', label: 'Optional', type: 'text', required: false },
        ];
        expect(validateInputs(inputs, {})).toEqual([]);
    });

    it('validates regex pattern', () => {
        const inputs: JobInput[] = [
            {
                key: 'email',
                label: 'Email',
                type: 'text',
                required: true,
                validation: '^\\S+@\\S+$',
            },
        ];
        expect(validateInputs(inputs, { email: 'bad' })).toHaveLength(1);
        expect(validateInputs(inputs, { email: 'a@b.com' })).toEqual([]);
    });

    it('skips validation for empty optional fields', () => {
        const inputs: JobInput[] = [
            {
                key: 'val',
                label: 'Val',
                type: 'text',
                required: false,
                validation: '^\\d+$',
            },
        ];
        expect(validateInputs(inputs, {})).toEqual([]);
    });
});

// ── getDifficultyPriority ──

describe('getDifficultyPriority', () => {
    it('maps S and A to critical', () => {
        expect(getDifficultyPriority('S')).toBe('critical');
        expect(getDifficultyPriority('A')).toBe('critical');
    });

    it('maps B and C to high', () => {
        expect(getDifficultyPriority('B')).toBe('high');
        expect(getDifficultyPriority('C')).toBe('high');
    });

    it('maps D to medium', () => {
        expect(getDifficultyPriority('D')).toBe('medium');
    });

    it('maps E to low', () => {
        expect(getDifficultyPriority('E')).toBe('low');
    });
});

// ── calculateMasteryBonus ──

describe('calculateMasteryBonus', () => {
    const mastery = {
        maxLevel: 10,
        completionsPerLevel: 3,
        speedBonusPerLevel: 5,
        expBonusPerLevel: 3,
    };

    it('returns 1.0 multipliers at level 0', () => {
        const bonus = calculateMasteryBonus(mastery, 0);
        expect(bonus.speedMultiplier).toBe(1);
        expect(bonus.expMultiplier).toBe(1);
    });

    it('returns correct bonus at level 5', () => {
        const bonus = calculateMasteryBonus(mastery, 5);
        expect(bonus.speedMultiplier).toBe(1.25); // 5 * 5% = 25%
        expect(bonus.expMultiplier).toBe(1.15); // 5 * 3% = 15%
    });

    it('returns max bonus at max level', () => {
        const bonus = calculateMasteryBonus(mastery, 10);
        expect(bonus.speedMultiplier).toBe(1.5); // 10 * 5% = 50%
        expect(bonus.expMultiplier).toBe(1.3); // 10 * 3% = 30%
    });
});

// ── DIFFICULTY_LEVEL_MAP ──

describe('DIFFICULTY_LEVEL_MAP', () => {
    it('has correct level requirements', () => {
        expect(DIFFICULTY_LEVEL_MAP.E).toBe(1);
        expect(DIFFICULTY_LEVEL_MAP.D).toBe(5);
        expect(DIFFICULTY_LEVEL_MAP.C).toBe(10);
        expect(DIFFICULTY_LEVEL_MAP.B).toBe(20);
        expect(DIFFICULTY_LEVEL_MAP.A).toBe(35);
        expect(DIFFICULTY_LEVEL_MAP.S).toBe(50);
    });

    it('is strictly increasing', () => {
        const levels = Object.values(DIFFICULTY_LEVEL_MAP);
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i]).toBeGreaterThan(levels[i - 1]);
        }
    });
});

// ── getProgress ──

describe('getProgress', () => {
    function makeJobDef(steps: JobStep[]): JobDefinition {
        return {
            id: 'test',
            name: 'Test Job',
            description: '',
            icon: '',
            category: 'development',
            inputs: [],
            workflow: {
                steps,
                settings: {
                    maxConcurrentAgents: 3,
                    timeoutMs: 60000,
                    errorStrategy: 'stop',
                    maxRetries: 0,
                    permissionMode: 'default',
                },
            },
            outputs: [],
            metadata: {
                difficulty: 'E',
                requiredLevel: 1,
                estimatedTimeSeconds: 60,
                creditCost: 10,
                baseExpReward: 50,
                tags: [],
                prerequisiteJobIds: [],
                mastery: {
                    maxLevel: 5,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 5,
                    expBonusPerLevel: 3,
                },
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            builtin: false,
        };
    }

    it('returns 0% for all pending steps', () => {
        const steps: JobStep[] = [
            {
                id: 's1',
                name: 'Step 1',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 1,
            },
            {
                id: 's2',
                name: 'Step 2',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 2,
            },
        ];
        const run: JobRun = {
            runId: 'r1',
            jobId: 'test',
            status: 'running',
            inputValues: {},
            stepRuns: steps.map(createInitialStepRun),
            startedAt: Date.now(),
            executedByAgents: [],
            expEarned: 0,
        };
        const progress = getProgress(run, makeJobDef(steps));
        expect(progress.overallPercent).toBe(0);
        expect(progress.completedSteps).toBe(0);
        expect(progress.totalSteps).toBe(2);
    });

    it('returns 50% when half the steps completed', () => {
        const steps: JobStep[] = [
            {
                id: 's1',
                name: 'Step 1',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 1,
            },
            {
                id: 's2',
                name: 'Step 2',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 2,
            },
        ];
        const run: JobRun = {
            runId: 'r1',
            jobId: 'test',
            status: 'running',
            inputValues: {},
            stepRuns: [
                {
                    stepId: 's1',
                    status: 'completed',
                    agentId: 'rio',
                    resolvedPrompt: '',
                    output: {},
                    retryCount: 0,
                },
                {
                    stepId: 's2',
                    status: 'pending',
                    agentId: '',
                    resolvedPrompt: '',
                    output: {},
                    retryCount: 0,
                },
            ],
            startedAt: Date.now() - 10000,
            executedByAgents: ['rio'],
            expEarned: 0,
        };
        const progress = getProgress(run, makeJobDef(steps));
        expect(progress.overallPercent).toBe(50);
        expect(progress.completedSteps).toBe(1);
    });

    it('returns 100% when all steps completed', () => {
        const steps: JobStep[] = [
            {
                id: 's1',
                name: 'Step 1',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 1,
            },
        ];
        const run: JobRun = {
            runId: 'r1',
            jobId: 'test',
            status: 'completed',
            inputValues: {},
            stepRuns: [
                {
                    stepId: 's1',
                    status: 'completed',
                    agentId: 'rio',
                    resolvedPrompt: '',
                    output: {},
                    retryCount: 0,
                },
            ],
            startedAt: Date.now() - 5000,
            completedAt: Date.now(),
            executedByAgents: ['rio'],
            expEarned: 50,
        };
        const progress = getProgress(run, makeJobDef(steps));
        expect(progress.overallPercent).toBe(100);
    });

    it('treats skipped steps as completed for progress', () => {
        const steps: JobStep[] = [
            {
                id: 's1',
                name: 'Step 1',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 1,
            },
            {
                id: 's2',
                name: 'Step 2',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 2,
            },
        ];
        const run: JobRun = {
            runId: 'r1',
            jobId: 'test',
            status: 'running',
            inputValues: {},
            stepRuns: [
                {
                    stepId: 's1',
                    status: 'completed',
                    agentId: 'rio',
                    resolvedPrompt: '',
                    output: {},
                    retryCount: 0,
                },
                {
                    stepId: 's2',
                    status: 'skipped',
                    agentId: '',
                    resolvedPrompt: '',
                    output: {},
                    retryCount: 0,
                },
            ],
            startedAt: Date.now() - 5000,
            executedByAgents: ['rio'],
            expEarned: 0,
        };
        const progress = getProgress(run, makeJobDef(steps));
        expect(progress.overallPercent).toBe(100);
    });

    it('identifies current running step', () => {
        const steps: JobStep[] = [
            {
                id: 's1',
                name: 'Plan',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 1,
            },
            {
                id: 's2',
                name: 'Implement',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 2,
            },
        ];
        const run: JobRun = {
            runId: 'r1',
            jobId: 'test',
            status: 'running',
            inputValues: {},
            stepRuns: [
                {
                    stepId: 's1',
                    status: 'completed',
                    agentId: 'sera',
                    resolvedPrompt: '',
                    output: {},
                    retryCount: 0,
                },
                {
                    stepId: 's2',
                    status: 'running',
                    agentId: 'rio',
                    resolvedPrompt: '',
                    output: {},
                    retryCount: 0,
                },
            ],
            startedAt: Date.now() - 5000,
            executedByAgents: ['sera', 'rio'],
            expEarned: 0,
        };
        const progress = getProgress(run, makeJobDef(steps));
        expect(progress.currentStep).toBe('Implement');
    });
});

// ── validateWorkflow ──

describe('validateWorkflow', () => {
    it('returns empty for valid workflow', () => {
        const workflow: JobWorkflow = {
            steps: [
                {
                    id: 's1',
                    name: 'Step 1',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [],
                    executionOrder: 1,
                },
                {
                    id: 's2',
                    name: 'Step 2',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [
                        {
                            targetKey: 'data',
                            source: 'step_output',
                            sourceRef: 's1.result',
                        },
                    ],
                    executionOrder: 2,
                },
            ],
            settings: {
                maxConcurrentAgents: 3,
                timeoutMs: 60000,
                errorStrategy: 'stop',
                maxRetries: 0,
                permissionMode: 'default',
            },
        };
        expect(validateWorkflow(workflow)).toEqual([]);
    });

    it('detects non-existent step references in input mapping', () => {
        const workflow: JobWorkflow = {
            steps: [
                {
                    id: 's1',
                    name: 'Step 1',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [
                        {
                            targetKey: 'data',
                            source: 'step_output',
                            sourceRef: 'nonexistent.result',
                        },
                    ],
                    executionOrder: 1,
                },
            ],
            settings: {
                maxConcurrentAgents: 3,
                timeoutMs: 60000,
                errorStrategy: 'stop',
                maxRetries: 0,
                permissionMode: 'default',
            },
        };
        const errors = validateWorkflow(workflow);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('nonexistent');
    });

    it('detects forward references (same or later execution order)', () => {
        const workflow: JobWorkflow = {
            steps: [
                {
                    id: 's1',
                    name: 'Step 1',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [
                        {
                            targetKey: 'data',
                            source: 'step_output',
                            sourceRef: 's2.result',
                        },
                    ],
                    executionOrder: 1,
                },
                {
                    id: 's2',
                    name: 'Step 2',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [],
                    executionOrder: 2,
                },
            ],
            settings: {
                maxConcurrentAgents: 3,
                timeoutMs: 60000,
                errorStrategy: 'stop',
                maxRetries: 0,
                permissionMode: 'default',
            },
        };
        const errors = validateWorkflow(workflow);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('later order');
    });

    it('detects non-existent step in condition', () => {
        const workflow: JobWorkflow = {
            steps: [
                {
                    id: 's1',
                    name: 'Step 1',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [],
                    condition: { stepId: 'ghost', type: 'succeeded' },
                    executionOrder: 1,
                },
            ],
            settings: {
                maxConcurrentAgents: 3,
                timeoutMs: 60000,
                errorStrategy: 'stop',
                maxRetries: 0,
                permissionMode: 'default',
            },
        };
        const errors = validateWorkflow(workflow);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('ghost');
    });

    it('allows __input__ in condition', () => {
        const workflow: JobWorkflow = {
            steps: [
                {
                    id: 's1',
                    name: 'Step 1',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [],
                    condition: {
                        stepId: '__input__',
                        type: 'output_contains',
                        value: 'test:true',
                    },
                    executionOrder: 1,
                },
            ],
            settings: {
                maxConcurrentAgents: 3,
                timeoutMs: 60000,
                errorStrategy: 'stop',
                maxRetries: 0,
                permissionMode: 'default',
            },
        };
        expect(validateWorkflow(workflow)).toEqual([]);
    });

    it('detects duplicate step IDs', () => {
        const workflow: JobWorkflow = {
            steps: [
                {
                    id: 's1',
                    name: 'Step 1',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [],
                    executionOrder: 1,
                },
                {
                    id: 's1',
                    name: 'Step 1 dup',
                    skillId: '',
                    promptTemplate: '',
                    inputMapping: [],
                    executionOrder: 2,
                },
            ],
            settings: {
                maxConcurrentAgents: 3,
                timeoutMs: 60000,
                errorStrategy: 'stop',
                maxRetries: 0,
                permissionMode: 'default',
            },
        };
        const errors = validateWorkflow(workflow);
        expect(errors.some((e) => e.includes('Duplicate'))).toBe(true);
    });
});

// ── groupStepsByOrder ──

describe('groupStepsByOrder', () => {
    it('groups steps by execution order', () => {
        const steps: JobStep[] = [
            {
                id: 's1',
                name: 'A',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 1,
            },
            {
                id: 's2',
                name: 'B',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 2,
            },
            {
                id: 's3',
                name: 'C',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 2,
            },
            {
                id: 's4',
                name: 'D',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 3,
            },
        ];
        const groups = groupStepsByOrder(steps);
        expect(groups).toHaveLength(3);
        expect(groups[0]).toHaveLength(1);
        expect(groups[1]).toHaveLength(2);
        expect(groups[2]).toHaveLength(1);
    });

    it('sorts groups by order ascending', () => {
        const steps: JobStep[] = [
            {
                id: 's3',
                name: 'C',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 3,
            },
            {
                id: 's1',
                name: 'A',
                skillId: '',
                promptTemplate: '',
                inputMapping: [],
                executionOrder: 1,
            },
        ];
        const groups = groupStepsByOrder(steps);
        expect(groups[0][0].id).toBe('s1');
        expect(groups[1][0].id).toBe('s3');
    });

    it('returns empty for empty steps', () => {
        expect(groupStepsByOrder([])).toEqual([]);
    });
});

// ── createJobRun ──

describe('createJobRun', () => {
    function makeMinimalJobDef(): JobDefinition {
        return {
            id: 'test-job',
            name: 'Test',
            description: '',
            icon: '',
            category: 'development',
            inputs: [],
            workflow: {
                steps: [
                    {
                        id: 's1',
                        name: 'S1',
                        skillId: '',
                        promptTemplate: '',
                        inputMapping: [],
                        executionOrder: 1,
                    },
                    {
                        id: 's2',
                        name: 'S2',
                        skillId: '',
                        promptTemplate: '',
                        inputMapping: [],
                        executionOrder: 2,
                    },
                ],
                settings: {
                    maxConcurrentAgents: 3,
                    timeoutMs: 60000,
                    errorStrategy: 'stop',
                    maxRetries: 0,
                    permissionMode: 'default',
                },
            },
            outputs: [],
            metadata: {
                difficulty: 'E',
                requiredLevel: 1,
                estimatedTimeSeconds: 60,
                creditCost: 10,
                baseExpReward: 50,
                tags: [],
                prerequisiteJobIds: [],
                mastery: {
                    maxLevel: 5,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 5,
                    expBonusPerLevel: 3,
                },
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            builtin: false,
        };
    }

    it('creates a run with correct structure', () => {
        const run = createJobRun(makeMinimalJobDef(), { key: 'val' });
        expect(run.runId).toMatch(/^jr-/);
        expect(run.jobId).toBe('test-job');
        expect(run.status).toBe('pending');
        expect(run.stepRuns).toHaveLength(2);
        expect(run.inputValues).toEqual({ key: 'val' });
        expect(run.executedByAgents).toEqual([]);
        expect(run.expEarned).toBe(0);
    });

    it('initializes all step runs as pending', () => {
        const run = createJobRun(makeMinimalJobDef(), {});
        for (const sr of run.stepRuns) {
            expect(sr.status).toBe('pending');
            expect(sr.retryCount).toBe(0);
        }
    });
});

// ── canRunJob ──

describe('canRunJob', () => {
    function makeJobDef(level: number, prereqs: string[] = []): JobDefinition {
        return {
            id: 'test',
            name: 'Test',
            description: '',
            icon: '',
            category: 'development',
            inputs: [],
            workflow: {
                steps: [],
                settings: {
                    maxConcurrentAgents: 1,
                    timeoutMs: 60000,
                    errorStrategy: 'stop',
                    maxRetries: 0,
                    permissionMode: 'default',
                },
            },
            outputs: [],
            metadata: {
                difficulty: 'C',
                requiredLevel: level,
                estimatedTimeSeconds: 60,
                creditCost: 10,
                baseExpReward: 50,
                tags: [],
                prerequisiteJobIds: prereqs,
                mastery: {
                    maxLevel: 5,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 5,
                    expBonusPerLevel: 3,
                },
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            builtin: false,
        };
    }

    it('allows when level meets requirement', () => {
        expect(canRunJob(makeJobDef(10), 15, []).canRun).toBe(true);
    });

    it('denies when level is too low', () => {
        const result = canRunJob(makeJobDef(20), 10, []);
        expect(result.canRun).toBe(false);
        expect(result.reason).toContain('level');
    });

    it('denies when prerequisite not completed', () => {
        const result = canRunJob(makeJobDef(1, ['prereq-job']), 99, []);
        expect(result.canRun).toBe(false);
        expect(result.reason).toContain('prereq-job');
    });

    it('allows when prerequisite is completed', () => {
        expect(
            canRunJob(makeJobDef(1, ['prereq-job']), 99, ['prereq-job']).canRun,
        ).toBe(true);
    });
});

// ── createInitialStepRun ──

describe('createInitialStepRun', () => {
    it('creates pending step run from step definition', () => {
        const step: JobStep = {
            id: 'plan',
            name: 'Plan',
            skillId: 'code-review',
            agentId: 'sera',
            promptTemplate: 'Do {{input.thing}}',
            inputMapping: [],
            executionOrder: 1,
        };
        const sr = createInitialStepRun(step);
        expect(sr.stepId).toBe('plan');
        expect(sr.status).toBe('pending');
        expect(sr.agentId).toBe('sera');
        expect(sr.retryCount).toBe(0);
        expect(sr.output).toEqual({});
    });

    it('defaults agentId to empty when not specified', () => {
        const step: JobStep = {
            id: 'auto',
            name: 'Auto',
            skillId: '',
            promptTemplate: '',
            inputMapping: [],
            executionOrder: 1,
        };
        const sr = createInitialStepRun(step);
        expect(sr.agentId).toBe('');
    });
});
