import { describe, it, expect } from 'vitest';
import {
    resolveConsensus,
    parseOpinion,
    buildOpinionPrompt,
} from '../../../electron/meeting-manager';
import type { MeetingOpinion } from '../../../electron/meeting-manager';

describe('resolveConsensus', () => {
    it('returns pending for empty opinions', () => {
        expect(resolveConsensus([])).toBe('pending');
    });

    it('returns approved when 2/3 majority approves', () => {
        const opinions: MeetingOpinion[] = [
            { agentId: 'a', opinion: 'good', vote: 'approve' },
            { agentId: 'b', opinion: 'ok', vote: 'approve' },
            { agentId: 'c', opinion: 'meh', vote: 'hold' },
        ];
        expect(resolveConsensus(opinions)).toBe('approved');
    });

    it('returns revision when any vote is revise', () => {
        const opinions: MeetingOpinion[] = [
            { agentId: 'a', opinion: 'good', vote: 'approve' },
            { agentId: 'b', opinion: 'bad', vote: 'revise' },
            { agentId: 'c', opinion: 'meh', vote: 'hold' },
        ];
        expect(resolveConsensus(opinions)).toBe('revision');
    });

    it('returns hold when no majority and no revise', () => {
        const opinions: MeetingOpinion[] = [
            { agentId: 'a', opinion: 'good', vote: 'approve' },
            { agentId: 'b', opinion: 'wait', vote: 'hold' },
            { agentId: 'c', opinion: 'wait', vote: 'hold' },
        ];
        expect(resolveConsensus(opinions)).toBe('hold');
    });

    it('approves with unanimous vote', () => {
        const opinions: MeetingOpinion[] = [
            { agentId: 'a', opinion: 'yes', vote: 'approve' },
            { agentId: 'b', opinion: 'yes', vote: 'approve' },
        ];
        expect(resolveConsensus(opinions)).toBe('approved');
    });

    it('handles single voter correctly', () => {
        expect(
            resolveConsensus([
                { agentId: 'a', opinion: 'ok', vote: 'approve' },
            ]),
        ).toBe('approved');
        expect(
            resolveConsensus([{ agentId: 'a', opinion: 'no', vote: 'revise' }]),
        ).toBe('revision');
        expect(
            resolveConsensus([{ agentId: 'a', opinion: 'wait', vote: 'hold' }]),
        ).toBe('hold');
    });
});

describe('parseOpinion', () => {
    it('parses approve vote from Korean format', () => {
        const result = parseOpinion(
            'rio',
            '투표: approve\n의견: 좋은 방향입니다.',
        );
        expect(result.vote).toBe('approve');
        expect(result.opinion).toBe('좋은 방향입니다.');
        expect(result.agentId).toBe('rio');
    });

    it('parses revise vote', () => {
        const result = parseOpinion(
            'luna',
            '투표: revise\n의견: 수정이 필요합니다.',
        );
        expect(result.vote).toBe('revise');
        expect(result.opinion).toBe('수정이 필요합니다.');
    });

    it('defaults to hold when no vote keyword found', () => {
        const result = parseOpinion('ara', '잘 모르겠습니다.');
        expect(result.vote).toBe('hold');
    });

    it('detects approve from English keyword', () => {
        const result = parseOpinion('rio', 'I approve this approach.');
        expect(result.vote).toBe('approve');
    });

    it('truncates long opinions without 의견: prefix', () => {
        const longText = 'x'.repeat(300);
        const result = parseOpinion('rio', longText);
        expect(result.opinion.length).toBeLessThanOrEqual(200);
    });

    it('returns (의견 없음) for empty text', () => {
        const result = parseOpinion('rio', '');
        expect(result.opinion).toBe('(의견 없음)');
    });
});

describe('buildOpinionPrompt', () => {
    it('includes round number', () => {
        const prompt = buildOpinionPrompt(
            'API 설계',
            { agentId: 'rio', agentName: 'Rio' },
            2,
            '',
        );
        expect(prompt).toContain('라운드 2');
    });

    it('includes topic', () => {
        const prompt = buildOpinionPrompt(
            '테스트 전략',
            { agentId: 'ara', agentName: 'Ara' },
            1,
            '',
        );
        expect(prompt).toContain('테스트 전략');
    });

    it('includes participant name', () => {
        const prompt = buildOpinionPrompt(
            'topic',
            { agentId: 'luna', agentName: 'Luna' },
            1,
            '',
        );
        expect(prompt).toContain('Luna');
    });

    it('includes previous context when provided', () => {
        const prev = '\n\n이전 라운드 결과:\n- rio: approve';
        const prompt = buildOpinionPrompt(
            'topic',
            { agentId: 'rio', agentName: 'Rio' },
            2,
            prev,
        );
        expect(prompt).toContain('이전 라운드 결과');
    });

    it('includes role description from persona', () => {
        const prompt = buildOpinionPrompt(
            'topic',
            { agentId: 'rio', agentName: 'Rio' },
            1,
            '',
        );
        expect(prompt).toContain('백엔드');
    });

    it('includes voting instructions', () => {
        const prompt = buildOpinionPrompt(
            'topic',
            { agentId: 'rio', agentName: 'Rio' },
            1,
            '',
        );
        expect(prompt).toContain('approve / hold / revise');
    });
});
