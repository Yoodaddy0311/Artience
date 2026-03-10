import { describe, it, expect, beforeEach } from 'vitest';
import { useGrowthStore } from '../useGrowthStore';
import { LEVEL_EXP_TABLE } from '../../types/growth';

function resetStore() {
    useGrowthStore.setState({ profiles: {} });
}

describe('useGrowthStore', () => {
    beforeEach(() => {
        resetStore();
    });

    // ── getOrCreateProfile ──

    describe('getOrCreateProfile', () => {
        it('returns default profile for new agent', () => {
            const profile = useGrowthStore
                .getState()
                .getOrCreateProfile('agent-1');

            expect(profile.agentId).toBe('agent-1');
            expect(profile.level).toBe(1);
            expect(profile.exp).toBe(0);
            expect(profile.totalExp).toBe(0);
            expect(profile.expToNext).toBe(LEVEL_EXP_TABLE[0]);
            expect(profile.stats.coding).toBe(1);
            expect(profile.skills).toEqual([]);
            expect(profile.memories).toEqual([]);
            expect(profile.traits).toEqual([]);
            expect(profile.relationships).toEqual([]);
            expect(profile.evolution.stage).toBe('novice');
        });

        it('returns existing profile for known agent', () => {
            const first = useGrowthStore
                .getState()
                .getOrCreateProfile('agent-1');
            useGrowthStore
                .getState()
                .addExp('agent-1', 50, 'coding', ['Edit'], 'backend');
            const second = useGrowthStore
                .getState()
                .getOrCreateProfile('agent-1');

            expect(second.agentId).toBe(first.agentId);
            expect(second.totalExp).toBe(50);
        });
    });

    // ── addExp ──

    describe('addExp', () => {
        it('increases exp and totalExp correctly', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore
                .getState()
                .addExp('agent-1', 50, 'coding', ['Edit'], 'backend');

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.exp).toBe(50);
            expect(profile.totalExp).toBe(50);
            expect(profile.level).toBe(1);
        });

        it('triggers level-up when exp >= expToNext', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            // LEVEL_EXP_TABLE[0] = 100, so 100 exp should level up to 2
            useGrowthStore
                .getState()
                .addExp('agent-1', 100, 'coding', ['Edit'], 'backend');

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.level).toBe(2);
            expect(profile.exp).toBe(0);
            expect(profile.totalExp).toBe(100);
            expect(profile.expToNext).toBe(LEVEL_EXP_TABLE[1]); // 115
        });

        it('handles multi-level-up with large exp gain', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            // Level 1->2: 100, Level 2->3: 115 => total 215 crosses 2 levels
            useGrowthStore
                .getState()
                .addExp('agent-1', 215, 'coding', ['Edit'], 'backend');

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.level).toBe(3);
            expect(profile.exp).toBe(0);
            expect(profile.totalExp).toBe(215);
        });

        it('updates evolution stage on level-up', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            // Sum exp needed for levels 1-10 to reach level 11 (apprentice)
            let totalNeeded = 0;
            for (let i = 0; i < 10; i++) {
                totalNeeded += LEVEL_EXP_TABLE[i];
            }
            useGrowthStore
                .getState()
                .addExp('agent-1', totalNeeded, 'coding', ['Edit'], 'backend');

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.level).toBe(11);
            expect(profile.evolution.stage).toBe('apprentice');
        });

        it('clamps at level 99 with expToNext=Infinity and legendary stage', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            // Sum all 98 level thresholds to reach level 99
            let totalNeeded = 0;
            for (let i = 0; i < 98; i++) {
                totalNeeded += LEVEL_EXP_TABLE[i];
            }
            useGrowthStore
                .getState()
                .addExp('agent-1', totalNeeded, 'coding', ['Edit'], 'backend');

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.level).toBe(99);
            expect(profile.exp).toBe(0);
            expect(profile.expToNext).toBe(Infinity);
            expect(profile.evolution.stage).toBe('legendary');
        });
    });

    // ── unlockSkill ──

    describe('unlockSkill', () => {
        it('adds skill with level 1', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore.getState().unlockSkill('agent-1', 'fe-components');

            const profile = useGrowthStore.getState().profiles['agent-1'];
            const skill = profile.skills.find(
                (s) => s.skillId === 'fe-components',
            );
            expect(skill).toBeDefined();
            expect(skill!.level).toBe(1);
            expect(skill!.exp).toBe(0);
            expect(skill!.unlockedAt).toBeGreaterThan(0);
        });

        it('does not duplicate already unlocked skill', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore.getState().unlockSkill('agent-1', 'fe-components');
            useGrowthStore.getState().unlockSkill('agent-1', 'fe-components');

            const profile = useGrowthStore.getState().profiles['agent-1'];
            const matching = profile.skills.filter(
                (s) => s.skillId === 'fe-components',
            );
            expect(matching).toHaveLength(1);
        });
    });

    // ── addSkillExp ──

    describe('addSkillExp', () => {
        it('increases skill exp and levels up at 100', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore.getState().unlockSkill('agent-1', 'fe-components');
            useGrowthStore
                .getState()
                .addSkillExp('agent-1', 'fe-components', 100);

            const profile = useGrowthStore.getState().profiles['agent-1'];
            const skill = profile.skills.find(
                (s) => s.skillId === 'fe-components',
            );
            expect(skill!.level).toBe(2);
            expect(skill!.exp).toBe(0);
        });

        it('caps skill level at 5', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore.getState().unlockSkill('agent-1', 'fe-components');
            // 400 exp = 4 level-ups, starting at level 1 => level 5
            useGrowthStore
                .getState()
                .addSkillExp('agent-1', 'fe-components', 500);

            const profile = useGrowthStore.getState().profiles['agent-1'];
            const skill = profile.skills.find(
                (s) => s.skillId === 'fe-components',
            );
            expect(skill!.level).toBe(5);
            expect(skill!.exp).toBe(0);
        });
    });

    // ── addMemory ──

    describe('addMemory', () => {
        it('adds memory with generated fields', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore.getState().addMemory('agent-1', {
                type: 'pattern',
                content: 'Use zustand for state',
                context: 'project setup',
                importance: 0.8,
            });

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.memories).toHaveLength(1);
            expect(profile.memories[0].type).toBe('pattern');
            expect(profile.memories[0].content).toBe('Use zustand for state');
            expect(profile.memories[0].id).toBeTruthy();
            expect(profile.memories[0].accessCount).toBe(0);
        });

        it('caps memories at 200', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            for (let i = 0; i < 210; i++) {
                useGrowthStore.getState().addMemory('agent-1', {
                    type: 'lesson',
                    content: `memory-${i}`,
                    context: 'test',
                    importance: 0.5,
                });
            }

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.memories).toHaveLength(200);
            // Oldest should be trimmed, newest kept
            expect(profile.memories[199].content).toBe('memory-209');
        });
    });

    // ── addTrait ──

    describe('addTrait', () => {
        it('adds trait with timestamp', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore.getState().addTrait('agent-1', {
                name: 'Fast Learner',
                description: 'Gains EXP faster',
                strength: 0.8,
                source: 'leveling',
            });

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.traits).toHaveLength(1);
            expect(profile.traits[0].name).toBe('Fast Learner');
            expect(profile.traits[0].id).toBeTruthy();
            expect(profile.traits[0].acquiredAt).toBeGreaterThan(0);
        });
    });

    // ── updateRelationship ──

    describe('updateRelationship', () => {
        it('creates new relationship', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore
                .getState()
                .updateRelationship('agent-1', 'agent-2', { affinity: 0.3 });

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.relationships).toHaveLength(1);
            expect(profile.relationships[0].targetAgentId).toBe('agent-2');
            expect(profile.relationships[0].affinity).toBe(0.3);
        });

        it('clamps affinity to [-1, 1]', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore
                .getState()
                .updateRelationship('agent-1', 'agent-2', { affinity: 5.0 });

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.relationships[0].affinity).toBe(1);

            // Update with large negative
            useGrowthStore
                .getState()
                .updateRelationship('agent-1', 'agent-2', { affinity: -10 });

            const updated = useGrowthStore.getState().profiles['agent-1'];
            expect(updated.relationships[0].affinity).toBe(-1);
        });
    });

    // ── recordTask ──

    describe('recordTask', () => {
        it('adds entry with timestamp', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            useGrowthStore.getState().recordTask('agent-1', {
                taskType: 'coding',
                toolsUsed: ['Edit', 'Bash'],
                expEarned: 25,
                skillCategory: 'backend',
                duration: 5000,
                success: true,
            });

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.taskHistory).toHaveLength(1);
            expect(profile.taskHistory[0].taskType).toBe('coding');
            expect(profile.taskHistory[0].timestamp).toBeGreaterThan(0);
        });

        it('caps history at 500', () => {
            useGrowthStore.getState().getOrCreateProfile('agent-1');
            for (let i = 0; i < 510; i++) {
                useGrowthStore.getState().recordTask('agent-1', {
                    taskType: `task-${i}`,
                    toolsUsed: [],
                    expEarned: 1,
                    skillCategory: 'backend',
                    duration: 100,
                    success: true,
                });
            }

            const profile = useGrowthStore.getState().profiles['agent-1'];
            expect(profile.taskHistory).toHaveLength(500);
            // Oldest trimmed, newest kept
            expect(profile.taskHistory[499].taskType).toBe('task-509');
        });
    });
});
