/**
 * R-2: Grid World System — Tile-based world with collision detection
 * Implements: 40×25 grid, tile types, collision map, spawn points, and A* pathfinding
 */

export const TILE_SIZE = 32;
export const GRID_COLS = 40;
export const GRID_ROWS = 25;

// ── Tile Types ──
export enum TileType {
    EMPTY = 0,
    FLOOR = 1,
    FLOOR_WOOD = 2,
    FLOOR_CARPET = 3,
    WALL = 10,
    WALL_WINDOW = 11,
    DOOR = 12,
}

// ── Zone Types (for waypoint targeting) ──
export type ZoneType = 'work' | 'meeting' | 'rest' | 'entrance' | 'hallway';

export interface GridCell {
    floor: TileType;
    wall: boolean;
    collision: boolean;
    zone?: ZoneType;
    objectId?: string;
}

export interface GridWorld {
    cols: number;
    rows: number;
    tileSize: number;
    cells: GridCell[][];
}

// ── Binary Heap (min-heap) for A* open set ──
class BinaryHeap<T> {
    private items: T[] = [];
    constructor(private compare: (a: T, b: T) => number) {}

    get size() { return this.items.length; }

    push(item: T) {
        this.items.push(item);
        this.siftUp(this.items.length - 1);
    }

    pop(): T | undefined {
        if (!this.items.length) return undefined;
        const top = this.items[0];
        const last = this.items.pop()!;
        if (this.items.length > 0) {
            this.items[0] = last;
            this.siftDown(0);
        }
        return top;
    }

    /** Update an existing item or push if not found. Returns true if updated. */
    updateOrPush(item: T, match: (a: T, b: T) => boolean): boolean {
        for (let i = 0; i < this.items.length; i++) {
            if (match(this.items[i], item)) {
                this.items[i] = item;
                this.siftUp(i);
                this.siftDown(i);
                return true;
            }
        }
        this.push(item);
        return false;
    }

    find(predicate: (item: T) => boolean): T | undefined {
        return this.items.find(predicate);
    }

    private siftUp(i: number) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.compare(this.items[i], this.items[parent]) >= 0) break;
            [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
            i = parent;
        }
    }

    private siftDown(i: number) {
        const n = this.items.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
            if (right < n && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
            if (smallest === i) break;
            [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
            i = smallest;
        }
    }
}

// ── A* Pathfinding ──
interface AStarNode {
    x: number;
    y: number;
    g: number;        // cost from start
    h: number;        // heuristic to end
    f: number;        // g + h
    parent: AStarNode | null;
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
    return Math.abs(ax - bx) + Math.abs(ay - by); // Manhattan distance
}

/**
 * A* pathfinding on a grid world.
 * Returns array of {x, y} grid positions from start to end, or empty array if no path.
 */
export function findPath(
    world: GridWorld,
    startX: number, startY: number,
    endX: number, endY: number
): { x: number; y: number }[] {
    // Bounds check
    if (startX < 0 || startX >= world.cols || startY < 0 || startY >= world.rows) return [];
    if (endX < 0 || endX >= world.cols || endY < 0 || endY >= world.rows) return [];
    if (world.cells[startY]?.[startX]?.collision || world.cells[endY]?.[endX]?.collision) return [];

    const openSet = new BinaryHeap<AStarNode>((a, b) => a.f - b.f);
    const closedSet = new Set<string>();
    const key = (x: number, y: number) => `${x},${y}`;

    const startNode: AStarNode = {
        x: startX, y: startY,
        g: 0, h: heuristic(startX, startY, endX, endY),
        f: heuristic(startX, startY, endX, endY),
        parent: null,
    };
    openSet.push(startNode);

    while (openSet.size > 0) {
        // Pop node with lowest f score (O(log n) instead of O(n log n) sort)
        const current = openSet.pop()!;

        // Reached destination
        if (current.x === endX && current.y === endY) {
            const path: { x: number; y: number }[] = [];
            let node: AStarNode | null = current;
            while (node) {
                path.unshift({ x: node.x, y: node.y });
                node = node.parent;
            }
            return path;
        }

        closedSet.add(key(current.x, current.y));

        // Check 4 neighbors (no diagonal)
        const neighbors = [
            { x: current.x - 1, y: current.y },
            { x: current.x + 1, y: current.y },
            { x: current.x, y: current.y - 1 },
            { x: current.x, y: current.y + 1 },
        ];

        for (const n of neighbors) {
            if (n.x < 0 || n.x >= world.cols || n.y < 0 || n.y >= world.rows) continue;
            if (closedSet.has(key(n.x, n.y))) continue;
            if (world.cells[n.y]?.[n.x]?.collision) continue;

            const g = current.g + 1;
            const h = heuristic(n.x, n.y, endX, endY);
            const f = g + h;

            // Check if already in openSet with better score
            const existing = openSet.find(o => o.x === n.x && o.y === n.y);
            if (existing && existing.g <= g) continue;

            const newNode: AStarNode = { x: n.x, y: n.y, g, h, f, parent: current };
            if (existing) {
                openSet.updateOrPush(newNode, (a, b) => a.x === b.x && a.y === b.y);
            } else {
                openSet.push(newNode);
            }
        }
    }

    return []; // No path found
}

