import { describe, it, expect } from 'vitest';
import { calculateExp, calculateStatGains } from '../exp-engine';

describe('calculateExp', () => {
    it('returns minimum 1 EXP for any activity', () => {
        const result = calculateExp({
            activity: 'idle',
            duration: 0,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        expect(result.totalExp).toBeGreaterThanOrEqual(1);
    });

    it('gives higher EXP for success activities', () => {
        const success = calculateExp({
            activity: 'success',
            duration: 10000,
            toolsUsedInSession: ['Edit'],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const idle = calculateExp({
            activity: 'idle',
            duration: 10000,
            toolsUsedInSession: ['Edit'],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        expect(success.totalExp).toBeGreaterThan(idle.totalExp);
    });

    it('applies streak bonus correctly', () => {
        const noStreak = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const withStreak = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 10,
            teamSize: 1,
            hasError: false,
        });
        expect(withStreak.totalExp).toBeGreaterThan(noStreak.totalExp);
        expect(withStreak.streakBonus).toBe(1.5);
    });

    it('caps streak bonus at 2.0', () => {
        const result = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 100,
            teamSize: 1,
            hasError: false,
        });
        expect(result.streakBonus).toBe(2.0);
    });

    it('applies team bonus correctly', () => {
        const solo = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const team = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 4,
            hasError: false,
        });
        expect(team.totalExp).toBeGreaterThan(solo.totalExp);
        expect(team.teamBonus).toBe(1.3);
    });

    it('applies error penalty', () => {
        const clean = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const errored = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: true,
        });
        expect(errored.totalExp).toBeLessThan(clean.totalExp);
    });

    it('adds tool-specific EXP bonus', () => {
        const noTool = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const withTool = calculateExp({
            activity: 'working',
            toolName: 'Edit',
            duration: 10000,
            toolsUsedInSession: ['Edit'],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        expect(withTool.baseExp).toBeGreaterThan(noTool.baseExp);
    });

    // ── Additional edge cases ──

    it('caps team bonus at 1.5', () => {
        const result = calculateExp({
            activity: 'working',
            duration: 10000,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 100,
            hasError: false,
        });
        expect(result.teamBonus).toBe(1.5);
    });

    it('returns team bonus of 1.0 for solo (teamSize=1)', () => {
        const result = calculateExp({
            activity: 'working',
            duration: 0,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        expect(result.teamBonus).toBe(1.0);
    });

    it('increases complexity multiplier with more tools used', () => {
        const fewTools = calculateExp({
            activity: 'working',
            duration: 30000,
            toolsUsedInSession: ['Edit'],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const manyTools = calculateExp({
            activity: 'working',
            duration: 30000,
            toolsUsedInSession: ['Edit', 'Write', 'Read', 'Bash', 'Grep'],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        expect(manyTools.complexityMultiplier).toBeGreaterThan(
            fewTools.complexityMultiplier,
        );
    });

    it('increases complexity multiplier with longer duration', () => {
        const short = calculateExp({
            activity: 'working',
            duration: 0,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const long = calculateExp({
            activity: 'working',
            duration: 60000,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        expect(long.complexityMultiplier).toBeGreaterThan(
            short.complexityMultiplier,
        );
    });

    it('caps complexity multiplier at 3.0', () => {
        const result = calculateExp({
            activity: 'working',
            duration: 600000,
            toolsUsedInSession: [
                'Edit',
                'Write',
                'Read',
                'Bash',
                'Grep',
                'Glob',
                'Agent',
            ],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        expect(result.complexityMultiplier).toBeLessThanOrEqual(3.0);
    });

    it('uses fallback base EXP of 3 for unknown activity type', () => {
        const result = calculateExp({
            activity: 'unknown_activity',
            duration: 0,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        expect(result.baseExp).toBe(3);
    });

    it('uses fallback tool bonus of 1 for unknown tool name', () => {
        const knownTool = calculateExp({
            activity: 'working',
            toolName: 'Edit',
            duration: 0,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const unknownTool = calculateExp({
            activity: 'working',
            toolName: 'CustomTool',
            duration: 0,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        // Edit bonus = 3, unknown bonus = 1
        expect(knownTool.baseExp).toBeGreaterThan(unknownTool.baseExp);
    });

    it('error penalty halves the final EXP', () => {
        const base = calculateExp({
            activity: 'working',
            duration: 0,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: false,
        });
        const errored = calculateExp({
            activity: 'working',
            duration: 0,
            toolsUsedInSession: [],
            streakDays: 0,
            teamSize: 1,
            hasError: true,
        });
        // Due to rounding, check approximately half
        expect(errored.totalExp).toBe(
            Math.max(1, Math.round(base.totalExp * 0.5)),
        );
    });
});

describe('calculateStatGains', () => {
    it('returns coding gains for writing activity', () => {
        const gains = calculateStatGains('writing');
        expect(gains.coding).toBeGreaterThan(0);
    });

    it('returns analysis gains for reading activity', () => {
        const gains = calculateStatGains('reading');
        expect(gains.analysis).toBeGreaterThan(0);
    });

    it('adds tool-specific bonuses', () => {
        const withoutTool = calculateStatGains('working');
        const withTool = calculateStatGains('working', 'Edit');
        expect(withTool.coding ?? 0).toBeGreaterThanOrEqual(
            withoutTool.coding ?? 0,
        );
    });

    it('returns speed gains for typing activity', () => {
        const gains = calculateStatGains('typing');
        expect(gains.speed).toBeGreaterThan(0);
        expect(gains.coding).toBeGreaterThan(0);
    });

    it('returns analysis and creativity for thinking activity', () => {
        const gains = calculateStatGains('thinking');
        expect(gains.analysis).toBe(2);
        expect(gains.creativity).toBe(1);
    });

    it('returns accuracy and teamwork for success activity', () => {
        const gains = calculateStatGains('success');
        expect(gains.accuracy).toBe(2);
        expect(gains.teamwork).toBe(1);
    });

    it('returns empty object for unknown activity', () => {
        const gains = calculateStatGains('unknown');
        expect(Object.keys(gains)).toHaveLength(0);
    });

    it('adds Bash tool speed bonus', () => {
        const gains = calculateStatGains('working', 'Bash');
        expect(gains.speed).toBeGreaterThanOrEqual(2);
    });

    it('adds Agent tool teamwork bonus', () => {
        const gains = calculateStatGains('working', 'Agent');
        expect(gains.teamwork).toBe(2);
    });

    it('adds Grep tool analysis bonus', () => {
        const gains = calculateStatGains('reading', 'Grep');
        // reading gives analysis=2, Grep adds +1
        expect(gains.analysis).toBe(3);
    });

    it('stacks tool bonus on top of activity bonus', () => {
        // writing gives coding=2, Edit adds +1
        const gains = calculateStatGains('writing', 'Edit');
        expect(gains.coding).toBe(3);
    });
});
