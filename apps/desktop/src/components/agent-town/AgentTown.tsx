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
import { useAppStore } from '../../store/useAppStore';
import { useTerminalStore } from '../../store/useTerminalStore';

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

// ── Dokba(raccoon) 프로필 ──
const DOKBA_PROFILE: AgentProfile = {
    id: 'raccoon',
    name: 'Dokba',
    role: 'AI 어시스턴트',
    sprite: '/assets/characters/raccoon_spritesheet.png',
    state: 'IDLE',
    currentJobId: null,
    home: { x: 20, y: 14 },
    pos: { x: 20, y: 14 },
};

// ── 단일화 모드: Dokba만 활성 표시, 나머지 숨김 ──
const SOLO_MODE = true;

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
    visible: boolean; // SOLO_MODE에서 숨김 제어
}

export const AgentTown: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const [renderError, setRenderError] = useState<string | null>(null);
    useEffect(() => {
        let isMounted = true;

        // References for cleanup of event listeners and observers
        let wheelHandler: ((e: WheelEvent) => void) | null = null;
        let pointerDownHandler: ((e: PointerEvent) => void) | null = null;
        let pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
        let pointerUpHandler: ((e: PointerEvent) => void) | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let canvasElRef: HTMLCanvasElement | null = null;
        let unsubTerminal: (() => void) | null = null;

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
                const mapCenterIso = gridToIso(20, 12);
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

                // Dokba를 먼저 생성
                const allProfiles = [DOKBA_PROFILE, ...DEFAULT_AGENTS];

                for (const profile of allProfiles) {
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

                    // Click handler: toggle inspector card via store
                    visual.container.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
                        e.stopPropagation();
                        const store = useAppStore.getState();
                        const currentId = store.highlightedAgentId;
                        store.setHighlightedAgentId(currentId === profile.id ? null : profile.id);
                    });

                    worldContainer.addChild(visual.container);

                    // SOLO_MODE: Dokba만 보이게, 나머지 숨김
                    const isVisible = !SOLO_MODE || profile.id === 'raccoon';

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
                    };

                    // 숨김 처리
                    visual.container.visible = isVisible;

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

                // Stagger initial pathfinding for visible agents only
                let staggerIndex = 0;
                for (const agent of isoAgents) {
                    if (!agent.visible) continue;
                    setTimeout(() => {
                        if (!isMounted) return;
                        // Dokba starts at REST AREA
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
                    const newTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetZoom + direction * ZOOM_STEP));

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
                canvasEl.addEventListener('wheel', wheelHandler, { passive: false });

                // ══════════════════════════════════════════════════════
                // ── PAN (pointer drag) ──
                // ══════════════════════════════════════════════════════

                pointerDownHandler = (e: PointerEvent) => {
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
                // ── RESIZE OBSERVER ──
                // ══════════════════════════════════════════════════════

                resizeObserver = new ResizeObserver((entries) => {
                    if (!isMounted || !containerRef.current) return;

                    for (const entry of entries) {
                        const { width: newW, height: newH } = entry.contentRect;
                        if (newW === 0 || newH === 0) continue;

                        app.renderer.resize(newW, newH);

                        worldContainer.x = newW / 2 - mapCenterIso.x * currentZoom;
                        worldContainer.y = newH / 2 - mapCenterIso.y * currentZoom;

                        targetWorldX = worldContainer.x;
                        targetWorldY = worldContainer.y;
                    }
                });

                resizeObserver.observe(containerRef.current);

                // ══════════════════════════════════════════════════════
                // ── useTerminalStore ↔ AgentTown 연결 ──
                // ══════════════════════════════════════════════════════

                unsubTerminal = useTerminalStore.subscribe((state, prevState) => {
                    // ── 탭 상태 변경 감지 ──
                    for (const tab of state.tabs) {
                        const prev = prevState.tabs.find(t => t.id === tab.id);
                        if (prev && prev.status === tab.status) continue;

                        if (!tab.agentId) continue;
                        const agent = isoAgentMap.get(tab.agentId);
                        if (!agent || agent.id === 'cto') continue;

                        if (tab.status === 'connecting') {
                            agent.state = 'WALK';
                            agent.visual.animState = 'walk';
                            updateOtterStateDot(agent.visual, STATE_COLORS.WALK);
                            pickIsoZoneDest(agent, 'work');
                        } else if (tab.status === 'connected') {
                            agent.state = 'RUNNING';
                            agent.visual.animState = 'walk';
                            agent.stateAnimTimer = 0;
                            updateOtterStateDot(agent.visual, STATE_COLORS.RUNNING);
                            showOtterBubble(agent.visual, '터미널 연결됨');
                        } else if (tab.status === 'exited') {
                            agent.state = 'SUCCESS';
                            agent.visual.animState = 'success';
                            agent.stateAnimTimer = 0;
                            updateOtterStateDot(agent.visual, STATE_COLORS.SUCCESS);
                            showOtterBubble(agent.visual, '세션 종료');
                        }
                    }

                    // ── 에이전트 활동 상태 변경 → 시각적 반응 + 게이미피케이션 ──
                    for (const [agentId, activity] of Object.entries(state.agentActivity)) {
                        const prevActivity = prevState.agentActivity[agentId];
                        if (prevActivity === activity) continue;

                        const agent = isoAgentMap.get(agentId);
                        if (!agent || agent.id === 'cto') continue;

                        switch (activity) {
                            case 'thinking':
                                agent.state = 'THINKING';
                                agent.visual.animState = 'think';
                                agent.stateAnimTimer = 0;
                                updateOtterStateDot(agent.visual, STATE_COLORS.THINKING);
                                showOtterBubble(agent.visual, '생각 중...');
                                pickIsoZoneDest(agent, 'work');
                                break;
                            case 'working':
                                agent.state = 'RUNNING';
                                agent.visual.animState = 'walk';
                                agent.stateAnimTimer = 0;
                                updateOtterStateDot(agent.visual, STATE_COLORS.RUNNING);
                                showOtterBubble(agent.visual, '도구 사용 중...');
                                // 이미 WORK ZONE이 아니면 이동
                                pickIsoZoneDest(agent, 'work');
                                break;
                            case 'success': {
                                agent.state = 'SUCCESS';
                                agent.visual.animState = 'success';
                                agent.stateAnimTimer = 0;
                                updateOtterStateDot(agent.visual, STATE_COLORS.SUCCESS);
                                showOtterBubble(agent.visual, '완료!');
                                // 게이미피케이션: XP + 코인 적립
                                const appStore = useAppStore.getState();
                                const hadError = prevActivity === 'error';
                                appStore.addPoints(hadError ? 10 : 15);
                                appStore.addCoins(5);
                                // 레벨업 체크 및 토스트
                                const newGam = useAppStore.getState().gamification;
                                if (newGam.lastLevelUp && newGam.lastLevelUp > Date.now() - 1000) {
                                    appStore.addToast({
                                        type: 'success',
                                        message: `레벨 업! Lv.${newGam.level} ${newGam.levelTitle}`,
                                    });
                                }
                                break;
                            }
                            case 'error':
                                agent.state = 'ERROR';
                                agent.visual.animState = 'error';
                                agent.stateAnimTimer = 0;
                                updateOtterStateDot(agent.visual, STATE_COLORS.ERROR);
                                showOtterBubble(agent.visual, '오류 발생');
                                break;
                            case 'idle':
                                // SUCCESS/ERROR → IDLE 전환은 애니메이션 루프에서 처리
                                if (agent.state === 'THINKING' || agent.state === 'RUNNING') {
                                    agent.state = 'IDLE';
                                    agent.visual.animState = 'idle';
                                    agent.stateAnimTimer = 0;
                                    updateOtterStateDot(agent.visual, STATE_COLORS.IDLE);
                                    // idle → REST AREA로 복귀
                                    pickIsoZoneDest(agent, 'rest');
                                }
                                break;
                        }
                    }
                });

                // ══════════════════════════════════════════════════════
                // ── Animation Loop ──
                // ══════════════════════════════════════════════════════
                app.ticker.add(() => {
                    const now = Date.now();

                    // ── Smooth zoom interpolation ──
                    if (Math.abs(currentZoom - targetZoom) > 0.001) {
                        currentZoom += (targetZoom - currentZoom) * ZOOM_LERP_FACTOR;
                        worldContainer.scale.set(currentZoom);

                        worldContainer.x += (targetWorldX - worldContainer.x) * ZOOM_LERP_FACTOR;
                        worldContainer.y += (targetWorldY - worldContainer.y) * ZOOM_LERP_FACTOR;
                    } else if (currentZoom !== targetZoom) {
                        currentZoom = targetZoom;
                        worldContainer.scale.set(currentZoom);
                        worldContainer.x = targetWorldX;
                        worldContainer.y = targetWorldY;
                    }

                    for (const agent of isoAgents) {
                        // 숨김 처리된 에이전트는 스킵
                        if (!agent.visible) continue;

                        // Bubble tick
                        tickOtterBubble(agent.visual);

                        // ── THINKING: walk to destination first, then sway in place ──
                        if (agent.state === 'THINKING') {
                            if (agent.path.length > 0) {
                                const target = agent.path[0];
                                const targetIso = gridToIso(target.x, target.y);
                                const dx = targetIso.x - agent.visual.container.x;
                                const dy = targetIso.y - agent.visual.container.y;
                                const dist = Math.sqrt(dx * dx + dy * dy);

                                if (dist > AGENT_SPEED_PX) {
                                    agent.visual.container.x += (dx / dist) * AGENT_SPEED_PX;
                                    agent.visual.container.y += (dy / dist) * AGENT_SPEED_PX;
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
                                tickOtterAnimation(agent.visual, now, true);
                            } else {
                                agent.visual.animState = 'think';
                                tickOtterAnimation(agent.visual, now, false);
                            }
                            continue;
                        }

                        // ── SUCCESS: celebratory bounce, then return to REST AREA ──
                        if (agent.state === 'SUCCESS') {
                            agent.visual.animState = 'success';
                            agent.stateAnimTimer++;
                            tickOtterAnimation(agent.visual, now, false);
                            if (agent.stateAnimTimer >= 72) {
                                agent.state = 'IDLE';
                                agent.visual.animState = 'idle';
                                agent.stateAnimTimer = 0;
                                updateOtterStateDot(agent.visual, STATE_COLORS.IDLE);
                                // 성공 후 REST AREA로 복귀
                                pickIsoZoneDest(agent, 'rest');
                            }
                            continue;
                        }

                        // ── ERROR: shake + red flash, then return to REST AREA ──
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
                                // 에러 후 REST AREA로 복귀
                                pickIsoZoneDest(agent, 'rest');
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
                                    // IDLE 시 REST AREA 근처에서 배회
                                    if (agent.id === 'raccoon') {
                                        pickIsoZoneDest(agent, 'rest');
                                    } else {
                                        pickIsoWanderDest(agent);
                                    }
                                } else if (agent.state === 'RUNNING') {
                                    pickIsoZoneDest(agent, 'work');
                                }
                            }
                        }

                        tickOtterAnimation(agent.visual, now, isMoving);
                    }

                    // ── Depth sort: re-order children by iso depth (row+col) ──
                    for (const agent of isoAgents) {
                        if (!agent.visible) continue;
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

            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }

            if (unsubTerminal) { unsubTerminal(); unsubTerminal = null; }

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
        <div ref={containerRef} className="absolute inset-0 z-0 bg-transparent" />
    );
};
