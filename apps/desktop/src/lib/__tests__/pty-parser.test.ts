import { describe, it, expect } from 'vitest';
import {
    stripAnsi,
    parsePtyChunk,
    detectActivity,
    summarizeEvents,
    isNoiseLine,
    type ParsedEvent,
} from '../pty-parser';

describe('stripAnsi', () => {
    it('removes CSI color codes', () => {
        expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello');
    });

    it('removes cursor movement sequences', () => {
        expect(stripAnsi('\x1b[1A\x1b[2Khello')).toBe('hello');
    });

    it('removes OSC sequences', () => {
        expect(stripAnsi('\x1b]0;title\x07content')).toBe('content');
    });

    it('normalizes \\r\\n to \\n', () => {
        expect(stripAnsi('line1\r\nline2')).toBe('line1\nline2');
    });

    it('removes bare \\r (ConPTY artifact)', () => {
        expect(stripAnsi('hello\rworld')).toBe('helloworld');
    });

    it('handles empty string', () => {
        expect(stripAnsi('')).toBe('');
    });

    it('normalizes mixed \\r\\n and \\n line endings', () => {
        expect(stripAnsi('a\r\nb\nc\r\nd')).toBe('a\nb\nc\nd');
    });

    it('collapses 3+ consecutive blank lines into 2', () => {
        expect(stripAnsi('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('preserves exactly 2 blank lines', () => {
        expect(stripAnsi('a\n\nb')).toBe('a\n\nb');
    });

    it('handles ConPTY \\r\\n with ANSI in between', () => {
        const raw = '\x1b[32mhello\x1b[0m\r\n\x1b[34mworld\x1b[0m';
        expect(stripAnsi(raw)).toBe('hello\nworld');
    });
});

describe('isNoiseLine', () => {
    it('returns true for empty string', () => {
        expect(isNoiseLine('')).toBe(true);
    });

    it('returns true for spinner characters', () => {
        expect(isNoiseLine('⠋')).toBe(true);
        expect(isNoiseLine('⠙')).toBe(true);
        expect(isNoiseLine('⠹')).toBe(true);
        expect(isNoiseLine('⠸')).toBe(true);
        expect(isNoiseLine('⠼')).toBe(true);
    });

    it('returns true for separator lines', () => {
        expect(isNoiseLine('───────────────')).toBe(true);
        expect(isNoiseLine('━━━━━━━━━━━')).toBe(true);
        expect(isNoiseLine('═══════════')).toBe(true);
        expect(isNoiseLine('  ──────  ')).toBe(true);
        expect(isNoiseLine('----------')).toBe(true);
    });

    it('returns true for box-drawing only lines', () => {
        expect(isNoiseLine('│')).toBe(true);
        expect(isNoiseLine('╔═══╗')).toBe(true);
        expect(isNoiseLine('├───┤')).toBe(true);
    });

    it('returns true for progress bars', () => {
        expect(isNoiseLine('[=====>    ] 50%')).toBe(true);
        expect(isNoiseLine('[##########] 100%')).toBe(true);
    });

    it('returns false for real text content', () => {
        expect(isNoiseLine('Hello world')).toBe(false);
        expect(isNoiseLine('Edit src/foo.ts')).toBe(false);
        expect(isNoiseLine('Error: something failed')).toBe(false);
    });

    it('returns false for thinking marker', () => {
        expect(isNoiseLine('⏺ Analyzing...')).toBe(false);
    });

    it('returns false for prompt marker', () => {
        expect(isNoiseLine('❯')).toBe(false);
    });
});

describe('parsePtyChunk', () => {
    it('detects thinking marker ⏺', () => {
        const events = parsePtyChunk('  ⏺ Analyzing the codebase...');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('thinking');
    });

    it('extracts thinking text after the marker', () => {
        const events = parsePtyChunk('  ⏺ Analyzing the codebase...');
        expect(events[0].content).toBe('Analyzing the codebase...');
    });

    it('handles standalone thinking marker', () => {
        const events = parsePtyChunk('⏺');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('thinking');
    });

    it('detects prompt marker ❯', () => {
        const events = parsePtyChunk('  ❯ ');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('prompt');
    });

    it('detects success marker ✓', () => {
        const events = parsePtyChunk('  ✓');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('tool_result');
    });

    it('detects tool use lines', () => {
        const events = parsePtyChunk('  Edit src/lib/foo.ts');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('tool_use');
        expect(events[0].toolName).toBe('Edit');
    });

    it('detects Bash tool use', () => {
        const events = parsePtyChunk('  Bash npm test');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('tool_use');
        expect(events[0].toolName).toBe('Bash');
    });

    it('detects Read tool use', () => {
        const events = parsePtyChunk('  Read package.json');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('tool_use');
        expect(events[0].toolName).toBe('Read');
    });

    it('detects error patterns', () => {
        const events = parsePtyChunk('Error: ENOENT file not found');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('error');
    });

    it('classifies plain text as text', () => {
        const events = parsePtyChunk('Hello this is regular output');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('text');
    });

    it('handles multi-line input', () => {
        const raw = '⏺ Thinking about it\n  Edit src/foo.ts\n  ✓\n❯';
        const events = parsePtyChunk(raw);
        expect(events).toHaveLength(4);
        expect(events[0].type).toBe('thinking');
        expect(events[1].type).toBe('tool_use');
        expect(events[2].type).toBe('tool_result');
        expect(events[3].type).toBe('prompt');
    });

    it('handles ANSI-wrapped tool names', () => {
        const raw = '\x1b[1m\x1b[34m  Edit\x1b[0m src/file.ts';
        const events = parsePtyChunk(raw);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('tool_use');
        expect(events[0].toolName).toBe('Edit');
    });

    it('skips empty lines', () => {
        const events = parsePtyChunk('\n\n  \n\n');
        expect(events).toHaveLength(0);
    });

    it('adds timestamps', () => {
        const before = Date.now();
        const events = parsePtyChunk('hello');
        const after = Date.now();
        expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
        expect(events[0].timestamp).toBeLessThanOrEqual(after);
    });

    // ── New: spinner filtering tests ──

    it('filters out spinner characters', () => {
        const events = parsePtyChunk('⠋\n⠙\n⠹\nHello world');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('text');
        expect(events[0].content).toBe('Hello world');
    });

    it('filters out separator lines', () => {
        const events = parsePtyChunk('───────────────\nSome text\n━━━━━━━━━━━');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('text');
        expect(events[0].content).toBe('Some text');
    });

    it('filters out box-drawing decoration', () => {
        const events = parsePtyChunk('╔═══╗\n│ content │\n╚═══╝');
        // "│ content │" is not a noise line because it contains "content"
        expect(events.some((e) => e.content.includes('content'))).toBe(true);
    });

    it('filters progress bars', () => {
        const events = parsePtyChunk('[=====>    ] 50%\nDone.');
        expect(events).toHaveLength(1);
        expect(events[0].content).toBe('Done.');
    });

    // ── New: \\r\\n normalization tests ──

    it('handles \\r\\n line endings in multi-line chunk', () => {
        const raw = '⏺ Working\r\n  Edit foo.ts\r\n  ✓\r\n❯';
        const events = parsePtyChunk(raw);
        expect(events).toHaveLength(4);
        expect(events[0].type).toBe('thinking');
        expect(events[1].type).toBe('tool_use');
        expect(events[2].type).toBe('tool_result');
        expect(events[3].type).toBe('prompt');
    });

    it('handles mixed line ending styles', () => {
        const raw = 'line1\r\nline2\nline3\r\nline4';
        const events = parsePtyChunk(raw);
        expect(events).toHaveLength(4);
        expect(events.every((e) => e.type === 'text')).toBe(true);
    });

    // ── New: noise mixed with real content ──

    it('extracts only real content from noisy output', () => {
        const raw = [
            '⠋', // spinner noise
            '⠙', // spinner noise
            '───────────', // separator noise
            '⏺ Analyzing the code...', // thinking
            '  Edit src/main.ts', // tool_use
            '─────', // separator noise
            '  ✓', // tool_result
            '❯', // prompt
        ].join('\n');

        const events = parsePtyChunk(raw);
        expect(events).toHaveLength(4);
        expect(events[0].type).toBe('thinking');
        expect(events[1].type).toBe('tool_use');
        expect(events[2].type).toBe('tool_result');
        expect(events[3].type).toBe('prompt');
    });
});

describe('parsePtyChunk — team detection', () => {
    it('detects single-line team status bar with 2+ @names', () => {
        const events = parsePtyChunk(
            '@main @frontend-dev @planner · ↓ to expand',
        );
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('team_update');
        expect(events[0].teamMembers).toEqual([
            'main',
            'frontend-dev',
            'planner',
        ]);
    });

    it('detects multi-line "N agents launched" format', () => {
        const raw = [
            '2 agents launched (ctrl+o to expand)',
            '    @backend-investigator (artibot:backend-developer)',
            '        └ Main process PTY activity investigation',
            '    @frontend-investigator (artibot:frontend-developer)',
            '        └ Renderer state flow investigation',
        ].join('\n');
        const events = parsePtyChunk(raw);
        const teamEvents = events.filter((e) => e.type === 'team_update');
        expect(teamEvents).toHaveLength(1);
        expect(teamEvents[0].teamMembers).toEqual([
            'backend-investigator',
            'frontend-investigator',
        ]);
    });

    it('detects "1 agent launched" (singular)', () => {
        const raw = [
            '1 agent launched (ctrl+o to expand)',
            '    @code-reviewer (artibot:code-reviewer)',
            '        └ Review the PR',
        ].join('\n');
        const events = parsePtyChunk(raw);
        const teamEvents = events.filter((e) => e.type === 'team_update');
        expect(teamEvents).toHaveLength(1);
        expect(teamEvents[0].teamMembers).toEqual(['code-reviewer']);
    });

    it('detects "3 agents launched" with many members', () => {
        const raw = [
            '3 agents launched (ctrl+o to expand)',
            '    @planner (artibot:planner)',
            '        └ Create architecture plan',
            '    @frontend-dev (artibot:frontend-developer)',
            '        └ Build React components',
            '    @backend-dev (artibot:backend-developer)',
            '        └ Build API endpoints',
        ].join('\n');
        const events = parsePtyChunk(raw);
        const teamEvents = events.filter((e) => e.type === 'team_update');
        expect(teamEvents).toHaveLength(1);
        expect(teamEvents[0].teamMembers).toEqual([
            'planner',
            'frontend-dev',
            'backend-dev',
        ]);
    });

    it('detects team shutdown', () => {
        const events = parsePtyChunk('shutdown');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('team_update');
        expect(events[0].teamMembers).toEqual([]);
    });

    it('does not match single @name as team_update', () => {
        const events = parsePtyChunk('Message from @user about the task');
        expect(events).toHaveLength(1);
        expect(events[0].type).not.toBe('team_update');
    });

    it('does not match "agents launched" without subsequent @names', () => {
        const raw = [
            '2 agents launched (ctrl+o to expand)',
            'Some unrelated text follows',
        ].join('\n');
        const events = parsePtyChunk(raw);
        const teamEvents = events.filter((e) => e.type === 'team_update');
        expect(teamEvents).toHaveLength(0);
    });

    it('handles multi-line team followed by regular content', () => {
        const raw = [
            '2 agents launched (ctrl+o to expand)',
            '    @investigator-a (artibot:frontend-developer)',
            '        └ Task A',
            '    @investigator-b (artibot:backend-developer)',
            '        └ Task B',
            '⏺ Analyzing the codebase...',
        ].join('\n');
        const events = parsePtyChunk(raw);
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe('team_update');
        expect(events[0].teamMembers).toEqual([
            'investigator-a',
            'investigator-b',
        ]);
        expect(events[1].type).toBe('thinking');
    });
});

describe('detectActivity', () => {
    const makeEvent = (
        type: ParsedEvent['type'],
        toolName?: string,
    ): ParsedEvent => ({
        type,
        content: 'test',
        toolName,
        timestamp: Date.now(),
    });

    it('returns idle for empty events', () => {
        expect(detectActivity([])).toBe('idle');
    });

    it('returns thinking when thinking events present', () => {
        expect(detectActivity([makeEvent('thinking')])).toBe('thinking');
    });

    it('returns writing when Edit tool_use events present', () => {
        expect(detectActivity([makeEvent('tool_use', 'Edit')])).toBe('writing');
    });

    it('returns error when error events present', () => {
        expect(detectActivity([makeEvent('text'), makeEvent('error')])).toBe(
            'error',
        );
    });

    it('returns success when prompt follows work', () => {
        const events = [
            makeEvent('thinking'),
            makeEvent('tool_use', 'Bash'),
            makeEvent('tool_result'),
            makeEvent('prompt'),
        ];
        expect(detectActivity(events)).toBe('success');
    });

    it('returns idle when prompt without prior work', () => {
        expect(detectActivity([makeEvent('prompt')])).toBe('idle');
    });

    it('error takes priority over working', () => {
        const events = [makeEvent('tool_use', 'Edit'), makeEvent('error')];
        expect(detectActivity(events)).toBe('error');
    });
});

describe('summarizeEvents', () => {
    const makeEvent = (
        type: ParsedEvent['type'],
        content: string,
        toolName?: string,
    ): ParsedEvent => ({
        type,
        content,
        toolName,
        timestamp: Date.now(),
    });

    it('lists unique tools', () => {
        const events = [
            makeEvent('tool_use', 'Edit src/a.ts', 'Edit'),
            makeEvent('tool_use', 'Edit src/b.ts', 'Edit'),
            makeEvent('tool_use', 'Bash npm test', 'Bash'),
        ];
        const summary = summarizeEvents(events);
        expect(summary).toContain('Edit');
        expect(summary).toContain('Bash');
    });

    it('counts errors', () => {
        const events = [
            makeEvent('error', 'Error: something failed'),
            makeEvent('error', 'Error: another failure'),
        ];
        const summary = summarizeEvents(events);
        expect(summary).toContain('Errors: 2');
    });

    it('returns fallback for empty events', () => {
        expect(summarizeEvents([])).toBe('(no output captured)');
    });
});
