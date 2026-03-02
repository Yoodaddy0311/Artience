/**
 * PTY Parser for Claude Code TUI output.
 *
 * Parses raw PTY data (with ANSI escapes) from Claude Code's ink-based TUI
 * into structured ParsedEvent objects. Designed to run in both Electron main
 * process (via import) and renderer (for types).
 *
 * Key Claude Code TUI patterns:
 *   ⏺  — thinking / working block start
 *   ✓  — task completed successfully
 *   ❯  — prompt ready (idle, waiting for user input)
 *   Tool headers like "Edit", "Write", "Bash", "Read", "Glob", "Grep" etc.
 *   Error patterns — permission denied, crash, etc.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ParsedEvent {
    type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error' | 'prompt' | 'team_update';
    content: string;
    toolName?: string;
    teamMembers?: string[];
    timestamp: number;
}

export type AgentActivity = 'idle' | 'thinking' | 'working' | 'success' | 'error';

// ── ANSI strip ─────────────────────────────────────────────────────────────

/**
 * Remove ANSI escape sequences from raw PTY data.
 * Handles CSI sequences, OSC sequences, and common escape codes.
 * Also strips common ConPTY artifacts on Windows.
 */
export function stripAnsi(raw: string): string {
    return raw
        // CSI sequences: ESC [ ... (letter)
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
        // OSC sequences: ESC ] ... (ST or BEL)
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
        // Simple ESC sequences: ESC (letter) or ESC (#)(digit)
        .replace(/\x1b[()#][A-Za-z0-9]/g, '')
        .replace(/\x1b[A-Za-z]/g, '')
        // Remaining bare ESC
        .replace(/\x1b/g, '')
        // Normalize all \r\n to \n first
        .replace(/\r\n/g, '\n')
        // Carriage return (without newline) — ConPTY often sends lone \r
        .replace(/\r/g, '')
        // Collapse 3+ consecutive blank lines into 2
        .replace(/\n{3,}/g, '\n\n');
}

// ── Noise filters ─────────────────────────────────────────────────────────

/** Braille spinner characters used by ink TUI (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ etc.) */
const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠿⠾⠽⠻⠷⠯⠟\s]*$/;

/** Separator lines (───, ═══, ─ ─ ─, etc.) */
const SEPARATOR_RE = /^[\s─━═╌╍┄┅┈┉\-]+$/;

/** Lines that are only box-drawing or decoration */
const BOX_DRAWING_RE = /^[\s│┃┆┇┊┋╎╏║├┤┬┴┼╔╗╚╝╠╣╦╩╬─━═]+$/;

/** Progress indicators like [=====>    ] 50% */
const PROGRESS_RE = /^\[?[=\->#\s]+\]?\s*\d+%/;

/**
 * Determine whether a trimmed line is TUI noise that should be filtered out.
 * Returns true if the line is noise (spinners, separators, empty decorations).
 */
export function isNoiseLine(trimmed: string): boolean {
    if (!trimmed) return true;
    if (SPINNER_RE.test(trimmed)) return true;
    if (SEPARATOR_RE.test(trimmed)) return true;
    if (BOX_DRAWING_RE.test(trimmed)) return true;
    if (PROGRESS_RE.test(trimmed)) return true;
    return false;
}

// ── Pattern definitions ────────────────────────────────────────────────────

/** Unicode codepoints that Claude Code uses as visual markers */
const THINKING_MARKER = '\u23FA';    // ⏺
const SUCCESS_MARKER = '\u2713';     // ✓
const PROMPT_MARKER = '\u276F';      // ❯

/** Known Claude Code tool names (from tool_use blocks in TUI output) */
const KNOWN_TOOLS = [
    'Edit', 'Write', 'Read', 'Bash', 'Glob', 'Grep',
    'TodoWrite', 'TodoRead', 'WebFetch', 'WebSearch',
    'Task', 'NotebookEdit', 'MultiEdit',
] as const;

/** Regex to match tool use headers in the TUI output.
 *  Claude Code prints tool names as a highlighted header, often followed by
 *  file paths or command strings. Examples:
 *    "  Edit  src/foo.ts"
 *    "  Bash  npm test"
 *    "  Read  package.json"
 */
const TOOL_USE_RE = new RegExp(
    `(?:^|\\n)\\s*(?:${KNOWN_TOOLS.join('|')})(?:\\s+\\S|\\s*$)`,
    'i',
);

/** Match the specific tool name from a tool use line */
const TOOL_NAME_RE = new RegExp(
    `\\b(${KNOWN_TOOLS.join('|')})\\b`,
    'i',
);

/** Error patterns */
const ERROR_PATTERNS = [
    /error:/i,
    /permission denied/i,
    /ENOENT/,
    /EACCES/,
    /fatal:/i,
    /panic:/i,
    /unhandled/i,
    /failed to/i,
    /\u2573/,        // ╳ Claude Code error marker
];

/** Team member pattern: @name appearing 2+ times on a single line.
 *  Matches Claude Code's team status bar, e.g. "@main @frontend-dev @planner · ↓ to expand" */
const TEAM_MEMBER_RE = /@(\w[\w-]*)/g;

/** Team dissolution patterns */
const TEAM_SHUTDOWN_RE = /\bshutdown\b/i;

/** Tool result patterns — usually follow tool_use with output content */
const TOOL_RESULT_PATTERNS = [
    /^\s*\u2713\s/,          // ✓ at line start (with content after)
    /^\s*\d+ files? /i,     // file count in results
    /^Output:/i,
];

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a raw PTY data chunk into structured events.
 *
 * This function processes a single chunk of PTY output (as received from
 * node-pty onData). It does NOT maintain cross-chunk state — the caller
 * (Electron main process) is responsible for buffering if needed.
 *
 * Lines that are pure TUI noise (spinners, separators, box-drawing) are
 * silently filtered out and do not produce events.
 */
export function parsePtyChunk(rawData: string): ParsedEvent[] {
    const cleaned = stripAnsi(rawData);
    const events: ParsedEvent[] = [];
    const now = Date.now();

    // Split into lines for pattern matching
    const lines = cleaned.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and TUI noise
        if (isNoiseLine(trimmed)) continue;

        // 0. Team member detection: lines with 2+ @name patterns
        //    e.g. "@main @frontend-dev @planner · ↓ to expand"
        const atMatches = [...trimmed.matchAll(TEAM_MEMBER_RE)];
        if (atMatches.length >= 2) {
            events.push({
                type: 'team_update',
                content: trimmed,
                teamMembers: atMatches.map(m => m[1]),
                timestamp: now,
            });
            continue;
        }

        // 0b. Team shutdown detection
        if (TEAM_SHUTDOWN_RE.test(trimmed) && trimmed.length < 100) {
            events.push({
                type: 'team_update',
                content: trimmed,
                teamMembers: [],
                timestamp: now,
            });
            continue;
        }

        // 1. Prompt detection (idle / waiting for input)
        if (trimmed.includes(PROMPT_MARKER) || /^\s*>\s*$/.test(trimmed)) {
            events.push({
                type: 'prompt',
                content: trimmed,
                timestamp: now,
            });
            continue;
        }

        // 2. Success / completion detection (standalone checkmark)
        if (/^\s*\u2713\s*$/.test(trimmed)) {
            events.push({
                type: 'tool_result',
                content: trimmed,
                timestamp: now,
            });
            continue;
        }

        // 3. Thinking / working indicator
        //    Matches: "⏺ Thinking...", "⏺  Analyzing...", standalone "⏺"
        if (trimmed.includes(THINKING_MARKER) || /^\s*\u23FA/.test(trimmed)) {
            // Extract the thinking text after the marker
            const thinkingContent = trimmed.replace(/^[\s\u23FA]+/, '').trim();
            events.push({
                type: 'thinking',
                content: thinkingContent || trimmed,
                timestamp: now,
            });
            continue;
        }

        // 4. Tool use detection
        const toolMatch = trimmed.match(TOOL_NAME_RE);
        if (toolMatch && TOOL_USE_RE.test('\n' + line)) {
            events.push({
                type: 'tool_use',
                content: trimmed,
                toolName: toolMatch[1],
                timestamp: now,
            });
            continue;
        }

        // 5. Error detection
        if (ERROR_PATTERNS.some(pat => pat.test(trimmed))) {
            events.push({
                type: 'error',
                content: trimmed,
                timestamp: now,
            });
            continue;
        }

        // 6. Tool result patterns
        if (TOOL_RESULT_PATTERNS.some(pat => pat.test(trimmed))) {
            events.push({
                type: 'tool_result',
                content: trimmed,
                timestamp: now,
            });
            continue;
        }

        // 7. Default: plain text
        events.push({
            type: 'text',
            content: trimmed,
            timestamp: now,
        });
    }

    return events;
}

// ── Activity detector ──────────────────────────────────────────────────────

/**
 * Derive the high-level agent activity from a list of recent parsed events.
 * Uses a priority-based approach: error > working > thinking > success > idle.
 */
export function detectActivity(events: ParsedEvent[]): AgentActivity {
    if (events.length === 0) return 'idle';

    // Check the most recent events (last N) for state signals
    const recent = events.slice(-10);

    // Error takes highest priority
    if (recent.some(e => e.type === 'error')) {
        return 'error';
    }

    // Check last event specifically for prompt (idle)
    const last = recent[recent.length - 1];
    if (last.type === 'prompt') {
        // If there were tool uses or thinking before the prompt, it's success
        const hasWork = recent.some(e =>
            e.type === 'tool_use' || e.type === 'thinking' || e.type === 'tool_result',
        );
        return hasWork ? 'success' : 'idle';
    }

    // Active tool use = working
    if (recent.some(e => e.type === 'tool_use')) {
        return 'working';
    }

    // Thinking indicator
    if (recent.some(e => e.type === 'thinking')) {
        return 'thinking';
    }

    // Tool result without subsequent prompt = still working
    if (recent.some(e => e.type === 'tool_result')) {
        return 'working';
    }

    return 'idle';
}

// ── Summary helper (for mail reports) ──────────────────────────────────────

/**
 * Summarize a sequence of parsed events into a brief report string.
 * Used when generating mail:new-report from PTY activity.
 */
export function summarizeEvents(events: ParsedEvent[]): string {
    const tools = events
        .filter(e => e.type === 'tool_use' && e.toolName)
        .map(e => e.toolName!);
    const uniqueTools = [...new Set(tools)];
    const errors = events.filter(e => e.type === 'error');
    const textLines = events
        .filter(e => e.type === 'text')
        .map(e => e.content)
        .slice(-5);

    const parts: string[] = [];
    if (uniqueTools.length > 0) {
        parts.push(`Tools used: ${uniqueTools.join(', ')}`);
    }
    if (errors.length > 0) {
        parts.push(`Errors: ${errors.length}`);
    }
    if (textLines.length > 0) {
        parts.push(textLines.join('\n'));
    }

    return parts.join('\n') || '(no output captured)';
}
