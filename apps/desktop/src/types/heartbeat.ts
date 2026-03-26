/**
 * Agent Heartbeat 자율 판단 시스템 — 타입 정의
 *
 * 에이전트가 주기적으로 체크리스트를 실행하고,
 * 자율성 레벨에 따라 직접 실행하거나 유저에게 알림을 보낸다.
 */

// ── Autonomy Levels ──

export type AutonomyLevel = 0 | 1 | 2 | 3;

export interface AutonomyPermissions {
    canReadFiles: boolean;
    canRunTests: boolean;
    canEditFiles: boolean;
    canRunBash: boolean;
    canCommitChanges: boolean;
    canCreateBranch: boolean;
    canInstallPackages: boolean;
    requiresApproval: boolean;
    maxFileEditsPerHeartbeat: number;
}

export const AUTONOMY_PERMISSIONS: Record<AutonomyLevel, AutonomyPermissions> =
    {
        0: {
            canReadFiles: true,
            canRunTests: false,
            canEditFiles: false,
            canRunBash: false,
            canCommitChanges: false,
            canCreateBranch: false,
            canInstallPackages: false,
            requiresApproval: true,
            maxFileEditsPerHeartbeat: 0,
        },
        1: {
            canReadFiles: true,
            canRunTests: true,
            canEditFiles: false,
            canRunBash: true,
            canCommitChanges: false,
            canCreateBranch: false,
            canInstallPackages: false,
            requiresApproval: true,
            maxFileEditsPerHeartbeat: 0,
        },
        2: {
            canReadFiles: true,
            canRunTests: true,
            canEditFiles: true,
            canRunBash: true,
            canCommitChanges: false,
            canCreateBranch: true,
            canInstallPackages: false,
            requiresApproval: false,
            maxFileEditsPerHeartbeat: 10,
        },
        3: {
            canReadFiles: true,
            canRunTests: true,
            canEditFiles: true,
            canRunBash: true,
            canCommitChanges: true,
            canCreateBranch: true,
            canInstallPackages: true,
            requiresApproval: false,
            maxFileEditsPerHeartbeat: 50,
        },
    };

// ── Check Item Types ──

export type CheckItemType =
    | 'build-check'
    | 'test-check'
    | 'lint-check'
    | 'dependency-check'
    | 'file-check'
    | 'metric-check'
    | 'command'
    | 'doc-freshness'
    | 'todo-scan'
    | 'coverage-check';

export interface HeartbeatCheckItem {
    id: string;
    name: string;
    description: string;
    type: CheckItemType;
    command?: string;
    filePattern?: string;
    threshold?: number;
    priority: 'critical' | 'normal' | 'low';
    enabled: boolean;
    requiredAutonomyLevel: AutonomyLevel;
    abortOnFail: boolean;
    dependsOn?: string[];
}

// ── Schedule ──

export interface HeartbeatSchedule {
    type: 'interval' | 'cron' | 'event-driven';
    intervalMs?: number;
    cronExpression?: string;
    triggerEvents?: string[];
    activeHoursStart?: number;
    activeHoursEnd?: number;
    daysOfWeek?: number[];
}

// ── Constraints ──

export interface HeartbeatConstraints {
    maxDurationMs: number;
    maxFileEdits: number;
    maxRetries: number;
    cooldownMs: number;
    blockedPaths: string[];
    blockedCommands: string[];
}

export const SAFETY_DEFAULTS: HeartbeatConstraints = {
    maxDurationMs: 300_000,
    maxFileEdits: 10,
    maxRetries: 2,
    cooldownMs: 300_000,
    blockedPaths: [
        '.env',
        '.env.*',
        'credentials.*',
        'secrets.*',
        '*.key',
        '*.pem',
        'node_modules/',
        '.git/',
    ],
    blockedCommands: [
        'rm -rf',
        'rmdir /s',
        'drop table',
        'drop database',
        'git push --force',
        'git reset --hard',
        'npm publish',
        'yarn publish',
        'format c:',
    ],
};

// ── Config ──

export interface HeartbeatConfig {
    agentId: string;
    enabled: boolean;
    intervalMs: number;
    autonomyLevel: AutonomyLevel;
    checklist: HeartbeatCheckItem[];
    schedule: HeartbeatSchedule;
    constraints: HeartbeatConstraints;
}

export const DEFAULT_INTERVAL_MS = 1_800_000; // 30분

export function defaultConfig(agentId: string): HeartbeatConfig {
    return {
        agentId,
        enabled: false,
        intervalMs: DEFAULT_INTERVAL_MS,
        autonomyLevel: 0,
        checklist: [],
        schedule: {
            type: 'interval',
            intervalMs: DEFAULT_INTERVAL_MS,
        },
        constraints: { ...SAFETY_DEFAULTS },
    };
}

// ── Execution Results ──

export type CheckItemStatus =
    | 'passed'
    | 'failed'
    | 'fixed'
    | 'rollback'
    | 'timeout'
    | 'error'
    | 'skipped';

