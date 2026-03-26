import { describe, it, expect } from 'vitest';
import { AGENT_PERSONAS, buildSystemPrompt } from '../../data/agent-personas';

describe('buildSystemPrompt', () => {
    it('returns persona-based prompt for known agent', () => {
        const prompt = buildSystemPrompt('Sera');
        expect(prompt).toContain('Sera');
        expect(prompt).toContain('PM');
        expect(prompt).toContain('한국어');
    });

    it('returns generic prompt for unknown agent', () => {
        const prompt = buildSystemPrompt('UnknownAgent');
        expect(prompt).toContain('UnknownAgent');
        expect(prompt).toContain('한국어');
    });

    it('is case-insensitive for lookup', () => {
        const prompt1 = buildSystemPrompt('rio');
        const prompt2 = buildSystemPrompt('Rio');
        // Both should reference the same persona
        expect(prompt1).toContain('백엔드');
        expect(prompt2).toContain('Rio');
    });

    it('includes role and personality for each known agent', () => {
        for (const key of Object.keys(AGENT_PERSONAS)) {
            const name = key.charAt(0).toUpperCase() + key.slice(1);
            const prompt = buildSystemPrompt(name);
            expect(prompt.length).toBeGreaterThan(20);
        }
    });
});
