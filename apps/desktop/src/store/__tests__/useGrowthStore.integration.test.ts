import { describe, it, expect, beforeEach } from 'vitest';
import { useGrowthStore } from '../useGrowthStore';
import { LEVEL_EXP_TABLE } from '../../types/growth';

/**
 * Integration tests: verify end-to-end workflows across multiple store actions.
 */

function resetStore() {
    useGrowthStore.setState({ profiles: {} });
}

describe('useGrowthStore integration', () => {
    beforeEach(() => {
        resetStore();
    });

    it('full agent lifecycle: create, earn EXP, level up, unlock skills, gain skill EXP', () => {
        const store = useGrowthStore.getState;

        // 1. Create agent
        const profile = store().getOrCreateProfile('lifecycle-agent');
        expect(profile.level).toBe(1);

        // 2. Earn enough EXP to level up
        store().addExp(
            'lifecycle-agent',
            LEVEL_EXP_TABLE[0],
            'coding',
            ['Edit', 'Bash'],
            'backend',
        );
        const afterLevelUp = store().profiles['lifecycle-agent'];
        expect(afterLevelUp.level).toBe(2);
        expect(afterLevelUp.totalExp).toBe(LEVEL_EXP_TABLE[0]);
        expect(afterLevelUp.taskHistory).toHaveLength(1);

        // 3. Unlock a skill
        store().unlockSkill('lifecycle-agent', 'be-api');
        const afterSkill = store().profiles['lifecycle-agent'];
        expect(afterSkill.skills).toHaveLength(1);
        expect(afterSkill.skills[0].skillId).toBe('be-api');
        expect(afterSkill.skills[0].level).toBe(1);

        // 4. Gain skill EXP and level up skill
        store().addSkillExp('lifecycle-agent', 'be-api', 100);
        const afterSkillExp = store().profiles['lifecycle-agent'];
        const skill = afterSkillExp.skills.find((s) => s.skillId === 'be-api');
        expect(skill!.level).toBe(2);
        expect(skill!.exp).toBe(0);
    });

    it('relationship + memory + trait accumulation across multiple interactions', () => {
        const store = useGrowthStore.getState;

        store().getOrCreateProfile('social-agent');

        // Build relationship over multiple interactions
        store().updateRelationship('social-agent', 'partner-agent', {
            affinity: 0.2,
            collaborationCount: 1,
        });
        store().updateRelationship('social-agent', 'partner-agent', {
            affinity: 0.3,
            collaborationCount: 1,
        });

        const profile = store().profiles['social-agent'];
        expect(profile.relationships).toHaveLength(1);
        expect(profile.relationships[0].affinity).toBe(0.5);
        expect(profile.relationships[0].collaborationCount).toBe(2);
        expect(profile.relationships[0].synergyBonus).toBe(0.02);

        // Add memory
        store().addMemory('social-agent', {
            type: 'relationship',
            content: 'Good collaboration with partner-agent',
            context: 'team project',
            importance: 0.9,
        });

        const afterMemory = store().profiles['social-agent'];
        expect(afterMemory.memories).toHaveLength(1);

        // Access memory bumps count
        const memoryId = afterMemory.memories[0].id;
        store().accessMemory('social-agent', memoryId);
        const afterAccess = store().profiles['social-agent'];
        expect(afterAccess.memories[0].accessCount).toBe(1);

        // Add trait
        store().addTrait('social-agent', {
            name: 'Team Player',
            description: 'Works well with others',
            strength: 0.7,
            source: 'collaboration',
        });

        const afterTrait = store().profiles['social-agent'];
        expect(afterTrait.traits).toHaveLength(1);
        expect(afterTrait.traits[0].name).toBe('Team Player');
    });

    it('multiple agents maintain independent profiles', () => {
        const store = useGrowthStore.getState;

        store().getOrCreateProfile('agent-a');
        store().getOrCreateProfile('agent-b');

        store().addExp('agent-a', 500, 'coding', ['Edit'], 'frontend');
        store().unlockSkill('agent-b', 'test-unit');

        const a = store().profiles['agent-a'];
        const b = store().profiles['agent-b'];

        // Agent A has EXP but no skills
        expect(a.totalExp).toBe(500);
        expect(a.skills).toHaveLength(0);

        // Agent B has skill but no EXP
        expect(b.totalExp).toBe(0);
        expect(b.skills).toHaveLength(1);
    });

    it('persistence: serialized state retains profiles after rehydration', () => {
        const store = useGrowthStore.getState;

        // Setup a profile with data
        store().getOrCreateProfile('persist-agent');
        store().addExp('persist-agent', 200, 'testing', ['Bash'], 'testing');
        store().unlockSkill('persist-agent', 'test-unit');
        store().addMemory('persist-agent', {
            type: 'lesson',
            content: 'Always test first',
            context: 'TDD session',
            importance: 0.9,
        });

        // Capture state as if it were persisted
        const snapshot = JSON.parse(
            JSON.stringify({ profiles: store().profiles }),
        );

        // Reset store (simulate fresh app start)
        resetStore();
        expect(store().profiles['persist-agent']).toBeUndefined();

        // Rehydrate from snapshot
        useGrowthStore.setState(snapshot);

        const rehydrated = store().profiles['persist-agent'];
        expect(rehydrated).toBeDefined();
        expect(rehydrated.totalExp).toBe(200);
        expect(rehydrated.skills).toHaveLength(1);
        expect(rehydrated.skills[0].skillId).toBe('test-unit');
        expect(rehydrated.memories).toHaveLength(1);
        expect(rehydrated.memories[0].content).toBe('Always test first');
    });

    it('task history records from addExp accumulate correctly', () => {
        const store = useGrowthStore.getState;

        store().getOrCreateProfile('history-agent');

        // addExp records a task history entry internally
        store().addExp('history-agent', 10, 'coding', ['Edit'], 'backend');
        store().addExp(
            'history-agent',
            20,
            'review',
            ['Read', 'Grep'],
            'communication',
        );

        // recordTask adds entries separately
        store().recordTask('history-agent', {
            taskType: 'deploy',
            toolsUsed: ['Bash'],
            expEarned: 15,
            skillCategory: 'devops',
            duration: 3000,
            success: true,
        });

        const profile = store().profiles['history-agent'];
        // 2 from addExp + 1 from recordTask
        expect(profile.taskHistory).toHaveLength(3);
        expect(profile.taskHistory[0].taskType).toBe('coding');
        expect(profile.taskHistory[1].taskType).toBe('review');
        expect(profile.taskHistory[2].taskType).toBe('deploy');
        expect(profile.totalExp).toBe(30);
    });
});
