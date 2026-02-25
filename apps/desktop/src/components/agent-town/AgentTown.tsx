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
import { DEFAULT_AGENTS } from '../../types/platform';

// Isometric coordinate system
import {
    gridToIso,
    getIsoCanvasSize,
    getCameraOffset,
    getIsoDirection,
} from '../../systems/isometric';

// Isometric floor/room renderer
import {
    createIsoFloor,
    createRoomSprites,
    createZoneLabels,
} from './iso-renderer';

// Otter character system
import {
    loadOtterTextures,
    createOtterVisual,
    setOtterDirection,
    tickOtterAnimation,
    updateOtterStateDot,
    showOtterBubble,
    tickOtterBubble,
    type OtterTextures,
    type OtterVisual,
} from './otter-runtime';

// Agent runtime constants (still used for speeds, colors, stagger)
import {
    STATE_COLORS,
    AGENT_SPEED_TILES_PER_SEC,
    IDLE_WANDER_RADIUS,
    STAGGER_DELAY_MS,
} from './agent-runtime';

// ── Isometric agent speed: pixels per frame ──
const AGENT_SPEED_PX = AGENT_SPEED_TILES_PER_SEC * 1.0;

// ── Zoom constraints ──
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.15;
const ZOOM_LERP_FACTOR = 0.1;

// ── Per-agent isometric runtime state ──
interface IsoAgent {
    id: string;
    name: string;
    profile: AgentProfile;
    visual: OtterVisual;
    state: AgentState;
    gridX: number;
    gridY: number;
    path: { x: number; y: number }[]; // grid coords
    pauseTimer: number;
    stateAnimTimer: number;
}

