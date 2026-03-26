import { describe, it, expect } from 'vitest';
import {
    getMaxAllowedAutonomy,
    canUpgradeAutonomy,
    isBlockedCommand,
    isBlockedPath,
    isWithinActiveHours,
    isActiveDay,
    sortChecklistByPriority,
    computeOverallStatus,
    defaultConfig,
    emptyAgentStats,
    AUTONOMY_PERMISSIONS,
    SAFETY_DEFAULTS,
    APPROVAL_EXPIRY_MS,
    DEFAULT_INTERVAL_MS,
} from '../../types/heartbeat';
import type {
    HeartbeatCheckItem,
    HeartbeatSchedule,
    CheckItemResult,
} from '../../types/heartbeat';

// ── getMaxAllowedAutonomy ──

describe('getMaxAllowedAutonomy', () => {
    it('returns 0 for level 1-9', () => {
        expect(getMaxAllowedAutonomy(1)).toBe(0);
        expect(getMaxAllowedAutonomy(9)).toBe(0);
    });

    it('returns 1 for level 10-24', () => {
        expect(getMaxAllowedAutonomy(10)).toBe(1);
        expect(getMaxAllowedAutonomy(24)).toBe(1);
    });

    it('returns 2 for level 25-49', () => {
        expect(getMaxAllowedAutonomy(25)).toBe(2);
        expect(getMaxAllowedAutonomy(49)).toBe(2);
    });

    it('returns 3 for level 50+', () => {
        expect(getMaxAllowedAutonomy(50)).toBe(3);
        expect(getMaxAllowedAutonomy(100)).toBe(3);
    });
});

// ── canUpgradeAutonomy ──

describe('canUpgradeAutonomy', () => {
    it('allows Level 0 for any character level', () => {
        expect(canUpgradeAutonomy(1, 0)).toEqual({ allowed: true });
    });

    it('allows Level 1 for character level 10+', () => {
        expect(canUpgradeAutonomy(10, 1)).toEqual({ allowed: true });
    });

    it('rejects Level 1 for character level 9', () => {
        const result = canUpgradeAutonomy(9, 1);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('최소 레벨: 10');
    });

    it('allows Level 2 for character level 25+', () => {
        expect(canUpgradeAutonomy(25, 2)).toEqual({ allowed: true });
    });

    it('rejects Level 2 for character level 24', () => {
        const result = canUpgradeAutonomy(24, 2);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('최소 레벨: 25');
    });

    it('allows Level 3 for character level 50+', () => {
        expect(canUpgradeAutonomy(50, 3)).toEqual({ allowed: true });
    });

    it('rejects Level 3 for character level 49', () => {
        const result = canUpgradeAutonomy(49, 3);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('최소 레벨: 50');
    });
});

// ── isBlockedCommand ──

describe('isBlockedCommand', () => {
    const blockedCommands = SAFETY_DEFAULTS.blockedCommands;

    it('blocks rm -rf', () => {
        expect(isBlockedCommand('rm -rf /', blockedCommands)).toBe(true);
    });

    it('blocks git push --force', () => {
        expect(
            isBlockedCommand('git push --force origin main', blockedCommands),
        ).toBe(true);
    });

    it('blocks git reset --hard', () => {
        expect(
            isBlockedCommand('git reset --hard HEAD~1', blockedCommands),
        ).toBe(true);
    });

    it('blocks npm publish', () => {
        expect(
            isBlockedCommand('npm publish --access public', blockedCommands),
        ).toBe(true);
    });

    it('blocks drop table (case insensitive)', () => {
        expect(isBlockedCommand('DROP TABLE users', blockedCommands)).toBe(
            true,
        );
    });

    it('allows safe commands', () => {
        expect(isBlockedCommand('npm run build', blockedCommands)).toBe(false);
        expect(isBlockedCommand('npm test', blockedCommands)).toBe(false);
        expect(isBlockedCommand('git status', blockedCommands)).toBe(false);
        expect(isBlockedCommand('npx tsc --noEmit', blockedCommands)).toBe(
            false,
        );
    });

    it('allows git push without --force', () => {
        expect(isBlockedCommand('git push origin main', blockedCommands)).toBe(
            false,
        );
    });
});

