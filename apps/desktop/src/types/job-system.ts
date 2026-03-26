// ── Job System Types ──
// One-click automation pipeline: Skill → Workflow → Job

import type { TaskPriority } from '../../electron/task-scheduler';

// ── Categories & Difficulty ──

export type JobCategory =
    | 'development'
    | 'report'
    | 'creative'
    | 'video'
    | 'research'
    | 'roleplay'
    | 'custom';

export type JobDifficulty = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export const DIFFICULTY_LEVEL_MAP: Record<JobDifficulty, number> = {
    E: 1,
    D: 5,
    C: 10,
    B: 20,
    A: 35,
    S: 50,
};

export const DIFFICULTY_PRIORITY_MAP: Record<JobDifficulty, TaskPriority> = {
    S: 'critical',
    A: 'critical',
    B: 'high',
    C: 'high',
    D: 'medium',
    E: 'low',
};

// ── Job Input ──

export interface JobInput {
    key: string;
    label: string;
    type:
        | 'text'
        | 'textarea'
        | 'file'
        | 'directory'
        | 'select'
        | 'boolean'
        | 'number';
    defaultValue?: string;
    options?: Array<{ value: string; label: string }>;
    accept?: string[];
    required: boolean;
    placeholder?: string;
    validation?: string;
}

// ── Workflow Structures ──

export interface WorkflowSettings {
    maxConcurrentAgents: number;
    timeoutMs: number;
    errorStrategy: 'stop' | 'skip' | 'retry' | 'ask_user';
    maxRetries: number;
    permissionMode: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions';
}

export interface JobWorkflow {
    steps: JobStep[];
    settings: WorkflowSettings;
}

export interface JobStep {
    id: string;
    name: string;
    skillId: string;
    agentId?: string;
    promptTemplate: string;
    inputMapping: InputMapping[];
    gate?: StepGate;
    condition?: StepCondition;
    timeoutMs?: number;
    model?: 'opus' | 'sonnet' | 'haiku';
    executionOrder: number;
}

export interface InputMapping {
    targetKey: string;
    source: 'job_input' | 'step_output' | 'literal';
    sourceRef: string;
    literalValue?: string;
}

export interface StepGate {
    type:
        | 'auto_check'
        | 'user_approval'
        | 'regex_match'
        | 'file_exists'
        | 'exit_code';
    reviewerAgentId?: string;
    pattern?: string;
    filePath?: string;
    onFail: 'retry_step' | 'abort_job' | 'ask_user' | 'skip';
    failMessage?: string;
}

export interface StepCondition {
    stepId: string;
    type: 'output_contains' | 'output_not_contains' | 'succeeded' | 'failed';
    value?: string;
}

// ── Job Output ──

export interface JobOutput {
    key: string;
    label: string;
    type: 'file' | 'text' | 'directory' | 'report';
    pathTemplate?: string;
    fromStepId: string;
    outputKey: string;
}

// ── Job Metadata ──

export interface MasteryConfig {
    maxLevel: number;
    completionsPerLevel: number;
    speedBonusPerLevel: number;
    expBonusPerLevel: number;
}

export interface JobMetadata {
    difficulty: JobDifficulty;
    requiredLevel: number;
    estimatedTimeSeconds: number;
    creditCost: number;
    baseExpReward: number;
    tags: string[];
    prerequisiteJobIds: string[];
    mastery: MasteryConfig;
}

// ── Job Definition ──

export interface JobDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: JobCategory;
    inputs: JobInput[];
    workflow: JobWorkflow;
    outputs: JobOutput[];
    metadata: JobMetadata;
    sourcePackId?: string;
    createdAt: number;
    updatedAt: number;
    builtin: boolean;
}

// ── Job Run ──

export type JobRunStatus =
    | 'pending'
    | 'running'
    | 'paused'
    | 'gate_waiting'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface StepRun {
    stepId: string;
    status:
        | 'pending'
        | 'running'
        | 'completed'
        | 'failed'
        | 'skipped'
        | 'gate_waiting';
    agentId: string;
    resolvedPrompt: string;
    output: Record<string, string>;
    startedAt?: number;
    completedAt?: number;
    retryCount: number;
    gatePassed?: boolean;
    error?: string;
}

export interface JobRun {
    runId: string;
    jobId: string;
    status: JobRunStatus;
    inputValues: Record<string, unknown>;
    stepRuns: StepRun[];
    startedAt: number;
    completedAt?: number;
    durationMs?: number;
    error?: string;
    executedByAgents: string[];
    expEarned: number;
}

// ── Progress ──

export interface StepProgress {
    stepId: string;
    stepName: string;
    status: StepRun['status'];
    agentId: string;
    percent: number;
}

export interface JobProgress {
    runId: string;
    jobName: string;
    overallPercent: number;
    currentStep: string;
    completedSteps: number;
    totalSteps: number;
    stepProgress: StepProgress[];
    elapsedMs: number;
    estimatedRemainingMs: number;
}

// ── Storage Schema ──

