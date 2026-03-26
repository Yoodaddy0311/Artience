import { describe, it, expect } from 'vitest';
import { BUBBLE_CONFIGS } from '../agent-runtime';

describe('meeting bubble configs', () => {
    it('has meeting_gathering config', () => {
        expect(BUBBLE_CONFIGS.meeting_gathering).toBeDefined();
        expect(BUBBLE_CONFIGS.meeting_gathering.emoji).toBeTruthy();
        expect(BUBBLE_CONFIGS.meeting_gathering.texts.length).toBeGreaterThan(
            0,
        );
    });

    it('has meeting_active config', () => {
        expect(BUBBLE_CONFIGS.meeting_active).toBeDefined();
        expect(BUBBLE_CONFIGS.meeting_active.emoji).toBeTruthy();
        expect(BUBBLE_CONFIGS.meeting_active.texts.length).toBeGreaterThan(0);
    });

    it('meeting_gathering has finite display time (transient)', () => {
        expect(BUBBLE_CONFIGS.meeting_gathering.displayFrames).toBeGreaterThan(
            0,
        );
    });

    it('meeting_active has 0 display frames (persistent while active)', () => {
        expect(BUBBLE_CONFIGS.meeting_active.displayFrames).toBe(0);
    });

    it('all required activity keys have bubble configs', () => {
        const requiredKeys = [
            'idle',
            'team_join',
            'meeting_gathering',
            'meeting_active',
            'thinking',
            'working',
            'reading',
            'typing',
            'writing',
            'success',
            'error',
        ];
        for (const key of requiredKeys) {
            expect(
                BUBBLE_CONFIGS[key],
                `Missing BUBBLE_CONFIGS["${key}"]`,
            ).toBeDefined();
        }
    });
});
