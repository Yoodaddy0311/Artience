import { describe, it, expect } from 'vitest';
import { parseLogState, getStateColor } from '../logParser';
import type { AgentState } from '../../types/platform';

describe('logParser', () => {
    // ── parseLogState ──

    describe('parseLogState', () => {
        const rules: Record<string, AgentState> = {
            error: 'ERROR',
            fail: 'ERROR',
            running: 'RUNNING',
            build: 'RUNNING',
            success: 'SUCCESS',
            complete: 'SUCCESS',
            think: 'THINKING',
            plan: 'THINKING',
            walk: 'WALK',
            input: 'NEEDS_INPUT',
        };

        it('should match a keyword and return the corresponding state', () => {
            expect(parseLogState('Build started', rules)).toBe('RUNNING');
        });

        it('should be case-insensitive for both message and keywords', () => {
            expect(parseLogState('ERROR: something failed', rules)).toBe('ERROR');
            expect(parseLogState('error: something failed', rules)).toBe('ERROR');
            expect(parseLogState('Error: something failed', rules)).toBe('ERROR');
        });

        it('should match keywords appearing anywhere in the message', () => {
            expect(parseLogState('The agent is thinking about the problem', rules)).toBe('THINKING');
            expect(parseLogState('Task completed successfully', rules)).toBe('SUCCESS');
        });

        it('should return the first matching keyword state', () => {
            // "error" comes before "fail" in rules iteration order
            // Both "error" and "fail" map to ERROR, but let's test with a message
            // containing multiple keywords from different states
            const result = parseLogState('error during running process', rules);
            // "error" matches first in the rules object
            expect(result).toBe('ERROR');
        });

        it('should return IDLE when no keyword matches', () => {
            expect(parseLogState('just a normal log line', rules)).toBe('IDLE');
        });

        it('should return IDLE for an empty message', () => {
            expect(parseLogState('', rules)).toBe('IDLE');
        });

        it('should return IDLE when rules are empty', () => {
            expect(parseLogState('error happened', {})).toBe('IDLE');
        });

        it('should handle partial keyword matches within words', () => {
            // "running" contains "run" but we test for "running" as keyword
            expect(parseLogState('running tests now', rules)).toBe('RUNNING');
        });

        it('should handle uppercase keywords in rules', () => {
            const upperRules: Record<string, AgentState> = {
                ERROR: 'ERROR',
                SUCCESS: 'SUCCESS',
            };
            expect(parseLogState('an error occurred', upperRules)).toBe('ERROR');
            expect(parseLogState('operation success', upperRules)).toBe('SUCCESS');
        });

        it('should handle messages with special characters', () => {
            expect(parseLogState('[2025-01-01] ERROR: connection refused', rules)).toBe('ERROR');
            expect(parseLogState('>>> build #42 started <<<', rules)).toBe('RUNNING');
        });
    });

    // ── getStateColor ──

    describe('getStateColor', () => {
        it('should return correct color for ERROR', () => {
            expect(getStateColor('ERROR')).toBe('text-red-400');
        });

        it('should return correct color for RUNNING', () => {
            expect(getStateColor('RUNNING')).toBe('text-blue-400');
        });

        it('should return correct color for SUCCESS', () => {
            expect(getStateColor('SUCCESS')).toBe('text-green-400');
        });

        it('should return correct color for THINKING', () => {
            expect(getStateColor('THINKING')).toBe('text-purple-400');
        });

        it('should return correct color for IDLE', () => {
            expect(getStateColor('IDLE')).toBe('text-gray-400');
        });

        it('should return correct color for WALK', () => {
            expect(getStateColor('WALK')).toBe('text-cyan-400');
        });

        it('should return correct color for NEEDS_INPUT', () => {
            expect(getStateColor('NEEDS_INPUT')).toBe('text-yellow-400');
        });

        it('should fall back to text-gray-400 for unknown state', () => {
            // Cast to AgentState to bypass TypeScript for edge case testing
            expect(getStateColor('UNKNOWN' as AgentState)).toBe('text-gray-400');
        });
    });
});