// ── isBlockedPath ──

describe('isBlockedPath', () => {
    const blockedPaths = SAFETY_DEFAULTS.blockedPaths;

    it('blocks .env', () => {
        expect(isBlockedPath('.env', blockedPaths)).toBe(true);
    });

    it('blocks .env.local via wildcard', () => {
        expect(isBlockedPath('.env.local', blockedPaths)).toBe(true);
    });

    it('blocks credentials.json via wildcard', () => {
        expect(isBlockedPath('credentials.json', blockedPaths)).toBe(true);
    });

    it('blocks private.key via wildcard', () => {
        expect(isBlockedPath('private.key', blockedPaths)).toBe(true);
    });

    it('blocks server.pem via wildcard', () => {
        expect(isBlockedPath('server.pem', blockedPaths)).toBe(true);
    });

    it('blocks node_modules/ directory', () => {
        expect(
            isBlockedPath('node_modules/lodash/index.js', blockedPaths),
        ).toBe(true);
    });

    it('blocks .git/ directory', () => {
        expect(isBlockedPath('.git/HEAD', blockedPaths)).toBe(true);
    });

    it('allows normal source files', () => {
        expect(isBlockedPath('src/index.ts', blockedPaths)).toBe(false);
        expect(isBlockedPath('package.json', blockedPaths)).toBe(false);
        expect(isBlockedPath('tsconfig.json', blockedPaths)).toBe(false);
    });

    it('blocks nested path with blocked directory', () => {
        expect(isBlockedPath('src/node_modules/foo.js', blockedPaths)).toBe(
            true,
        );
    });
});

// ── isWithinActiveHours ──

describe('isWithinActiveHours', () => {
    it('returns true when no schedule constraints', () => {
        const schedule: HeartbeatSchedule = { type: 'interval' };
        expect(isWithinActiveHours(schedule)).toBe(true);
    });

    it('returns true within active hours', () => {
        const schedule: HeartbeatSchedule = {
            type: 'interval',
            activeHoursStart: 9,
            activeHoursEnd: 18,
        };
        // 12:00 (noon) is within 9-18
        const noon = new Date('2026-03-26T12:00:00');
        expect(isWithinActiveHours(schedule, noon)).toBe(true);
    });

    it('returns false outside active hours', () => {
        const schedule: HeartbeatSchedule = {
            type: 'interval',
            activeHoursStart: 9,
            activeHoursEnd: 18,
        };
        // 22:00 is outside 9-18
        const lateNight = new Date('2026-03-26T22:00:00');
        expect(isWithinActiveHours(schedule, lateNight)).toBe(false);
    });

    it('handles wrap-around hours (night shift)', () => {
        const schedule: HeartbeatSchedule = {
            type: 'interval',
            activeHoursStart: 22,
            activeHoursEnd: 6,
        };
        // 23:00 is within 22-06
        const lateNight = new Date('2026-03-26T23:00:00');
        expect(isWithinActiveHours(schedule, lateNight)).toBe(true);

        // 03:00 is within 22-06
        const earlyMorning = new Date('2026-03-27T03:00:00');
        expect(isWithinActiveHours(schedule, earlyMorning)).toBe(true);

        // 12:00 is outside 22-06
        const noon = new Date('2026-03-26T12:00:00');
        expect(isWithinActiveHours(schedule, noon)).toBe(false);
    });

    it('respects daysOfWeek filter', () => {
        const schedule: HeartbeatSchedule = {
            type: 'interval',
            daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
        };
        // 2026-03-26 is Thursday (day 4)
        const thursday = new Date('2026-03-26T12:00:00');
        expect(isWithinActiveHours(schedule, thursday)).toBe(true);

        // 2026-03-29 is Sunday (day 0)
        const sunday = new Date('2026-03-29T12:00:00');
        expect(isWithinActiveHours(schedule, sunday)).toBe(false);
    });
});

// ── isActiveDay ──

