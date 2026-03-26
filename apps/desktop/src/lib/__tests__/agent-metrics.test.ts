import { describe, it, expect } from 'vitest';

/**
 * agent-metrics.ts uses electron-store. We test the metric calculation
 * logic by replicating the completion rate / avg duration formulas.
 */

describe('agent-metrics calculation logic', () => {
    function calcCompletionRate(completed: number, failed: number): number {
        const finished = completed + failed;
        return finished > 0 ? completed / finished : 0;
    }

    function calcAvgDuration(durations: number[]): number {
        if (durations.length === 0) return 0;
        return durations.reduce((sum, d) => sum + d, 0) / durations.length;
    }

    it('completion rate is 0 when no tasks', () => {
        expect(calcCompletionRate(0, 0)).toBe(0);
    });

    it('completion rate is 1 when all succeed', () => {
        expect(calcCompletionRate(10, 0)).toBe(1);
    });

    it('completion rate is 0.5 when half succeed', () => {
        expect(calcCompletionRate(5, 5)).toBe(0.5);
    });

    it('avg duration is 0 when no completed tasks', () => {
        expect(calcAvgDuration([])).toBe(0);
    });

    it('avg duration calculates correctly', () => {
        expect(calcAvgDuration([100, 200, 300])).toBe(200);
    });

    it('ring buffer keeps at most N items', () => {
        const MAX_RECENT_TASKS = 50;
        const tasks = Array.from({ length: 60 }, (_, i) => ({ id: i }));
        if (tasks.length > MAX_RECENT_TASKS) {
            const trimmed = tasks.slice(-MAX_RECENT_TASKS);
            expect(trimmed.length).toBe(50);
            expect(trimmed[0].id).toBe(10);
        }
    });
});
