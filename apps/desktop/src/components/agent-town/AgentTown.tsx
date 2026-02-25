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
const AGENT_SPEED_PX = AGENT_SPEED_TILES_PER_SEC * 2;

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

                // ── World container for pan/zoom ──
                const worldContainer = new PIXI.Container();
                worldContainer.sortableChildren = true;
                app.stage.addChild(worldContainer);

                // Center the iso map in the viewport
                const viewW = containerRef.current.clientWidth;
                const viewH = containerRef.current.clientHeight;
                const offset = getCameraOffset(viewW, viewH);
                worldContainer.x = offset.x;
                worldContainer.y = offset.y;

                // Scale to fit the viewport
                const scaleX = viewW / W;
                const scaleY = viewH / H;
                const fitScale = Math.min(scaleX, scaleY) * 0.85;
                worldContainer.scale.set(fitScale);

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
                await createRoomSprites(worldContainer);

                // ── Zone Labels ──
                const labelsContainer = createZoneLabels(gridWorld.cells, gridWorld.cols, gridWorld.rows);
                labelsContainer.zIndex = 1;
                worldContainer.addChild(labelsContainer);

                // ══════════════════════════════════════════════════════
                // ── OTTER AGENTS: Load textures + create visuals ──
                // ══════════════════════════════════════════════════════

                const otterTextures: OtterTextures = await loadOtterTextures();
                if (!isMounted) return;

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