/**
 * Create a default office layout for the grid world.
 * Generates rooms, hallways, desks, and spawn points.
 */
export function createDefaultWorld(): GridWorld {
    const cells: GridCell[][] = [];

    // Initialize all cells as FLOOR
    for (let y = 0; y < GRID_ROWS; y++) {
        cells[y] = [];
        for (let x = 0; x < GRID_COLS; x++) {
            cells[y][x] = {
                floor: TileType.FLOOR,
                wall: false,
                collision: false,
            };
        }
    }

    // ── Outer walls ──
    for (let x = 0; x < GRID_COLS; x++) {
        cells[0][x] = { floor: TileType.WALL, wall: true, collision: true };
        cells[GRID_ROWS - 1][x] = { floor: TileType.WALL, wall: true, collision: true };
    }
    for (let y = 0; y < GRID_ROWS; y++) {
        cells[y][0] = { floor: TileType.WALL, wall: true, collision: true };
        cells[y][GRID_COLS - 1] = { floor: TileType.WALL, wall: true, collision: true };
    }

    // ── Work Zone (top-left room: cols 1-18, rows 1-11) ──
    for (let y = 1; y <= 11; y++) {
        for (let x = 1; x <= 18; x++) {
            cells[y][x].zone = 'work';
            cells[y][x].floor = TileType.FLOOR_WOOD;
        }
    }
    // Divider wall
    for (let y = 1; y <= 11; y++) {
        if (y === 5 || y === 6) continue; // Door gap
        cells[y][19] = { floor: TileType.WALL, wall: true, collision: true };
    }
    // Bottom wall of work zone
    for (let x = 1; x <= 18; x++) {
        if (x === 8 || x === 9) continue; // Door gap
        cells[12][x] = { floor: TileType.WALL, wall: true, collision: true };
    }

    // ── Meeting Zone (top-right room: cols 20-38, rows 1-11) ──
    for (let y = 1; y <= 11; y++) {
        for (let x = 20; x <= 38; x++) {
            cells[y][x].zone = 'meeting';
            cells[y][x].floor = TileType.FLOOR_CARPET;
        }
    }
    for (let x = 20; x <= 38; x++) {
        if (x === 28 || x === 29) continue;
        cells[12][x] = { floor: TileType.WALL, wall: true, collision: true };
    }

    // ── Hallway (middle strip: rows 13-16) ──
    for (let y = 13; y <= 16; y++) {
        for (let x = 1; x <= 38; x++) {
            cells[y][x].zone = 'hallway';
        }
    }

    // ── Rest Zone (bottom-left: cols 1-18, rows 17-23) ──
    for (let y = 17; y <= 23; y++) {
        for (let x = 1; x <= 18; x++) {
            cells[y][x].zone = 'rest';
            cells[y][x].floor = TileType.FLOOR_CARPET;
        }
    }
    for (let y = 17; y <= 23; y++) {
        if (y === 19 || y === 20) continue;
        cells[y][19] = { floor: TileType.WALL, wall: true, collision: true };
    }
    for (let x = 1; x <= 18; x++) {
        if (x === 8 || x === 9) continue;
        cells[17][x] = { floor: TileType.WALL, wall: true, collision: true, zone: undefined };
    }

    // ── Entrance Zone (bottom-right: cols 20-38, rows 17-23) ──
    for (let y = 17; y <= 23; y++) {
        for (let x = 20; x <= 38; x++) {
            cells[y][x].zone = 'entrance';
        }
    }
    for (let x = 20; x <= 38; x++) {
        if (x === 28 || x === 29) continue;
        cells[17][x] = { floor: TileType.WALL, wall: true, collision: true, zone: undefined };
    }

    // ── Desks (collision objects in work zone) ──
    const deskPositions = [
        [3, 3], [3, 5], [3, 7], [3, 9],
        [8, 3], [8, 5], [8, 7], [8, 9],
        [13, 3], [13, 5], [13, 7], [13, 9],
    ];
    for (const [x, y] of deskPositions) {
        cells[y][x].collision = true;
        cells[y][x].objectId = `desk-${x}-${y}`;
    }

    // ── Meeting table (center of meeting room) ──
    for (let x = 27; x <= 31; x++) {
        for (let y = 5; y <= 7; y++) {
            cells[y][x].collision = true;
            cells[y][x].objectId = 'meeting-table';
        }
    }

    return { cols: GRID_COLS, rows: GRID_ROWS, tileSize: TILE_SIZE, cells };
}

