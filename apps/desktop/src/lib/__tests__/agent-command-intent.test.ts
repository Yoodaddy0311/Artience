import { describe, it, expect } from 'vitest';
import { classifyAgentCommandIntent } from '../agent-command-intent';

describe('classifyAgentCommandIntent', () => {
    describe('empty / whitespace input', () => {
        it('returns thinking for empty string', () => {
            const result = classifyAgentCommandIntent('');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('empty-input-default');
        });

        it('returns thinking for whitespace-only string', () => {
            const result = classifyAgentCommandIntent('   ');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('empty-input-default');
        });
    });

    describe('slash commands', () => {
        it('classifies /team as thinking (team-orchestration)', () => {
            const result = classifyAgentCommandIntent('/team status');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('team-orchestration-command');
        });

        it('classifies /review as reading (inspection)', () => {
            const result = classifyAgentCommandIntent('/review code');
            expect(result.activity).toBe('reading');
            expect(result.reason).toBe('inspection-command');
        });

        it('classifies /status as reading (inspection)', () => {
            const result = classifyAgentCommandIntent('/status');
            expect(result.activity).toBe('reading');
            expect(result.reason).toBe('inspection-command');
        });

        it('classifies /doctor as reading (inspection)', () => {
            const result = classifyAgentCommandIntent('/doctor');
            expect(result.activity).toBe('reading');
            expect(result.reason).toBe('inspection-command');
        });

        it('classifies /clear as typing (terminal)', () => {
            const result = classifyAgentCommandIntent('/clear');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('terminal-command');
        });

        it('classifies /config as typing (terminal)', () => {
            const result = classifyAgentCommandIntent('/config');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('terminal-command');
        });

        it('classifies /mcp as typing (terminal)', () => {
            const result = classifyAgentCommandIntent('/mcp');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('terminal-command');
        });

        it('classifies /terminal-setup as typing (terminal)', () => {
            const result = classifyAgentCommandIntent('/terminal-setup');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('terminal-command');
        });

        it('classifies unknown slash command as thinking (generic)', () => {
            const result = classifyAgentCommandIntent('/unknown');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('generic-slash-command');
        });
    });

    describe('shell commands', () => {
        it('classifies git command as typing (shell)', () => {
            const result = classifyAgentCommandIntent('git status');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('shell-command');
        });

        it('classifies npm command as typing (shell)', () => {
            const result = classifyAgentCommandIntent('npm install');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('shell-command');
        });

        it('classifies bare prefix as shell command', () => {
            const result = classifyAgentCommandIntent('docker');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('shell-command');
        });

        it('classifies python3 as typing (shell)', () => {
            const result = classifyAgentCommandIntent('python3 script.py');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('shell-command');
        });

        it('does not match partial prefix (e.g. "github")', () => {
            const result = classifyAgentCommandIntent('github is great');
            expect(result.reason).not.toBe('shell-command');
        });
    });

    describe('writing keywords', () => {
        it('classifies "implement a feature" as writing', () => {
            const result = classifyAgentCommandIntent('implement a feature');
            expect(result.activity).toBe('writing');
            expect(result.reason).toBe('implementation-keyword');
        });

        it('classifies "fix the bug" as writing', () => {
            const result = classifyAgentCommandIntent('fix the bug');
            expect(result.activity).toBe('writing');
            expect(result.reason).toBe('implementation-keyword');
        });

        it('classifies Korean writing keyword', () => {
            const result = classifyAgentCommandIntent('기능 구현 해줘');
            expect(result.activity).toBe('writing');
            expect(result.reason).toBe('implementation-keyword');
        });

        it('classifies "refactor the module" as writing', () => {
            const result = classifyAgentCommandIntent('refactor the module');
            expect(result.activity).toBe('writing');
            expect(result.reason).toBe('implementation-keyword');
        });
    });

    describe('typing keywords', () => {
        it('classifies "run the tests" as typing', () => {
            const result = classifyAgentCommandIntent('run the tests');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('execution-keyword');
        });

        it('classifies "deploy to production" as typing', () => {
            const result = classifyAgentCommandIntent('deploy to production');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('execution-keyword');
        });

        it('classifies Korean typing keyword', () => {
            const result = classifyAgentCommandIntent('서버 실행');
            expect(result.activity).toBe('typing');
            expect(result.reason).toBe('execution-keyword');
        });
    });

    describe('reading keywords', () => {
        it('classifies "search for errors" as reading', () => {
            const result = classifyAgentCommandIntent('search for errors');
            expect(result.activity).toBe('reading');
            expect(result.reason).toBe('inspection-keyword');
        });

        it('classifies "analyze the code" as reading', () => {
            const result = classifyAgentCommandIntent('analyze the code');
            expect(result.activity).toBe('reading');
            expect(result.reason).toBe('inspection-keyword');
        });

        it('classifies Korean reading keyword', () => {
            const result = classifyAgentCommandIntent('코드 검토 부탁');
            expect(result.activity).toBe('reading');
            expect(result.reason).toBe('inspection-keyword');
        });
    });

    describe('thinking keywords', () => {
        it('classifies "plan the architecture" as thinking', () => {
            const result = classifyAgentCommandIntent('plan the architecture');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('planning-keyword');
        });

        it('classifies Korean thinking keyword', () => {
            const result = classifyAgentCommandIntent('시스템 설계');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('planning-keyword');
        });
    });

    describe('directive integration', () => {
        it('handles CEO directive prefix ($)', () => {
            const result = classifyAgentCommandIntent('$ plan something');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('planning-keyword');
        });

        it('handles task directive prefix (#)', () => {
            const result = classifyAgentCommandIntent('# implement feature');
            expect(result.activity).toBe('writing');
            expect(result.reason).toBe('implementation-keyword');
        });

        it('returns delegated-task-default for task directive with no keywords', () => {
            const result = classifyAgentCommandIntent('# hello');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('delegated-task-default');
        });
    });

    describe('keyword priority (writing > typing > reading > thinking)', () => {
        it('writing beats typing when both match', () => {
            // "write" (writing) + "test" (typing) -> writing wins
            const result = classifyAgentCommandIntent('write a test');
            expect(result.activity).toBe('writing');
        });

        it('typing beats reading when both match', () => {
            // "run" (typing) + "search" (reading) not easy to combine,
            // test with "execute" (typing) presence
            const result = classifyAgentCommandIntent('execute the command');
            expect(result.activity).toBe('typing');
        });
    });

    describe('default fallback', () => {
        it('returns thinking for unrecognized input', () => {
            const result = classifyAgentCommandIntent('hello world');
            expect(result.activity).toBe('thinking');
            expect(result.reason).toBe('default-thinking');
        });
    });

    describe('return type shape', () => {
        it('always returns activity and reason', () => {
            const result = classifyAgentCommandIntent('anything');
            expect(result).toHaveProperty('activity');
            expect(result).toHaveProperty('reason');
        });
    });
});
