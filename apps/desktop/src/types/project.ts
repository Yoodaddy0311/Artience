/**
 * project.json — S-6: Central data model for DogBa Studio
 * Defines the entire world state, agents, recipes, theme, and layout.
 * This is the single source of truth saved/loaded by Studio mode.
 */

export interface ProjectData {
    version: string;                  // Schema version, e.g. "1.0.0"
    meta: ProjectMeta;
    theme: ProjectTheme;
    world: WorldData;
    agents: AgentDefinition[];
    recipes: RecipeDefinition[];
    history: SnapshotMeta[];         // S-4: Version history references
}

// ── Meta ──
export interface ProjectMeta {
    id: string;
    name: string;
    description: string;
    createdAt: string;               // ISO 8601
    updatedAt: string;
    author: string;
}

// ── Theme ──
export interface ProjectTheme {
    palette: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        surface: string;
        text: string;
    };
    font: {
        heading: string;
        body: string;
    };
    buttonStyle: 'neo-brutal' | 'rounded' | 'flat';
}

// ── World (Grid + Layout) ──
export interface WorldData {
    gridCols: number;               // default 40
    gridRows: number;               // default 25
    tileSize: number;               // default 32
    layers: {
        floor: number[][];          // 0=empty, 1+=tile type
        wall: number[][];           // 0=no wall, 1=wall
        collision: number[][];      // 0=walkable, 1=blocked
        objects: WorldObject[];     // Furniture, decorations
        spawn: SpawnPoint[];        // Agent spawn positions
    };
}

export interface WorldObject {
    id: string;
    type: string;                   // "desk" | "chair" | "plant" | "whiteboard" | ...
    x: number;                      // Grid position
    y: number;
    width: number;
    height: number;
    rotation?: number;
    properties?: Record<string, unknown>;
}

export interface SpawnPoint {
    id: string;
    agentId: string;                // Links to agent definition
    x: number;
    y: number;
    zone: 'work' | 'meeting' | 'rest' | 'entrance';
}

// ── Agent Definition ──
export interface AgentDefinition {
    id: string;
    name: string;
    role: string;
    personality: string;
    sprite: string;                 // Path to sprite image or spritesheet
    spritesheetConfig?: {
        cols: number;
        rows: number;
        rowMapping: Record<string, number>;  // e.g. { idle: 0, walk: 1, run: 2 }
    };
    skills: string[];
    systemPrompt?: string;
}

// ── Recipe Definition ──
export interface RecipeDefinition {
    id: string;
    name: string;
    description: string;
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
    parserRules?: {
        thinkKeywords: string[];     // Triggers THINKING state
        runKeywords: string[];       // Triggers RUNNING state
    };
    timeout?: number;                // Max execution time in ms
    tags: string[];
}

// ── Version History Snapshot ──
export interface SnapshotMeta {
    id: string;
    createdAt: string;
    label: string;
    filePath: string;                // Path to history/{id}.json
}

// ── Default project ──
export const DEFAULT_PROJECT: ProjectData = {
    version: '1.0.0',
    meta: {
        id: 'default-project',
        name: '기본 오피스',
        description: 'DogBa Platform 기본 프로젝트',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'Artience',
    },
    theme: {
        palette: {
            primary: '#FFD100',
            secondary: '#9DE5DC',
            accent: '#E8DAFF',
            background: '#FFF8E7',
            surface: '#FFFFFF',
            text: '#18181B',
        },
        font: { heading: 'Pretendard', body: 'Pretendard' },
        buttonStyle: 'neo-brutal',
    },
    world: {
        gridCols: 40,
        gridRows: 25,
        tileSize: 32,
        layers: {
            floor: [],
            wall: [],
            collision: [],
            objects: [],
            spawn: [],
        },
    },
    agents: [],
    recipes: [],
    history: [],
};
