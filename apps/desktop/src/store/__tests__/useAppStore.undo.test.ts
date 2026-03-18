import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../useAppStore';
import { DEFAULT_PROJECT } from '../../types/project';

describe('useAppStore undo controls', () => {
    beforeEach(() => {
        useAppStore.getState().resetProjectConfig();
        useAppStore.setState({
            undoStack: [],
            projectConfig: structuredClone(DEFAULT_PROJECT),
            projectLoading: false,
            projectError: null,
        });
    });

    it('skips undo snapshots for live world-property updates when requested', () => {
        const targetId = DEFAULT_PROJECT.world.layers.objects[0].id;

        useAppStore.getState().updateWorldObjectProperties(
            targetId,
            { offsetX: 12 },
            { trackUndo: false },
        );

        expect(useAppStore.getState().undoStack).toHaveLength(0);
        const target = useAppStore
            .getState()
            .projectConfig.world.layers.objects.find((obj) => obj.id === targetId);
        expect(target?.properties?.offsetX).toBe(12);
    });

    it('keeps a single undo snapshot for full world-object updates', () => {
        const target = DEFAULT_PROJECT.world.layers.objects[0];

        useAppStore.getState().updateWorldObjectFull(target.id, 10, 11, {
            offsetX: 4,
            offsetY: 6,
        });

        expect(useAppStore.getState().undoStack).toHaveLength(1);
        const updated = useAppStore
            .getState()
            .projectConfig.world.layers.objects.find((obj) => obj.id === target.id);
        expect(updated?.x).toBe(10);
        expect(updated?.y).toBe(11);
        expect(updated?.properties?.offsetX).toBe(4);
        expect(updated?.properties?.offsetY).toBe(6);
    });
});
