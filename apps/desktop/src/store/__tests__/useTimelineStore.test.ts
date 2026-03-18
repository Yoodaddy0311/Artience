import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '../useTimelineStore';

describe('useTimelineStore', () => {
    beforeEach(() => {
        useTimelineStore.getState().clearEntries();
    });

    it('dedupes repeated open transitions for the same activity', () => {
        const store = useTimelineStore.getState();

        store.recordTransition('a02', 'typing');
        store.recordTransition('a02', 'typing');

        const entries = useTimelineStore.getState().entries;
        expect(entries).toHaveLength(1);
        expect(entries[0].activity).toBe('typing');
        expect(entries[0].endedAt).toBeUndefined();
    });

    it('creates a new entry when the tool changes within the same activity', () => {
        const store = useTimelineStore.getState();

        store.recordTransition('a02', 'reading', 'Read');
        store.recordTransition('a02', 'reading', 'Glob');

        const entries = useTimelineStore.getState().entries;
        expect(entries).toHaveLength(2);
        expect(entries[0].toolName).toBe('Read');
        expect(entries[0].endedAt).toBeTypeOf('number');
        expect(entries[1].toolName).toBe('Glob');
        expect(entries[1].endedAt).toBeUndefined();
    });
});