export interface JobStoreSchema {
    version: number;
    definitions: Record<string, JobDefinition>;
    history: JobRun[];
    mastery: Record<string, Record<string, MasteryProgress>>;
    settings: JobGlobalSettings;
}

export interface MasteryProgress {
    jobId: string;
    agentId: string;
    level: number;
    completions: number;
}

export interface JobGlobalSettings {
    maxConcurrentJobs: number;
    defaultTimeoutMs: number;
    autoSaveArtifacts: boolean;
}

// ── Pure Functions ──

/**
 * Resolve a prompt template by substituting variables.
 * Supports: {{input.key}}, {{step.stepId.output.key}}, {{job.name}}, {{agent.name}}, {{timestamp}}, {{cwd}}
 */
export function resolvePromptTemplate(
    template: string,
    inputValues: Record<string, unknown>,
    stepOutputs: Record<string, Record<string, string>>,
    context: { jobName: string; agentName: string; cwd: string },
): string {
    let result = template;

    // {{input.key}}
    result = result.replace(/\{\{input\.(\w+)\}\}/g, (_, key) => {
        const val = inputValues[key];
        return val != null ? String(val) : '';
    });

    // {{step.stepId.output.key}}
    result = result.replace(
        /\{\{step\.(\w+)\.output\.(\w+)\}\}/g,
        (_, stepId, key) => {
            return stepOutputs[stepId]?.[key] ?? '';
        },
    );

    // {{job.name}}
    result = result.replace(/\{\{job\.name\}\}/g, context.jobName);

    // {{agent.name}}
    result = result.replace(/\{\{agent\.name\}\}/g, context.agentName);

    // {{timestamp}}
    result = result.replace(/\{\{timestamp\}\}/g, new Date().toISOString());

    // {{cwd}}
    result = result.replace(/\{\{cwd\}\}/g, context.cwd);

    return result;
}

/**
 * Evaluate a step condition against previous step outputs.
 * Returns true if the step should execute.
 */
export function evaluateCondition(
    condition: StepCondition,
    stepRuns: StepRun[],
    inputValues: Record<string, unknown>,
): boolean {
    // Special case: condition references job inputs
    if (condition.stepId === '__input__') {
        const allInputStr = Object.entries(inputValues)
            .map(([k, v]) => `${k}:${v}`)
            .join(' ');
        switch (condition.type) {
            case 'output_contains':
                return condition.value
                    ? allInputStr.includes(condition.value)
                    : true;
            case 'output_not_contains':
                return condition.value
                    ? !allInputStr.includes(condition.value)
                    : true;
            default:
                return true;
        }
    }

    const stepRun = stepRuns.find((s) => s.stepId === condition.stepId);
    if (!stepRun) return true; // if referenced step not found, execute by default

    switch (condition.type) {
        case 'succeeded':
            return stepRun.status === 'completed';
        case 'failed':
            return stepRun.status === 'failed';
        case 'output_contains': {
            const outputText = Object.values(stepRun.output).join(' ');
            return condition.value
                ? outputText.includes(condition.value)
                : true;
        }
        case 'output_not_contains': {
            const outputText = Object.values(stepRun.output).join(' ');
            return condition.value
                ? !outputText.includes(condition.value)
                : true;
        }
        default:
            return true;
    }
}

/**
 * Validate job input values against their definitions.
 * Returns list of error messages (empty = valid).
 */
export function validateInputs(
    inputs: JobInput[],
    values: Record<string, unknown>,
): string[] {
    const errors: string[] = [];

    for (const input of inputs) {
        const val = values[input.key];

        if (input.required && (val == null || val === '')) {
            errors.push(`"${input.label}" is required`);
            continue;
        }

        if (val != null && val !== '' && input.validation) {
            try {
                const regex = new RegExp(input.validation);
                if (!regex.test(String(val))) {
                    errors.push(
                        `"${input.label}" does not match validation pattern`,
                    );
                }
            } catch {
                // invalid regex in definition, skip validation
            }
        }
    }

    return errors;
}

/**
 * Map job difficulty to task scheduler priority.
 */
export function getDifficultyPriority(difficulty: JobDifficulty): TaskPriority {
    return DIFFICULTY_PRIORITY_MAP[difficulty];
}

/**
 * Calculate mastery bonus multiplier.
 * Returns { speedMultiplier, expMultiplier } where 1.0 = no bonus.
 */
export function calculateMasteryBonus(
    mastery: MasteryConfig,
    currentLevel: number,
): { speedMultiplier: number; expMultiplier: number } {
    const speedBonus = (currentLevel * mastery.speedBonusPerLevel) / 100;
    const expBonus = (currentLevel * mastery.expBonusPerLevel) / 100;
    return {
        speedMultiplier: 1 + speedBonus,
        expMultiplier: 1 + expBonus,
    };
}

/**
 * Calculate job run progress from step runs.
 */
