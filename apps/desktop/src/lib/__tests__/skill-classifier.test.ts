import { describe, it, expect } from 'vitest';
import { classifySkill, classifyDominantSkill } from '../skill-classifier';

describe('classifySkill', () => {
    it('classifies .tsx files as frontend', () => {
        expect(classifySkill('Edit', 'Edit src/components/Button.tsx')).toBe(
            'frontend',
        );
    });

    it('classifies test files as testing', () => {
        expect(classifySkill('Edit', 'Edit src/__tests__/foo.test.ts')).toBe(
            'testing',
        );
    });

    it('classifies Bash tool as devops', () => {
        expect(classifySkill('Bash')).toBe('devops');
    });

    it('classifies API route files as backend', () => {
        expect(classifySkill('Edit', 'Edit src/api/users.ts')).toBe('backend');
    });

    it('classifies docs as communication', () => {
        expect(classifySkill('Edit', 'Edit docs/README.md')).toBe(
            'communication',
        );
    });

    it('classifies schema/type files as architecture', () => {
        expect(classifySkill('Edit', 'Edit src/types/platform.ts')).toBe(
            'architecture',
        );
    });

    it('defaults to backend for unknown', () => {
        expect(classifySkill('UnknownTool')).toBe('backend');
    });

    // ── Additional edge cases ──

    it('classifies .spec. files as testing', () => {
        expect(classifySkill('Edit', 'Edit src/utils.spec.ts')).toBe('testing');
    });

    it('classifies e2e directory files as testing', () => {
        expect(classifySkill('Edit', 'Edit e2e/login.test.ts')).toBe('testing');
    });

    it('classifies .vue files as frontend via extension fallback', () => {
        expect(classifySkill('Edit', 'Edit src/App.vue')).toBe('frontend');
    });

    it('classifies .css files as frontend via extension', () => {
        expect(classifySkill('Edit', 'Edit src/global.css')).toBe('frontend');
    });

    it('classifies hooks directory as frontend', () => {
        expect(classifySkill('Edit', 'Edit src/hooks/useAuth.ts')).toBe(
            'frontend',
        );
    });

    it('classifies pages directory as frontend', () => {
        expect(classifySkill('Edit', 'Edit src/pages/Home.tsx')).toBe(
            'frontend',
        );
    });

    it('classifies server directory as backend', () => {
        expect(classifySkill('Edit', 'Edit server/index.ts')).toBe('backend');
    });

    it('classifies middleware directory as backend', () => {
        expect(classifySkill('Edit', 'Edit src/middleware/auth.ts')).toBe(
            'backend',
        );
    });

    it('classifies .github directory as devops', () => {
        expect(classifySkill('Edit', 'Edit .github/workflows/ci.yml')).toBe(
            'devops',
        );
    });

    it('classifies docker files as devops when path has extension', () => {
        expect(classifySkill('Edit', 'Edit docker/compose.yml')).toBe('devops');
    });

    it('classifies deploy directory as devops', () => {
        expect(classifySkill('Edit', 'Edit deploy/scripts/run.sh')).toBe(
            'devops',
        );
    });

    it('classifies config files as architecture', () => {
        expect(classifySkill('Edit', 'Edit config/settings.ts')).toBe(
            'architecture',
        );
    });

    it('classifies interfaces directory as architecture', () => {
        expect(classifySkill('Edit', 'Edit src/interfaces/IUser.ts')).toBe(
            'architecture',
        );
    });

    it('classifies CHANGELOG as communication', () => {
        expect(classifySkill('Edit', 'Edit CHANGELOG.md')).toBe(
            'communication',
        );
    });

    it('classifies Agent tool as architecture', () => {
        expect(classifySkill('Agent')).toBe('architecture');
    });

    it('classifies WebSearch tool as communication', () => {
        expect(classifySkill('WebSearch')).toBe('communication');
    });

    it('classifies TodoWrite tool as communication', () => {
        expect(classifySkill('TodoWrite')).toBe('communication');
    });

    it('prioritizes path pattern over file extension', () => {
        // __tests__/ pattern should match before .ts extension
        expect(classifySkill('Edit', 'Edit src/__tests__/utils.ts')).toBe(
            'testing',
        );
    });

    it('handles content with no file path gracefully', () => {
        expect(classifySkill('Edit', 'no file path here')).toBe('backend');
    });
});

describe('classifyDominantSkill', () => {
    it('returns most frequent category', () => {
        const events = [
            { toolName: 'Edit', content: 'Edit src/components/A.tsx' },
            { toolName: 'Edit', content: 'Edit src/components/B.tsx' },
            { toolName: 'Edit', content: 'Edit src/api/users.ts' },
        ];
        expect(classifyDominantSkill(events)).toBe('frontend');
    });

    it('returns backend for empty events', () => {
        expect(classifyDominantSkill([])).toBe('backend');
    });

    it('returns testing when test events dominate', () => {
        const events = [
            { toolName: 'Edit', content: 'Edit src/__tests__/a.test.ts' },
            { toolName: 'Edit', content: 'Edit src/__tests__/b.test.ts' },
            { toolName: 'Edit', content: 'Edit src/__tests__/c.test.ts' },
            { toolName: 'Bash', content: 'npm test' },
        ];
        expect(classifyDominantSkill(events)).toBe('testing');
    });

    it('returns devops when devops events dominate', () => {
        const events = [
            { toolName: 'Bash' },
            { toolName: 'Bash' },
            { toolName: 'Edit', content: 'Edit .github/workflows/ci.yml' },
        ];
        expect(classifyDominantSkill(events)).toBe('devops');
    });

    it('handles single event list', () => {
        const events = [
            { toolName: 'Edit', content: 'Edit src/components/Btn.tsx' },
        ];
        expect(classifyDominantSkill(events)).toBe('frontend');
    });
});