/**
 * Validate that all zones are reachable from the entrance.
 * Returns {valid, unreachable} — unreachable lists zones that can't be reached.
 */
export function validateWorld(world: GridWorld): { valid: boolean; unreachable: ZoneType[] } {
    // Find entrance spawn point
    let startX = 29, startY = 20; // Default entrance position
    for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
            if (world.cells[y][x].zone === 'entrance' && !world.cells[y][x].collision) {
                startX = x; startY = y; break;
            }
        }
    }

    // BFS flood fill from entrance
    const visited = new Set<string>();
    const queue = [{ x: startX, y: startY }];
    const reachedZones = new Set<ZoneType>();

    while (queue.length > 0) {
        const { x, y } = queue.shift()!;
        const k = `${x},${y}`;
        if (visited.has(k)) continue;
        visited.add(k);

        const cell = world.cells[y]?.[x];
        if (!cell || cell.collision) continue;
        if (cell.zone) reachedZones.add(cell.zone);

        queue.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 });
    }

    const allZones: ZoneType[] = ['work', 'meeting', 'rest', 'entrance', 'hallway'];
    const unreachable = allZones.filter(z => !reachedZones.has(z));

    return { valid: unreachable.length === 0, unreachable };
}

// ── Helper: collect all walkable cells ──
export function getWalkableCells(world: GridWorld): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = [];
    for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
            const cell = world.cells[y][x];
            if (!cell.collision && !cell.wall) {
                result.push({ x, y });
            }
        }
    }
    return result;
}

// ── Helper: collect walkable cells within a specific zone ──
export function getZoneCells(world: GridWorld, zone: ZoneType): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = [];
    for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
            const cell = world.cells[y][x];
            if (cell.zone === zone && !cell.collision && !cell.wall) {
                result.push({ x, y });
            }
        }
    }
    return result;
}

// ── Helper: find nearest walkable cell to a given position ──
export function getNearestWalkable(world: GridWorld, px: number, py: number): { x: number; y: number } {
    // If the given cell is already walkable, return it
    if (
        px >= 0 && px < world.cols && py >= 0 && py < world.rows &&
        !world.cells[py][px].collision && !world.cells[py][px].wall
    ) {
        return { x: px, y: py };
    }
    // BFS outward to find nearest walkable
    const visited = new Set<string>();
    const queue: { x: number; y: number }[] = [{ x: px, y: py }];
    while (queue.length > 0) {
        const cur = queue.shift()!;
        const k = `${cur.x},${cur.y}`;
        if (visited.has(k)) continue;
        visited.add(k);
        if (cur.x < 0 || cur.x >= world.cols || cur.y < 0 || cur.y >= world.rows) continue;
        const cell = world.cells[cur.y][cur.x];
        if (!cell.collision && !cell.wall) return { x: cur.x, y: cur.y };
        queue.push(
            { x: cur.x - 1, y: cur.y },
            { x: cur.x + 1, y: cur.y },
            { x: cur.x, y: cur.y - 1 },
            { x: cur.x, y: cur.y + 1 },
        );
    }
    // Fallback: center of the map
    return { x: Math.floor(world.cols / 2), y: Math.floor(world.rows / 2) };
}

// ── Helper: get a random walkable cell within Manhattan radius of a point ──
export function getRandomWalkableNear(
    world: GridWorld,
    cx: number,
    cy: number,
    radius: number,
): { x: number; y: number } | null {
    const candidates: { x: number; y: number }[] = [];
    const minX = Math.max(0, cx - radius);
    const maxX = Math.min(world.cols - 1, cx + radius);
    const minY = Math.max(0, cy - radius);
    const maxY = Math.min(world.rows - 1, cy + radius);
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (Math.abs(x - cx) + Math.abs(y - cy) > radius) continue;
            const cell = world.cells[y][x];
            if (!cell.collision && !cell.wall) {
                candidates.push({ x, y });
            }
        }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}
