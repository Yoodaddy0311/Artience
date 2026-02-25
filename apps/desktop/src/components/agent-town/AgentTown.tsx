import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { type AgentState } from '../../types/platform';
import {
    createDefaultWorld,
    findPath,
    TILE_SIZE,
    TileType,
    type ZoneType,
    type GridWorld,
    getWalkableCells,
    getZoneCells,
    getNearestWalkable,
    getRandomWalkableNear,
} from '../../systems/grid-world';
import { useAppStore } from '../../store/useAppStore';
import { DEFAULT_AGENTS, type AgentProfile } from '../../types/platform';

const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;

// State colors for name label background
const STATE_COLORS: Record<string, number> = {
    IDLE: 0x9ca3af,
    WALK: 0x60a5fa,
    THINKING: 0xfbbf24,
    RUNNING: 0x22c55e,
    SUCCESS: 0x34d399,
    ERROR: 0xef4444,
    NEEDS_INPUT: 0xa855f7,
};

const STATE_COLORS_CSS: Record<string, string> = {
    IDLE: '#9ca3af',
    WALK: '#60a5fa',
    THINKING: '#fbbf24',
    RUNNING: '#22c55e',
    SUCCESS: '#34d399',
    ERROR: '#ef4444',
    NEEDS_INPUT: '#a855f7',
};

const STATE_LABELS: Record<AgentState, string> = {
    IDLE: '\uB300\uAE30',
    WALK: '\uC774\uB3D9',
    THINKING: '\uACE0\uBBFC \uC911',
    RUNNING: '\uC791\uC5C5 \uC911',
    SUCCESS: '\uC131\uACF5',
    ERROR: '\uC624\uB958',
    NEEDS_INPUT: '\uC785\uB825 \uB300\uAE30',
};

const RACCOON_AGENT_ID = 'raccoon';

// P2-12: Zone display names (Korean)
const ZONE_LABELS: Record<ZoneType, string> = {
    work: 'WORK ZONE',
    meeting: 'MEETING',
    rest: 'REST AREA',
    entrance: 'ENTRANCE',
    hallway: 'HALLWAY',
};

// P2-12: Zone label tint colors
const ZONE_LABEL_COLORS: Record<ZoneType, number> = {
    work: 0xfde68a,
    meeting: 0xa7f3d0,
    rest: 0xbfdbfe,
    entrance: 0xfecaca,
    hallway: 0xe5e7eb,
};

// ── Agent movement constants ──
const AGENT_SPEED_TILES_PER_SEC = 2; // 2 tiles per second
const AGENT_SPEED_PX = AGENT_SPEED_TILES_PER_SEC * TILE_SIZE / TARGET_FPS; // pixels per frame
const IDLE_WANDER_RADIUS = 5; // tiles
const IDLE_PAUSE_MIN_MS = 2000;
const IDLE_PAUSE_MAX_MS = 5000;
const SUCCESS_ANIM_FRAMES = 72; // ~1.2s at 60fps
const ERROR_ANIM_FRAMES = 72;
const AGENT_SPRITE_HEIGHT = 48; // target sprite height in pixels
const STAGGER_DELAY_MS = 80; // ms between initial path calculations

interface LogItem {
    ts: number;
    text: string;
    state: AgentState;
}

interface InspectorData {
    visible: boolean;
    screenX: number;
    screenY: number;
}

// ── Per-agent runtime state (mutable, not React state) ──
interface AgentRuntime {
    id: string;
    name: string;
    profile: AgentProfile;
    state: AgentState;
    // PIXI objects
    container: PIXI.Container;
    sprite: PIXI.Sprite;
    shadow: PIXI.Graphics;
    nameLabel: PIXI.Text;
    stateDot: PIXI.Graphics;
    // Pathfinding
    gridX: number;
    gridY: number;
    path: { x: number; y: number }[]; // pixel coords
    // Pause / state timers
    pauseTimer: number; // frames remaining in pause
    stateAnimTimer: number; // frames since entering SUCCESS/ERROR
    // Movement
    baseScaleX: number;
    // Speech bubble
    bubbleContainer: PIXI.Container | null;
    bubbleFadeTimer: number;
    bubbleFading: boolean;
    // Error flash
    errorFlashTimer: number;
}

