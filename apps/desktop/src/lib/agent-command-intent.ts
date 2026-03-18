import type { AgentActivity } from './pty-parser';
import { parseDirective } from './directive-parser';

export interface AgentCommandIntent {
    activity: AgentActivity;
    reason: string;
}

const SHELL_PREFIXES = [
    'git',
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'npx',
    'node',
    'python',
    'python3',
    'pip',
    'pytest',
    'vitest',
    'jest',
    'cargo',
    'go',
    'docker',
    'kubectl',
    'bash',
    'sh',
    'cmd',
    'powershell',
];

const THINKING_KEYWORDS = [
    'plan',
    'brainstorm',
    'strategy',
    'architecture',
    'design',
    'reason',
    'why',
    'how',
    '분석',
    '설계',
    '계획',
    '전략',
    '구조',
];

const READING_KEYWORDS = [
    'read',
    'review',
    'search',
    'find',
    'inspect',
    'analyze',
    'investigate',
    'compare',
    'grep',
    'glob',
    'docs',
    'document',
    'log',
    'trace',
    'stack',
    '확인',
    '검토',
    '검색',
    '조사',
    '문서',
    '로그',
];

const WRITING_KEYWORDS = [
    'write',
    'implement',
    'create',
    'fix',
    'edit',
    'update',
    'refactor',
    'patch',
    'add',
    'build feature',
    '구현',
    '수정',
    '작성',
    '추가',
    '개선',
    '리팩터',
];

const TYPING_KEYWORDS = [
    'run',
    'test',
    'execute',
    'deploy',
    'install',
    'compile',
    'benchmark',
    'script',
    'command',
    'cli',
    'terminal',
    '실행',
    '테스트',
    '배포',
    '설치',
    '명령',
    '터미널',
];

function includesAny(haystack: string, keywords: readonly string[]): boolean {
    return keywords.some((keyword) => haystack.includes(keyword));
}

function startsWithShellCommand(text: string): boolean {
    return SHELL_PREFIXES.some(
        (prefix) => text === prefix || text.startsWith(`${prefix} `),
    );
}

function classifySlashCommand(text: string): AgentCommandIntent | null {
    if (!text.startsWith('/')) return null;

    if (text.startsWith('/team')) {
        return { activity: 'thinking', reason: 'team-orchestration-command' };
    }
    if (
        text.startsWith('/review') ||
        text.startsWith('/status') ||
        text.startsWith('/doctor')
    ) {
        return { activity: 'reading', reason: 'inspection-command' };
    }
    if (
        text.startsWith('/clear') ||
        text.startsWith('/config') ||
        text.startsWith('/mcp') ||
        text.startsWith('/terminal-setup')
    ) {
        return { activity: 'typing', reason: 'terminal-command' };
    }

    return { activity: 'thinking', reason: 'generic-slash-command' };
}

export function classifyAgentCommandIntent(
    rawInput: string,
): AgentCommandIntent {
    const directive = parseDirective(rawInput);
    const text = directive.content.trim().toLowerCase();

    if (!text) {
        return { activity: 'thinking', reason: 'empty-input-default' };
    }

    const slashIntent = classifySlashCommand(text);
    if (slashIntent) return slashIntent;

    if (startsWithShellCommand(text)) {
        return { activity: 'typing', reason: 'shell-command' };
    }

    if (includesAny(text, WRITING_KEYWORDS)) {
        return { activity: 'writing', reason: 'implementation-keyword' };
    }

    if (includesAny(text, TYPING_KEYWORDS)) {
        return { activity: 'typing', reason: 'execution-keyword' };
    }

    if (includesAny(text, READING_KEYWORDS)) {
        return { activity: 'reading', reason: 'inspection-keyword' };
    }

    if (includesAny(text, THINKING_KEYWORDS)) {
        return { activity: 'thinking', reason: 'planning-keyword' };
    }

    if (directive.type === 'task') {
        return { activity: 'thinking', reason: 'delegated-task-default' };
    }

    return { activity: 'thinking', reason: 'default-thinking' };
}
