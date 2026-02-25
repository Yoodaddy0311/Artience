import { describe, it, expect } from 'vitest';
import {
    createDefaultWorld,
    findPath,
    getWalkableCells,
    getRandomWalkableNear,
    getNearestWalkable,
    GRID_COLS,
    GRID_ROWS,
    TileType,
} from '../grid-world';
import type { GridWorld, GridCell } from '../grid-world';

// ── Helper: create a small test grid with known layout ──
function createTestGrid(
    cols: number,
    rows: number,
    collisionPositions: { x: number; y: number }[] = [],
): GridWorld {
    const cells: GridCell[][] = [];
    for (let y = 0; y < rows; y++) {
        cells[y] = [];
        for (let x = 0; x < cols; x++) {
            cells[y][x] = {
                floor: TileType.FLOOR,
                wall: false,
                collision: false,
            };
        }
    }
    for (const pos of collisionPositions) {
        cells[pos.y][pos.x] = {
            floor: TileType.WALL,
            wall: true,
            collision: true,
        };
    }
    return { cols, rows, tileSize: 32, cells };
}

describe('grid-world', () => {
    // ── BinaryHeap (tested indirectly through findPath / A*) ──

    describe('BinaryHeap (via A* pathfinding)', () => {
        it('should find a path through a simple open grid (exercises push/pop ordering)', () => {
            const world = createTestGrid(5, 5);
            const path = findPath(world, 0, 0, 4, 4);

            expect(path.length).toBeGreaterThan(0);
            expect(path[0]).toEqual({ x: 0, y: 0 });
            expect(path[path.length - 1]).toEqual({ x: 4, y: 4 });
            // Manhattan distance is 8, so optimal path length is 9 nodes
            expect(path).toHaveLength(9);
        });

        it('should correctly prioritize lower-cost nodes (heap ordering)', () => {
            // Create a grid with a wall that forces a detour
            // The heap must correctly pop the minimum-f node to find optimal path
            const world = createTestGrid(5, 5, [
                { x: 2, y: 0 },
                { x: 2, y: 1 },
                { x: 2, y: 2 },
                { x: 2, y: 3 },
            ]);
            const path = findPath(world, 0, 0, 4, 0);

            expect(path.length).toBeGreaterThan(0);
            expect(path[0]).toEqual({ x: 0, y: 0 });
            expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
            // Must go around the wall: right to x=1, down to y=4, right past wall, up
            // Every cell in path should not be a collision cell
            for (const cell of path) {
                expect(world.cells[cell.y][cell.x].collision).toBe(false);
            }
        });

        it('should exercise updateOrPush when revisiting nodes with better costs', () => {
            // In a diamond-shaped opening, both paths to a node are considered
            // and the heap must update existing entries
            const world = createTestGrid(7, 7, [
                { x: 3, y: 1 },
                { x: 3, y: 2 },
                { x: 3, y: 4 },
                { x: 3, y: 5 },
            ]);
            const path = findPath(world, 0, 3, 6, 3);

            expect(path.length).toBeGreaterThan(0);
            expect(path[0]).toEqual({ x: 0, y: 3 });
            expect(path[path.length - 1]).toEqual({ x: 6, y: 3 });
        });
    });

    // ── getWalkableCells ──

    describe('getWalkableCells', () => {
        it('should return all cells in a fully open grid', () => {
            const world = createTestGrid(3, 3);
            const walkable = getWalkableCells(world);

            expect(walkable).toHaveLength(9);
        });

        it('should exclude collision cells', () => {
            const world = createTestGrid(3, 3, [
                { x: 1, y: 1 },
            ]);
            const walkable = getWalkableCells(world);

            expect(walkable).toHaveLength(8);
            expect(walkable.find((c) => c.x === 1 && c.y === 1)).toBeUndefined();
        });

        it('should exclude wall cells', () => {
            const world = createTestGrid(3, 3);
            // Manually set a wall without collision (though walls typically have collision too)
            world.cells[0][0].wall = true;
            const walkable = getWalkableCells(world);

            expect(walkable).toHaveLength(8);
            expect(walkable.find((c) => c.x === 0 && c.y === 0)).toBeUndefined();
        });

        it('should return cells from the default world', () => {
            const world = createDefaultWorld();
            const walkable = getWalkableCells(world);

            // The default world has walls, desks, and meeting table
            // Total cells: 40*25 = 1000
            // Should have significantly fewer walkable cells
            expect(walkable.length).toBeGreaterThan(0);
            expect(walkable.length).toBeLessThan(GRID_COLS * GRID_ROWS);
        });
    });

    // ── getRandomWalkableNear ──

    describe('getRandomWalkableNear', () => {
        it('should return a cell within the given Manhattan radius', () => {
            const world = createTestGrid(10, 10);
            const cx = 5;
            const cy = 5;
            const radius = 3;

            const result = getRandomWalkableNear(world, cx, cy, radius);
            expect(result).not.toBeNull();

            const dist = Math.abs(result!.x - cx) + Math.abs(result!.y - cy);
            expect(dist).toBeLessThanOrEqual(radius);
        });

        it('should return null if no walkable cells exist within radius', () => {
            // Create a grid where all cells near center are walls
            const world = createTestGrid(5, 5);
            // Block everything within radius 1 of (2,2) including (2,2)
            for (let y = 1; y <= 3; y++) {
                for (let x = 1; x <= 3; x++) {
                    world.cells[y][x].collision = true;
                    world.cells[y][x].wall = true;
                }
            }
            const result = getRandomWalkableNear(world, 2, 2, 1);
            expect(result).toBeNull();
        });

        it('should handle edge positions near grid boundaries', () => {
            const world = createTestGrid(5, 5);
            const result = getRandomWalkableNear(world, 0, 0, 2);

            expect(result).not.toBeNull();
            expect(result!.x).toBeGreaterThanOrEqual(0);
            expect(result!.y).toBeGreaterThanOrEqual(0);
        });

        it('should return a walkable (non-collision, non-wall) cell', () => {
            const world = createTestGrid(10, 10, [
                { x: 4, y: 5 },
                { x: 6, y: 5 },
            ]);

            // Run multiple times to increase confidence
            for (let i = 0; i < 20; i++) {
                const result = getRandomWalkableNear(world, 5, 5, 2);
                expect(result).not.toBeNull();
                const cell = world.cells[result!.y][result!.x];
                expect(cell.collision).toBe(false);
                expect(cell.wall).toBe(false);
            }
        });

        it('should only return the center cell when radius is 0', () => {
            const world = createTestGrid(5, 5);
            const result = getRandomWalkableNear(world, 2, 2, 0);

            expect(result).not.toBeNull();
            expect(result).toEqual({ x: 2, y: 2 });
        });
    });

    // ── getNearestWalkable ──

    describe('getNearestWalkable', () => {
        it('should return the same position if it is already walkable', () => {
            const world = createTestGrid(5, 5);
            const result = getNearestWalkable(world, 2, 2);

            expect(result).toEqual({ x: 2, y: 2 });
        });

        it('should find the nearest walkable cell when starting on a collision cell', () => {
            const world = createTestGrid(5, 5, [
                { x: 2, y: 2 },
            ]);
            const result = getNearestWalkable(world, 2, 2);

            // Should be one of the 4 adjacent cells
            const dist = Math.abs(result.x - 2) + Math.abs(result.y - 2);
            expect(dist).toBe(1);
            expect(world.cells[result.y][result.x].collision).toBe(false);
        });

        it('should handle starting at a wall cell', () => {
            const world = createTestGrid(5, 5);
            world.cells[0][0].wall = true;
            world.cells[0][0].collision = true;

            const result = getNearestWalkable(world, 0, 0);
            expect(world.cells[result.y][result.x].collision).toBe(false);
            expect(world.cells[result.y][result.x].wall).toBe(false);
        });

        it('should find walkable cell even when surrounded by walls', () => {
            const world = createTestGrid(5, 5, [
                { x: 1, y: 2 },
                { x: 3, y: 2 },
                { x: 2, y: 1 },
                { x: 2, y: 3 },
                { x: 2, y: 2 },
            ]);
            const result = getNearestWalkable(world, 2, 2);

            // BFS will find a walkable cell further out
            expect(world.cells[result.y][result.x].collision).toBe(false);
        });

        it('should work on the default world at known collision positions', () => {
            const world = createDefaultWorld();
            // Desk at (3, 3) is a collision object
            const result = getNearestWalkable(world, 3, 3);

            expect(world.cells[result.y][result.x].collision).toBe(false);
            expect(world.cells[result.y][result.x].wall).toBe(false);
        });
    });

    // ── A* Pathfinding (findPath) ──

    describe('findPath', () => {
        it('should find a straight-line path in an open grid', () => {
            const world = createTestGrid(5, 1);
            const path = findPath(world, 0, 0, 4, 0);

            expect(path).toEqual([
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 2, y: 0 },
                { x: 3, y: 0 },
                { x: 4, y: 0 },
            ]);
        });

        it('should return empty array when start is out of bounds', () => {
            const world = createTestGrid(5, 5);
            expect(findPath(world, -1, 0, 4, 4)).toEqual([]);
        });

        it('should return empty array when end is out of bounds', () => {
            const world = createTestGrid(5, 5);
            expect(findPath(world, 0, 0, 5, 5)).toEqual([]);
        });

        it('should return empty array when start is a collision cell', () => {
            const world = createTestGrid(5, 5, [{ x: 0, y: 0 }]);
            expect(findPath(world, 0, 0, 4, 4)).toEqual([]);
        });

        it('should return empty array when end is a collision cell', () => {
            const world = createTestGrid(5, 5, [{ x: 4, y: 4 }]);
            expect(findPath(world, 0, 0, 4, 4)).toEqual([]);
        });

        it('should return empty array when no path exists', () => {
            // Create a wall across the entire grid splitting it in two
            const walls = [];
            for (let y = 0; y < 5; y++) {
                walls.push({ x: 2, y });
            }
            const world = createTestGrid(5, 5, walls);
            expect(findPath(world, 0, 0, 4, 0)).toEqual([]);
        });

        it('should find a path around obstacles', () => {
            const world = createTestGrid(5, 5, [
                { x: 1, y: 0 },
                { x: 1, y: 1 },
                { x: 1, y: 2 },
            ]);
            const path = findPath(world, 0, 0, 2, 0);

            expect(path.length).toBeGreaterThan(0);
            expect(path[0]).toEqual({ x: 0, y: 0 });
            expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });
            // Verify no collision cells in path
            for (const cell of path) {
                expect(world.cells[cell.y][cell.x].collision).toBe(false);
            }
        });

        it('should return path of length 1 when start equals end', () => {
            const world = createTestGrid(5, 5);
            const path = findPath(world, 2, 2, 2, 2);

            expect(path).toEqual([{ x: 2, y: 2 }]);
        });

        it('should produce consecutive steps (no teleportation)', () => {
            const world = createTestGrid(10, 10, [
                { x: 5, y: 3 },
                { x: 5, y: 4 },
                { x: 5, y: 5 },
                { x: 5, y: 6 },
            ]);
            const path = findPath(world, 0, 5, 9, 5);

            for (let i = 1; i < path.length; i++) {
                const dx = Math.abs(path[i].x - path[i - 1].x);
                const dy = Math.abs(path[i].y - path[i - 1].y);
                // Each step should be exactly one cell in cardinal direction
                expect(dx + dy).toBe(1);
            }
        });

        it('should find a valid path in the default world between zones', () => {
            const world = createDefaultWorld();
            // Work zone cell (2, 2) to entrance zone cell (25, 20)
            const path = findPath(world, 2, 2, 25, 20);

            expect(path.length).toBeGreaterThan(0);
            expect(path[0]).toEqual({ x: 2, y: 2 });
            expect(path[path.length - 1]).toEqual({ x: 25, y: 20 });

            // Verify all path cells are walkable
            for (const cell of path) {
                expect(world.cells[cell.y][cell.x].collision).toBe(false);
            }
        });

        it('should find optimal path length (Manhattan distance in open grid)', () => {
            const world = createTestGrid(10, 10);
            const path = findPath(world, 0, 0, 9, 9);

            // Manhattan distance = 18, path length = 19 nodes
            expect(path).toHaveLength(19);
        });
    });
});
