import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { type AgentState, type AgentProfile } from '../../types/platform';
import {
    createDefaultWorld,
    findPath,
    type ZoneType,
    getZoneCells,
    getNearestWalkable,
    getRandomWalkableNear,
} from '../../systems/grid-world';
import { DEFAULT_AGENTS, AGENT_ANIMAL_MAP } from '../../types/platform';
import { useAppStore } from '../../store/useAppStore';
import { useTerminalStore } from '../../store/useTerminalStore';
import { processActivityChange } from '../../lib/growth-bridge';

// Isometric coordinate system
import {
    gridToIso,
    getIsoCanvasSize,
    getCameraOffset,
    getIsoDirection,
    isoToGrid,
} from '../../systems/isometric';

// Isometric floor/room renderer
import {
    createIsoFloor,
    createRoomSprites,
    createZoneLabels,
} from './iso-renderer';
import type { WorldObject } from '../../types/project';

// Animal character system
import {
    loadAnimalTextures,
    loadDeskAnimation,
    showDeskAnimation,
    hideDeskAnimation,
    createAnimalVisual,
    setAnimalDirection,
    tickAnimalAnimation,
    updateAnimalStateDot,
    showAnimalBubble,
    tickAnimalBubble,
    type AnimalTextures,
    type AnimalVisual,
    type AnimalType,
    type DeskAnimationFrames,
} from './animal-runtime';

// Agent runtime constants (still used for speeds, colors, stagger)
import {
    STATE_COLORS,
    AGENT_SPEED_TILES_PER_SEC,
    IDLE_WANDER_RADIUS,
    STAGGER_DELAY_MS,
    BUBBLE_CONFIGS,
    TOOL_BUBBLES,
} from './agent-runtime';

// ── Isometric agent speed: pixels per frame ──
const AGENT_SPEED_PX = AGENT_SPEED_TILES_PER_SEC * 1.0;

// ── Zoom constraints ──
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.15;
const ZOOM_LERP_FACTOR = 0.1;

// ── Dokba(raccoon) 프로필 ──
const DOKBA_PROFILE: AgentProfile = {
    id: 'raccoon',
    name: 'Dokba',
    role: 'AI 어시스턴트',
    sprite: '/assets/characters/dokba_profile.png',
    state: 'IDLE',
    currentJobId: null,
    home: { x: 10, y: 20 },
    pos: { x: 10, y: 20 },
};

// ── 단일화 모드: Dokba만 활성 표시, 나머지 숨김 ──
const SOLO_MODE = false;

// ── Per-agent isometric runtime state ──
// ── Idle debounce: 3초(180프레임) 이상 idle 지속 시에만 REST로 복귀 ──
const IDLE_DEBOUNCE_FRAMES = 180; // ~3s at 60fps

// ── Success/Error → REST 복귀 딜레이: 5초(300프레임) ──
const SUCCESS_REST_DELAY_FRAMES = 300;

interface IsoAgent {
    id: string;
    name: string;
    profile: AgentProfile;
    visual: AnimalVisual;
    state: AgentState;
    gridX: number;
    gridY: number;
    path: { x: number; y: number }[]; // grid coords
    pauseTimer: number;
    stateAnimTimer: number;
    visible: boolean; // SOLO_MODE에서 숨김 제어
    idleDebounceTimer: number; // idle 디바운스 카운터 (프레임)
}

