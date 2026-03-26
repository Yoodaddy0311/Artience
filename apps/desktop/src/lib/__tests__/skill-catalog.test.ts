import { describe, it, expect } from 'vitest';
import { SKILL_CATALOG, searchCatalog } from '../../../electron/skill-catalog';

describe('SKILL_CATALOG', () => {
    it('contains 10 skills', () => {
        expect(SKILL_CATALOG).toHaveLength(10);
    });

    it('each skill has required fields', () => {
        for (const skill of SKILL_CATALOG) {
            expect(skill.id).toBeTruthy();
            expect(skill.name).toBeTruthy();
            expect(skill.description).toBeTruthy();
            expect(skill.tags.length).toBeGreaterThan(0);
            expect(skill.repoUrl).toBeTruthy();
            expect(skill.author).toBeTruthy();
        }
    });

    it('has unique IDs', () => {
        const ids = SKILL_CATALOG.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('searchCatalog', () => {
    it('returns all skills for empty query', () => {
        expect(searchCatalog('')).toHaveLength(10);
        expect(searchCatalog('  ')).toHaveLength(10);
    });

    it('finds skills by tag', () => {
        const results = searchCatalog('git');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((s) => s.id === 'commit-message')).toBe(true);
    });

    it('finds skills by Korean tag', () => {
        const results = searchCatalog('보안');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((s) => s.id === 'dependency-audit')).toBe(true);
    });

    it('finds skills by name', () => {
        const results = searchCatalog('Docker');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('docker-setup');
    });

    it('supports multi-term search (all terms must match)', () => {
        const results = searchCatalog('test generator');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('test-generator');
    });

    it('is case insensitive', () => {
        const lower = searchCatalog('changelog');
        const upper = searchCatalog('CHANGELOG');
        expect(lower).toEqual(upper);
    });

    it('returns empty for non-matching query', () => {
        expect(searchCatalog('xyzzy_nonexistent')).toHaveLength(0);
    });

    it('matches by skill id', () => {
        const results = searchCatalog('perf-audit');
        expect(results.some((s) => s.id === 'perf-audit')).toBe(true);
    });
});
