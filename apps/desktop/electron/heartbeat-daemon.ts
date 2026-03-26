import Store from 'electron-store';
import { randomUUID } from 'crypto';
import {
    HeartbeatConfig,
    HeartbeatCheckItem,
    HeartbeatLog,
    HeartbeatAgentStats,
    HeartbeatStoreSchema,
    CheckItemResult,
    ApprovalRequest,
    AutonomyLevel,
    OverallStatus,
    defaultConfig,
    emptyAgentStats,
    isWithinActiveHours,
    isBlockedCommand,
    sortChecklistByPriority,
    computeOverallStatus,
    getMaxAllowedAutonomy,
    AUTONOMY_PERMISSIONS,
    SAFETY_DEFAULTS,
    APPROVAL_EXPIRY_MS,
} from '../src/types/heartbeat';

const MAX_LOG_ENTRIES = 1000;

class HeartbeatDaemon {
    private store: Store<HeartbeatStoreSchema> | null = null;
    private timers = new Map<string, ReturnType<typeof setInterval>>();
    private running = new Map<string, boolean>();
    private cooldowns = new Map<string, number>(); // agentId → cooldown expiry timestamp
    private tickListeners: ((log: HeartbeatLog) => void)[] = [];
    private approvalListeners: ((req: ApprovalRequest) => void)[] = [];

    init(): void {
        if (this.store) return;
        this.store = new Store<HeartbeatStoreSchema>({
            name: 'dokba-heartbeat',
            defaults: {
                version: 1,
                configs: {},
                logs: [],
                approvalQueue: [],
                stats: {},
            },
        });
    }

    private ensureInit(): void {
        if (!this.store) this.init();
    }

    // ── Daemon Control ──

    start(agentId: string): { success: boolean; reason?: string } {
        this.ensureInit();
        if (this.timers.has(agentId)) {
            return { success: false, reason: 'Already running' };
        }

        const config = this.getConfig(agentId);
        if (!config.enabled) {
            return {
                success: false,
                reason: 'Heartbeat is disabled for this agent',
            };
        }

        const intervalMs = config.schedule.intervalMs ?? config.intervalMs;
        const timer = setInterval(() => {
            void this.executeTick(agentId);
        }, intervalMs);

        this.timers.set(agentId, timer);
        return { success: true };
    }

    stop(agentId: string): { success: boolean } {
        const timer = this.timers.get(agentId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(agentId);
        }
        this.running.delete(agentId);
        return { success: true };
    }

    stopAll(): { success: boolean } {
        for (const agentId of [...this.timers.keys()]) {
            this.stop(agentId);
        }
        return { success: true };
    }

    getStatus(agentId: string): 'running' | 'idle' | 'disabled' {
        const config = this.getConfig(agentId);
        if (!config.enabled) return 'disabled';
        if (this.timers.has(agentId)) return 'running';
        return 'idle';
    }

    /** Manual single execution — for testing or on-demand runs */
    async runOnce(agentId: string): Promise<HeartbeatLog> {
        return this.executeTick(agentId);
    }