export const AgentTown: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [inspector, setInspector] = useState<InspectorData>({ visible: false, screenX: 0, screenY: 0 });
    const [raccoonDisplayState, setRaccoonDisplayState] = useState<AgentState>('IDLE');
    const [logs, setLogs] = useState<LogItem[]>([]);

    // P2-9: Highlight store subscription
    const highlightedAgentId = useAppStore((s) => s.highlightedAgentId);
    const setHighlightedAgentId = useAppStore((s) => s.setHighlightedAgentId);

    // Ref to expose raccoon container position for inspector card placement
    const raccoonScreenPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // P2-9: Refs for highlight effect (managed inside PIXI, controlled from React)
    const highlightGlowRef = useRef<PIXI.Graphics | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleRaccoonClick = useCallback(() => {
        const pos = raccoonScreenPosRef.current;
        setInspector(prev => {
            if (prev.visible) {
                return { visible: false, screenX: 0, screenY: 0 };
            }
            return { visible: true, screenX: pos.x, screenY: pos.y };
        });
    }, []);

    const closeInspector = useCallback(() => {
        setInspector({ visible: false, screenX: 0, screenY: 0 });
    }, []);

    // P2-9: Handle highlight changes from store
    useEffect(() => {
        const glow = highlightGlowRef.current;
        if (!glow) return;

        if (highlightedAgentId === RACCOON_AGENT_ID) {
            glow.visible = true;
            glow.alpha = 1;

            // Auto-dismiss after 3 seconds
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = setTimeout(() => {
                setHighlightedAgentId(null);
            }, 3000);
        } else {
            glow.visible = false;
        }

        return () => {
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        };
    }, [highlightedAgentId, setHighlightedAgentId]);

    useEffect(() => {
        let isMounted = true;
        let wsRef: WebSocket | null = null;
        let reconnectTimerRef: ReturnType<typeof setTimeout> | null = null;

        const initPixi = async () => {
            try {
                if (!containerRef.current) return;

                // Optional: Destroy existing app
                const existingCanvas = containerRef.current.querySelector('canvas');
                if (existingCanvas) existingCanvas.remove();

                const app = new PIXI.Application();
                appRef.current = app as any;
                await app.init({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                    backgroundColor: 0xfdfaf6,
                    resolution: window.devicePixelRatio || 1,
                    autoDensity: true,
                    antialias: true,
                });

                if (!isMounted) return;
                containerRef.current.appendChild(app.canvas);

                const W = app.canvas.width / app.renderer.resolution;
                const H = app.canvas.height / app.renderer.resolution;

                // ── Grid World Generation ──
                const gridWorld = createDefaultWorld();

                // Pre-compute walkable cells and zone cells for performance
                const allWalkable = getWalkableCells(gridWorld);
                const zoneCellsCache: Record<string, { x: number; y: number }[]> = {};
                const getZoneCellsCached = (zone: ZoneType): { x: number; y: number }[] => {
                    if (!zoneCellsCache[zone]) {
                        zoneCellsCache[zone] = getZoneCells(gridWorld, zone);
                    }
                    return zoneCellsCache[zone];
                };

                // ── Grid Background with Walls/Desks ──
                const grid = new PIXI.Graphics();

                // Draw grid lines
                for (let x = 0; x <= W; x += TILE_SIZE) { grid.moveTo(x, 0); grid.lineTo(x, H); }
                for (let y = 0; y <= H; y += TILE_SIZE) { grid.moveTo(0, y); grid.lineTo(W, y); }
                grid.stroke({ width: 1, color: 0xe2e8f0, alpha: 0.5 });

                // Draw Walls, Desks, and Zone tints
                gridWorld.cells.forEach((row, y) => {
                    row.forEach((cell, x) => {
                        if (cell.wall || cell.collision) {
                            grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                            grid.fill({ color: cell.wall ? 0x94a3b8 : 0xd1d5db, alpha: cell.wall ? 0.3 : 0.5 });
                        } else if (cell.zone === 'work') {
                            grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                            grid.fill({ color: 0xfde68a, alpha: 0.1 });
                        } else if (cell.zone === 'meeting') {
                            grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                            grid.fill({ color: 0xa7f3d0, alpha: 0.1 });
                        } else if (cell.zone === 'rest') {
                            grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                            grid.fill({ color: 0xbfdbfe, alpha: 0.1 });
                        } else if (cell.zone === 'entrance') {
                            grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                            grid.fill({ color: 0xfecaca, alpha: 0.1 });
                        } else if (cell.zone === 'hallway') {
                            grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                            grid.fill({ color: 0xe5e7eb, alpha: 0.06 });
                        }
                    });
                });

                app.stage.addChild(grid);

                // ── P2-12: Zone Name Labels ──
                // Compute zone bounding boxes
                const zoneBounds: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {};
                gridWorld.cells.forEach((row, y) => {
                    row.forEach((cell, x) => {
                        if (cell.zone && !cell.wall && !cell.collision) {
                            if (!zoneBounds[cell.zone]) {
                                zoneBounds[cell.zone] = { minX: x, minY: y, maxX: x, maxY: y };
                            } else {
                                const b = zoneBounds[cell.zone];
                                if (x < b.minX) b.minX = x;
                                if (y < b.minY) b.minY = y;
                                if (x > b.maxX) b.maxX = x;
                                if (y > b.maxY) b.maxY = y;
                            }
                        }
                    });
                });

                for (const [zone, bounds] of Object.entries(zoneBounds)) {
                    const zoneType = zone as ZoneType;
                    const label = ZONE_LABELS[zoneType] || zone.toUpperCase();
                    const centerX = ((bounds.minX + bounds.maxX + 1) / 2) * TILE_SIZE;
                    const topY = bounds.minY * TILE_SIZE + 6;

                    const zoneLabelContainer = new PIXI.Container();
                    zoneLabelContainer.x = centerX;
                    zoneLabelContainer.y = topY;

                    // Label text
                    const labelText = new PIXI.Text({
                        text: label,
                        style: {
                            fontSize: 11,
                            fontFamily: 'system-ui, sans-serif',
                            fontWeight: '900',
                            fill: 0x18181b,
                            letterSpacing: 1.5,
                        },
                    });
                    labelText.anchor.set(0.5, 0);

                    // Background rectangle (Neo-Brutalist)
                    const padding = 6;
                    const bgWidth = labelText.width + padding * 2;
                    const bgHeight = labelText.height + padding;
                    const bg = new PIXI.Graphics();
                    bg.roundRect(-bgWidth / 2, -padding / 2, bgWidth, bgHeight, 3);
                    bg.fill({ color: ZONE_LABEL_COLORS[zoneType] || 0xffffff, alpha: 0.7 });
                    bg.stroke({ width: 2, color: 0x18181b, alpha: 0.4 });

                    zoneLabelContainer.addChild(bg);
                    zoneLabelContainer.addChild(labelText);
                    app.stage.addChild(zoneLabelContainer);
                }

                // ══════════════════════════════════════════════════════
                // ── RACCOON: Spritesheet Character (kept as-is) ──
                // ══════════════════════════════════════════════════════
                const SPRITESHEET_PATH = '/assets/characters/raccoon_spritesheet.png';
                const COLS = 5;
                const ROWS = 3;
                let raccoonFrameIndex = 0;
                let raccoonAnimRow = 0; // 0=idle, 1=walk-back, 2=walk-front
                let raccoonFrameTimer = 0;
                let raccoonContainer: PIXI.Container | null = null;
                let raccoonSprite: PIXI.Sprite | null = null;
                let raccoonShadow: PIXI.Graphics | null = null;
                let raccoonFrames: PIXI.Texture[][] = []; // [row][col]
                let raccoonLabel: PIXI.Text | null = null;
                let raccoonStateDotGfx: PIXI.Graphics | null = null;
                let raccoonBaseScaleX = 1;
                let raccoonStateDotNeedsRecalc = true;

                // Raccoon state management
                let raccoonState: AgentState = 'IDLE';
                let raccoonStateAnimTimer = 0; // For SUCCESS/ERROR auto-reset

                // P2-11: Speech bubble state
                let raccoonBubbleContainer: PIXI.Container | null = null;
                let raccoonBubbleFadeTimer = 0;
                let raccoonBubbleFading = false;
                const BUBBLE_DISPLAY_FRAMES = 210; // ~3.5 seconds at 60fps
                const BUBBLE_FADE_FRAMES = 60; // ~1 second fade

                // Waypoint-based walking state
                let raccoonPath: { x: number, y: number }[] = [];
                let raccoonPauseTimer = 0;
                const RACCOON_SPEED = 1.8; // pixels per frame
                const RACCOON_PAUSE_FRAMES = 90; // ~1.5 seconds pause at waypoint

                const ROW_LABELS = [
                    'Row 1: Idle/Work',
                    'Row 2: Walk Back',
                    'Row 3: Walk Front',
                ];

                const pickNewDestination = () => {
                    if (allWalkable.length === 0) return;
                    const targetCell = allWalkable[Math.floor(Math.random() * allWalkable.length)];

                    // Current grid position
                    const startX = Math.floor(Math.max(0, Math.min(W, raccoonContainer?.x || W / 2)) / TILE_SIZE);
                    const startY = Math.floor(Math.max(0, Math.min(H, raccoonContainer?.y || H / 2)) / TILE_SIZE);

                    // Keep coords within safe bounds
                    const safeStartX = Math.max(0, Math.min(gridWorld.cols - 1, startX));
                    const safeStartY = Math.max(0, Math.min(gridWorld.rows - 1, startY));

                    const path = findPath(gridWorld, safeStartX, safeStartY, targetCell.x, targetCell.y);

                    // Convert path to pixel coordinates (center of tile)
                    raccoonPath = path.map(p => ({
                        x: (p.x + 0.5) * TILE_SIZE,
                        y: (p.y + 0.5) * TILE_SIZE
                    }));
                };

                // Navigate raccoon to a specific zone using A* pathfinding
                const pickZoneDestination = (zone: ZoneType) => {
                    const zoneCells = getZoneCellsCached(zone);

                    if (zoneCells.length === 0) {
                        pickNewDestination();
                        return;
                    }

                    const targetCell = zoneCells[Math.floor(Math.random() * zoneCells.length)];

                    const startX = Math.floor(Math.max(0, Math.min(W, raccoonContainer?.x || W / 2)) / TILE_SIZE);
                    const startY = Math.floor(Math.max(0, Math.min(H, raccoonContainer?.y || H / 2)) / TILE_SIZE);
                    const safeStartX = Math.max(0, Math.min(gridWorld.cols - 1, startX));
                    const safeStartY = Math.max(0, Math.min(gridWorld.rows - 1, startY));

                    const path = findPath(gridWorld, safeStartX, safeStartY, targetCell.x, targetCell.y);

                    raccoonPath = path.map(p => ({
                        x: (p.x + 0.5) * TILE_SIZE,
                        y: (p.y + 0.5) * TILE_SIZE
                    }));
                };

                // Update raccoon state dot visual
                const updateRaccoonStateDot = (state: AgentState) => {
                    if (!raccoonStateDotGfx) return;
                    raccoonStateDotGfx.clear();
                    raccoonStateDotGfx.circle(0, 0, 5);
                    raccoonStateDotGfx.fill(STATE_COLORS[state] || STATE_COLORS.IDLE);
                };

                // P2-11: Show speech bubble above raccoon
                const showRaccoonBubble = (text: string) => {
                    if (!raccoonContainer) return;

                    // Remove existing bubble
                    if (raccoonBubbleContainer) {
                        raccoonContainer.removeChild(raccoonBubbleContainer);
                        raccoonBubbleContainer = null;
                    }

                    const bubble = new PIXI.Container();
                    bubble.y = -130;

                    // Text content
                    const truncatedText = text.length > 40 ? text.slice(0, 40) + '...' : text;
                    const bubbleText = new PIXI.Text({
                        text: truncatedText,
                        style: {
                            fontSize: 11,
                            fontFamily: 'system-ui, sans-serif',
                            fontWeight: '700',
                            fill: 0x18181b,
                            wordWrap: true,
                            wordWrapWidth: 140,
                        },
                    });
                    bubbleText.anchor.set(0.5, 0.5);

                    // Background (Neo-Brutalist: white bg, black 2px border, rounded)
                    const padX = 10;
                    const padY = 8;
                    const bg = new PIXI.Graphics();
                    const bw = bubbleText.width + padX * 2;
                    const bh = bubbleText.height + padY * 2;
                    bg.roundRect(-bw / 2, -bh / 2, bw, bh, 6);
                    bg.fill({ color: 0xffffff, alpha: 1 });
                    bg.stroke({ width: 2, color: 0x18181b });

                    // Speech bubble tail (triangle pointing down)
                    bg.moveTo(-6, bh / 2);
                    bg.lineTo(0, bh / 2 + 8);
                    bg.lineTo(6, bh / 2);
                    bg.closePath();
                    bg.fill({ color: 0xffffff });
                    bg.stroke({ width: 2, color: 0x18181b });

                    bubble.addChild(bg);
                    bubble.addChild(bubbleText);
                    bubble.alpha = 1;

                    raccoonContainer.addChild(bubble);
                    raccoonBubbleContainer = bubble;
                    raccoonBubbleFadeTimer = 0;
                    raccoonBubbleFading = false;
                };

                try {
                    const sheetTexture = await PIXI.Assets.load(SPRITESHEET_PATH);
                    if (!isMounted) return;

                    const frameW = Math.floor(sheetTexture.width / COLS);
                    const frameH = Math.floor(sheetTexture.height / ROWS);

                    // Slice into individual frame textures
                    raccoonFrames = [];
                    for (let row = 0; row < ROWS; row++) {
                        const rowFrames: PIXI.Texture[] = [];
                        for (let col = 0; col < COLS; col++) {
                            const rect = new PIXI.Rectangle(col * frameW, row * frameH, frameW, frameH);
                            const frameTex = new PIXI.Texture({ source: sheetTexture.source, frame: rect });
                            rowFrames.push(frameTex);
                        }
                        raccoonFrames.push(rowFrames);
                    }

                    // Create raccoon container
                    raccoonContainer = new PIXI.Container();
                    raccoonContainer.x = W / 2;
                    raccoonContainer.y = H / 2;

                    // Make raccoon clickable (PixiJS v8 API)
                    raccoonContainer.eventMode = 'static';
                    raccoonContainer.cursor = 'pointer';
                    raccoonContainer.on('pointertap', () => {
                        if (!raccoonContainer) return;
                        // Get the global position of the raccoon on the canvas
                        const canvasRect = app.canvas.getBoundingClientRect();
                        const screenX = canvasRect.left + (raccoonContainer.x * canvasRect.width / W);
                        const screenY = canvasRect.top + (raccoonContainer.y * canvasRect.height / H);
                        raccoonScreenPosRef.current = { x: screenX, y: screenY };
                        handleRaccoonClick();
                    });

                    // P2-9: Highlight glow (initially hidden)
                    const highlightGlow = new PIXI.Graphics();
                    highlightGlow.circle(0, -40, 60);
                    highlightGlow.fill({ color: 0xffd100, alpha: 0.25 });
                    highlightGlow.visible = false;
                    raccoonContainer.addChildAt(highlightGlow, 0);
                    highlightGlowRef.current = highlightGlow;

                    // Shadow ellipse (drawn at the feet)
                    raccoonShadow = new PIXI.Graphics();
                    raccoonShadow.ellipse(0, 0, 24, 8);
                    raccoonShadow.fill({ color: 0x000000, alpha: 0.15 });
                    raccoonShadow.y = 2;
                    raccoonContainer.addChild(raccoonShadow);

                    // Raccoon sprite (start with first frame)
                    raccoonSprite = new PIXI.Sprite(raccoonFrames[0][0]);
                    raccoonSprite.anchor.set(0.5, 1);
                    const raccoonScale = 100 / frameH;
                    raccoonSprite.scale.set(raccoonScale);
                    raccoonBaseScaleX = raccoonSprite.scale.x;
                    raccoonContainer.addChild(raccoonSprite);

                    // Name label
                    const raccoonName = new PIXI.Text({
                        text: 'Raccoon',
                        style: { fontSize: 12, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', fill: 0x5c4033 }
                    });
                    raccoonName.anchor.set(0.5, 0);
                    raccoonName.y = 6;
                    raccoonContainer.addChild(raccoonName);

                    // State dot (above name label, to the right)
                    raccoonStateDotGfx = new PIXI.Graphics();
                    raccoonStateDotGfx.circle(0, 0, 5);
                    raccoonStateDotGfx.fill(STATE_COLORS.IDLE);
                    raccoonStateDotGfx.x = raccoonName.width / 2 + 10;
                    raccoonStateDotGfx.y = 13;
                    raccoonContainer.addChild(raccoonStateDotGfx);

                    // Animation label (debug only)
                    raccoonLabel = new PIXI.Text({
                        text: ROW_LABELS[0],
                        style: { fontSize: 14, fontFamily: 'system-ui, sans-serif', fontWeight: '800', fill: 0x18181b }
                    });
                    raccoonLabel.anchor.set(0.5, 1);
                    raccoonLabel.y = -110;
                    raccoonLabel.visible = import.meta.env.DEV;
                    raccoonContainer.addChild(raccoonLabel);

                    app.stage.addChild(raccoonContainer);

                    // Set hit area to make clicking easier
                    raccoonContainer.hitArea = new PIXI.Rectangle(-50, -120, 100, 140);

                    // Pick first destination
                    pickNewDestination();

                } catch (e) {
                    console.warn('[AgentTown] Failed to load raccoon spritesheet:', e);
                }

                // ══════════════════════════════════════════════════════
                // ── 25 DEFAULT AGENTS: Load sprites + create runtime ──
                // ══════════════════════════════════════════════════════

                // Deduplicate sprite paths for texture loading
                const uniqueSpritePaths = [...new Set(DEFAULT_AGENTS.map(a => a.sprite))];
                const textureCache: Record<string, PIXI.Texture> = {};

                // Load all unique textures in parallel
                try {
                    const texturePromises = uniqueSpritePaths.map(async (path) => {
                        try {
                            const tex = await PIXI.Assets.load(path);
                            textureCache[path] = tex;
                        } catch (err) {
                            console.warn(`[AgentTown] Failed to load sprite: ${path}`, err);
                        }
                    });
                    await Promise.all(texturePromises);
                } catch (err) {
                    console.warn('[AgentTown] Error loading agent textures:', err);
                }

                if (!isMounted) return;

                // Create agent runtime objects
                const agentRuntimes: AgentRuntime[] = [];
                const agentRuntimeMap = new Map<string, AgentRuntime>();

                for (let i = 0; i < DEFAULT_AGENTS.length; i++) {
                    const profile = DEFAULT_AGENTS[i];
                    const tex = textureCache[profile.sprite];
                    if (!tex) continue;

                    // Find walkable spawn position near home
                    const spawnPos = getNearestWalkable(gridWorld, profile.home.x, profile.home.y);

                    // Create container
                    const agentContainer = new PIXI.Container();
                    agentContainer.x = (spawnPos.x + 0.5) * TILE_SIZE;
                    agentContainer.y = (spawnPos.y + 0.5) * TILE_SIZE;

                    // Shadow
                    const shadow = new PIXI.Graphics();
                    shadow.ellipse(0, 0, 14, 5);
                    shadow.fill({ color: 0x000000, alpha: 0.12 });
                    shadow.y = 2;
                    agentContainer.addChild(shadow);

                    // Sprite
                    const agentSprite = new PIXI.Sprite(tex);
                    agentSprite.anchor.set(0.5, 1);
                    const spriteScale = AGENT_SPRITE_HEIGHT / tex.height;
                    agentSprite.scale.set(spriteScale);
                    agentContainer.addChild(agentSprite);

                    // Name label (small, below sprite)
                    const nameLabel = new PIXI.Text({
                        text: profile.name,
                        style: {
                            fontSize: 9,
                            fontFamily: 'system-ui, sans-serif',
                            fontWeight: '700',
                            fill: 0x374151,
                        },
                    });
                    nameLabel.anchor.set(0.5, 0);
                    nameLabel.y = 4;
                    agentContainer.addChild(nameLabel);

                    // State dot
                    const stateDot = new PIXI.Graphics();
                    stateDot.circle(0, 0, 3);
                    stateDot.fill(STATE_COLORS.IDLE);
                    stateDot.x = nameLabel.width / 2 + 6;
                    stateDot.y = 10;
                    agentContainer.addChild(stateDot);

                    app.stage.addChild(agentContainer);

                    const runtime: AgentRuntime = {
                        id: profile.id,
                        name: profile.name,
                        profile,
                        state: 'IDLE',
                        container: agentContainer,
                        sprite: agentSprite,
                        shadow,
                        nameLabel,
                        stateDot,
                        gridX: spawnPos.x,
                        gridY: spawnPos.y,
                        path: [],
                        pauseTimer: Math.floor(Math.random() * 120) + 60, // random initial pause
                        stateAnimTimer: 0,
                        baseScaleX: spriteScale,
                        bubbleContainer: null,
                        bubbleFadeTimer: 0,
                        bubbleFading: false,
                        errorFlashTimer: 0,
                    };

                    agentRuntimes.push(runtime);
                    agentRuntimeMap.set(profile.id, runtime);
                    // Also map by name (lowercase) for TASK_ASSIGNED matching
                    agentRuntimeMap.set(profile.name.toLowerCase(), runtime);
                }

                // ── Helper: pick wandering destination for an agent ──
                const pickAgentWanderDest = (agent: AgentRuntime) => {
                    const near = getRandomWalkableNear(
                        gridWorld,
                        agent.gridX,
                        agent.gridY,
                        IDLE_WANDER_RADIUS,
                    );
                    if (!near) return;
                    const path = findPath(gridWorld, agent.gridX, agent.gridY, near.x, near.y);
                    agent.path = path.map(p => ({
                        x: (p.x + 0.5) * TILE_SIZE,
                        y: (p.y + 0.5) * TILE_SIZE,
                    }));
                };

                // ── Helper: pick zone destination for an agent ──
                const pickAgentZoneDest = (agent: AgentRuntime, zone: ZoneType) => {
                    const cells = getZoneCellsCached(zone);
                    if (cells.length === 0) {
                        pickAgentWanderDest(agent);
                        return;
                    }
                    const target = cells[Math.floor(Math.random() * cells.length)];
                    const path = findPath(gridWorld, agent.gridX, agent.gridY, target.x, target.y);
                    agent.path = path.map(p => ({
                        x: (p.x + 0.5) * TILE_SIZE,
                        y: (p.y + 0.5) * TILE_SIZE,
                    }));
                };

                // ── Helper: update agent state dot ──
                const updateAgentStateDot = (agent: AgentRuntime, state: AgentState) => {
                    agent.stateDot.clear();
                    agent.stateDot.circle(0, 0, 3);
                    agent.stateDot.fill(STATE_COLORS[state] || STATE_COLORS.IDLE);
                };

                // ── Helper: show speech bubble on an agent ──
                const showAgentBubble = (agent: AgentRuntime, text: string) => {
                    // Remove existing bubble
                    if (agent.bubbleContainer) {
                        agent.container.removeChild(agent.bubbleContainer);
                        agent.bubbleContainer = null;
                    }

                    const bubble = new PIXI.Container();
                    bubble.y = -70;

                    const truncatedText = text.length > 30 ? text.slice(0, 30) + '...' : text;
                    const bubbleText = new PIXI.Text({
                        text: truncatedText,
                        style: {
                            fontSize: 9,
                            fontFamily: 'system-ui, sans-serif',
                            fontWeight: '700',
                            fill: 0x18181b,
                            wordWrap: true,
                            wordWrapWidth: 100,
                        },
                    });
                    bubbleText.anchor.set(0.5, 0.5);

                    const padX = 6;
                    const padY = 4;
                    const bg = new PIXI.Graphics();
                    const bw = bubbleText.width + padX * 2;
                    const bh = bubbleText.height + padY * 2;
                    bg.roundRect(-bw / 2, -bh / 2, bw, bh, 4);
                    bg.fill({ color: 0xffffff, alpha: 1 });
                    bg.stroke({ width: 1.5, color: 0x18181b });

                    bg.moveTo(-4, bh / 2);
                    bg.lineTo(0, bh / 2 + 5);
                    bg.lineTo(4, bh / 2);
                    bg.closePath();
                    bg.fill({ color: 0xffffff });
                    bg.stroke({ width: 1.5, color: 0x18181b });

                    bubble.addChild(bg);
                    bubble.addChild(bubbleText);
                    bubble.alpha = 1;

                    agent.container.addChild(bubble);
                    agent.bubbleContainer = bubble;
                    agent.bubbleFadeTimer = 0;
                    agent.bubbleFading = false;
                };

                // ── Helper: handle state change for a non-raccoon agent ──
                const handleAgentStateChange = (agent: AgentRuntime, newState: AgentState) => {
                    agent.state = newState;
                    agent.stateAnimTimer = 0;
                    updateAgentStateDot(agent, newState);

                    if (newState === 'RUNNING') {
                        pickAgentZoneDest(agent, 'work');
                    } else if (newState === 'THINKING') {
                        // Stop and sway
                        agent.path = [];
                        agent.pauseTimer = 0;
                    } else if (newState === 'SUCCESS') {
                        agent.path = [];
                        agent.pauseTimer = 0;
                        agent.stateAnimTimer = 0;
                    } else if (newState === 'ERROR') {
                        agent.path = [];
                        agent.pauseTimer = 0;
                        agent.stateAnimTimer = 0;
                        agent.errorFlashTimer = 0;
                    } else if (newState === 'IDLE' || newState === 'WALK') {
                        if (agent.path.length === 0) {
                            pickAgentWanderDest(agent);
                        }
                    }
                };

                // Stagger initial pathfinding for the 25 agents
                for (let i = 0; i < agentRuntimes.length; i++) {
                    const agent = agentRuntimes[i];
                    setTimeout(() => {
                        if (!isMounted) return;
                        pickAgentWanderDest(agent);
                    }, i * STAGGER_DELAY_MS);
                }

                // ── WebSocket for state changes (auto-reconnect) ────────────
                let reconnectDelay = 1000;

                const connectWs = () => {
                    const ws = new WebSocket('ws://localhost:8000/ws/town');
                    wsRef = ws;

                    ws.onopen = () => { reconnectDelay = 1000; }; // Reset delay on success

                    ws.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);

                            if (data.type === 'AGENT_STATE_CHANGE') {
                                const newState = data.state as AgentState;

                                // ── Handle Raccoon state changes ──
                                if (data.agentId === RACCOON_AGENT_ID || data.agentId === 'raccoon') {
                                    raccoonState = newState;
                                    raccoonStateAnimTimer = 0;

                                    // Update React state for inspector display
                                    if (isMounted) {
                                        setRaccoonDisplayState(newState);
                                        setLogs(prev => {
                                            const entry: LogItem = {
                                                ts: Date.now(),
                                                text: `\uC0C1\uD0DC \uBCC0\uACBD: ${STATE_LABELS[newState]}`,
                                                state: newState,
                                            };
                                            return [...prev.slice(-19), entry];
                                        });
                                    }

                                    // Update state dot visual
                                    updateRaccoonStateDot(newState);

                                    // State-specific behavior
                                    if (newState === 'RUNNING') {
                                        pickZoneDestination('work');
                                    } else if (newState === 'THINKING') {
                                        pickZoneDestination('meeting');
                                    } else if (newState === 'SUCCESS' || newState === 'ERROR') {
                                        raccoonPath = [];
                                        raccoonPauseTimer = 0;
                                        raccoonStateAnimTimer = 0;
                                    } else if (newState === 'IDLE' || newState === 'WALK') {
                                        if (raccoonPath.length === 0) {
                                            pickNewDestination();
                                        }
                                    }
                                }

                                // ── Handle 25 agent state changes ──
                                const agentId = data.agentId as string;
                                const agent = agentRuntimeMap.get(agentId);
                                if (agent) {
                                    handleAgentStateChange(agent, newState);
                                }
                            }

                            if (data.type === 'TASK_ASSIGNED') {
                                // Log task assignments for raccoon inspector
                                if (data.agent === 'Raccoon' || data.agent === 'raccoon') {
                                    if (isMounted) {
                                        setLogs(prev => {
                                            const entry: LogItem = {
                                                ts: Date.now(),
                                                text: `\uC791\uC5C5 \uD560\uB2F9: ${data.taskContent.length > 50 ? data.taskContent.slice(0, 50) + '...' : data.taskContent}`,
                                                state: raccoonState,
                                            };
                                            return [...prev.slice(-19), entry];
                                        });
                                    }

                                    // P2-11: Show speech bubble above raccoon
                                    showRaccoonBubble(data.taskContent || '\uC0C8 \uC791\uC5C5 \uC218\uC2E0');
                                }

                                // Show speech bubble on matched agent
                                const agentName = (data.agent as string || '').toLowerCase();
                                const agent = agentRuntimeMap.get(agentName);
                                if (agent) {
                                    showAgentBubble(agent, data.taskContent || '\uC0C8 \uC791\uC5C5 \uC218\uC2E0');
                                }
                            }

                            if (data.type === 'JOB_UPDATE') {
                                // When a job completes, find the assigned agent and update state
                                const job = data.job;
                                if (job && job.assignedAgentId) {
                                    const agent = agentRuntimeMap.get(job.assignedAgentId);
                                    if (agent) {
                                        if (job.state === 'SUCCESS') {
                                            handleAgentStateChange(agent, 'SUCCESS');
                                        } else if (job.state === 'ERROR') {
                                            handleAgentStateChange(agent, 'ERROR');
                                        } else if (job.state === 'RUNNING') {
                                            handleAgentStateChange(agent, 'RUNNING');
                                        }
                                    }
                                }
                            }

                            // Capture JOB_LOG for raccoon inspector logs
                            if (data.type === 'JOB_LOG') {
                                if (isMounted) {
                                    setLogs(prev => {
                                        const entry: LogItem = {
                                            ts: data.log?.ts || Date.now(),
                                            text: data.log?.text || String(data.text || ''),
                                            state: raccoonState,
                                        };
                                        return [...prev.slice(-19), entry];
                                    });
                                }
                            }
                        } catch (e) { /* ignore */ }
                    };

                    ws.onclose = () => {
                        if (!isMounted) return;
                        reconnectTimerRef = setTimeout(connectWs, reconnectDelay);
                        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
                    };
                    ws.onerror = () => { ws.close(); };
                };
                connectWs();

                // ══════════════════════════════════════════════════════
                // ── Animation Loop ──
                // ══════════════════════════════════════════════════════
                app.ticker.add(() => {
                    const now = Date.now();

                    // ────────────────────────────────────────────
                    // ── 25 AGENTS: Movement + Animation ──
                    // ────────────────────────────────────────────
                    for (let ai = 0; ai < agentRuntimes.length; ai++) {
                        const agent = agentRuntimes[ai];
                        const { container, sprite, shadow } = agent;

                        // ── Speech bubble fade ──
                        if (agent.bubbleContainer) {
                            agent.bubbleFadeTimer++;
                            if (!agent.bubbleFading && agent.bubbleFadeTimer >= BUBBLE_DISPLAY_FRAMES) {
                                agent.bubbleFading = true;
                                agent.bubbleFadeTimer = 0;
                            }
                            if (agent.bubbleFading) {
                                const fadeProgress = agent.bubbleFadeTimer / BUBBLE_FADE_FRAMES;
                                agent.bubbleContainer.alpha = Math.max(0, 1 - fadeProgress);
                                if (fadeProgress >= 1) {
                                    container.removeChild(agent.bubbleContainer);
                                    agent.bubbleContainer = null;
                                    agent.bubbleFading = false;
                                    agent.bubbleFadeTimer = 0;
                                }
                            }
                        }

                        // ── SUCCESS animation: bounce ──
                        if (agent.state === 'SUCCESS') {
                            agent.stateAnimTimer++;
                            const jumpT = (now % 600) / 600;
                            const jumpY = Math.sin(jumpT * Math.PI) * 10;
                            sprite.y = -jumpY;
                            sprite.rotation = Math.sin(now * 0.01) * 0.08;

                            if (agent.stateAnimTimer >= SUCCESS_ANIM_FRAMES) {
                                agent.state = 'IDLE';
                                agent.stateAnimTimer = 0;
                                sprite.y = 0;
                                sprite.rotation = 0;
                                updateAgentStateDot(agent, 'IDLE');
                                pickAgentWanderDest(agent);
                            }
                            continue;
                        }

                        // ── ERROR animation: shake + red tint ──
                        if (agent.state === 'ERROR') {
                            agent.stateAnimTimer++;
                            agent.errorFlashTimer++;
                            const shakeX = Math.sin(now * 0.03) * 4;
                            sprite.x = shakeX;
                            sprite.rotation = Math.sin(now * 0.02) * 0.08;

                            // Red tint for first 30 frames
                            if (agent.errorFlashTimer < 30) {
                                sprite.tint = 0xff6666;
                            } else {
                                sprite.tint = 0xffffff;
                            }

                            if (agent.stateAnimTimer >= ERROR_ANIM_FRAMES) {
                                agent.state = 'IDLE';
                                agent.stateAnimTimer = 0;
                                sprite.x = 0;
                                sprite.rotation = 0;
                                sprite.tint = 0xffffff;
                                updateAgentStateDot(agent, 'IDLE');
                                pickAgentWanderDest(agent);
                            }
                            continue;
                        }

                        // Reset offsets from SUCCESS/ERROR
                        sprite.x = 0;
                        sprite.tint = 0xffffff;

                        // ── THINKING: sway animation, no movement ──
                        if (agent.state === 'THINKING') {
                            sprite.rotation = Math.sin(now * 0.0015) * 0.06;
                            // Subtle bob
                            sprite.y = Math.sin(now * 0.002) * 2;
                            continue;
                        }

                        sprite.rotation = 0;
                        sprite.y = 0;

                        // ── Movement along path ──
                        if (agent.path.length > 0) {
                            const target = agent.path[0];
                            const dx = target.x - container.x;
                            const dy = target.y - container.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);

                            // Speed adjustment based on state
                            const speed = agent.state === 'RUNNING'
                                ? AGENT_SPEED_PX * 1.6
                                : AGENT_SPEED_PX;

                            if (dist > speed) {
                                // Lerp towards target
                                container.x += (dx / dist) * speed;
                                container.y += (dy / dist) * speed;

                                // Flip sprite based on horizontal direction
                                if (Math.abs(dx) > 0.5) {
                                    sprite.scale.x = dx > 0 ? agent.baseScaleX : -agent.baseScaleX;
                                }

                                // Subtle bob while walking
                                sprite.y = Math.sin(now * 0.008) * 1.5;
                            } else {
                                // Reached waypoint
                                container.x = target.x;
                                container.y = target.y;
                                agent.path.shift();

                                // Update grid position
                                agent.gridX = Math.floor(container.x / TILE_SIZE);
                                agent.gridY = Math.floor(container.y / TILE_SIZE);
                            }
                        } else {
                            // ── Pause at destination, then pick new target ──
                            agent.pauseTimer++;
                            const pauseFrames = (IDLE_PAUSE_MIN_MS + Math.random() * (IDLE_PAUSE_MAX_MS - IDLE_PAUSE_MIN_MS)) / (1000 / TARGET_FPS);

                            if (agent.pauseTimer >= pauseFrames) {
                                agent.pauseTimer = 0;
                                if (agent.state === 'IDLE' || agent.state === 'WALK') {
                                    pickAgentWanderDest(agent);
                                } else if (agent.state === 'RUNNING') {
                                    // Stay at work zone, pick new position within it
                                    pickAgentZoneDest(agent, 'work');
                                }
                            }
                        }

                        // Shadow alpha
                        shadow.alpha = agent.path.length > 0 ? 0.12 : 0.08 + Math.sin(now * 0.003) * 0.02;
                    }

                    // ────────────────────────────────────────────
                    // ── RACCOON: Waypoint movement + spritesheet + state animations ──
                    // ────────────────────────────────────────────
                    if (raccoonSprite && raccoonContainer && raccoonFrames.length > 0) {
                        // Recalculate state dot x on first rendered frame (text width now reliable)
                        if (raccoonStateDotNeedsRecalc && raccoonStateDotGfx && raccoonLabel) {
                            const nameEl = raccoonContainer.children.find(
                                (c): c is PIXI.Text => c instanceof PIXI.Text && (c as PIXI.Text).text === 'Raccoon'
                            );
                            if (nameEl && nameEl.width > 0) {
                                raccoonStateDotGfx.x = nameEl.width / 2 + 10;
                                raccoonStateDotNeedsRecalc = false;
                            }
                        }

                        // P2-9: Highlight glow pulse animation
                        const glow = highlightGlowRef.current;
                        if (glow && glow.visible) {
                            const pulse = 0.2 + Math.sin(now * 0.006) * 0.15;
                            glow.alpha = pulse;
                            glow.scale.set(1 + Math.sin(now * 0.004) * 0.08);
                        }

                        // P2-11: Speech bubble fade management
                        if (raccoonBubbleContainer) {
                            raccoonBubbleFadeTimer++;
                            if (!raccoonBubbleFading && raccoonBubbleFadeTimer >= BUBBLE_DISPLAY_FRAMES) {
                                raccoonBubbleFading = true;
                                raccoonBubbleFadeTimer = 0;
                            }
                            if (raccoonBubbleFading) {
                                const fadeProgress = raccoonBubbleFadeTimer / BUBBLE_FADE_FRAMES;
                                raccoonBubbleContainer.alpha = Math.max(0, 1 - fadeProgress);
                                if (fadeProgress >= 1) {
                                    raccoonContainer.removeChild(raccoonBubbleContainer);
                                    raccoonBubbleContainer = null;
                                    raccoonBubbleFading = false;
                                    raccoonBubbleFadeTimer = 0;
                                }
                            }
                        }

                        let isMoving = false;

                        // ── SUCCESS animation: celebration jump (freeze in place) ──
                        if (raccoonState === 'SUCCESS') {
                            raccoonStateAnimTimer++;
                            const jumpT = (now % 800) / 800;
                            const jumpY = Math.sin(jumpT * Math.PI) * 18;
                            const squash = jumpT < 0.2 ? 1 - jumpT * 0.8 : (jumpT > 0.8 ? 1 - (1 - jumpT) * 0.8 : 1);
                            raccoonSprite.y = -jumpY;
                            raccoonSprite.scale.y = Math.abs(raccoonSprite.scale.y) * squash;
                            raccoonSprite.rotation = Math.sin(now * 0.012) * 0.1;

                            // Frame cycling for idle row (row 0) during celebration
                            raccoonFrameTimer++;
                            if (raccoonFrameTimer >= 6) {
                                raccoonFrameTimer = 0;
                                raccoonFrameIndex = (raccoonFrameIndex + 1) % COLS;
                                raccoonSprite.texture = raccoonFrames[0][raccoonFrameIndex];
                            }

                            // Auto-reset to IDLE after ~1.2 seconds (72 frames)
                            if (raccoonStateAnimTimer >= 72) {
                                raccoonState = 'IDLE';
                                raccoonStateAnimTimer = 0;
                                raccoonSprite.y = 0;
                                raccoonSprite.rotation = 0;
                                raccoonSprite.scale.set(raccoonBaseScaleX);
                                updateRaccoonStateDot('IDLE');
                                if (isMounted) setRaccoonDisplayState('IDLE');
                                pickNewDestination();
                            }
                        }
                        // ── ERROR animation: angry shake (freeze in place) ──
                        else if (raccoonState === 'ERROR') {
                            raccoonStateAnimTimer++;
                            const shakeX = Math.sin(now * 0.03) * 5;
                            raccoonSprite.x = shakeX;
                            raccoonSprite.y = 0;
                            raccoonSprite.rotation = Math.sin(now * 0.02) * 0.1;

                            // Frame cycling for idle row (row 0) during shake
                            raccoonFrameTimer++;
                            if (raccoonFrameTimer >= 5) {
                                raccoonFrameTimer = 0;
                                raccoonFrameIndex = (raccoonFrameIndex + 1) % COLS;
                                raccoonSprite.texture = raccoonFrames[0][raccoonFrameIndex];
                            }

                            // Auto-reset to IDLE after ~1.2 seconds (72 frames)
                            if (raccoonStateAnimTimer >= 72) {
                                raccoonState = 'IDLE';
                                raccoonStateAnimTimer = 0;
                                raccoonSprite.x = 0;
                                raccoonSprite.y = 0;
                                raccoonSprite.rotation = 0;
                                updateRaccoonStateDot('IDLE');
                                if (isMounted) setRaccoonDisplayState('IDLE');
                                pickNewDestination();
                            }
                        }
                        // ── Normal movement states ──
                        else {
                            // Reset any residual shake/jump offsets
                            raccoonSprite.x = 0;

                            // THINKING sway animation (gentle rotation oscillation)
                            if (raccoonState === 'THINKING') {
                                raccoonSprite.rotation = Math.sin(now * 0.0015) * 0.08;
                            } else {
                                raccoonSprite.rotation = 0;
                            }

                            if (raccoonPath.length > 0) {
                                const target = raccoonPath[0];
                                const dx = target.x - raccoonContainer.x;
                                const dy = target.y - raccoonContainer.y;
                                const dist = Math.sqrt(dx * dx + dy * dy);

                                // Adjust speed based on state
                                const currentSpeed = raccoonState === 'RUNNING' ? RACCOON_SPEED * 1.8
                                    : raccoonState === 'THINKING' ? RACCOON_SPEED * 0.6
                                    : RACCOON_SPEED;

                                if (dist > currentSpeed) {
                                    // Move towards target
                                    raccoonContainer.x += (dx / dist) * currentSpeed;
                                    raccoonContainer.y += (dy / dist) * currentSpeed;
                                    if (Math.abs(dx) > Math.abs(dy)) {
                                        raccoonSprite.scale.x = dx > 0 ? raccoonBaseScaleX : -raccoonBaseScaleX;
                                    }
                                    isMoving = true;
                                } else {
                                    // Reached node
                                    raccoonContainer.x = target.x;
                                    raccoonContainer.y = target.y;
                                    raccoonPath.shift(); // remove reached node
                                }
                            } else {
                                // Pause at final waypoint
                                raccoonPauseTimer++;
                                if (raccoonPauseTimer >= RACCOON_PAUSE_FRAMES) {
                                    raccoonPauseTimer = 0;
                                    // Only pick random destination in IDLE/WALK states
                                    if (raccoonState === 'IDLE' || raccoonState === 'WALK') {
                                        pickNewDestination();
                                    }
                                }
                            }

                            // Select animation row based on state
                            let targetRow: number;
                            if (raccoonState === 'THINKING') {
                                targetRow = 0;
                            } else if (raccoonState === 'RUNNING') {
                                targetRow = 2;
                            } else {
                                targetRow = isMoving ? 2 : 0;
                            }

                            if (targetRow !== raccoonAnimRow) {
                                raccoonAnimRow = targetRow;
                                raccoonFrameIndex = 0;
                                if (raccoonLabel) raccoonLabel.text = ROW_LABELS[raccoonAnimRow];
                            }

                            // Frame cycling -- speed varies by state
                            raccoonFrameTimer++;
                            let frameSpeed: number;
                            if (raccoonState === 'THINKING') {
                                frameSpeed = 18; // slow, contemplative
                            } else if (raccoonState === 'RUNNING') {
                                frameSpeed = 4; // fast running (~15fps)
                            } else {
                                frameSpeed = isMoving ? 5 : 5; // walk 12fps / idle 12fps
                            }

                            if (raccoonFrameTimer >= frameSpeed) {
                                raccoonFrameTimer = 0;
                                raccoonFrameIndex = (raccoonFrameIndex + 1) % COLS;
                                raccoonSprite.texture = raccoonFrames[raccoonAnimRow][raccoonFrameIndex];
                            }
                        }

                        // Subtle shadow pulse when idle
                        if (raccoonShadow) {
                            raccoonShadow.alpha = (raccoonState === 'SUCCESS' || raccoonState === 'ERROR')
                                ? 0.1 + Math.sin(now * 0.005) * 0.05
                                : (raccoonPath.length > 0 ? 0.15 : 0.12 + Math.sin(now * 0.003) * 0.03);
                        }

                        // Update screen position ref for inspector card placement
                        raccoonScreenPosRef.current = {
                            x: raccoonContainer.x,
                            y: raccoonContainer.y,
                        };
                    }
                }); // close ticker.add

            } catch (err: any) {
                console.error("AgentTown Rendering Error:", err);
                setRenderError(err.message || String(err));
            }
        };

        initPixi();

        return () => {
            isMounted = false;
            // Close WebSocket and cancel reconnect timer
            if (reconnectTimerRef) clearTimeout(reconnectTimerRef);
            if (wsRef) {
                try { wsRef.close(); } catch (_) { /* ignore */ }
                wsRef = null;
            }
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
            if (appRef.current) {
                try {
                    appRef.current.destroy();
                } catch (e) {
                    console.warn('[AgentTown] destroy() error (HMR safe):', e);
                }
                appRef.current = null;
            }
        };
    }, [handleRaccoonClick]);

    if (renderError) {
        return (
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-red-50 p-8">
                <div className="bg-white border-4 border-red-500 rounded-2xl p-6 shadow-xl max-w-2xl text-red-600 font-bold whitespace-pre-wrap">
                    <h2>AgentTown Crash:</h2>
                    <p>{renderError}</p>
                </div>
            </div>
        );
    }

    // Format timestamp for log display
    const formatTime = (ts: number): string => {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    };

    // Calculate inspector card position relative to the container
    const getInspectorStyle = (): React.CSSProperties => {
        const pos = raccoonScreenPosRef.current;
        // Position the card to the right of the raccoon
        return {
            position: 'absolute',
            left: `${Math.min(pos.x + 60, (containerRef.current?.clientWidth || 800) - 280)}px`,
            top: `${Math.max(10, pos.y - 120)}px`,
            zIndex: 50,
        };
    };

    const recentLogs = logs.slice(-5);

    return (
        <div ref={containerRef} className="absolute inset-0 z-0 bg-transparent">
            {/* Inspector Card (Neo-Brutalist style) */}
            {inspector.visible && (
                <div
                    style={getInspectorStyle()}
                    className="w-64 bg-white border-2 border-black shadow-[3px_3px_0_0_#000] select-none"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b-2 border-black bg-amber-50">
                        <div className="flex items-center gap-2">
                            <span className="font-black text-sm tracking-tight">Raccoon</span>
                            <span
                                className="inline-block w-2.5 h-2.5 rounded-full border border-black"
                                style={{ backgroundColor: STATE_COLORS_CSS[raccoonDisplayState] || STATE_COLORS_CSS.IDLE }}
                            />
                        </div>
                        <button
                            onClick={closeInspector}
                            className="w-6 h-6 flex items-center justify-center border-2 border-black bg-white hover:bg-red-100 active:bg-red-200 font-black text-xs leading-none transition-colors"
                        >
                            X
                        </button>
                    </div>

                    {/* State */}
                    <div className="px-3 py-2 border-b border-gray-200">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{'\uD604\uC7AC \uC0C1\uD0DC'}</div>
                        <div className="flex items-center gap-1.5">
                            <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: STATE_COLORS_CSS[raccoonDisplayState] || STATE_COLORS_CSS.IDLE }}
                            />
                            <span className="text-sm font-bold text-gray-800">
                                {STATE_LABELS[raccoonDisplayState]}
                            </span>
                        </div>
                    </div>

                    {/* Recent Logs */}
                    <div className="px-3 py-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{'\uCD5C\uADFC \uB85C\uADF8'}</div>
                        {recentLogs.length === 0 ? (
                            <div className="text-xs text-gray-300 italic py-1">{'\uB85C\uADF8 \uC5C6\uC74C'}</div>
                        ) : (
                            <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                {recentLogs.map((log, i) => (
                                    <div key={`${log.ts}-${i}`} className="flex items-start gap-1.5 text-[11px]">
                                        <span className="text-gray-400 font-mono shrink-0">{formatTime(log.ts)}</span>
                                        <span
                                            className="inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0"
                                            style={{ backgroundColor: STATE_COLORS_CSS[log.state] || STATE_COLORS_CSS.IDLE }}
                                        />
                                        <span className="text-gray-600 break-all">{log.text}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
