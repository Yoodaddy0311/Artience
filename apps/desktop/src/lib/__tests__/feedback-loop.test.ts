import { describe, it, expect, vi } from 'vitest';
import {
    calculateFeedback,
    generateRecommendations,
    type FeedbackEvent,
    type FeedbackResult,
} from '../feedback-loop';

describe('calculateFeedback', () => {
    it('returns base 100 EXP for success', () => {
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'success',
            durationMs: 300_000, // exactly baseline → no speed bonus
        };
        const result = calculateFeedback(event);
        expect(result.agentId).toBe('a1');
        expect(result.expGained).toBe(100);
    });

    it('returns base 10 EXP for failure', () => {
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'failure',
            durationMs: 60_000,
        };
        const result = calculateFeedback(event);
        expect(result.expGained).toBe(10);
    });

    it('adds speed bonus for fast success (under 5 min)', () => {
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'success',
            durationMs: 0, // instant → max bonus
        };
        const result = calculateFeedback(event);
        expect(result.expGained).toBe(150); // 100 base + 50 max bonus
    });

    it('gives partial speed bonus proportionally', () => {
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'success',
            durationMs: 150_000, // half of baseline → 50% of bonus = 25
        };
        const result = calculateFeedback(event);
        expect(result.expGained).toBe(125); // 100 + 25
    });

    it('gives no speed bonus for failure even if fast', () => {
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'failure',
            durationMs: 0,
        };
        const result = calculateFeedback(event);
        expect(result.expGained).toBe(10);
    });

    it('gives no speed bonus when duration exceeds baseline', () => {
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'success',
            durationMs: 600_000, // 10 minutes
        };
        const result = calculateFeedback(event);
        expect(result.expGained).toBe(100);
    });

    it('distributes skill EXP for each skill used', () => {
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'success',
            durationMs: 300_000,
            skillsUsed: ['typescript', 'react'],
        };
        const result = calculateFeedback(event);
        expect(result.skillExpGained).toEqual({
            typescript: 30,
            react: 30,
        });
    });

    it('returns empty skillExpGained when no skills used', () => {
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'success',
            durationMs: 300_000,
        };
        const result = calculateFeedback(event);
        expect(result.skillExpGained).toEqual({});
    });

    it('includes timestamp in result', () => {
        const now = Date.now();
        vi.setSystemTime(now);
        const result = calculateFeedback({
            agentId: 'a1',
            taskId: 't1',
            outcome: 'success',
            durationMs: 300_000,
        });
        expect(result.timestamp).toBe(now);
        vi.useRealTimers();
    });
});

describe('generateRecommendations', () => {
    function makeResult(
        agentId: string,
        expGained: number,
        skillExpGained: Record<string, number> = {},
    ): FeedbackResult {
        return {
            agentId,
            expGained,
            skillExpGained,
            recommendations: [],
            timestamp: Date.now(),
        };
    }

    it('recommends difficulty decrease after 3+ consecutive failures', () => {
        const history: FeedbackResult[] = [
            makeResult('a1', 10), // failure
            makeResult('a1', 10), // failure
        ];
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't3',
            outcome: 'failure',
            durationMs: 60_000,
        };
        const recs = generateRecommendations(history, event);
        expect(recs).toContain('태스크 난이도 하향 조정 권장');
    });

    it('does not recommend difficulty decrease with fewer than 3 failures', () => {
        const history: FeedbackResult[] = [makeResult('a1', 10)];
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't2',
            outcome: 'failure',
            durationMs: 60_000,
        };
        const recs = generateRecommendations(history, event);
        expect(recs).not.toContain('태스크 난이도 하향 조정 권장');
    });

    it('does not recommend difficulty decrease when latest is success', () => {
        const history: FeedbackResult[] = [
            makeResult('a1', 10),
            makeResult('a1', 10),
            makeResult('a1', 10),
        ];
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't4',
            outcome: 'success',
            durationMs: 60_000,
        };
        const recs = generateRecommendations(history, event);
        expect(recs).not.toContain('태스크 난이도 하향 조정 권장');
    });

    it('recommends difficulty increase when EXP is improving and latest is success', () => {
        // History newest-first: expGained ascending = [80, 100, 120]
        // improving check: durations[0] < durations[1] && durations[1] < durations[2]
        // i.e. recentByAgent[0].exp < recentByAgent[1].exp < recentByAgent[2].exp
        const history: FeedbackResult[] = [
            makeResult('a1', 80),
            makeResult('a1', 100),
            makeResult('a1', 120),
        ];
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't5',
            outcome: 'success',
            durationMs: 60_000,
        };
        const recs = generateRecommendations(history, event);
        expect(recs).toContain('숙련도 향상 중 — 난이도 상향 가능');
    });

    it('recommends skill specialization when cumulative skill EXP >= 150', () => {
        const history: FeedbackResult[] = [
            makeResult('a1', 100, { typescript: 30 }),
            makeResult('a1', 100, { typescript: 30 }),
            makeResult('a1', 100, { typescript: 30 }),
            makeResult('a1', 100, { typescript: 30 }),
        ];
        // History has 4 * 30 = 120, plus current event 30 = 150
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't6',
            outcome: 'success',
            durationMs: 300_000,
            skillsUsed: ['typescript'],
        };
        const recs = generateRecommendations(history, event);
        expect(recs).toContain(
            'typescript 스킬 전문가 — 관련 태스크 우선 배정',
        );
    });

    it('returns empty recommendations when no patterns matched', () => {
        const history: FeedbackResult[] = [];
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'success',
            durationMs: 300_000,
        };
        const recs = generateRecommendations(history, event);
        expect(recs).toEqual([]);
    });

    it('only considers history for the same agentId', () => {
        const history: FeedbackResult[] = [
            makeResult('other-agent', 10),
            makeResult('other-agent', 10),
            makeResult('other-agent', 10),
        ];
        const event: FeedbackEvent = {
            agentId: 'a1',
            taskId: 't1',
            outcome: 'failure',
            durationMs: 60_000,
        };
        const recs = generateRecommendations(history, event);
        // Only 1 failure for a1 (the current event), not 3+
        expect(recs).not.toContain('태스크 난이도 하향 조정 권장');
    });
});