    /**
     * Synchronous tick for unit testing — runs checklist evaluation
     * without actually executing commands. Returns the HeartbeatLog
     * that would be produced.
     */
    tick(agentId: string): HeartbeatLog {
        this.ensureInit();
        const config = this.getConfig(agentId);
        const startedAt = Date.now();
        const runId = randomUUID();

        // Schedule check
        if (!isWithinActiveHours(config.schedule)) {
            return this.createSkippedLog(
                runId,
                agentId,
                startedAt,
                'Outside active hours',
            );
        }

        // Cooldown check
        const cooldownExpiry = this.cooldowns.get(agentId) ?? 0;
        if (Date.now() < cooldownExpiry) {
            return this.createSkippedLog(
                runId,
                agentId,
                startedAt,
                'In cooldown period',
            );
        }

        // Already running check
        if (this.running.get(agentId)) {
            return this.createSkippedLog(
                runId,
                agentId,
                startedAt,
                'Previous tick still running',
            );
        }

        // Run checklist evaluation
        const sortedItems = sortChecklistByPriority(
            config.checklist.filter((item) => item.enabled),
        );

        const results: CheckItemResult[] = [];
        const permissions = AUTONOMY_PERMISSIONS[config.autonomyLevel];
        let aborted = false;

        for (const item of sortedItems) {
            if (aborted) {
                results.push(
                    this.createSkippedResult(
                        item,
                        'Aborted due to prior critical failure',
                    ),
                );
                continue;
            }

            // Check dependency
            if (item.dependsOn && item.dependsOn.length > 0) {
                const allDepsMet = item.dependsOn.every((depId) =>
                    results.some(
                        (r) => r.itemId === depId && r.status === 'passed',
                    ),
                );
                if (!allDepsMet) {
                    results.push(
                        this.createSkippedResult(item, 'Dependencies not met'),
                    );
                    continue;
                }
            }

            // Check autonomy level
            if (item.requiredAutonomyLevel > config.autonomyLevel) {
                results.push(
                    this.createSkippedResult(
                        item,
                        `Requires autonomy level ${item.requiredAutonomyLevel}`,
                    ),
                );
                continue;
            }

            // Check command safety
            if (
                item.command &&
                isBlockedCommand(
                    item.command,
                    config.constraints.blockedCommands,
                )
            ) {
                results.push({
                    itemId: item.id,
                    itemName: item.name,
                    status: 'error',
                    message: `Blocked command detected: ${item.command}`,
                    durationMs: 0,
                    filesChanged: [],
                    timestamp: Date.now(),
                });
                if (item.abortOnFail) aborted = true;
                continue;
            }

            // Evaluate check item (without actual execution in sync tick)
            const result = this.evaluateCheckItem(item, config, permissions);
            results.push(result);

            if (result.status === 'failed' && item.abortOnFail) {
                aborted = true;
            }
        }

        const completedAt = Date.now();
        const overallStatus: OverallStatus = aborted
            ? 'aborted'
            : computeOverallStatus(results);

        const log: HeartbeatLog = {
            runId,
            agentId,
            startedAt,
            completedAt,
            totalDurationMs: completedAt - startedAt,
            itemResults: results,
            overallStatus,
        };

        this.recordLog(log);
        this.updateStats(agentId, log);
        this.emitTick(log);

        // Apply cooldown on failure
        if (overallStatus === 'some-failed' || overallStatus === 'aborted') {
            this.cooldowns.set(
                agentId,
                Date.now() + config.constraints.cooldownMs,
            );
        }

        return log;
    }

    // ── Config Management ──

    getConfig(agentId: string): HeartbeatConfig {
        this.ensureInit();
        const configs = this.store!.get('configs');
        return configs[agentId] ?? defaultConfig(agentId);
    }

    setConfig(
        agentId: string,
        patch: Partial<HeartbeatConfig>,
    ): { success: boolean } {
        this.ensureInit();
        const configs = this.store!.get('configs');
        const existing = configs[agentId] ?? defaultConfig(agentId);
        configs[agentId] = { ...existing, ...patch, agentId };
        this.store!.set('configs', configs);

        // Restart timer if running with new interval
        if (this.timers.has(agentId)) {
            this.stop(agentId);
            if (configs[agentId].enabled) {
                this.start(agentId);
            }
        }

        return { success: true };
    }

    // ── Autonomy Level ──

    setAutonomy(
        agentId: string,
        level: AutonomyLevel,
        characterLevel?: number,
    ): { success: boolean; reason?: string } {
        if (characterLevel != null) {
            const maxAllowed = getMaxAllowedAutonomy(characterLevel);
            if (level > maxAllowed) {
                const minLevels: Record<number, number> = {
                    1: 10,
                    2: 25,
                    3: 50,
                };
                return {
                    success: false,
                    reason: `캐릭터 레벨 ${characterLevel}에서는 자율성 Level ${level}을 해금할 수 없습니다. (최소 레벨: ${minLevels[level] ?? 0})`,
                };
            }
        }

        this.setConfig(agentId, { autonomyLevel: level });
        return { success: true };
    }

    // ── Approval Queue ──

