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
});
