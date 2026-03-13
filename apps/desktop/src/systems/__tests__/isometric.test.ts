import { describe, it, expect } from 'vitest';
import {
    gridToIso,
    isoToGrid,
    getIsoCanvasSize,
    getCameraOffset,
    isoDepthCompare,
    getIsoDirection,
    ISO_TILE_WIDTH,
    ISO_TILE_HEIGHT,
    ISO_MAP_COLS,
    ISO_MAP_ROWS,
    ISO_ROOMS,
} from '../isometric';

describe('gridToIso', () => {
    it('converts origin (0,0) to screen (0,0)', () => {
        const result = gridToIso(0, 0);
        expect(result).toEqual({ x: 0, y: 0 });
    });

    it('converts (1,0) to positive x and positive y', () => {
        const result = gridToIso(1, 0);
        expect(result).toEqual({
            x: ISO_TILE_WIDTH / 2,
            y: ISO_TILE_HEIGHT / 2,
        });
    });

    it('converts (0,1) to negative x and positive y', () => {
        const result = gridToIso(0, 1);
        expect(result).toEqual({
            x: -(ISO_TILE_WIDTH / 2),
            y: ISO_TILE_HEIGHT / 2,
        });
    });

    it('converts (1,1) to x=0 and doubled y', () => {
        const result = gridToIso(1, 1);
        expect(result.x).toBe(0);
        expect(result.y).toBe(ISO_TILE_HEIGHT);
    });

    it('handles large grid coordinates', () => {
        const result = gridToIso(39, 24);
        expect(result.x).toBe((39 - 24) * (ISO_TILE_WIDTH / 2));
        expect(result.y).toBe((39 + 24) * (ISO_TILE_HEIGHT / 2));
    });
});

describe('isoToGrid', () => {
    it('converts screen origin back to grid (0,0)', () => {
        const result = isoToGrid(0, 0);
        expect(result).toEqual({ col: 0, row: 0 });
    });

    it('round-trips gridToIso -> isoToGrid for integer coordinates', () => {
        // Due to floor rounding, use the center of a tile
        const col = 5;
        const row = 3;
        const iso = gridToIso(col, row);
        const grid = isoToGrid(iso.x, iso.y);
        expect(grid).toEqual({ col, row });
    });

    it('round-trips for origin', () => {
        const iso = gridToIso(0, 0);
        const grid = isoToGrid(iso.x, iso.y);
        expect(grid).toEqual({ col: 0, row: 0 });
    });

    it('round-trips for far corner', () => {
        const col = 10;
        const row = 10;
        const iso = gridToIso(col, row);
        const grid = isoToGrid(iso.x, iso.y);
        expect(grid).toEqual({ col, row });
    });
});

describe('getIsoCanvasSize', () => {
    it('returns positive width and height', () => {
        const size = getIsoCanvasSize();
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
    });

    it('calculates size based on map dimensions and tile size', () => {
        const size = getIsoCanvasSize();
        const totalTiles = ISO_MAP_COLS + ISO_MAP_ROWS;
        expect(size.width).toBe(totalTiles * (ISO_TILE_WIDTH / 2));
        expect(size.height).toBe(totalTiles * (ISO_TILE_HEIGHT / 2));
    });
});

describe('getCameraOffset', () => {
    it('centers horizontally based on viewport width', () => {
        const offset = getCameraOffset(800, 600);
        expect(offset.x).toBe(400);
    });

    it('uses fixed vertical offset of 50', () => {
        const offset = getCameraOffset(800, 600);
        expect(offset.y).toBe(50);
    });

    it('adjusts to different viewport widths', () => {
        const offset1 = getCameraOffset(1920, 1080);
        const offset2 = getCameraOffset(1280, 720);
        expect(offset1.x).toBe(960);
        expect(offset2.x).toBe(640);
    });
});

describe('isoDepthCompare', () => {
    it('returns negative when a is closer to camera (lower depth)', () => {
        const a = { gridCol: 0, gridRow: 0 };
        const b = { gridCol: 5, gridRow: 5 };
        expect(isoDepthCompare(a, b)).toBeLessThan(0);
    });

    it('returns positive when a is further from camera (higher depth)', () => {
        const a = { gridCol: 10, gridRow: 10 };
        const b = { gridCol: 2, gridRow: 3 };
        expect(isoDepthCompare(a, b)).toBeGreaterThan(0);
    });

    it('returns zero for same depth', () => {
        const a = { gridCol: 3, gridRow: 7 };
        const b = { gridCol: 5, gridRow: 5 };
        expect(isoDepthCompare(a, b)).toBe(0);
    });

    it('sorts an array correctly for rendering order', () => {
        const entities = [
            { gridCol: 5, gridRow: 5 },
            { gridCol: 0, gridRow: 0 },
            { gridCol: 10, gridRow: 2 },
            { gridCol: 3, gridRow: 1 },
        ];
        const sorted = [...entities].sort(isoDepthCompare);
        expect(sorted[0]).toEqual({ gridCol: 0, gridRow: 0 });
        expect(sorted[sorted.length - 1]).toEqual({ gridCol: 10, gridRow: 2 });
    });
});

describe('getIsoDirection', () => {
    it('returns SE for moving right in grid (dx=1, dy=0)', () => {
        expect(getIsoDirection(1, 0)).toBe('SE');
    });

    it('returns NW for moving left in grid (dx=-1, dy=0)', () => {
        expect(getIsoDirection(-1, 0)).toBe('NW');
    });

    it('returns SW for moving down in grid (dx=0, dy=1)', () => {
        expect(getIsoDirection(0, 1)).toBe('SW');
    });

    it('returns NE for moving up in grid (dx=0, dy=-1)', () => {
        expect(getIsoDirection(0, -1)).toBe('NE');
    });

    it('returns SE for diagonal down-right (dx=1, dy=1)', () => {
        expect(getIsoDirection(1, 1)).toBe('SE');
    });

    it('returns SE fallback for diagonal up-left (dx=-1, dy=-1) where screenDx=0', () => {
        // dx=-1, dy=-1 => screenDx = (-1)-(-1) = 0, screenDy = (-1)+(-1) = -2
        // No condition matches screenDx=0, screenDy<0, so falls through to SE default
        expect(getIsoDirection(-1, -1)).toBe('SE');
    });

    it('returns SE as fallback for zero movement (dx=0, dy=0)', () => {
        expect(getIsoDirection(0, 0)).toBe('SE');
    });
});

describe('ISO_ROOMS', () => {
    it('contains all 5 zone types', () => {
        const zones = ISO_ROOMS.map((r) => r.zone);
        expect(zones).toContain('work');
        expect(zones).toContain('meeting');
        expect(zones).toContain('hallway');
        expect(zones).toContain('rest');
        expect(zones).toContain('entrance');
    });

    it('has valid grid positions within map bounds', () => {
        for (const room of ISO_ROOMS) {
            expect(room.gridCol).toBeGreaterThanOrEqual(0);
            expect(room.gridRow).toBeGreaterThanOrEqual(0);
            expect(room.gridCol + room.cols).toBeLessThanOrEqual(ISO_MAP_COLS);
            expect(room.gridRow + room.rows).toBeLessThanOrEqual(ISO_MAP_ROWS);
        }
    });

    it('has positive dimensions for all rooms', () => {
        for (const room of ISO_ROOMS) {
            expect(room.cols).toBeGreaterThan(0);
            expect(room.rows).toBeGreaterThan(0);
        }
    });
});