    createApproval(
        agentId: string,
        checkItemId: string,
        description: string,
        proposedAction: string,
    ): ApprovalRequest {
        this.ensureInit();
        const now = Date.now();
        const req: ApprovalRequest = {
            id: randomUUID(),
            agentId,
            checkItemId,
            description,
            proposedAction,
            createdAt: now,
            status: 'pending',
            expiresAt: now + APPROVAL_EXPIRY_MS,
        };

        const queue = this.store!.get('approvalQueue');
        queue.push(req);
        this.store!.set('approvalQueue', queue);
        this.emitApprovalRequest(req);
        return req;
    }

    approve(requestId: string): { success: boolean; reason?: string } {
        this.ensureInit();
        const queue = this.store!.get('approvalQueue');
        const req = queue.find((r) => r.id === requestId);
        if (!req) return { success: false, reason: 'Request not found' };
        if (req.status !== 'pending')
            return { success: false, reason: `Request already ${req.status}` };
        if (Date.now() > req.expiresAt) {
            req.status = 'expired';
            this.store!.set('approvalQueue', queue);
            return { success: false, reason: 'Request expired' };
        }

        req.status = 'approved';
        this.store!.set('approvalQueue', queue);
        return { success: true };
    }

    reject(requestId: string): { success: boolean; reason?: string } {
        this.ensureInit();
        const queue = this.store!.get('approvalQueue');
        const req = queue.find((r) => r.id === requestId);
        if (!req) return { success: false, reason: 'Request not found' };
        if (req.status !== 'pending')
            return { success: false, reason: `Request already ${req.status}` };

        req.status = 'rejected';
        this.store!.set('approvalQueue', queue);
        return { success: true };
    }

    getApprovals(agentId?: string): ApprovalRequest[] {
        this.ensureInit();
        const queue = this.store!.get('approvalQueue');
        // Expire stale requests
        const now = Date.now();
        let changed = false;
        for (const req of queue) {
            if (req.status === 'pending' && now > req.expiresAt) {
                req.status = 'expired';
                changed = true;
            }
        }
        if (changed) this.store!.set('approvalQueue', queue);

        if (agentId) return queue.filter((r) => r.agentId === agentId);
        return queue;
    }

    getPendingApprovals(): ApprovalRequest[] {
        return this.getApprovals().filter((r) => r.status === 'pending');
    }

    // ── Logs & Stats ──

    getLogs(agentId?: string, limit = 50, offset = 0): HeartbeatLog[] {
        this.ensureInit();
        let logs = this.store!.get('logs');
        if (agentId) {
            logs = logs.filter((l) => l.agentId === agentId);
        }
        // Most recent first
        return logs.reverse().slice(offset, offset + limit);
    }

    getStats(agentId: string): HeartbeatAgentStats {
        this.ensureInit();
        const stats = this.store!.get('stats');
        return stats[agentId] ?? emptyAgentStats();
    }

    getAllStats(): Record<string, HeartbeatAgentStats> {
        this.ensureInit();
        return this.store!.get('stats');
    }

    // ── Event Listeners ──

    onTick(listener: (log: HeartbeatLog) => void): () => void {
        this.tickListeners.push(listener);
        return () => {
            this.tickListeners = this.tickListeners.filter(
                (l) => l !== listener,
            );
        };
    }

    onApprovalRequest(listener: (req: ApprovalRequest) => void): () => void {
        this.approvalListeners.push(listener);
        return () => {
            this.approvalListeners = this.approvalListeners.filter(
                (l) => l !== listener,
            );
        };
    }

    // ── Shutdown ──

    shutdown(): void {
        this.stopAll();
    }

    // ── Private Helpers ──

    private async executeTick(agentId: string): Promise<HeartbeatLog> {
        // The async version wraps tick() and could in future execute actual PTY commands
        return this.tick(agentId);
    }