export interface CheckItemResult {
    itemId: string;
    itemName: string;
    status: CheckItemStatus;
    message: string;
    durationMs: number;
    filesChanged: string[];
    timestamp: number;
}

export type OverallStatus =
    | 'all-passed'
    | 'some-failed'
    | 'aborted'
    | 'timeout';

export interface HeartbeatLog {
    runId: string;
    agentId: string;
    startedAt: number;
    completedAt: number;
    totalDurationMs: number;
    itemResults: CheckItemResult[];
    overallStatus: OverallStatus;
}

// ── Approval Queue ──

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
    id: string;
    agentId: string;
    checkItemId: string;
    description: string;
    proposedAction: string;
    createdAt: number;
    status: ApprovalStatus;
    expiresAt: number;
}

export const APPROVAL_EXPIRY_MS = 1_800_000; // 30분

// ── Agent Stats ──

export interface HeartbeatAgentStats {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalFixesApplied: number;
    totalRollbacks: number;
    averageDurationMs: number;
    lastRunAt: number;
}

export function emptyAgentStats(): HeartbeatAgentStats {
    return {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        totalFixesApplied: 0,
        totalRollbacks: 0,
        averageDurationMs: 0,
        lastRunAt: 0,
    };
}

// ── Pure Helper Functions ──

export function getMaxAllowedAutonomy(characterLevel: number): AutonomyLevel {
    if (characterLevel >= 50) return 3;
    if (characterLevel >= 25) return 2;
    if (characterLevel >= 10) return 1;
    return 0;
}

export function canUpgradeAutonomy(
    characterLevel: number,
    targetLevel: AutonomyLevel,
): { allowed: boolean; reason?: string } {
    const maxAllowed = getMaxAllowedAutonomy(characterLevel);
    if (targetLevel > maxAllowed) {
        const minLevels: Record<number, number> = { 1: 10, 2: 25, 3: 50 };
        return {
            allowed: false,
            reason: `캐릭터 레벨 ${characterLevel}에서는 자율성 Level ${targetLevel}을 해금할 수 없습니다. (최소 레벨: ${minLevels[targetLevel] ?? 0})`,
        };
    }
    return { allowed: true };
}

export function isBlockedCommand(
    command: string,
    blockedCommands: string[],
): boolean {
    const normalized = command.toLowerCase().trim();
    return blockedCommands.some((blocked) =>
        normalized.includes(blocked.toLowerCase()),
    );
}

export function isBlockedPath(
    filePath: string,
    blockedPaths: string[],
): boolean {
    return blockedPaths.some((pattern) => {
        if (pattern.endsWith('/')) {
            return (
                filePath.startsWith(pattern) || filePath.includes(`/${pattern}`)
            );
        }
        if (pattern.includes('*')) {
            const regex = new RegExp(
                '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$',
            );
            return regex.test(filePath);
        }
        return filePath === pattern || filePath.endsWith(`/${pattern}`);
    });
}

export function isWithinActiveHours(
    schedule: HeartbeatSchedule,
    now?: Date,
): boolean {
    const date = now ?? new Date();

    if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        if (!schedule.daysOfWeek.includes(date.getDay())) return false;
    }

    if (schedule.activeHoursStart != null && schedule.activeHoursEnd != null) {
        const hour = date.getHours();
        if (schedule.activeHoursStart <= schedule.activeHoursEnd) {
            return (
                hour >= schedule.activeHoursStart &&
                hour < schedule.activeHoursEnd
            );
        }
        // Wrap-around (e.g., 22:00 ~ 06:00)
        return (
            hour >= schedule.activeHoursStart || hour < schedule.activeHoursEnd
        );
    }

    return true;
}

export function isActiveDay(schedule: HeartbeatSchedule, now?: Date): boolean {
    if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) return true;
    const day = (now ?? new Date()).getDay();
    return schedule.daysOfWeek.includes(day);
}

export function sortChecklistByPriority(
    items: HeartbeatCheckItem[],
): HeartbeatCheckItem[] {
    const priorityOrder: Record<string, number> = {
        critical: 0,
        normal: 1,
        low: 2,
    };
    return [...items].sort(
        (a, b) =>
            (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1),
    );
}

export function computeOverallStatus(
    results: CheckItemResult[],
): OverallStatus {
    if (results.length === 0) return 'all-passed';
    if (results.some((r) => r.status === 'timeout')) return 'timeout';
    const hasFailure = results.some(
        (r) =>
            r.status === 'failed' ||
            r.status === 'error' ||
            r.status === 'rollback',
    );
    if (hasFailure) return 'some-failed';
    return 'all-passed';
}

// ── Store Schema ──

export interface HeartbeatStoreSchema {
    version: number;
    configs: Record<string, HeartbeatConfig>;
    logs: HeartbeatLog[];
    approvalQueue: ApprovalRequest[];
    stats: Record<string, HeartbeatAgentStats>;
}
