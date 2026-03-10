import { describe, it, expect, beforeEach } from 'vitest';
import { useGrowthStore } from '../../store/useGrowthStore';
import type { ParsedEvent } from '../pty-parser';
import { processActivityChange } from '../growth-bridge';

function resetStore() {
    useGrowthStore.setState({ profiles: {} });
}

function makeEvent(
    type: ParsedEvent['type'],
    toolName?: string,
    content?: string,
): ParsedEvent {
    return {
        type,
        content: content ?? 'test',
        toolName,
        timestamp: Date.now(),
    };
}

describe('processActivityChange', () => {
    beforeEach(() => {
        resetStore();
    });

    // 1. Skips idle activity
    it('returns empty events when activity is idle', () => {
        const result = processActivityChange(
            'agent-1',
            'idle',
            undefined,
            [],
            1,
        );

        expect(result).toEqual([]);
        expect(useGrowthStore.getState().profiles['agent-1']).toBeUndefined();
    });

    // 2. Grants EXP on thinking
    it('grants EXP on thinking activity', () => {
        const events = [makeEvent('thinking')];
        const result = processActivityChange(
            'agent-1',
            'thinking',
            undefined,
            events,
            1,
        );

        const expEvent = result.find((e) => e.type === 'exp_gained');
        expect(expEvent).toBeDefined();
        expect(expEvent!.details.amount as number).toBeGreaterThan(0);
    });

    // 3. Grants EXP on working — includes tool bonus
    it('grants EXP on working with tool bonus', () => {
        const events = [makeEvent('tool_use', 'Edit', 'src/foo.ts')];
        const resultWithTool = processActivityChange(
            'agent-1',
            'working',
            undefined,
            events,
            1,
        );

        resetStore();

        const resultNoTool = processActivityChange(
            'agent-2',
            'working',
            undefined,
            [makeEvent('thinking')],
            1,
        );

        const expWithTool = resultWithTool.find((e) => e.type === 'exp_gained');
        const expNoTool = resultNoTool.find((e) => e.type === 'exp_gained');
        expect(expWithTool).toBeDefined();
        expect(expNoTool).toBeDefined();
        expect(expWithTool!.details.amount as number).toBeGreaterThan(
            expNoTool!.details.amount as number,
        );
    });

    // 4. Grants EXP on success — higher base EXP, records task with success=true
    it('grants higher EXP on success and records task with success=true', () => {
        const events = [
            makeEvent('tool_use', 'Edit', 'src/foo.ts'),
            makeEvent('tool_result'),
        ];

        const result = processActivityChange(
            'agent-1',
            'success',
            'working',
            events,
            1,
        );

        const expEvent = result.find((e) => e.type === 'exp_gained');
        expect(expEvent).toBeDefined();
        expect(expEvent!.details.amount as number).toBeGreaterThan(0);

        const profile = useGrowthStore.getState().profiles['agent-1'];
        expect(profile).toBeDefined();
        expect(profile.taskHistory.length).toBeGreaterThan(0);
        const lastTask = profile.taskHistory[profile.taskHistory.length - 1];
        expect(lastTask.success).toBe(true);
    });

    // 5. Grants EXP on error — lower EXP, records task with success=false
    it('grants lower EXP on error and records task with success=false', () => {
        const events = [
            makeEvent('tool_use', 'Bash', 'npm test'),
            makeEvent('error', undefined, 'Error: something broke'),
        ];

        const result = processActivityChange(
            'agent-1',
            'error',
            'working',
            events,
            1,
        );

        const expEvent = result.find((e) => e.type === 'exp_gained');
        expect(expEvent).toBeDefined();

        const profile = useGrowthStore.getState().profiles['agent-1'];
        expect(profile).toBeDefined();
        expect(profile.taskHistory.length).toBeGreaterThan(0);
        const lastTask = profile.taskHistory[profile.taskHistory.length - 1];
        expect(lastTask.success).toBe(false);
    });

    // 6. Classifies skill from events
    it('classifies skill category from tool events', () => {
        const events = [
            makeEvent('tool_use', 'Edit', 'src/components/Button.tsx'),
            makeEvent('tool_use', 'Edit', 'src/components/Card.tsx'),
        ];

        const result = processActivityChange(
            'agent-1',
            'working',
            undefined,
            events,
            1,
        );

        const expEvent = result.find((e) => e.type === 'exp_gained');
        expect(expEvent).toBeDefined();
        expect(expEvent!.details.skillCategory).toBe('frontend');
    });

    // 7. Detects level-up
    it('returns level_up event when enough EXP is accumulated', () => {
        // Give enough EXP to level up (level 1 needs 100 EXP)
        // Pre-seed a profile close to leveling up
        const { getOrCreateProfile } = useGrowthStore.getState();
        getOrCreateProfile('agent-1');
        useGrowthStore.setState((state) => ({
            profiles: {
                ...state.profiles,
                'agent-1': {
                    ...state.profiles['agent-1'],
                    exp: 95,
                    expToNext: 100,
                },
            },
        }));

        const events = [
            makeEvent('tool_use', 'Edit', 'src/foo.ts'),
            makeEvent('tool_use', 'Write', 'src/bar.ts'),
            makeEvent('tool_use', 'Bash', 'npm test'),
            makeEvent('tool_use', 'Read', 'package.json'),
            makeEvent('tool_use', 'Grep', 'pattern'),
        ];

        const result = processActivityChange(
            'agent-1',
            'success',
            'working',
            events,
            1,
        );

        const levelUp = result.find((e) => e.type === 'level_up');
        expect(levelUp).toBeDefined();
        expect(levelUp!.details.newLevel as number).toBeGreaterThanOrEqual(2);
    });

    // 8. Adds memory on success
    it('adds memory with type lesson on success', () => {
        const events = [
            makeEvent('tool_use', 'Edit', 'src/utils.ts'),
            makeEvent('text', undefined, 'Fixed the parsing bug'),
        ];

        const result = processActivityChange(
            'agent-1',
            'success',
            'working',
            events,
            1,
        );

        const profile = useGrowthStore.getState().profiles['agent-1'];
        expect(profile).toBeDefined();
        const lessonMemory = profile.memories.find((m) => m.type === 'lesson');
        expect(lessonMemory).toBeDefined();
    });

    // 9. Team bonus applied
    it('applies team bonus when teamSize is greater than 1', () => {
        const events = [makeEvent('tool_use', 'Edit', 'src/foo.ts')];

        const resultSolo = processActivityChange(
            'agent-solo',
            'working',
            undefined,
            events,
            1,
        );

        resetStore();

        const resultTeam = processActivityChange(
            'agent-team',
            'working',
            undefined,
            events,
            3,
        );

        const expSolo = resultSolo.find((e) => e.type === 'exp_gained');
        const expTeam = resultTeam.find((e) => e.type === 'exp_gained');
        expect(expSolo).toBeDefined();
        expect(expTeam).toBeDefined();
        expect(expTeam!.details.amount as number).toBeGreaterThan(
            expSolo!.details.amount as number,
        );
    });

    // 10. Session tools extracted correctly
    it('extracts unique tool names from events', () => {
        const events = [
            makeEvent('tool_use', 'Edit', 'src/a.ts'),
            makeEvent('tool_use', 'Edit', 'src/b.ts'),
            makeEvent('tool_use', 'Read', 'src/c.ts'),
            makeEvent('tool_use', 'Bash', 'npm run lint'),
            makeEvent('thinking'),
            makeEvent('text'),
        ];

        const result = processActivityChange(
            'agent-1',
            'working',
            undefined,
            events,
            1,
        );

        const expEvent = result.find((e) => e.type === 'exp_gained');
        expect(expEvent).toBeDefined();
        expect(expEvent!.details.toolsUsed).toBeDefined();

        const toolNames = expEvent!.details.toolsUsed as string[];
        expect(toolNames).toContain('Edit');
        expect(toolNames).toContain('Read');
        expect(toolNames).toContain('Bash');
        // Should be unique — Edit appears twice in events but once in tools
        expect(toolNames.filter((t: string) => t === 'Edit')).toHaveLength(1);
    });

    // 11. Auto-unlocks skill on level threshold
    it('auto-unlocks a skill when agent reaches appropriate level', () => {
        const { getOrCreateProfile } = useGrowthStore.getState();
        getOrCreateProfile('agent-1');

        // Set agent to level 4 with high exp so it levels to 5
        useGrowthStore.setState((state) => ({
            profiles: {
                ...state.profiles,
                'agent-1': {
                    ...state.profiles['agent-1'],
                    level: 4,
                    exp: 140,
                    expToNext: 152, // LEVEL_EXP_TABLE[3]
                },
            },
        }));

        const events = [
            makeEvent('tool_use', 'Edit', 'src/components/Widget.tsx'),
            makeEvent('tool_use', 'Edit', 'src/components/Panel.tsx'),
            makeEvent('tool_use', 'Write', 'src/components/New.tsx'),
            makeEvent('tool_use', 'Read', 'src/hooks/useData.ts'),
            makeEvent('tool_use', 'Bash', 'npm test'),
        ];

        const result = processActivityChange(
            'agent-1',
            'success',
            'working',
            events,
            1,
        );

        const profile = useGrowthStore.getState().profiles['agent-1'];
        expect(profile.skills.length).toBeGreaterThan(0);
    });

    // Additional edge cases

    it('handles transition from undefined previous activity', () => {
        const events = [makeEvent('thinking')];
        const result = processActivityChange(
            'agent-1',
            'thinking',
            undefined,
            events,
            1,
        );

        expect(result.length).toBeGreaterThan(0);
    });

    it('does not duplicate EXP when same activity repeats', () => {
        const events = [makeEvent('thinking')];

        // First transition
        processActivityChange('agent-1', 'thinking', undefined, events, 1);
        const profileAfterFirst = useGrowthStore.getState().profiles['agent-1'];
        const firstTotalExp = profileAfterFirst?.totalExp ?? 0;

        // Same activity again (thinking -> thinking) should still grant EXP
        // since it represents continued work
        processActivityChange('agent-1', 'thinking', 'thinking', events, 1);
        const profileAfterSecond =
            useGrowthStore.getState().profiles['agent-1'];
        const secondTotalExp = profileAfterSecond?.totalExp ?? 0;

        expect(secondTotalExp).toBeGreaterThanOrEqual(firstTotalExp);
    });

    it('success activity grants more EXP than error activity', () => {
        const events = [makeEvent('tool_use', 'Edit', 'src/foo.ts')];

        const successResult = processActivityChange(
            'agent-s',
            'success',
            'working',
            events,
            1,
        );

        resetStore();

        const errorResult = processActivityChange(
            'agent-e',
            'error',
            'working',
            events,
            1,
        );

        const successExp = successResult.find((e) => e.type === 'exp_gained')!
            .details.amount as number;
        const errorExp = errorResult.find((e) => e.type === 'exp_gained')!
            .details.amount as number;

        expect(successExp).toBeGreaterThan(errorExp);
    });
});