describe('isActiveDay', () => {
    it('returns true when no daysOfWeek specified', () => {
        const schedule: HeartbeatSchedule = { type: 'interval' };
        expect(isActiveDay(schedule)).toBe(true);
    });

    it('returns true on active day', () => {
        const schedule: HeartbeatSchedule = {
            type: 'interval',
            daysOfWeek: [4], // Thursday only
        };
        const thursday = new Date('2026-03-26T12:00:00');
        expect(isActiveDay(schedule, thursday)).toBe(true);
    });

    it('returns false on inactive day', () => {
        const schedule: HeartbeatSchedule = {
            type: 'interval',
            daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
        };
        const sunday = new Date('2026-03-29T12:00:00');
        expect(isActiveDay(schedule, sunday)).toBe(false);
    });
});

// ── sortChecklistByPriority ──

describe('sortChecklistByPriority', () => {
    const makeItem = (
        id: string,
        priority: 'critical' | 'normal' | 'low',
    ): HeartbeatCheckItem => ({
        id,
        name: id,
        description: '',
        type: 'command',
        priority,
        enabled: true,
        requiredAutonomyLevel: 0,
        abortOnFail: false,
    });

    it('sorts critical before normal before low', () => {
        const items = [
            makeItem('low1', 'low'),
            makeItem('normal1', 'normal'),
            makeItem('critical1', 'critical'),
            makeItem('normal2', 'normal'),
        ];

        const sorted = sortChecklistByPriority(items);
        expect(sorted[0].id).toBe('critical1');
        expect(sorted[1].id).toBe('normal1');
        expect(sorted[2].id).toBe('normal2');
        expect(sorted[3].id).toBe('low1');
    });

    it('does not mutate original array', () => {
        const items = [makeItem('b', 'low'), makeItem('a', 'critical')];
        const sorted = sortChecklistByPriority(items);
        expect(items[0].id).toBe('b');
        expect(sorted[0].id).toBe('a');
    });

    it('handles empty array', () => {
        expect(sortChecklistByPriority([])).toEqual([]);
    });
});

// ── computeOverallStatus ──

describe('computeOverallStatus', () => {
    const makeResult = (
        status: CheckItemResult['status'],
    ): CheckItemResult => ({
        itemId: 'test',
        itemName: 'test',
        status,
        message: '',
        durationMs: 0,
        filesChanged: [],
        timestamp: Date.now(),
    });

    it('returns all-passed for empty results', () => {
        expect(computeOverallStatus([])).toBe('all-passed');
    });

    it('returns all-passed when all passed', () => {
        const results = [makeResult('passed'), makeResult('passed')];
        expect(computeOverallStatus(results)).toBe('all-passed');
    });

    it('returns all-passed when mixed passed and fixed', () => {
        const results = [makeResult('passed'), makeResult('fixed')];
        // fixed is a successful auto-repair, not a failure
        expect(computeOverallStatus(results)).toBe('all-passed');
    });

    it('returns timeout when any item timed out', () => {
        const results = [makeResult('passed'), makeResult('timeout')];
        expect(computeOverallStatus(results)).toBe('timeout');
    });

    it('returns some-failed when any item failed', () => {
        const results = [makeResult('passed'), makeResult('failed')];
        expect(computeOverallStatus(results)).toBe('some-failed');
    });

    it('returns some-failed for error status', () => {
        const results = [makeResult('passed'), makeResult('error')];
        expect(computeOverallStatus(results)).toBe('some-failed');
    });

    it('returns some-failed for rollback status', () => {
        const results = [makeResult('passed'), makeResult('rollback')];
        expect(computeOverallStatus(results)).toBe('some-failed');
    });

    it('all-passed with skipped items', () => {
        const results = [makeResult('passed'), makeResult('skipped')];
        expect(computeOverallStatus(results)).toBe('all-passed');
    });
});

// ── AUTONOMY_PERMISSIONS ──