export const AgentTown: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const [renderError, setRenderError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        let wsRef: WebSocket | null = null;
        let reconnectTimerRef: ReturnType<typeof setTimeout> | null = null;

        // References for cleanup of event listeners and observers
        let wheelHandler: ((e: WheelEvent) => void) | null = null;
        let pointerDownHandler: ((e: PointerEvent) => void) | null = null;
        let pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
        let pointerUpHandler: ((e: PointerEvent) => void) | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let canvasElRef: HTMLCanvasElement | null = null;

        const initPixi = async () => {
            try {
                if (!containerRef.current) return;

                // Remove existing canvas (HMR safety)
                const existingCanvas = containerRef.current.querySelector('canvas');
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
                // The iso map's visual center is roughly at the midpoint of the bounding box.
                // gridToIso maps (0,0) to the "top" of the diamond.
                // The center of a 40x25 grid in iso coords:
                const mapCenterIso = gridToIso(20, 12);
                // Position worldContainer so mapCenterIso lands at viewport center
                worldContainer.x = viewW / 2 - mapCenterIso.x * currentZoom;
                worldContainer.y = viewH / 2 - mapCenterIso.y * currentZoom;
                worldContainer.scale.set(currentZoom);

                // Drag/pan state
                let isDragging = false;
                let lastPointerX = 0;
                let lastPointerY = 0;

                // ── Grid World Generation ──
                const gridWorld = createDefaultWorld();

                // Pre-compute zone cells for performance
                const zoneCellsCache: Record<string, { x: number; y: number }[]> = {};
                const getZoneCellsCached = (zone: ZoneType): { x: number; y: number }[] => {
                    if (!zoneCellsCache[zone]) {
                        zoneCellsCache[zone] = getZoneCells(gridWorld, zone);
                    }
                    return zoneCellsCache[zone];
                };

                // ── Isometric Floor ──
                const floorContainer = createIsoFloor(gridWorld.cells, gridWorld.cols, gridWorld.rows);
                floorContainer.zIndex = 0;
                worldContainer.addChild(floorContainer);

                // ── Room Asset Sprites ──
                const roomSprites = await createRoomSprites(worldContainer);

                // Anti-pixelation: set linear scaleMode on room sprite textures
                for (const roomSprite of roomSprites) {
                    if (roomSprite.texture?.source) {
                        roomSprite.texture.source.scaleMode = 'linear';
                    }
                }

                // ── Zone Labels ──
                const labelsContainer = createZoneLabels(gridWorld.cells, gridWorld.cols, gridWorld.rows);
                labelsContainer.zIndex = 1;
                worldContainer.addChild(labelsContainer);

                // ══════════════════════════════════════════════════════
                // ── OTTER AGENTS: Load textures + create visuals ──
                // ══════════════════════════════════════════════════════

                const otterTextures: OtterTextures = await loadOtterTextures();
                if (!isMounted) return;

                // Anti-pixelation: set linear scaleMode on otter textures
                for (const tex of [otterTextures.nw, otterTextures.ne, otterTextures.sw, otterTextures.se]) {
                    if (tex?.source) {
                        tex.source.scaleMode = 'linear';
                    }
                }

                const isoAgents: IsoAgent[] = [];
                const isoAgentMap = new Map<string, IsoAgent>();

                for (const profile of DEFAULT_AGENTS) {
                    const spawnPos = getNearestWalkable(gridWorld, profile.home.x, profile.home.y);
                    const visual = createOtterVisual(otterTextures, profile.name, STATE_COLORS.IDLE);

                    // Position in isometric screen coords
                    const isoPos = gridToIso(spawnPos.x, spawnPos.y);
                    visual.container.x = isoPos.x;
                    visual.container.y = isoPos.y;

                    // Make clickable
                    visual.container.eventMode = 'static';
                    visual.container.cursor = 'pointer';
                    visual.container.hitArea = new PIXI.Rectangle(-30, -80, 60, 100);

                    worldContainer.addChild(visual.container);

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
                    };

                    isoAgents.push(agent);
                    isoAgentMap.set(profile.id, agent);
                    isoAgentMap.set(profile.name.toLowerCase(), agent);
                }

                // ── Helper: pick wandering destination for an otter agent ──
                const pickIsoWanderDest = (agent: IsoAgent): void => {
                    const near = getRandomWalkableNear(
                        gridWorld,
                        agent.gridX,
                        agent.gridY,
                        IDLE_WANDER_RADIUS,
                    );
                    if (!near) return;
                    const path = findPath(gridWorld, agent.gridX, agent.gridY, near.x, near.y);
                    agent.path = path; // store as grid coords
                };

                // ── Helper: pick zone destination for an otter agent ──
                const pickIsoZoneDest = (agent: IsoAgent, zone: ZoneType): void => {
                    const cells = getZoneCellsCached(zone);
                    if (cells.length === 0) {
                        pickIsoWanderDest(agent);
                        return;
                    }
                    const target = cells[Math.floor(Math.random() * cells.length)];
                    const path = findPath(gridWorld, agent.gridX, agent.gridY, target.x, target.y);
                    agent.path = path;
                };

                // Stagger initial pathfinding for agents
                for (let i = 0; i < isoAgents.length; i++) {
                    const agent = isoAgents[i];
                    setTimeout(() => {
                        if (!isMounted) return;
                        pickIsoWanderDest(agent);
                    }, i * STAGGER_DELAY_MS);
                }

                // ══════════════════════════════════════════════════════
                // ── ZOOM (mouse wheel) ──
                // ══════════════════════════════════════════════════════

                wheelHandler = (e: WheelEvent) => {
                    e.preventDefault();

                    // Determine zoom direction
                    const direction = e.deltaY < 0 ? 1 : -1;
                    const newTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetZoom + direction * ZOOM_STEP));

                    if (newTarget === targetZoom) return;

                    // Zoom toward cursor position (standard map zoom behavior)
                    // The point under the cursor should stay fixed after zoom.
                    //
                    // Before zoom: worldPoint = (cursorScreen - worldContainer.position) / currentZoom
                    // After zoom:  cursorScreen = worldPoint * newZoom + newPosition
                    // => newPosition = cursorScreen - worldPoint * newZoom

                    const rect = app.canvas.getBoundingClientRect();
                    const cursorX = e.clientX - rect.left;
                    const cursorY = e.clientY - rect.top;

                    // World-space point under cursor (using current actual zoom, not target)
                    const worldX = (cursorX - worldContainer.x) / currentZoom;
                    const worldY = (cursorY - worldContainer.y) / currentZoom;

                    // Compute the position the container needs to be at when zoom reaches newTarget
                    // so that the same world point remains under the cursor.
                    // We'll apply this gradually in the ticker alongside the zoom lerp,
                    // but we store the "target position" to lerp toward as well.
                    const targetPosX = cursorX - worldX * newTarget;
                    const targetPosY = cursorY - worldY * newTarget;

                    targetZoom = newTarget;

                    // Store target position for the ticker to lerp toward
                    targetWorldX = targetPosX;
                    targetWorldY = targetPosY;
                };

                // Target world position (updated by wheel handler, lerped in ticker)
                let targetWorldX = worldContainer.x;
                let targetWorldY = worldContainer.y;

                const canvasEl = app.canvas as HTMLCanvasElement;
                canvasEl.addEventListener('wheel', wheelHandler, { passive: false });

                // ══════════════════════════════════════════════════════
                // ── PAN (pointer drag) ──
                // ══════════════════════════════════════════════════════

                pointerDownHandler = (e: PointerEvent) => {
                    // Allow pan on middle button, or left button
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

                    // Keep target position in sync so zoom lerp does not fight the drag
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
                // ── RESIZE OBSERVER ──
                // ══════════════════════════════════════════════════════

                resizeObserver = new ResizeObserver((entries) => {
                    if (!isMounted || !containerRef.current) return;

                    for (const entry of entries) {
                        const { width: newW, height: newH } = entry.contentRect;
                        if (newW === 0 || newH === 0) continue;

                        // Resize the renderer
                        app.renderer.resize(newW, newH);

                        // Re-center: shift worldContainer so the map center stays at viewport center
                        const currentWorldCenterX = (newW / 2 - worldContainer.x) / currentZoom;
                        const currentWorldCenterY = (newH / 2 - worldContainer.y) / currentZoom;

                        // We want mapCenterIso to stay at viewport center
                        worldContainer.x = newW / 2 - mapCenterIso.x * currentZoom;
                        worldContainer.y = newH / 2 - mapCenterIso.y * currentZoom;

                        targetWorldX = worldContainer.x;
                        targetWorldY = worldContainer.y;
                    }
                });

                resizeObserver.observe(containerRef.current);

                // ── WebSocket for state changes (auto-reconnect) ──
                let reconnectDelay = 1000;

                const connectWs = () => {
                    const ws = new WebSocket('ws://localhost:8000/ws/town');
                    wsRef = ws;

                    ws.onopen = () => {
                        reconnectDelay = 1000;
                    };

                    ws.onmessage = (event: MessageEvent) => {
                        try {
                            const data = JSON.parse(event.data);

                            if (data.type === 'AGENT_STATE_CHANGE') {
                                const agentId = data.agentId as string;
                                const newState = data.state as AgentState;
                                const agent = isoAgentMap.get(agentId);

                                if (agent) {
                                    agent.state = newState;
                                    agent.stateAnimTimer = 0;
                                    updateOtterStateDot(
                                        agent.visual,
                                        STATE_COLORS[newState] || STATE_COLORS.IDLE,
                                    );

                                    if (newState === 'RUNNING') {
                                        pickIsoZoneDest(agent, 'work');
                                    } else if (newState === 'THINKING') {
                                        agent.path = [];
                                        agent.visual.animState = 'think';
                                    } else if (newState === 'SUCCESS') {
                                        agent.path = [];
                                        agent.visual.animState = 'success';
                                    } else if (newState === 'ERROR') {
                                        agent.path = [];
                                        agent.visual.animState = 'error';
                                    } else if (
                                        (newState === 'IDLE' || newState === 'WALK') &&
                                        agent.path.length === 0
                                    ) {
                                        pickIsoWanderDest(agent);
                                    }
                                }
                            }

                            if (data.type === 'TASK_ASSIGNED') {
                                const agentName = (data.agent as string || '').toLowerCase();
                                const agent = isoAgentMap.get(agentName);
                                if (agent) {
                                    showOtterBubble(
                                        agent.visual,
                                        data.taskContent || '\uC0C8 \uC791\uC5C5 \uC218\uC2E0',
                                    );
                                }
                            }

                            if (data.type === 'JOB_UPDATE') {
                                const job = data.job;
                                if (job && job.assignedAgentId) {
                                    const agent = isoAgentMap.get(job.assignedAgentId);
                                    if (agent) {
                                        const jobState = job.state as string;
                                        if (jobState === 'SUCCESS' || jobState === 'ERROR' || jobState === 'RUNNING') {
                                            const newState = jobState as AgentState;
                                            agent.state = newState;
                                            agent.stateAnimTimer = 0;
                                            updateOtterStateDot(
                                                agent.visual,
                                                STATE_COLORS[newState] || STATE_COLORS.IDLE,
                                            );

                                            if (newState === 'RUNNING') {
                                                pickIsoZoneDest(agent, 'work');
                                            } else if (newState === 'SUCCESS') {
                                                agent.path = [];
                                                agent.visual.animState = 'success';
                                            } else if (newState === 'ERROR') {
                                                agent.path = [];
                                                agent.visual.animState = 'error';
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (_e) {
                            /* ignore parse errors */
                        }
                    };

                    ws.onclose = () => {
                        if (!isMounted) return;
                        reconnectTimerRef = setTimeout(connectWs, reconnectDelay);
                        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
                    };

                    ws.onerror = () => {
                        ws.close();
                    };
                };

                connectWs();

                // ══════════════════════════════════════════════════════
                // ── Animation Loop ──
                // ══════════════════════════════════════════════════════
                app.ticker.add(() => {
                    const now = Date.now();

                    // ── Smooth zoom interpolation ──
                    if (Math.abs(currentZoom - targetZoom) > 0.001) {
                        currentZoom += (targetZoom - currentZoom) * ZOOM_LERP_FACTOR;
                        worldContainer.scale.set(currentZoom);

                        // Lerp position toward target (for zoom-to-cursor)
                        worldContainer.x += (targetWorldX - worldContainer.x) * ZOOM_LERP_FACTOR;
                        worldContainer.y += (targetWorldY - worldContainer.y) * ZOOM_LERP_FACTOR;
                    } else if (currentZoom !== targetZoom) {
                        // Snap to final value to avoid sub-pixel drift
                        currentZoom = targetZoom;
                        worldContainer.scale.set(currentZoom);
                        worldContainer.x = targetWorldX;
                        worldContainer.y = targetWorldY;
                    }

                    for (const agent of isoAgents) {
                        // Bubble tick
                        tickOtterBubble(agent.visual);

                        // ── THINKING: sway animation, no movement ──
                        if (agent.state === 'THINKING') {
                            agent.visual.animState = 'think';
                            tickOtterAnimation(agent.visual, now, false);
                            continue;
                        }

                        // ── SUCCESS: celebratory bounce ──
                        if (agent.state === 'SUCCESS') {
                            agent.visual.animState = 'success';
                            agent.stateAnimTimer++;
                            tickOtterAnimation(agent.visual, now, false);
                            if (agent.stateAnimTimer >= 72) {
                                agent.state = 'IDLE';
                                agent.visual.animState = 'idle';
                                agent.stateAnimTimer = 0;
                                updateOtterStateDot(agent.visual, STATE_COLORS.IDLE);
                                pickIsoWanderDest(agent);
                            }
                            continue;
                        }

                        // ── ERROR: shake + red flash ──
                        if (agent.state === 'ERROR') {
                            agent.visual.animState = 'error';
                            agent.stateAnimTimer++;
                            tickOtterAnimation(agent.visual, now, false);
                            if (agent.stateAnimTimer >= 72) {
                                agent.state = 'IDLE';
                                agent.visual.animState = 'idle';
                                agent.stateAnimTimer = 0;
                                agent.visual.sprite.tint = 0xffffff;
                                agent.visual.sprite.x = 0;
                                updateOtterStateDot(agent.visual, STATE_COLORS.IDLE);
                                pickIsoWanderDest(agent);
                            }
                            continue;
                        }

                        // ── Movement along path (grid coords -> iso screen coords) ──
                        const isMoving = agent.path.length > 0;

                        if (agent.path.length > 0) {
                            const target = agent.path[0];
                            const targetIso = gridToIso(target.x, target.y);
                            const dx = targetIso.x - agent.visual.container.x;
                            const dy = targetIso.y - agent.visual.container.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);

                            const speed = agent.state === 'RUNNING'
                                ? AGENT_SPEED_PX * 1.6
                                : AGENT_SPEED_PX;

                            if (dist > speed) {
                                agent.visual.container.x += (dx / dist) * speed;
                                agent.visual.container.y += (dy / dist) * speed;

                                // Update otter direction based on grid-space movement
                                const gridDx = target.x - agent.gridX;
                                const gridDy = target.y - agent.gridY;
                                const dir = getIsoDirection(gridDx, gridDy);
                                setOtterDirection(agent.visual, otterTextures, dir);
                            } else {
                                agent.visual.container.x = targetIso.x;
                                agent.visual.container.y = targetIso.y;
                                agent.gridX = target.x;
                                agent.gridY = target.y;
                                agent.path.shift();
                            }
                        } else {
                            // Pause then pick new destination
                            agent.pauseTimer++;
                            const pauseFrames = 120 + Math.random() * 180;
                            if (agent.pauseTimer >= pauseFrames) {
                                agent.pauseTimer = 0;
                                if (agent.state === 'IDLE' || agent.state === 'WALK') {
                                    pickIsoWanderDest(agent);
                                } else if (agent.state === 'RUNNING') {
                                    pickIsoZoneDest(agent, 'work');
                                }
                            }
                        }

                        tickOtterAnimation(agent.visual, now, isMoving);
                    }

                    // ── Depth sort: re-order children by iso depth (row+col) ──
                    for (const agent of isoAgents) {
                        agent.visual.container.zIndex = 100 + agent.gridX + agent.gridY;
                    }
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

            // Close WebSocket and cancel reconnect timer
            if (reconnectTimerRef) clearTimeout(reconnectTimerRef);
            if (wsRef) {
                try {
                    wsRef.close();
                } catch (_) {
                    /* ignore */
                }
                wsRef = null;
            }

            // Remove event listeners (use saved canvas ref — app.canvas may be undefined after destroy)
            if (canvasElRef) {
                if (wheelHandler) {
                    canvasElRef.removeEventListener('wheel', wheelHandler);
                    wheelHandler = null;
                }
                if (pointerDownHandler) {
                    canvasElRef.removeEventListener('pointerdown', pointerDownHandler);
                    pointerDownHandler = null;
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

            // Disconnect resize observer
            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }

            if (appRef.current) {
                try {
                    appRef.current.destroy();
                } catch (e) {
                    console.warn('[AgentTown] destroy() error (HMR safe):', e);
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
        <div ref={containerRef} className="absolute inset-0 z-0 bg-transparent" />
    );
};