    private evaluateCheckItem(
        item: HeartbeatCheckItem,
        config: HeartbeatConfig,
        permissions: (typeof AUTONOMY_PERMISSIONS)[AutonomyLevel],
    ): CheckItemResult {
        const now = Date.now();

        // For command-type checks, verify permissions
        if (item.type === 'command' && !permissions.canRunBash) {
            return {
                itemId: item.id,
                itemName: item.name,
                status: 'skipped',
                message: 'Bash execution not allowed at current autonomy level',
                durationMs: 0,
                filesChanged: [],
                timestamp: now,
            };
        }

        if (
            (item.type === 'build-check' ||
                item.type === 'test-check' ||
                item.type === 'lint-check') &&
            !permissions.canRunTests
        ) {
            return {
                itemId: item.id,
                itemName: item.name,
                status: 'skipped',
                message:
                    'Test/build execution not allowed at current autonomy level',
                durationMs: 0,
                filesChanged: [],
                timestamp: now,
            };
        }

        // Level 0: observation only — record as "passed" with observation note
        if (config.autonomyLevel === 0) {
            return {
                itemId: item.id,
                itemName: item.name,
                status: 'passed',
                message: `[Observer] Check registered: ${item.description}`,
                durationMs: 0,
                filesChanged: [],
                timestamp: now,
            };
        }

        // Level 1: would need approval
        if (permissions.requiresApproval) {
            this.createApproval(
                config.agentId,
                item.id,
                `${item.name}: ${item.description}`,
                item.command ?? `Run ${item.type}`,
            );
            return {
                itemId: item.id,
                itemName: item.name,
                status: 'skipped',
                message: 'Approval requested — awaiting user confirmation',
                durationMs: 0,
                filesChanged: [],
                timestamp: now,
            };
        }

        // Level 2+: would execute (actual execution deferred to async PTY runner)
        return {
            itemId: item.id,
            itemName: item.name,
            status: 'passed',
            message: `[Autonomous] Ready to execute: ${item.command ?? item.type}`,
            durationMs: 0,
            filesChanged: [],
            timestamp: now,
        };
    }

    private createSkippedLog(
        runId: string,
        agentId: string,
        startedAt: number,
        reason: string,
    ): HeartbeatLog {
        const now = Date.now();
        return {
            runId,
            agentId,
            startedAt,
            completedAt: now,
            totalDurationMs: now - startedAt,
            itemResults: [
                {
                    itemId: '_skip',
                    itemName: 'Heartbeat Skip',
                    status: 'skipped',
                    message: reason,
                    durationMs: 0,
                    filesChanged: [],
                    timestamp: now,
                },
            ],
            overallStatus: 'all-passed',
        };
    }

    private createSkippedResult(
        item: HeartbeatCheckItem,
        reason: string,
    ): CheckItemResult {
        return {
            itemId: item.id,
            itemName: item.name,
            status: 'skipped',
            message: reason,
            durationMs: 0,
            filesChanged: [],
            timestamp: Date.now(),
        };
    }

    private recordLog(log: HeartbeatLog): void {
        if (!this.store) return;
        const logs = this.store.get('logs');
        logs.push(log);
        // Ring buffer
        if (logs.length > MAX_LOG_ENTRIES) {
            this.store.set('logs', logs.slice(-MAX_LOG_ENTRIES));
        } else {
            this.store.set('logs', logs);
        }
    }

    private updateStats(agentId: string, log: HeartbeatLog): void {
        if (!this.store) return;
        const allStats = this.store.get('stats');
        const stats = allStats[agentId] ?? emptyAgentStats();

        stats.totalRuns++;
        stats.lastRunAt = log.completedAt;

        if (log.overallStatus === 'all-passed') {
            stats.successfulRuns++;
        } else {
            stats.failedRuns++;
        }

        // Count fixes and rollbacks
        for (const result of log.itemResults) {
            if (result.status === 'fixed') stats.totalFixesApplied++;
            if (result.status === 'rollback') stats.totalRollbacks++;
        }

        // Recalculate average duration
        const totalDuration =
            stats.averageDurationMs * (stats.totalRuns - 1) +
            log.totalDurationMs;
        stats.averageDurationMs = Math.round(totalDuration / stats.totalRuns);

        allStats[agentId] = stats;
        this.store.set('stats', allStats);
    }

    private emitTick(log: HeartbeatLog): void {
        for (const listener of this.tickListeners) {
            try {
                listener(log);
            } catch {
                /* ignore */
            }
        }
    }

    private emitApprovalRequest(req: ApprovalRequest): void {
        for (const listener of this.approvalListeners) {
            try {
                listener(req);
            } catch {
                /* ignore */
            }
        }
    }
}

export const heartbeatDaemon = new HeartbeatDaemon();