describe('AUTONOMY_PERMISSIONS', () => {
    it('Level 0 can only read files', () => {
        const p = AUTONOMY_PERMISSIONS[0];
        expect(p.canReadFiles).toBe(true);
        expect(p.canRunTests).toBe(false);
        expect(p.canEditFiles).toBe(false);
        expect(p.canRunBash).toBe(false);
        expect(p.canCommitChanges).toBe(false);
        expect(p.requiresApproval).toBe(true);
        expect(p.maxFileEditsPerHeartbeat).toBe(0);
    });

    it('Level 1 can run tests and bash but needs approval', () => {
        const p = AUTONOMY_PERMISSIONS[1];
        expect(p.canRunTests).toBe(true);
        expect(p.canRunBash).toBe(true);
        expect(p.canEditFiles).toBe(false);
        expect(p.requiresApproval).toBe(true);
    });

    it('Level 2 can edit files without approval', () => {
        const p = AUTONOMY_PERMISSIONS[2];
        expect(p.canEditFiles).toBe(true);
        expect(p.canRunBash).toBe(true);
        expect(p.requiresApproval).toBe(false);
        expect(p.canCommitChanges).toBe(false);
        expect(p.maxFileEditsPerHeartbeat).toBe(10);
    });

    it('Level 3 has full permissions', () => {
        const p = AUTONOMY_PERMISSIONS[3];
        expect(p.canEditFiles).toBe(true);
        expect(p.canCommitChanges).toBe(true);
        expect(p.canCreateBranch).toBe(true);
        expect(p.canInstallPackages).toBe(true);
        expect(p.requiresApproval).toBe(false);
        expect(p.maxFileEditsPerHeartbeat).toBe(50);
    });
});

// ── SAFETY_DEFAULTS ──

describe('SAFETY_DEFAULTS', () => {
    it('has 5 minute timeout', () => {
        expect(SAFETY_DEFAULTS.maxDurationMs).toBe(300_000);
    });

    it('has max 10 file edits', () => {
        expect(SAFETY_DEFAULTS.maxFileEdits).toBe(10);
    });

    it('has max 2 retries', () => {
        expect(SAFETY_DEFAULTS.maxRetries).toBe(2);
    });

    it('has 5 minute cooldown', () => {
        expect(SAFETY_DEFAULTS.cooldownMs).toBe(300_000);
    });

    it('blocks sensitive file patterns', () => {
        expect(SAFETY_DEFAULTS.blockedPaths).toContain('.env');
        expect(SAFETY_DEFAULTS.blockedPaths).toContain('.git/');
        expect(SAFETY_DEFAULTS.blockedPaths).toContain('node_modules/');
    });

    it('blocks dangerous commands', () => {
        expect(SAFETY_DEFAULTS.blockedCommands).toContain('rm -rf');
        expect(SAFETY_DEFAULTS.blockedCommands).toContain('git push --force');
        expect(SAFETY_DEFAULTS.blockedCommands).toContain('npm publish');
    });
});

// ── defaultConfig ──

describe('defaultConfig', () => {
    it('creates disabled config for agent', () => {
        const config = defaultConfig('luna');
        expect(config.agentId).toBe('luna');
        expect(config.enabled).toBe(false);
        expect(config.autonomyLevel).toBe(0);
        expect(config.checklist).toEqual([]);
    });

    it('uses 30 minute interval', () => {
        const config = defaultConfig('luna');
        expect(config.intervalMs).toBe(DEFAULT_INTERVAL_MS);
        expect(config.intervalMs).toBe(1_800_000);
    });

    it('includes safety defaults', () => {
        const config = defaultConfig('luna');
        expect(config.constraints.blockedCommands).toEqual(
            SAFETY_DEFAULTS.blockedCommands,
        );
        expect(config.constraints.blockedPaths).toEqual(
            SAFETY_DEFAULTS.blockedPaths,
        );
    });
});

// ── emptyAgentStats ──

describe('emptyAgentStats', () => {
    it('creates zero-initialized stats', () => {
        const stats = emptyAgentStats();
        expect(stats.totalRuns).toBe(0);
        expect(stats.successfulRuns).toBe(0);
        expect(stats.failedRuns).toBe(0);
        expect(stats.totalFixesApplied).toBe(0);
        expect(stats.totalRollbacks).toBe(0);
        expect(stats.averageDurationMs).toBe(0);
        expect(stats.lastRunAt).toBe(0);
    });
});

// ── Constants ──

describe('constants', () => {
    it('APPROVAL_EXPIRY_MS is 30 minutes', () => {
        expect(APPROVAL_EXPIRY_MS).toBe(1_800_000);
    });

    it('DEFAULT_INTERVAL_MS is 30 minutes', () => {
        expect(DEFAULT_INTERVAL_MS).toBe(1_800_000);
    });
});