export const AgentTown: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const [renderError, setRenderError] = useState<string | null>(null);

    // Zustand store hooks for Tycoon style Object management
    const projectConfig = useAppStore((s) => s.projectConfig);
    const updateWorldObject = useAppStore((s) => s.updateWorldObject);
    const saveProject = useAppStore((s) => s.saveProject);
    const activeView = useAppStore((s) => s.activeView);

    // Mutable ref so closures in initPixi can read latest activeView
    const activeViewRef = useRef(activeView);
    activeViewRef.current = activeView;

    useEffect(() => {
        let isMounted = true;

        // References for cleanup of event listeners and observers
        let wheelHandler: ((e: WheelEvent) => void) | null = null;
        let pointerDownHandler: ((e: PointerEvent) => void) | null = null;
        let pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
        let pointerUpHandler: ((e: PointerEvent) => void) | null = null;
        let keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let dragOverHandler: ((e: DragEvent) => void) | null = null;
        let dropHandler: ((e: DragEvent) => void) | null = null;

        const selectedBuildingId = { current: null as string | null };
        const buildingSpritesMap = new Map<string, PIXI.Container>();
        let canvasElRef: HTMLCanvasElement | null = null;
        let unsubTerminal: (() => void) | null = null;

        const initPixi = async () => {
            try {
                if (!containerRef.current) return;

                // Remove existing canvas (HMR safety)
                const existingCanvas =
                    containerRef.current.querySelector('canvas');
                if (existingCanvas) existingCanvas.remove();

                const app = new PIXI.Application();
                appRef.current = app as any;

                const isoSize = getIsoCanvasSize();
                const W = isoSize.width;
                const H = isoSize.height;

                // Use higher resolution for anti-pixelation (minimum 2x)
                const pixelRatio = Math.max(window.devicePixelRatio || 1, 2);

                await app.init({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                    backgroundColor: 0xfdfaf6,
                    resolution: pixelRatio,
                    autoDensity: true,
                    antialias: true,
                });

                if (!isMounted) return;
                containerRef.current.appendChild(app.canvas);
                canvasElRef = app.canvas as HTMLCanvasElement;

                // ── World container for pan/zoom ──
                const worldContainer = new PIXI.Container();
                worldContainer.sortableChildren = true;
                app.stage.addChild(worldContainer);

                // ── Background Click Deselect ──
                app.stage.eventMode = 'static';
                app.stage.hitArea = new PIXI.Rectangle(0, 0, W * 10, H * 10);
                app.stage.on('pointerdown', () => {
                    if (
                        selectedBuildingId.current &&
                        activeViewRef.current === 'studio'
                    ) {
                        selectedBuildingId.current = null;
                        buildingSpritesMap.forEach((s) => {
                            s.tint = 0xffffff;
                            s.emit('toggleTransformMode', false);
                            // We use 'any' cast here if typescript complains about isTransformMode missing
                            (s as any).isTransformMode = false;
                        });
                    }
                });

                // ── Camera / Zoom / Pan state (local variables, NOT React state) ──
                const viewW = containerRef.current.clientWidth;
                const viewH = containerRef.current.clientHeight;

                // Calculate initial scale: fit the iso map, then zoom in so it is clearly visible
                const scaleX = viewW / W;
                const scaleY = viewH / H;
                const fitScale = Math.min(scaleX, scaleY) * 1.5;

                let currentZoom = fitScale;
                let targetZoom = fitScale;

                // Center the map in the viewport
                const mapCenterIso = gridToIso(20, 12);
                worldContainer.x = viewW / 2 - mapCenterIso.x * currentZoom;
                worldContainer.y = viewH / 2 - mapCenterIso.y * currentZoom;
                worldContainer.scale.set(currentZoom);

                // Drag/pan state
                let isDragging = false;
                let isDraggingBuilding = false; // Shared flag: suppress pan when dragging a building
                let lastPointerX = 0;
                let lastPointerY = 0;

                // ── Grid World Generation ──
                const gridWorld = createDefaultWorld();

                // ── Mark building footprints as collision-blocked (with 1-cell padding) ──
                for (const obj of projectConfig.world.layers.objects) {
                    const pad = 1; // Extra cells around footprint
                    for (let dx = -pad; dx < obj.width + pad; dx++) {
                        for (let dy = -pad; dy < obj.height + pad; dy++) {
                            const cx = obj.x + dx;
                            const cy = obj.y + dy;
                            if (
                                cx >= 0 &&
                                cx < gridWorld.cols &&
                                cy >= 0 &&
                                cy < gridWorld.rows
                            ) {
                                gridWorld.cells[cy][cx].collision = true;
                            }
                        }
                    }
                }

                // Pre-compute zone cells for performance
                const zoneCellsCache: Record<
                    string,
                    { x: number; y: number }[]
                > = {};
                const getZoneCellsCached = (
                    zone: ZoneType,
                ): { x: number; y: number }[] => {
                    if (!zoneCellsCache[zone]) {
                        zoneCellsCache[zone] = getZoneCells(gridWorld, zone);
                    }
                    return zoneCellsCache[zone];
                };

                // ── Isometric Floor ──
                const floorContainer = createIsoFloor(
                    gridWorld.cells,
                    gridWorld.cols,
                    gridWorld.rows,
                );
                floorContainer.zIndex = 0;
                worldContainer.addChild(floorContainer);

                // ── Room Asset Sprites ──
                const handleObjectMoved = (
                    id: string,
                    col: number,
                    row: number,
                    offsetX?: number,
                    offsetY?: number,
                    rotation?: number,
                ) => {
                    updateWorldObject(id, col, row);
                    if (offsetX !== undefined && offsetY !== undefined) {
                        useAppStore.getState().updateWorldObjectProperties(id, {
                            offsetX,
                            offsetY,
                            rotation,
                        });
                    }
                    saveProject(); // 즉시 저장
                };

                const handleCornersMoved = (
                    id: string,
                    corners: { x: number; y: number }[],
                ) => {
                    useAppStore
                        .getState()
                        .updateWorldObjectCorners(id, corners);
                    saveProject(); // 즉시 저장
                };

                const roomSprites = await createRoomSprites(
                    worldContainer,
                    projectConfig.world.layers.objects,
                    true, // Always create with drag handlers
                    (id, col, row, ox, oy, rot) => {
                        handleObjectMoved(id, col, row, ox, oy, rot);
                        isDraggingBuilding = false; // Release building drag lock
                    },
                    // Callbacks injectables for pan suppression
                    () => {
                        // Only allow drag in studio mode
                        if (activeViewRef.current !== 'studio') return false;
                        isDraggingBuilding = true;
                        return true;
                    },
                    () => {
                        isDraggingBuilding = false;
                    },
                    (id) => {
                        // Object selected
                        selectedBuildingId.current = id;
                    },
                    handleCornersMoved,
                );

                for (const rs of roomSprites) {
                    buildingSpritesMap.set(rs.id, rs.sprite);
                }

                // ── Zone Labels ──
                const labelsContainer = createZoneLabels(
                    gridWorld.cells,
                    gridWorld.cols,
                    gridWorld.rows,
                );
                labelsContainer.zIndex = 1;
                worldContainer.addChild(labelsContainer);

                // ══════════════════════════════════════════════════════
                // ── ANIMAL AGENTS: Load textures + create visuals ──
                // ══════════════════════════════════════════════════════

                const otterTextures = await loadAnimalTextures('otter');
                const catTextures = await loadAnimalTextures('cat');
                const hamsterTextures = await loadAnimalTextures('hamster');
                const dogTextures = await loadAnimalTextures('dog');
                const rabbitTextures = await loadAnimalTextures('rabbit');
                const deskFrames = await loadDeskAnimation();
                if (!isMounted) return;

                const allAnimalTextures: Record<
                    Exclude<AnimalType, 'raccoon'>,
                    AnimalTextures
                > = {
                    otter: otterTextures,
                    cat: catTextures,
                    hamster: hamsterTextures,
                    dog: dogTextures,
                    rabbit: rabbitTextures,
                };

                // Anti-pixelation: set linear scaleMode on animal textures
                for (const textures of Object.values(allAnimalTextures)) {
                    for (const tex of [
                        textures.nw,
                        textures.ne,
                        textures.sw,
                        textures.se,
                    ]) {
                        if (tex?.source) {
                            tex.source.scaleMode = 'linear';
                        }
                    }
                }

                const isoAgents: IsoAgent[] = [];
                const isoAgentMap = new Map<string, IsoAgent>();

                // Dokba를 먼저 생성
                const allProfiles = [DOKBA_PROFILE, ...DEFAULT_AGENTS];

                for (const profile of allProfiles) {
                    const spawnPos = getNearestWalkable(
                        gridWorld,
                        profile.home.x,
                        profile.home.y,
                    );

                    // Direct ID → AnimalType lookup (no role-keyword guessing)
                    const animalType = (AGENT_ANIMAL_MAP[profile.id] ||
                        'otter') as AnimalType;
                    const visual = createAnimalVisual(
                        allAnimalTextures[
                            animalType as keyof typeof allAnimalTextures
                        ] || otterTextures,
                        profile.name,
                        STATE_COLORS.IDLE,
                        animalType as AnimalType,
                    );

                    // Position in isometric screen coords
                    const isoPos = gridToIso(spawnPos.x, spawnPos.y);
                    visual.container.x = isoPos.x;
                    visual.container.y = isoPos.y;

                    // Make clickable
                    visual.container.eventMode = 'static';
                    visual.container.cursor = 'pointer';
                    visual.container.hitArea = new PIXI.Rectangle(
                        -30,
                        -80,
                        60,
                        100,
                    );

                    // Click handler: toggle inspector card via store
                    visual.container.on(
                        'pointertap',
                        (e: PIXI.FederatedPointerEvent) => {
                            e.stopPropagation();
                            const store = useAppStore.getState();
                            const currentId = store.highlightedAgentId;
                            store.setHighlightedAgentId(
                                currentId === profile.id ? null : profile.id,
                            );
                        },
                    );

                    worldContainer.addChild(visual.container);

                    // Initial visibility assumption (will be updated dynamically in the ticker)
                    const isVisible = SOLO_MODE
                        ? profile.id === 'raccoon'
                        : true;

                    const agent: IsoAgent = {
                        id: profile.id,
                        name: profile.name,
                        profile,
                        visual,
                        state: 'IDLE' as AgentState,
                        gridX: spawnPos.x,
                        gridY: spawnPos.y,
                        path: [],
                        pauseTimer: Math.floor(Math.random() * 120) + 60,
                        stateAnimTimer: 0,
                        visible: isVisible,
                        idleDebounceTimer: 0,
                    };

                    // 숨김 처리
                    visual.container.visible = isVisible;

                    isoAgents.push(agent);
                    isoAgentMap.set(profile.id, agent);
                    isoAgentMap.set(profile.name.toLowerCase(), agent);
                }

                // ── Helper: pick wandering destination for an animal agent ──
                const pickIsoWanderDest = (agent: IsoAgent): void => {
                    const near = getRandomWalkableNear(
                        gridWorld,
                        agent.gridX,
                        agent.gridY,
                        IDLE_WANDER_RADIUS,
                    );
                    if (!near) return;
                    const path = findPath(
                        gridWorld,
                        agent.gridX,
                        agent.gridY,
                        near.x,
                        near.y,
                    );
                    agent.path = path; // store as grid coords
                };

                // ── Helper: pick zone destination for an animal agent ──
                const pickIsoZoneDest = (
                    agent: IsoAgent,
                    zone: ZoneType,
                ): void => {
                    const cells = getZoneCellsCached(zone);
                    if (cells.length === 0) {
                        pickIsoWanderDest(agent);
                        return;
                    }
                    const target =
                        cells[Math.floor(Math.random() * cells.length)];
                    const path = findPath(
                        gridWorld,
                        agent.gridX,
                        agent.gridY,
                        target.x,
                        target.y,
                    );
                    agent.path = path;
                };

                // ── Helper: get bubble text for activity, with optional tool-specific text ──
                const getBubbleText = (
                    activity: string,
                    toolName?: string,
                ): string => {
                    // Tool-specific bubble for 'working' state
                    if (activity === 'working' && toolName) {
                        const toolBubble = TOOL_BUBBLES[toolName];
                        if (toolBubble)
                            return `${toolBubble.emoji} ${toolBubble.text}`;
                    }
                    const config = BUBBLE_CONFIGS[activity];
                    if (config) {
                        const text =
                            config.texts[
                                Math.floor(Math.random() * config.texts.length)
                            ];
                        return `${config.emoji} ${text}`;
                    }
                    return activity;
                };

                // Stagger initial pathfinding for visible agents only
                let staggerIndex = 0;
                for (const agent of isoAgents) {
                    setTimeout(() => {
                        if (!isMounted) return;
                        // Stagger start destinations
                        if (agent.id === 'raccoon') {
                            pickIsoZoneDest(agent, 'rest');
                        } else {
                            pickIsoWanderDest(agent);
                        }
                    }, staggerIndex * STAGGER_DELAY_MS);
                    staggerIndex++;
                }

                // ══════════════════════════════════════════════════════
                // ── ZOOM (mouse wheel) ──
                // ══════════════════════════════════════════════════════

                wheelHandler = (e: WheelEvent) => {
                    e.preventDefault();

                    // Determine zoom direction
                    const direction = e.deltaY < 0 ? 1 : -1;
                    const newTarget = Math.min(
                        ZOOM_MAX,
                        Math.max(ZOOM_MIN, targetZoom + direction * ZOOM_STEP),
                    );

                    if (newTarget === targetZoom) return;

                    const rect = app.canvas.getBoundingClientRect();
                    const cursorX = e.clientX - rect.left;
                    const cursorY = e.clientY - rect.top;

                    const worldX = (cursorX - worldContainer.x) / currentZoom;
                    const worldY = (cursorY - worldContainer.y) / currentZoom;

                    const targetPosX = cursorX - worldX * newTarget;
                    const targetPosY = cursorY - worldY * newTarget;

                    targetZoom = newTarget;

                    targetWorldX = targetPosX;
                    targetWorldY = targetPosY;
                };

                // Target world position (updated by wheel handler, lerped in ticker)
                let targetWorldX = worldContainer.x;
                let targetWorldY = worldContainer.y;

                const canvasEl = app.canvas as HTMLCanvasElement;
                canvasEl.addEventListener('wheel', wheelHandler, {
                    passive: false,
                });

                // ══════════════════════════════════════════════════════
                // ── PAN (pointer drag) ──
                // ══════════════════════════════════════════════════════

                pointerDownHandler = (e: PointerEvent) => {
                    if (isDraggingBuilding) return; // Don't pan while dragging a building
                    if (e.button === 0 || e.button === 1) {
                        isDragging = true;
                        lastPointerX = e.clientX;
                        lastPointerY = e.clientY;
                        canvasEl.style.cursor = 'grabbing';
                    }
                };

                pointerMoveHandler = (e: PointerEvent) => {
                    if (!isDragging) return;

                    const dx = e.clientX - lastPointerX;
                    const dy = e.clientY - lastPointerY;
                    lastPointerX = e.clientX;
                    lastPointerY = e.clientY;

                    worldContainer.x += dx;
                    worldContainer.y += dy;

                    targetWorldX = worldContainer.x;
                    targetWorldY = worldContainer.y;
                };

                pointerUpHandler = (_e: PointerEvent) => {
                    if (isDragging) {
                        isDragging = false;
                        canvasEl.style.cursor = 'default';
                    }
                };

                canvasEl.addEventListener('pointerdown', pointerDownHandler);
                window.addEventListener('pointermove', pointerMoveHandler);
                window.addEventListener('pointerup', pointerUpHandler);

                // ══════════════════════════════════════════════════════
                // ── MAP DROP (Asset placement) ──
                // ══════════════════════════════════════════════════════

                dragOverHandler = (e: DragEvent) => {
                    if (activeViewRef.current !== 'studio') return;
                    e.preventDefault(); // Required to allow drop
                };

                dropHandler = (e: DragEvent) => {
                    if (activeViewRef.current !== 'studio') return;
                    e.preventDefault();

                    try {
                        const dataStr =
                            e.dataTransfer?.getData('application/json');
                        if (!dataStr) return;

                        const data = JSON.parse(dataStr);
                        if (data.type !== 'asset') return;

                        // Calculate bounds
                        const rect = canvasEl.getBoundingClientRect();
                        const clientX = e.clientX - rect.left;
                        const clientY = e.clientY - rect.top;

                        // Calculate world coords
                        const worldX =
                            (clientX - worldContainer.x) /
                            worldContainer.scale.x;
                        const worldY =
                            (clientY - worldContainer.y) /
                            worldContainer.scale.y;

                        // Convert ISO world pos to Grid coords
                        const gridPoint = isoToGrid(worldX, worldY);
                        const col = Math.round(gridPoint.col);
                        const row = Math.round(gridPoint.row);

                        // Instantiate WorldObject (using 4x4 default as per ISO_ASSET_GUIDE if no metadata, 6x6 for larger ones depending on preference, we'll use 6x6 to be safe with big buildings)
                        const newObj = {
                            id: `obj-${Date.now()}`,
                            type: 'building' as const,
                            x: col,
                            y: row,
                            width: 6,
                            height: 6,
                            properties: {
                                asset: data.url,
                                isWalkable: false,
                                offsetX: 0,
                                offsetY: 0,
                                rotation: 0,
                            },
                        };

                        const state = useAppStore.getState();
                        const objects = [
                            ...state.projectConfig.world.layers.objects,
                            newObj,
                        ];
                        state.updateProjectConfig({
                            world: {
                                ...state.projectConfig.world,
                                layers: {
                                    ...state.projectConfig.world.layers,
                                    objects,
                                },
                            },
                        });

                        // Instantly save after drop
                        state.saveProject();

                        // Dynamically render the new sprite into the PIXI scene without requiring a refresh
                        createRoomSprites(
                            worldContainer,
                            [newObj],
                            true, // isEditMode
                            handleObjectMoved,
                            () => {
                                isDraggingBuilding = true;
                                return true;
                            },
                            () => {
                                isDraggingBuilding = false;
                            },
                            (id) => {
                                selectedBuildingId.current = id;
                                buildingSpritesMap.forEach((s) => {
                                    s.tint = 0xffffff;
                                });
                            },
                            handleCornersMoved,
                        ).then((newSprites) => {
                            newSprites.forEach((ns) => {
                                buildingSpritesMap.set(ns.id, ns.sprite);
                            });
                        });
                    } catch (err) {
                        console.error('Drop placement failed:', err);
                    }
                };

                canvasEl.addEventListener('dragover', dragOverHandler);
                canvasEl.addEventListener('drop', dropHandler);

                // ══════════════════════════════════════════════════════
                // ── KEYBOARD (Fine-Tune Offsets) ──
                // ══════════════════════════════════════════════════════

                keyDownHandler = (e: KeyboardEvent) => {
                    if (activeViewRef.current !== 'studio') return;
                    const id = selectedBuildingId.current;
                    if (!id) return;

                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault();
                        const state = useAppStore.getState();
                        const newObjects =
                            state.projectConfig.world.layers.objects.filter(
                                (o) => o.id !== id,
                            );

                        state.updateProjectConfig({
                            world: {
                                ...state.projectConfig.world,
                                layers: {
                                    ...state.projectConfig.world.layers,
                                    objects: newObjects,
                                },
                            },
                        });

                        const sprite = buildingSpritesMap.get(id);
                        if (sprite) {
                            worldContainer.removeChild(sprite);
                            sprite.destroy();
                            buildingSpritesMap.delete(id);
                        }

                        selectedBuildingId.current = null;
                        state.saveProject();
                        return;
                    }

                    if (e.key === 't' || e.key === 'T') {
                        e.preventDefault();
                        const sprite = buildingSpritesMap.get(id) as any;
                        if (sprite) {
                            sprite.isTransformMode = !sprite.isTransformMode;
                            sprite.emit(
                                'toggleTransformMode',
                                sprite.isTransformMode,
                            );
                        }
                        return;
                    }

                    if (
                        (e.ctrlKey || e.metaKey) &&
                        (e.key === 'z' || e.key === 'Z')
                    ) {
                        e.preventDefault();
                        const state = useAppStore.getState();
                        if (state.undoStack.length > 0) {
                            state.undo();

                            // Immediately rebuild PIXI sprites to visually match undone State
                            buildingSpritesMap.forEach((sprite) => {
                                worldContainer.removeChild(sprite);
                                sprite.destroy();
                            });
                            buildingSpritesMap.clear();

                            // Use fresh config state after undo
                            const restoredObjects =
                                useAppStore.getState().projectConfig.world
                                    .layers.objects;
                            createRoomSprites(
                                worldContainer,
                                restoredObjects,
                                true, // isEditMode
                                (oid, col, row, ox, oy, rot) => {
                                    useAppStore
                                        .getState()
                                        .updateWorldObject(oid, col, row);
                                    if (ox !== undefined && oy !== undefined) {
                                        useAppStore
                                            .getState()
                                            .updateWorldObjectProperties(oid, {
                                                offsetX: ox,
                                                offsetY: oy,
                                                rotation: rot,
                                            });
                                    }
                                    useAppStore.getState().saveProject();
                                    isDraggingBuilding = false;
                                },
                                () => {
                                    if (activeViewRef.current !== 'studio')
                                        return false;
                                    isDraggingBuilding = true;
                                    return true;
                                },
                                () => {
                                    isDraggingBuilding = false;
                                },
                                (sid) => {
                                    selectedBuildingId.current = sid;
                                    buildingSpritesMap.forEach((s) => {
                                        s.tint = 0xffffff;
                                    });
                                },
                                (oid, corners) => {
                                    useAppStore
                                        .getState()
                                        .updateWorldObjectCorners(oid, corners);
                                    useAppStore.getState().saveProject();
                                },
                            ).then((newSprites) => {
                                newSprites.forEach((ns) => {
                                    buildingSpritesMap.set(ns.id, ns.sprite);
                                });
                                // Restore visual selection
                                if (selectedBuildingId.current) {
                                    const reborn = buildingSpritesMap.get(
                                        selectedBuildingId.current,
                                    );
                                    if (reborn) {
                                        reborn.tint = 0xffffaa;
                                        reborn.alpha = 0.6;
                                    }
                                }
                            });
                        }
                        return;
                    }

                    // ── Ctrl+C (Copy) ──
                    if (
                        (e.ctrlKey || e.metaKey) &&
                        (e.key === 'c' || e.key === 'C')
                    ) {
                        e.preventDefault();
                        const state = useAppStore.getState();
                        const targetObj =
                            state.projectConfig.world.layers.objects.find(
                                (o) => o.id === id,
                            );
                        if (targetObj) {
                            state.setClipboard(
                                JSON.parse(JSON.stringify(targetObj)),
                            );
                            console.log(
                                '[Clipboard] Copied object:',
                                targetObj.id,
                            );
                        }
                        return;
                    }

                    // ── Ctrl+V (Paste) ──
                    if (
                        (e.ctrlKey || e.metaKey) &&
                        (e.key === 'v' || e.key === 'V')
                    ) {
                        e.preventDefault();
                        const state = useAppStore.getState();
                        const clipboard = state.clipboard;
                        if (clipboard) {
                            // Instantiate new object based on clipboard
                            const newObj = JSON.parse(
                                JSON.stringify(clipboard),
                            ) as WorldObject;
                            newObj.id = `obj-${Date.now()}`;
                            // Offset slightly on the grid for visual separation
                            newObj.x += 1;
                            newObj.y += 1;

                            const objects = [
                                ...state.projectConfig.world.layers.objects,
                                newObj,
                            ];
                            state.updateProjectConfig({
                                world: {
                                    ...state.projectConfig.world,
                                    layers: {
                                        ...state.projectConfig.world.layers,
                                        objects,
                                    },
                                },
                            });
                            state.saveProject();

                            // Render immediately
                            createRoomSprites(
                                worldContainer,
                                [newObj],
                                true,
                                (oid, col, row, ox, oy, rot) => {
                                    useAppStore
                                        .getState()
                                        .updateWorldObject(oid, col, row);
                                    if (ox !== undefined && oy !== undefined) {
                                        useAppStore
                                            .getState()
                                            .updateWorldObjectProperties(oid, {
                                                offsetX: ox,
                                                offsetY: oy,
                                                rotation: rot,
                                            });
                                    }
                                    useAppStore.getState().saveProject();
                                    isDraggingBuilding = false;
                                },
                                () => {
                                    if (activeViewRef.current !== 'studio')
                                        return false;
                                    isDraggingBuilding = true;
                                    return true;
                                },
                                () => {
                                    isDraggingBuilding = false;
                                },
                                (sid) => {
                                    selectedBuildingId.current = sid;
                                    buildingSpritesMap.forEach((s) => {
                                        s.tint = 0xffffff;
                                    });
                                },
                                (oid, corners) => {
                                    useAppStore
                                        .getState()
                                        .updateWorldObjectCorners(oid, corners);
                                    useAppStore.getState().saveProject();
                                },
                            ).then((newSprites) => {
                                newSprites.forEach((ns) => {
                                    buildingSpritesMap.set(ns.id, ns.sprite);
                                });
                                // Auto-select the pasted object
                                selectedBuildingId.current = newObj.id;
                                const pastedSprite = buildingSpritesMap.get(
                                    newObj.id,
                                );
                                if (pastedSprite) {
                                    pastedSprite.tint = 0xffffaa;
                                }
                            });

                            console.log(
                                '[Clipboard] Pasted object:',
                                newObj.id,
                            );
                        }
                        return;
                    }

                    const keys = [
                        'ArrowUp',
                        'ArrowDown',
                        'ArrowLeft',
                        'ArrowRight',
                        '[',
                        ']',
                    ];
                    if (keys.includes(e.key)) {
                        e.preventDefault();
                    } else {
                        return; // Ignore other keys
                    }

                    const state = useAppStore.getState();
                    const obj = state.projectConfig.world.layers.objects.find(
                        (o) => o.id === id,
                    );
                    if (!obj) return;

                    const props = obj.properties || {};
                    let ox = (props.offsetX as number) || 0;
                    let oy = (props.offsetY as number) || 0;
                    let rot = (props.rotation as number) || 0;

                    const step = e.shiftKey ? 5 : 1;
                    const rotStep = e.shiftKey ? 0.05 : 0.01;

                    if (e.key === 'ArrowUp') oy -= step;
                    if (e.key === 'ArrowDown') oy += step;
                    if (e.key === 'ArrowLeft') ox -= step;
                    if (e.key === 'ArrowRight') ox += step;
                    if (e.key === '[') rot -= rotStep;
                    if (e.key === ']') rot += rotStep;

                    // Immediately apply visually
                    const sprite = buildingSpritesMap.get(id);
                    if (sprite) {
                        const baseIso = gridToIso(obj.x, obj.y);
                        sprite.x = baseIso.x + ox;
                        sprite.y = baseIso.y + oy;
                        sprite.rotation = rot;
                    }

                    // Save to store
                    state.updateWorldObjectProperties(id, {
                        offsetX: ox,
                        offsetY: oy,
                        rotation: rot,
                    });
                    state.saveProject();
                };

                window.addEventListener('keydown', keyDownHandler);

                // ══════════════════════════════════════════════════════
                // ── BACKGROUND DESELECT ──
                // ══════════════════════════════════════════════════════

                floorContainer.eventMode = 'static';
                floorContainer.on('pointerdown', () => {
                    selectedBuildingId.current = null;
                    // Reset visual highlight
                    buildingSpritesMap.forEach((sprite) => {
                        sprite.tint = 0xffffff;
                    });
                });

                // ══════════════════════════════════════════════════════
                // ── RESIZE OBSERVER ──
                // ══════════════════════════════════════════════════════

                resizeObserver = new ResizeObserver((entries) => {
                    if (!isMounted || !containerRef.current) return;

                    for (const entry of entries) {
                        const { width: newW, height: newH } = entry.contentRect;
                        if (newW === 0 || newH === 0) continue;

                        app.renderer.resize(newW, newH);

                        worldContainer.x =
                            newW / 2 - mapCenterIso.x * currentZoom;
                        worldContainer.y =
                            newH / 2 - mapCenterIso.y * currentZoom;

                        targetWorldX = worldContainer.x;
                        targetWorldY = worldContainer.y;
                    }
                });

                resizeObserver.observe(containerRef.current);

                // ══════════════════════════════════════════════════════
                // ── useTerminalStore ↔ AgentTown 연결 ──
                // ══════════════════════════════════════════════════════

                unsubTerminal = useTerminalStore.subscribe(
                    (state, prevState) => {
                        // ── 팀원 캐릭터 표시/숨김 ──
                        if (
                            state.activeTeamMembers !==
                            prevState.activeTeamMembers
                        ) {
                            const currentTeamAgentIds = new Set(
                                Object.values(state.activeTeamMembers),
                            );
                            const prevTeamAgentIds = new Set(
                                Object.values(prevState.activeTeamMembers),
                            );

                            for (const agent of isoAgents) {
                                if (
                                    agent.id === 'raccoon' ||
                                    agent.id === 'cto'
                                )
                                    continue;

                                const inTeam = currentTeamAgentIds.has(
                                    agent.id,
                                );
                                const wasInTeam = prevTeamAgentIds.has(
                                    agent.id,
                                );

                                if (inTeam && !wasInTeam) {
                                    // 새로 팀에 합류: 보이게 + WORK ZONE으로 이동
                                    agent.visible = true;
                                    agent.visual.container.visible = true;
                                    agent.state = 'IDLE';
                                    agent.visual.animState = 'idle';
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.IDLE,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText('connecting'),
                                    );
                                    pickIsoZoneDest(agent, 'work');
                                } else if (!inTeam && wasInTeam) {
                                    // 팀에서 제거: 숨김 + 상태 초기화
                                    agent.visible = false;
                                    agent.visual.container.visible = false;
                                    agent.path = [];
                                    agent.state = 'IDLE';
                                    agent.visual.animState = 'idle';
                                    agent.stateAnimTimer = 0;
                                    agent.idleDebounceTimer = 0;
                                }
                            }
                        }

                        // ── 탭 상태 변경 감지 ──
                        for (const tab of state.tabs) {
                            const prev = prevState.tabs.find(
                                (t) => t.id === tab.id,
                            );
                            if (prev && prev.status === tab.status) continue;

                            if (!tab.agentId) continue;
                            const agent = isoAgentMap.get(tab.agentId);
                            if (!agent || agent.id === 'cto') continue;

                            if (tab.status === 'connecting') {
                                // A-1: connecting에서 Work Zone 이동 제거 — REST에서 대기
                                agent.state = 'IDLE';
                                agent.visual.animState = 'idle';
                                updateAnimalStateDot(
                                    agent.visual as AnimalVisual,
                                    STATE_COLORS.IDLE,
                                );
                                showAnimalBubble(
                                    agent.visual as AnimalVisual,
                                    getBubbleText('connecting'),
                                );
                            } else if (tab.status === 'connected') {
                                agent.state = 'IDLE';
                                agent.visual.animState = 'idle';
                                agent.stateAnimTimer = 0;
                                updateAnimalStateDot(
                                    agent.visual as AnimalVisual,
                                    STATE_COLORS.IDLE,
                                );
                                showAnimalBubble(
                                    agent.visual as AnimalVisual,
                                    getBubbleText('connected'),
                                );
                            } else if (tab.status === 'exited') {
                                agent.state = 'SUCCESS';
                                agent.visual.animState = 'success';
                                agent.stateAnimTimer = 0;
                                updateAnimalStateDot(
                                    agent.visual as AnimalVisual,
                                    STATE_COLORS.SUCCESS,
                                );
                                showAnimalBubble(
                                    agent.visual as AnimalVisual,
                                    getBubbleText('exited'),
                                );
                            }
                        }

                        // ── 에이전트 활동 상태 변경 → 시각적 반응 + 게이미피케이션 ──
                        for (const [agentId, activity] of Object.entries(
                            state.agentActivity,
                        )) {
                            const prevActivity =
                                prevState.agentActivity[agentId];
                            if (prevActivity === activity) continue;

                            const agent = isoAgentMap.get(agentId);
                            if (!agent || agent.id === 'cto') continue;

                            // 활동 상태 변경 시 idle 디바운스 리셋
                            if (activity !== 'idle') {
                                agent.idleDebounceTimer = 0;
                            }

                            switch (activity) {
                                case 'thinking':
                                    agent.state = 'THINKING';
                                    agent.visual.animState = 'think';
                                    agent.stateAnimTimer = 0;
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.THINKING,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText('thinking'),
                                    );
                                    pickIsoZoneDest(agent, 'work');
                                    break;
                                case 'working': {
                                    agent.state = 'RUNNING';
                                    agent.visual.animState = 'walk';
                                    agent.stateAnimTimer = 0;
                                    const tab = state.tabs.find(
                                        (t) => t.agentId === agentId,
                                    );
                                    const msgs = tab
                                        ? state.parsedMessages[tab.id]
                                        : undefined;
                                    const lastToolEvent = msgs
                                        ?.slice(-5)
                                        .reverse()
                                        .find((e) => e.type === 'tool_use');
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.RUNNING,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText(
                                            'working',
                                            lastToolEvent?.toolName,
                                        ),
                                    );
                                    pickIsoZoneDest(agent, 'work');
                                    break;
                                }
                                case 'reading': {
                                    agent.state = 'READING';
                                    agent.visual.animState = 'walk';
                                    agent.stateAnimTimer = 0;
                                    const tab = state.tabs.find(
                                        (t) => t.agentId === agentId,
                                    );
                                    const msgs = tab
                                        ? state.parsedMessages[tab.id]
                                        : undefined;
                                    const lastToolEvent = msgs
                                        ?.slice(-5)
                                        .reverse()
                                        .find((e) => e.type === 'tool_use');
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.READING,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText(
                                            'reading',
                                            lastToolEvent?.toolName,
                                        ),
                                    );
                                    pickIsoZoneDest(agent, 'meeting');
                                    break;
                                }
                                case 'typing': {
                                    agent.state = 'TYPING';
                                    agent.visual.animState = 'walk';
                                    agent.stateAnimTimer = 0;
                                    const tab = state.tabs.find(
                                        (t) => t.agentId === agentId,
                                    );
                                    const msgs = tab
                                        ? state.parsedMessages[tab.id]
                                        : undefined;
                                    const lastToolEvent = msgs
                                        ?.slice(-5)
                                        .reverse()
                                        .find((e) => e.type === 'tool_use');
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.TYPING,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText(
                                            'typing',
                                            lastToolEvent?.toolName,
                                        ),
                                    );
                                    pickIsoZoneDest(agent, 'work');
                                    break;
                                }
                                case 'writing': {
                                    agent.state = 'WRITING';
                                    agent.visual.animState = 'walk';
                                    agent.stateAnimTimer = 0;
                                    const tab = state.tabs.find(
                                        (t) => t.agentId === agentId,
                                    );
                                    const msgs = tab
                                        ? state.parsedMessages[tab.id]
                                        : undefined;
                                    const lastToolEvent = msgs
                                        ?.slice(-5)
                                        .reverse()
                                        .find((e) => e.type === 'tool_use');
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.WRITING,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText(
                                            'writing',
                                            lastToolEvent?.toolName,
                                        ),
                                    );
                                    pickIsoZoneDest(agent, 'work');
                                    break;
                                }
                                case 'success': {
                                    agent.state = 'SUCCESS';
                                    agent.visual.animState = 'success';
                                    agent.stateAnimTimer = 0;
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.SUCCESS,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText('success'),
                                    );
                                    // 게이미피케이션: XP + 코인 적립
                                    const appStore = useAppStore.getState();
                                    const hadError = prevActivity === 'error';
                                    appStore.addPoints(hadError ? 10 : 15);
                                    appStore.addCoins(5);
                                    // 레벨업 체크 및 토스트
                                    const newGam =
                                        useAppStore.getState().gamification;
                                    if (
                                        newGam.lastLevelUp &&
                                        newGam.lastLevelUp > Date.now() - 1000
                                    ) {
                                        appStore.addToast({
                                            type: 'success',
                                            message: `\uB808\uBCA8 \uC5C5! Lv.${newGam.level} ${newGam.levelTitle}`,
                                        });
                                    }
                                    break;
                                }
                                case 'error':
                                    agent.state = 'ERROR';
                                    agent.visual.animState = 'error';
                                    agent.stateAnimTimer = 0;
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.ERROR,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText('error'),
                                    );
                                    break;
                                case 'idle':
                                    // A-2: idle 디바운스 — 즉시 전환하지 않고 타이머만 시작
                                    // 실제 REST 복귀는 애니메이션 루프에서 IDLE_DEBOUNCE_FRAMES 경과 후 처리
                                    if (
                                        agent.state === 'THINKING' ||
                                        agent.state === 'RUNNING' ||
                                        agent.state === 'READING' ||
                                        agent.state === 'TYPING' ||
                                        agent.state === 'WRITING'
                                    ) {
                                        agent.idleDebounceTimer = 1; // 디바운스 카운트 시작
                                    }
                                    break;
                            }

                            // ── Growth System integration ──
                            const growthTab = state.tabs.find(
                                (t) => t.agentId === agentId,
                            );
                            const recentEvents = growthTab
                                ? (state.parsedMessages[growthTab.id] ?? [])
                                : [];
                            const teamSize =
                                Object.keys(state.activeTeamMembers).length + 1; // +1 for Dokba
                            const growthEvents = processActivityChange(
                                agentId,
                                activity,
                                prevActivity,
                                recentEvents,
                                teamSize,
                            );

                            // Show level-up toast
                            for (const ge of growthEvents) {
                                if (ge.type === 'level_up') {
                                    const appStore = useAppStore.getState();
                                    appStore.addToast({
                                        type: 'success',
                                        message: `${agent?.id ?? agentId} 레벨 업! Lv.${ge.details.newLevel}`,
                                    });
                                }
                            }
                        }
                    },
                );

                // ══════════════════════════════════════════════════════
                // ── Animation Loop ──
                // ══════════════════════════════════════════════════════
                app.ticker.add(() => {
                    const now = Date.now();

                    // ── Smooth zoom interpolation ──
                    if (Math.abs(currentZoom - targetZoom) > 0.001) {
                        currentZoom +=
                            (targetZoom - currentZoom) * ZOOM_LERP_FACTOR;
                        worldContainer.scale.set(currentZoom);

                        worldContainer.x +=
                            (targetWorldX - worldContainer.x) *
                            ZOOM_LERP_FACTOR;
                        worldContainer.y +=
                            (targetWorldY - worldContainer.y) *
                            ZOOM_LERP_FACTOR;
                    } else if (currentZoom !== targetZoom) {
                        currentZoom = targetZoom;
                        worldContainer.scale.set(currentZoom);
                        worldContainer.x = targetWorldX;
                        worldContainer.y = targetWorldY;
                    }

                    // ── Dynamic Visibility Sync with Dock (MUST be before skip guard) ──
                    const currentDockAgents =
                        useTerminalStore.getState().dockAgents || [];

                    for (const agent of isoAgents) {
                        // Sync visibility with dock
                        const shouldBeVisible = SOLO_MODE
                            ? agent.id === 'raccoon'
                            : currentDockAgents.includes(agent.id);

                        if (agent.visible !== shouldBeVisible) {
                            agent.visible = shouldBeVisible;
                            agent.visual.container.visible = shouldBeVisible;

                            // When becoming visible, trigger initial pathfinding
                            if (shouldBeVisible && agent.path.length === 0) {
                                if (agent.id === 'raccoon') {
                                    pickIsoZoneDest(agent, 'rest');
                                } else {
                                    pickIsoWanderDest(agent);
                                }
                            }
                        }

                        // Skip invisible agents
                        if (!agent.visible) continue;

                        // Bubble tick
                        tickAnimalBubble(agent.visual as AnimalVisual);

                        // ── A-2: Idle debounce — 3초 경과 후 실제 REST 복귀 ──
                        if (agent.idleDebounceTimer > 0) {
                            agent.idleDebounceTimer++;
                            if (
                                agent.idleDebounceTimer >= IDLE_DEBOUNCE_FRAMES
                            ) {
                                agent.idleDebounceTimer = 0;
                                // 아직 작업 중인 상태면 이제 진짜 SLEEPING/IDLE로 전환
                                if (
                                    agent.state === 'THINKING' ||
                                    agent.state === 'RUNNING' ||
                                    agent.state === 'READING' ||
                                    agent.state === 'TYPING' ||
                                    agent.state === 'WRITING'
                                ) {
                                    hideDeskAnimation(
                                        agent.visual as AnimalVisual,
                                    );
                                    agent.state = 'SLEEPING';
                                    agent.visual.animState = 'walk';
                                    agent.stateAnimTimer = 0;
                                    updateAnimalStateDot(
                                        agent.visual as AnimalVisual,
                                        STATE_COLORS.SLEEPING,
                                    );
                                    showAnimalBubble(
                                        agent.visual as AnimalVisual,
                                        getBubbleText('sleeping'),
                                    );
                                    pickIsoZoneDest(agent, 'rest');
                                }
                            }
                        }

                        // ── THINKING: walk to destination first, then sway in place ──
                        if (agent.state === 'THINKING') {
                            hideDeskAnimation(agent.visual as AnimalVisual);
                            if (agent.path.length > 0) {
                                const target = agent.path[0];
                                const targetIso = gridToIso(target.x, target.y);
                                const dx =
                                    targetIso.x - agent.visual.container.x;
                                const dy =
                                    targetIso.y - agent.visual.container.y;
                                const dist = Math.sqrt(dx * dx + dy * dy);

                                if (dist > AGENT_SPEED_PX) {
                                    agent.visual.container.x +=
                                        (dx / dist) * AGENT_SPEED_PX;
                                    agent.visual.container.y +=
                                        (dy / dist) * AGENT_SPEED_PX;
                                    const gridDx = target.x - agent.gridX;
                                    const gridDy = target.y - agent.gridY;
                                    const dir = getIsoDirection(gridDx, gridDy);
                                    const animalVisual =
                                        agent.visual as AnimalVisual;
                                    setAnimalDirection(
                                        animalVisual,
                                        allAnimalTextures[
                                            animalVisual.animalType as Exclude<
                                                AnimalType,
                                                'raccoon'
                                            >
                                        ] || otterTextures,
                                        dir,
                                    );
                                } else {
                                    agent.visual.container.x = targetIso.x;
                                    agent.visual.container.y = targetIso.y;
                                    agent.gridX = target.x;
                                    agent.gridY = target.y;
                                    agent.path.shift();
                                }
                                tickAnimalAnimation(
                                    agent.visual as AnimalVisual,
                                    now,
                                    true,
                                );
                            } else {
                                agent.visual.animState = 'think';
                                tickAnimalAnimation(
                                    agent.visual as AnimalVisual,
                                    now,
                                    false,
                                );
                            }
                            continue;
                        }

                        // ── SUCCESS: celebratory bounce, then return to REST AREA (A-3: 5초 딜레이) ──
                        if (agent.state === 'SUCCESS') {
                            hideDeskAnimation(agent.visual as AnimalVisual);
                            agent.visual.animState = 'success';
                            agent.stateAnimTimer++;
                            tickAnimalAnimation(
                                agent.visual as AnimalVisual,
                                now,
                                false,
                            );
                            if (
                                agent.stateAnimTimer >=
                                SUCCESS_REST_DELAY_FRAMES
                            ) {
                                agent.state = 'IDLE';
                                agent.visual.animState = 'idle';
                                agent.stateAnimTimer = 0;
                                updateAnimalStateDot(
                                    agent.visual as AnimalVisual,
                                    STATE_COLORS.IDLE,
                                );
                                showAnimalBubble(
                                    agent.visual as AnimalVisual,
                                    getBubbleText('idle'),
                                );
                                pickIsoZoneDest(agent, 'rest');
                            }
                            continue;
                        }

                        // ── ERROR: shake + red flash, then return to REST AREA (A-3: 5초 딜레이) ──
                        if (agent.state === 'ERROR') {
                            hideDeskAnimation(agent.visual as AnimalVisual);
                            agent.visual.animState = 'error';
                            agent.stateAnimTimer++;
                            tickAnimalAnimation(
                                agent.visual as AnimalVisual,
                                now,
                                false,
                            );
                            if (
                                agent.stateAnimTimer >=
                                SUCCESS_REST_DELAY_FRAMES
                            ) {
                                agent.state = 'IDLE';
                                agent.visual.animState = 'idle';
                                agent.stateAnimTimer = 0;
                                agent.visual.sprite.tint = 0xffffff;
                                agent.visual.sprite.x = 0;
                                updateAnimalStateDot(
                                    agent.visual as AnimalVisual,
                                    STATE_COLORS.IDLE,
                                );
                                showAnimalBubble(
                                    agent.visual as AnimalVisual,
                                    getBubbleText('idle'),
                                );
                                pickIsoZoneDest(agent, 'rest');
                            }
                            continue;
                        }

                        // ── Movement along path (grid coords -> iso screen coords) ──
                        const isMoving = agent.path.length > 0;

                        if (agent.path.length > 0) {
                            // Stop desk animation when walking
                            hideDeskAnimation(agent.visual as AnimalVisual);

                            const target = agent.path[0];
                            const targetIso = gridToIso(target.x, target.y);
                            const dx = targetIso.x - agent.visual.container.x;
                            const dy = targetIso.y - agent.visual.container.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);

                            const speed =
                                agent.state === 'RUNNING'
                                    ? AGENT_SPEED_PX * 1.6
                                    : AGENT_SPEED_PX;

                            if (dist > speed) {
                                agent.visual.container.x += (dx / dist) * speed;
                                agent.visual.container.y += (dy / dist) * speed;

                                const gridDx = target.x - agent.gridX;
                                const gridDy = target.y - agent.gridY;
                                const dir = getIsoDirection(gridDx, gridDy);
                                const animalVisual =
                                    agent.visual as AnimalVisual;
                                setAnimalDirection(
                                    animalVisual,
                                    allAnimalTextures[
                                        animalVisual.animalType as Exclude<
                                            AnimalType,
                                            'raccoon'
                                        >
                                    ] || otterTextures,
                                    dir,
                                );
                            } else {
                                agent.visual.container.x = targetIso.x;
                                agent.visual.container.y = targetIso.y;
                                agent.gridX = target.x;
                                agent.gridY = target.y;
                                agent.path.shift();
                            }
                        } else {
                            // Reached destination, apply specific task animation if applicable
                            if (
                                agent.state === 'READING' ||
                                agent.state === 'TYPING' ||
                                agent.state === 'WRITING' ||
                                agent.state === 'RUNNING'
                            ) {
                                // Show desk animation for work states
                                showDeskAnimation(
                                    agent.visual as AnimalVisual,
                                    deskFrames,
                                );
                            } else {
                                // Not working — hide desk if showing
                                hideDeskAnimation(agent.visual as AnimalVisual);
                            }

                            if (agent.state === 'SLEEPING')
                                agent.visual.animState = 'sleep';

                            // Pause then pick new destination
                            agent.pauseTimer++;
                            const pauseFrames = 120 + Math.random() * 180;
                            if (agent.pauseTimer >= pauseFrames) {
                                agent.pauseTimer = 0;
                                if (
                                    agent.state === 'IDLE' ||
                                    agent.state === 'WALK' ||
                                    agent.state === 'SLEEPING'
                                ) {
                                    // IDLE 시 REST AREA 근처에서 배회
                                    if (agent.id === 'raccoon') {
                                        pickIsoZoneDest(agent, 'rest');
                                    } else {
                                        pickIsoWanderDest(agent);
                                    }
                                } else if (
                                    agent.state === 'RUNNING' ||
                                    agent.state === 'TYPING' ||
                                    agent.state === 'WRITING'
                                ) {
                                    pickIsoZoneDest(agent, 'work');
                                } else if (agent.state === 'READING') {
                                    pickIsoZoneDest(agent, 'meeting');
                                }
                            }
                        }

                        tickAnimalAnimation(agent.visual, now, isMoving);
                    }

                    // ── Depth sort: re-order children by iso depth (row+col) ──
                    for (const agent of isoAgents) {
                        if (!agent.visible) continue;
                        agent.visual.container.zIndex =
                            100 + agent.gridX + agent.gridY;
                    }

                    // Also sort building sprites dynamically so they interleave with characters
                    buildingSpritesMap.forEach((sprite) => {
                        const grid = isoToGrid(sprite.x, sprite.y);
                        // Add fraction to stabilize sorting between cells
                        sprite.zIndex = 100 + grid.col + grid.row + 0.5;
                    });

                    worldContainer.sortChildren();
                }); // close ticker.add
            } catch (err: any) {
                console.error('AgentTown Rendering Error:', err);
                setRenderError(err.message || String(err));
            }
        };

        initPixi();

        return () => {
            isMounted = false;

            if (canvasElRef) {
                if (wheelHandler) {
                    canvasElRef.removeEventListener('wheel', wheelHandler);
                    wheelHandler = null;
                }
                if (pointerDownHandler) {
                    canvasElRef.removeEventListener(
                        'pointerdown',
                        pointerDownHandler,
                    );
                    pointerDownHandler = null;
                }
                if (dragOverHandler) {
                    canvasElRef.removeEventListener(
                        'dragover',
                        dragOverHandler,
                    );
                    dragOverHandler = null;
                }
                if (dropHandler) {
                    canvasElRef.removeEventListener('drop', dropHandler);
                    dropHandler = null;
                }
                canvasElRef = null;
            }
            if (pointerMoveHandler) {
                window.removeEventListener('pointermove', pointerMoveHandler);
                pointerMoveHandler = null;
            }
            if (pointerUpHandler) {
                window.removeEventListener('pointerup', pointerUpHandler);
                pointerUpHandler = null;
            }
            if (keyDownHandler) {
                window.removeEventListener('keydown', keyDownHandler);
                keyDownHandler = null;
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }

            if (unsubTerminal) {
                unsubTerminal();
                unsubTerminal = null;
            }

            if (appRef.current) {
                try {
                    appRef.current.destroy();
                } catch (_) {
                    /* HMR safe: _cancelResize etc. */
                }
                appRef.current = null;
            }
        };
    }, []);

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

    return (
        <div className="relative w-full h-full bg-[#fdfaf6] overflow-hidden">
            <div
                ref={containerRef}
                className="absolute inset-0 select-none touch-none z-0"
                style={{ WebkitTapHighlightColor: 'transparent' }}
            />
        </div>
    );
};
