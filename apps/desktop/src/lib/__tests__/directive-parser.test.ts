import { describe, it, expect } from 'vitest';
import { parseDirective } from '../directive-parser';

describe('parseDirective', () => {
    describe('CEO directive ($ prefix)', () => {
        it('returns ceo type for $ prefix', () => {
            const result = parseDirective('$ deploy to production');
            expect(result.type).toBe('ceo');
            expect(result.content).toBe('deploy to production');
            expect(result.rawInput).toBe('$ deploy to production');
        });

        it('extracts targetAgent from @mention in ceo directive', () => {
            const result = parseDirective('$ @backend-developer fix the API');
            expect(result.type).toBe('ceo');
            expect(result.targetAgent).toBe('backend-developer');
            expect(result.content).toBe('fix the API');
        });

        it('handles $ with no space after prefix', () => {
            const result = parseDirective('$run tests');
            expect(result.type).toBe('ceo');
            expect(result.content).toBe('run tests');
        });
    });

    describe('task directive (# prefix)', () => {
        it('returns task type for # prefix', () => {
            const result = parseDirective('# add login feature');
            expect(result.type).toBe('task');
            expect(result.content).toBe('add login feature');
        });

        it('extracts targetAgent from @mention in task directive', () => {
            const result = parseDirective(
                '# @frontend-developer build the form',
            );
            expect(result.type).toBe('task');
            expect(result.targetAgent).toBe('frontend-developer');
            expect(result.content).toBe('build the form');
        });
    });

    describe('normal message', () => {
        it('returns normal type for plain text', () => {
            const result = parseDirective('hello world');
            expect(result.type).toBe('normal');
            expect(result.content).toBe('hello world');
        });

        it('does not extract targetAgent for normal messages', () => {
            const result = parseDirective('just a message @someone');
            expect(result.type).toBe('normal');
            expect(result.targetAgent).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('handles empty string', () => {
            const result = parseDirective('');
            expect(result.type).toBe('normal');
            expect(result.content).toBe('');
        });

        it('handles whitespace-only string', () => {
            const result = parseDirective('   ');
            expect(result.type).toBe('normal');
            expect(result.content).toBe('');
        });

        it('trims leading/trailing whitespace', () => {
            const result = parseDirective('  $ hello  ');
            expect(result.type).toBe('ceo');
            expect(result.content).toBe('hello');
        });

        it('handles $ alone', () => {
            const result = parseDirective('$');
            expect(result.type).toBe('ceo');
            expect(result.content).toBe('');
        });

        it('handles # alone', () => {
            const result = parseDirective('#');
            expect(result.type).toBe('task');
            expect(result.content).toBe('');
        });

        it('preserves rawInput exactly as provided', () => {
            const input = '  $ test  ';
            const result = parseDirective(input);
            expect(result.rawInput).toBe(input);
        });
    });
});
