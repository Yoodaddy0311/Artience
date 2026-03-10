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
});
