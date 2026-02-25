import type { ProjectTheme } from '../../types/project';

export interface DraftSummary {
    rooms: number;
    collisionTiles: number;
    spawnPoints: number;
    agents: number;
    recipes: number;
    theme: string;
    generatedAt: string;
    method?: 'llm' | 'rule-based';
}

export interface DraftFile {
    filename: string;
    path: string;
    type: 'json' | 'image' | 'other';
    size: number;
}

/** Room definition from the server draft world data. */
export interface DraftRoom {
    id: string;
    name: string;
    type: string;
    width: number;
    height: number;
    x: number;
    y: number;
}

/** Zone definition from the server draft world data. */
export interface DraftZone {
    id: string;
    name: string;
    type: string;
}

/** Theme shape from the server draft (rule-based or LLM). */
export interface DraftThemeRaw {
    name?: string;
    primary_color?: string;
    secondary_color?: string;
    background?: string;
    palette?: ProjectTheme['palette'];
}

/** Agent shape from the server draft (may lack full AgentDefinition fields). */
export interface DraftAgent {
    id: string;
    name: string;
    role?: string;
    personality?: string;
    sprite?: string;
    skills?: string[];
    systemPrompt?: string;
}

/** Recipe shape from the server draft. */
export interface DraftRecipe {
    id: string;
    name: string;
    description?: string;
    command: string;
    args: string[];
    tags?: string[];
}

/** World data from the server draft. */
export interface DraftWorld {
    grid_size?: number;
    gridCols?: number;
    gridRows?: number;
    rooms?: DraftRoom[];
    zones?: DraftZone[];
}

/**
 * DA-5: DraftData now uses ProjectData-compatible types.
 * Extended to hold the full draft response including world data.
 */
export interface DraftData {
    summary: DraftSummary;
    prompt?: string;
    scope?: string;
    theme?: DraftThemeRaw;
    world?: DraftWorld;
    agents?: DraftAgent[];
    recipes?: DraftRecipe[];
}

export type FetchState = 'idle' | 'loading' | 'success' | 'error';
