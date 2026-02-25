import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { type AgentState } from '../../types/platform';
import {
    createDefaultWorld,
    findPath,
    TILE_SIZE,
    type ZoneType,
    getWalkableCells,
    getZoneCells,
    getNearestWalkable,
    getRandomWalkableNear,
} from '../../systems/grid-world';
import { useAppStore } from '../../store/useAppStore';
import { DEFAULT_AGENTS } from '../../types/platform';

import {
    TARGET_FPS,
    STATE_COLORS,
    RACCOON_AGENT_ID,
    AGENT_SPEED_TILES_PER_SEC,
    IDLE_WANDER_RADIUS,
    AGENT_SPRITE_HEIGHT,
    STAGGER_DELAY_MS,
    type LogItem,
    type InspectorData,
    type AgentRuntime,
    createAgentRuntime,
    tickAgentBubble,
    tickAgentAnimation,
} from './agent-runtime';
import {
    RACCOON_COLS,
    createRaccoonRuntime,
    tickRaccoon,
} from './raccoon-runtime';
import { drawGridBackground, drawZoneLabels } from './canvas-renderer';
import { RaccoonInspector } from './RaccoonInspector';
import { handleWsMessage, type WsHandlerContext } from './ws-handler';

const AGENT_SPEED_PX = AGENT_SPEED_TILES_PER_SEC * TILE_SIZE / TARGET_FPS; // pixels per frame

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
                drawGridBackground(app, gridWorld, W, H);

                // ── P2-12: Zone Name Labels ──
                drawZoneLabels(app, gridWorld);

                // ══════════════════════════════════════════════════════
                // ── RACCOON: Spritesheet Character ──
                // ══════════════════════════════════════════════════════
                const SPRITESHEET_PATH = '/assets/characters/raccoon_spritesheet.png';
                const ROWS = 3;
                const raccoon = createRaccoonRuntime();

                const pickNewDestination = () => {
                    if (allWalkable.length === 0) return;
                    const targetCell = allWalkable[Math.floor(Math.random() * allWalkable.length)];
                    const startX = Math.floor(Math.max(0, Math.min(W, raccoon.container?.x || W / 2)) / TILE_SIZE);
                    const startY = Math.floor(Math.max(0, Math.min(H, raccoon.container?.y || H / 2)) / TILE_SIZE);
                    const safeStartX = Math.max(0, Math.min(gridWorld.cols - 1, startX));
                    const safeStartY = Math.max(0, Math.min(gridWorld.rows - 1, startY));
                    const path = findPath(gridWorld, safeStartX, safeStartY, targetCell.x, targetCell.y);
                    raccoon.path = path.map(p => ({ x: (p.x + 0.5) * TILE_SIZE, y: (p.y + 0.5) * TILE_SIZE }));
                };

                const pickZoneDestination = (zone: ZoneType) => {
                    const zoneCells = getZoneCellsCached(zone);
                    if (zoneCells.length === 0) { pickNewDestination(); return; }
                    const targetCell = zoneCells[Math.floor(Math.random() * zoneCells.length)];
                    const startX = Math.floor(Math.max(0, Math.min(W, raccoon.container?.x || W / 2)) / TILE_SIZE);
                    const startY = Math.floor(Math.max(0, Math.min(H, raccoon.container?.y || H / 2)) / TILE_SIZE);
                    const safeStartX = Math.max(0, Math.min(gridWorld.cols - 1, startX));
                    const safeStartY = Math.max(0, Math.min(gridWorld.rows - 1, startY));
                    const path = findPath(gridWorld, safeStartX, safeStartY, targetCell.x, targetCell.y);
                    raccoon.path = path.map(p => ({ x: (p.x + 0.5) * TILE_SIZE, y: (p.y + 0.5) * TILE_SIZE }));
                };

                try {
                    const sheetTexture = await PIXI.Assets.load(SPRITESHEET_PATH);
                    if (!isMounted) return;

                    const frameW = Math.floor(sheetTexture.width / RACCOON_COLS);
                    const frameH = Math.floor(sheetTexture.height / ROWS);

                    for (let row = 0; row < ROWS; row++) {
                        const rowFrames: PIXI.Texture[] = [];
                        for (let col = 0; col < RACCOON_COLS; col++) {
                            const frame = new PIXI.Rectangle(col * frameW, row * frameH, frameW, frameH);
                            rowFrames.push(new PIXI.Texture({ source: sheetTexture.source, frame }));
                        }
                        raccoon.frames.push(rowFrames);
                    }

                    raccoon.container = new PIXI.Container();
                    raccoon.container.x = W / 2;
                    raccoon.container.y = H / 2;
                    raccoon.container.eventMode = 'static';
                    raccoon.container.cursor = 'pointer';
                    raccoon.container.on('pointertap', () => {
                        if (!raccoon.container) return;
                        const canvasRect = app.canvas.getBoundingClientRect();
                        const screenX = canvasRect.left + (raccoon.container.x * canvasRect.width / W);
                        const screenY = canvasRect.top + (raccoon.container.y * canvasRect.height / H);
                        raccoonScreenPosRef.current = { x: screenX, y: screenY };
                        handleRaccoonClick();
                    });

                    // P2-9: Highlight glow (initially hidden)
                    const highlightGlow = new PIXI.Graphics();
                    highlightGlow.circle(0, -40, 60);
                    highlightGlow.fill({ color: 0xffd100, alpha: 0.25 });
                    highlightGlow.visible = false;
                    raccoon.container.addChildAt(highlightGlow, 0);
                    highlightGlowRef.current = highlightGlow;

                    raccoon.shadow = new PIXI.Graphics();
                    raccoon.shadow.ellipse(0, 0, 24, 8);
                    raccoon.shadow.fill({ color: 0x000000, alpha: 0.15 });
                    raccoon.shadow.y = 0;
                    raccoon.container.addChild(raccoon.shadow);

                    raccoon.sprite = new PIXI.Sprite(raccoon.frames[0][0]);
                    raccoon.sprite.anchor.set(0.5, 1);
                    raccoon.baseScaleX = AGENT_SPRITE_HEIGHT * 1.4 / frameH;
                    raccoon.sprite.scale.set(raccoon.baseScaleX);
                    raccoon.container.addChild(raccoon.sprite);

                    const raccoonName = new PIXI.Text({
                        text: 'Raccoon',
                        style: { fontSize: 11, fontFamily: 'system-ui, sans-serif', fontWeight: '800', fill: 0x18181b },
                    });
                    raccoonName.anchor.set(0.5, 0);
                    raccoonName.y = 6;
                    raccoon.container.addChild(raccoonName);

                    raccoon.stateDotGfx = new PIXI.Graphics();
                    raccoon.stateDotGfx.circle(0, 0, 5);
                    raccoon.stateDotGfx.fill(STATE_COLORS.IDLE);
                    raccoon.stateDotGfx.x = raccoonName.width / 2 + 10;
                    raccoon.stateDotGfx.y = 13;
                    raccoon.container.addChild(raccoon.stateDotGfx);

                    raccoon.label = new PIXI.Text({
                        text: 'Row 1: Idle/Work',
                        style: { fontSize: 14, fontFamily: 'system-ui, sans-serif', fontWeight: '800', fill: 0x18181b }
                    });
                    raccoon.label.anchor.set(0.5, 1);
                    raccoon.label.y = -110;
                    raccoon.label.visible = import.meta.env.DEV;
                    raccoon.container.addChild(raccoon.label);

                    app.stage.addChild(raccoon.container);
                    raccoon.container.hitArea = new PIXI.Rectangle(-50, -120, 100, 140);
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

                    const { runtime, container: agentContainer } = createAgentRuntime(
                        profile, tex, spawnPos, TILE_SIZE,
                    );

                    app.stage.addChild(agentContainer);

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

                const wsCtx: WsHandlerContext = {
                    raccoon,
                    get isMounted() { return isMounted; },
                    agentRuntimeMap,
                    setRaccoonDisplayState,
                    setLogs,
                    pickNewDestination,
                    pickZoneDestination,
                    pickAgentWanderDest,
                    pickAgentZoneDest,
                };

                const connectWs = () => {
                    const ws = new WebSocket('ws://localhost:8000/ws/town');
                    wsRef = ws;
                    ws.onopen = () => { reconnectDelay = 1000; };
                    ws.onmessage = (event) => handleWsMessage(event, wsCtx);
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
                        tickAgentBubble(agent);
                        tickAgentAnimation(agent, now, AGENT_SPEED_PX, pickAgentWanderDest, pickAgentZoneDest);
                    }

                    // ── RACCOON: tick animation ──
                    tickRaccoon(
                        raccoon, now, highlightGlowRef.current, isMounted,
                        setRaccoonDisplayState, pickNewDestination, raccoonScreenPosRef,
                    );
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

    return (
        <div ref={containerRef} className="absolute inset-0 z-0 bg-transparent">
            {inspector.visible && (
                <RaccoonInspector
                    raccoonDisplayState={raccoonDisplayState}
                    logs={logs}
                    containerRef={containerRef}
                    raccoonScreenPosRef={raccoonScreenPosRef}
                    onClose={closeInspector}
                />
            )}
        </div>
    );
};
