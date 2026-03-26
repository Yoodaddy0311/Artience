import { describe, it, expect } from 'vitest';
import {
    CHARACTER_SKILLS,
    getSkillProfile,
    getSkillById,
    buildSkillSystemPrompt,
} from '../../../electron/skill-map';

describe('CHARACTER_SKILLS', () => {
    it('has entries for 25 characters (all except dokba)', () => {
        // 25 out of 26 personas have skill profiles; dokba may or may not be included
        expect(Object.keys(CHARACTER_SKILLS).length).toBe(25);
    });

    it('each profile has a defaultAgent and at least one skill', () => {
        for (const [name, profile] of Object.entries(CHARACTER_SKILLS)) {
            expect(
                profile.defaultAgent,
                `${name} missing defaultAgent`,
            ).toBeTruthy();
            expect(
                profile.skills.length,
                `${name} has no skills`,
            ).toBeGreaterThan(0);
        }
    });

    it('all skill objects have id, label, description, systemPromptSuffix', () => {
        const allSkills = Object.values(CHARACTER_SKILLS).flatMap(
            (p) => p.skills,
        );
        for (const skill of allSkills) {
            expect(skill.id).toBeTruthy();
            expect(skill.label).toBeTruthy();
            expect(skill.description).toBeTruthy();
            expect(skill.systemPromptSuffix).toBeTruthy();
        }
    });
});

describe('getSkillProfile', () => {
    it('returns profile for known agent', () => {
        const profile = getSkillProfile('sera');
        expect(profile).toBeDefined();
        expect(profile!.defaultAgent).toBe('orchestrator');
    });

    it('is case insensitive', () => {
        expect(getSkillProfile('SERA')).toEqual(getSkillProfile('sera'));
    });

    it('returns undefined for unknown agent', () => {
        expect(getSkillProfile('nonexistent')).toBeUndefined();
    });

    it('returns correct profile for luna (frontend)', () => {
        const profile = getSkillProfile('luna');
        expect(profile!.defaultAgent).toBe('frontend-developer');
        expect(profile!.skills.some((s) => s.id === 'frontend')).toBe(true);
    });
});

describe('getSkillById', () => {
    it('returns skill for valid agent+skill combo', () => {
        const skill = getSkillById('sera', 'plan');
        expect(skill).toBeDefined();
        expect(skill!.label).toBe('Plan');
    });

    it('returns undefined for invalid skill id', () => {
        expect(getSkillById('sera', 'nonexistent')).toBeUndefined();
    });

    it('returns undefined for unknown agent', () => {
        expect(getSkillById('nobody', 'plan')).toBeUndefined();
    });

    it('finds code-review for podo', () => {
        const skill = getSkillById('podo', 'code-review');
        expect(skill).toBeDefined();
        expect(skill!.id).toBe('code-review');
    });
});

describe('buildSkillSystemPrompt', () => {
    it('returns base prompt when no skill provided', () => {
        expect(buildSkillSystemPrompt('base prompt')).toBe('base prompt');
        expect(buildSkillSystemPrompt('base prompt', undefined)).toBe(
            'base prompt',
        );
    });

    it('appends skill context to base prompt', () => {
        const skill = getSkillById('sera', 'plan')!;
        const result = buildSkillSystemPrompt('base', skill);
        expect(result).toContain('base');
        expect(result).toContain('[Active Skill: Plan]');
        expect(result).toContain(skill.systemPromptSuffix);
    });

    it('preserves newline formatting', () => {
        const skill = getSkillById('duri', 'security')!;
        const result = buildSkillSystemPrompt('System:', skill);
        expect(result).toBe(
            `System:\n\n[Active Skill: ${skill.label}]\n${skill.systemPromptSuffix}`,
        );
    });
});