export function getProgress(run: JobRun, jobDef: JobDefinition): JobProgress {
    const totalSteps = run.stepRuns.length || jobDef.workflow.steps.length;
    const completedSteps = run.stepRuns.filter(
        (s) => s.status === 'completed' || s.status === 'skipped',
    ).length;
    const currentStepRun = run.stepRuns.find((s) => s.status === 'running');
    const currentStep = currentStepRun
        ? (jobDef.workflow.steps.find((s) => s.id === currentStepRun.stepId)
              ?.name ?? '')
        : '';

    const overallPercent =
        totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    const elapsedMs = run.completedAt
        ? run.completedAt - run.startedAt
        : Date.now() - run.startedAt;

    const estimatedRemainingMs =
        completedSteps > 0 && completedSteps < totalSteps
            ? Math.round(
                  (elapsedMs / completedSteps) * (totalSteps - completedSteps),
              )
            : 0;

    const stepProgress: StepProgress[] = jobDef.workflow.steps.map((step) => {
        const sr = run.stepRuns.find((s) => s.stepId === step.id);
        return {
            stepId: step.id,
            stepName: step.name,
            status: sr?.status ?? 'pending',
            agentId: sr?.agentId ?? step.agentId ?? '',
            percent:
                sr?.status === 'completed' || sr?.status === 'skipped'
                    ? 100
                    : sr?.status === 'running'
                      ? 50
                      : 0,
        };
    });

    return {
        runId: run.runId,
        jobName: jobDef.name,
        overallPercent,
        currentStep,
        completedSteps,
        totalSteps,
        stepProgress,
        elapsedMs,
        estimatedRemainingMs,
    };
}

/**
 * Validate a workflow DAG: check for circular references and missing step references.
 * Returns list of error messages (empty = valid).
 */
export function validateWorkflow(workflow: JobWorkflow): string[] {
    const errors: string[] = [];
    const stepIds = new Set(workflow.steps.map((s) => s.id));

    for (const step of workflow.steps) {
        // Check input mapping references
        for (const mapping of step.inputMapping) {
            if (mapping.source === 'step_output') {
                const refStepId = mapping.sourceRef.split('.')[0];
                if (!stepIds.has(refStepId)) {
                    errors.push(
                        `Step "${step.id}" references non-existent step "${refStepId}" in input mapping`,
                    );
                }
                // Check for forward references (step referencing a later step)
                const refStep = workflow.steps.find((s) => s.id === refStepId);
                if (refStep && refStep.executionOrder >= step.executionOrder) {
                    errors.push(
                        `Step "${step.id}" references step "${refStepId}" which executes at the same or later order`,
                    );
                }
            }
        }

        // Check condition references
        if (step.condition && step.condition.stepId !== '__input__') {
            if (!stepIds.has(step.condition.stepId)) {
                errors.push(
                    `Step "${step.id}" condition references non-existent step "${step.condition.stepId}"`,
                );
            }
        }

        // Check gate reviewer reference
        if (
            step.gate?.reviewerAgentId &&
            step.gate.type === 'auto_check' &&
            !step.gate.reviewerAgentId
        ) {
            errors.push(
                `Step "${step.id}" has auto_check gate but no reviewerAgentId`,
            );
        }
    }

    // Check for duplicate step IDs
    const seen = new Set<string>();
    for (const step of workflow.steps) {
        if (seen.has(step.id)) {
            errors.push(`Duplicate step ID: "${step.id}"`);
        }
        seen.add(step.id);
    }

    return errors;
}

/**
 * Group steps by executionOrder for parallel execution within each group.
 */
export function groupStepsByOrder(steps: JobStep[]): JobStep[][] {
    const groups = new Map<number, JobStep[]>();
    for (const step of steps) {
        const group = groups.get(step.executionOrder) ?? [];
        group.push(step);
        groups.set(step.executionOrder, group);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, steps]) => steps);
}

/**
 * Create an initial StepRun for a step.
 */
export function createInitialStepRun(step: JobStep): StepRun {
    return {
        stepId: step.id,
        status: 'pending',
        agentId: step.agentId ?? '',
        resolvedPrompt: '',
        output: {},
        retryCount: 0,
    };
}

/**
 * Create an initial JobRun.
 */
export function createJobRun(
    jobDef: JobDefinition,
    inputValues: Record<string, unknown>,
): JobRun {
    return {
        runId: `jr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        jobId: jobDef.id,
        status: 'pending',
        inputValues,
        stepRuns: jobDef.workflow.steps.map(createInitialStepRun),
        startedAt: Date.now(),
        executedByAgents: [],
        expEarned: 0,
    };
}

/**
 * Check if a character meets the requirements to run a job.
 */
export function canRunJob(
    jobDef: JobDefinition,
    characterLevel: number,
    completedJobIds: string[],
): { canRun: boolean; reason?: string } {
    if (characterLevel < jobDef.metadata.requiredLevel) {
        return {
            canRun: false,
            reason: `Requires level ${jobDef.metadata.requiredLevel} (current: ${characterLevel})`,
        };
    }

    for (const prereq of jobDef.metadata.prerequisiteJobIds) {
        if (!completedJobIds.includes(prereq)) {
            return {
                canRun: false,
                reason: `Prerequisite job "${prereq}" not completed`,
            };
        }
    }

    return { canRun: true };
}
