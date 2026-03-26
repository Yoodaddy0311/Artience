import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => {
    const fn = Object.assign(() => {}, { __promisify__: vi.fn() });
    return { default: { execFile: fn }, execFile: fn };
});
vi.mock('util', () => ({
    default: { promisify: vi.fn(() => vi.fn()) },
    promisify: vi.fn(() => vi.fn()),
}));
vi.mock('fs', () => ({
    default: {},
    existsSync: () => false,
    readdirSync: () => [],
}));
vi.mock('path', () => ({
    default: { join: (...args: string[]) => args.join('/') },
    join: (...args: string[]) => args.join('/'),
}));

import {
    extractMarkdownTitle,
    extractMarkdownDescription,
    findAgentForSkill,
} from '../../../electron/skill-manager';

describe('extractMarkdownTitle', () => {
    it('extracts h1 title', () => {
        expect(extractMarkdownTitle('# My Skill\n\nSome content')).toBe(
            'My Skill',
        );
    });

    it('returns null for no h1', () => {
        expect(extractMarkdownTitle('No heading here')).toBeNull();
    });

    it('extracts first h1 only', () => {
        expect(extractMarkdownTitle('# First\n# Second')).toBe('First');
    });

    it('trims whitespace', () => {
        expect(extractMarkdownTitle('#   Spaced Title  ')).toBe('Spaced Title');
    });

    it('handles h1 not on first line', () => {
        expect(extractMarkdownTitle('preamble\n# Title Here')).toBe(
            'Title Here',
        );
    });
});

describe('extractMarkdownDescription', () => {
    it('extracts description from ## Description section', () => {
        const md =
            '# Title\n\n## Description\nThis is the description.\n\n## Instructions';
        expect(extractMarkdownDescription(md)).toBe('This is the description.');
    });

    it('returns null when no description section', () => {
        expect(
            extractMarkdownDescription('# Title\n\nJust content'),
        ).toBeNull();
    });

    it('handles multiline gap between heading and content', () => {
        const md = '## Description\n\n\nFirst line of desc';
        expect(extractMarkdownDescription(md)).toBe('First line of desc');
    });
});

describe('findAgentForSkill', () => {
    it('finds default skill agent (code-review → podo)', () => {
        expect(findAgentForSkill('code-review')).toBe('podo');
    });

    it('finds default skill agent (run-tests → ara)', () => {
        expect(findAgentForSkill('run-tests')).toBe('ara');
    });

    it('finds default skill agent (security-audit → duri)', () => {
        expect(findAgentForSkill('security-audit')).toBe('duri');
    });

    it('finds agent from CHARACTER_SKILLS for non-default skill', () => {
        // 'frontend' skill is mapped to luna in CHARACTER_SKILLS
        const agent = findAgentForSkill('frontend');
        expect(agent).toBeDefined();
    });

    it('returns undefined for unknown skill', () => {
        expect(findAgentForSkill('nonexistent-skill')).toBeUndefined();
    });
});
