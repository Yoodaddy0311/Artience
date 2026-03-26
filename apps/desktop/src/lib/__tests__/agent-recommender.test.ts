import { describe, it, expect } from 'vitest';
import {
    recommendAgents,
    extractDomainScores,
} from '../../../electron/agent-recommender';

describe('extractDomainScores', () => {
    it('returns empty map for unrelated text', () => {
        const scores = extractDomainScores('hello world nothing relevant');
        expect(scores.size).toBe(0);
    });

    it('detects frontend domain keywords', () => {
        const scores = extractDomainScores('React component UI 디자인');
        expect(scores.has('frontend')).toBe(true);
        expect(scores.get('frontend')!).toBeGreaterThan(0);
    });

    it('detects backend domain keywords', () => {
        const scores = extractDomainScores('API server endpoint 백엔드');
        expect(scores.has('backend')).toBe(true);
    });

    it('detects multiple domains', () => {
        const scores = extractDomainScores(
            'React frontend component and API server backend with test coverage',
        );
        expect(scores.has('frontend')).toBe(true);
        expect(scores.has('backend')).toBe(true);
        expect(scores.has('test')).toBe(true);
    });

    it('handles Korean keywords', () => {
        const scores = extractDomainScores('프론트엔드 컴포넌트 디자인 작업');
        expect(scores.has('frontend')).toBe(true);
    });
});

describe('recommendAgents', () => {
    it('returns empty array for unrelated task', () => {
        const result = recommendAgents('asdfghjklqwerty');
        expect(result).toEqual([]);
    });

    it('returns agents for frontend task', () => {
        const result = recommendAgents('React 컴포넌트 UI 디자인 작업');
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].score).toBeGreaterThan(0);
        expect(result[0].reason).toBeTruthy();
    });

    it('respects maxResults limit', () => {
        const result = recommendAgents(
            'frontend backend test security devops',
            2,
        );
        expect(result.length).toBeLessThanOrEqual(2);
    });

    it('results are sorted by score descending', () => {
        const result = recommendAgents('API 서버 백엔드 테스트');
        for (let i = 1; i < result.length; i++) {
            expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
        }
    });

    it('each result has agentId, score, and reason', () => {
        const result = recommendAgents('코드 리뷰 품질 검사');
        for (const r of result) {
            expect(r.agentId).toBeTruthy();
            expect(typeof r.score).toBe('number');
            expect(r.reason).toBeTruthy();
        }
    });
});
