import * as PIXI from 'pixi.js';
import { type AgentState } from '../../types/platform';
import { TILE_SIZE, type ZoneType } from '../../systems/grid-world';
import { type AgentProfile } from '../../types/platform';

// ── Frame rate constants ──

export const TARGET_FPS = 60;
export const FRAME_MS = 1000 / TARGET_FPS;

// ── State colors for name label background ──

export const STATE_COLORS: Record<string, number> = {
    IDLE: 0x9ca3af,
    WALK: 0x60a5fa,
    THINKING: 0xfbbf24,
    RUNNING: 0x22c55e,
    SUCCESS: 0x34d399,
    ERROR: 0xef4444,
    NEEDS_INPUT: 0xa855f7,
};

export const STATE_COLORS_CSS: Record<string, string> = {
    IDLE: '#9ca3af',
    WALK: '#60a5fa',
    THINKING: '#fbbf24',
    RUNNING: '#22c55e',
    SUCCESS: '#34d399',
    ERROR: '#ef4444',
    NEEDS_INPUT: '#a855f7',
};

export const STATE_LABELS: Record<AgentState, string> = {
    IDLE: '\uB300\uAE30',
    WALK: '\uC774\uB3D9',
    THINKING: '\uACE0\uBBFC \uC911',
    RUNNING: '\uC791\uC5C5 \uC911',
    SUCCESS: '\uC131\uACF5',
    ERROR: '\uC624\uB958',
    NEEDS_INPUT: '\uC785\uB825 \uB300\uAE30',
};

export const RACCOON_AGENT_ID = 'raccoon';

// ── P2-12: Zone display names (Korean) ──

export const ZONE_LABELS: Record<ZoneType, string> = {
    work: 'WORK ZONE',
    meeting: 'MEETING',
    rest: 'REST AREA',
    entrance: 'ENTRANCE',
    hallway: 'HALLWAY',
};

// ── P2-12: Zone label tint colors ──

export const ZONE_LABEL_COLORS: Record<ZoneType, number> = {
    work: 0xfde68a,
    meeting: 0xa7f3d0,
    rest: 0xbfdbfe,
    entrance: 0xfecaca,
    hallway: 0xe5e7eb,
};

// ── Agent movement constants ──

export const AGENT_SPEED_TILES_PER_SEC = 2; // 2 tiles per second
export const IDLE_WANDER_RADIUS = 5; // tiles
export const IDLE_PAUSE_MIN_MS = 2000;
export const IDLE_PAUSE_MAX_MS = 5000;
export const SUCCESS_ANIM_FRAMES = 72; // ~1.2s at 60fps
export const ERROR_ANIM_FRAMES = 72;
export const AGENT_SPRITE_HEIGHT = 48; // target sprite height in pixels
export const STAGGER_DELAY_MS = 80; // ms between initial path calculations
export const BUBBLE_DISPLAY_FRAMES = 210; // ~3.5 seconds at 60fps
export const BUBBLE_FADE_FRAMES = 60; // ~1 second fade

// ── Interfaces ──

export interface LogItem {
    ts: number;
    text: string;
    state: AgentState;
}

export interface InspectorData {
    visible: boolean;
    screenX: number;
    screenY: number;
}

// ── Per-agent runtime state (mutable, not React state) ──

export interface AgentRuntime {
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

// ── Agent helper functions ──

/** Update the visual state dot on an agent runtime. */
export function updateAgentStateDot(agent: AgentRuntime, state: AgentState): void {
    agent.stateDot.clear();
    agent.stateDot.circle(0, 0, 3);
    agent.stateDot.fill(STATE_COLORS[state] || STATE_COLORS.IDLE);
}

/** Show a speech bubble above an agent. */
export function showAgentBubble(agent: AgentRuntime, text: string): void {
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
}

/**
 * Per-frame tick for a non-raccoon agent's speech bubble fade.
 * Handles display timer and fade-out animation.
 */
export function tickAgentBubble(agent: AgentRuntime): void {
    if (!agent.bubbleContainer) return;

    agent.bubbleFadeTimer++;
    if (!agent.bubbleFading && agent.bubbleFadeTimer >= BUBBLE_DISPLAY_FRAMES) {
        agent.bubbleFading = true;
        agent.bubbleFadeTimer = 0;
    }
    if (agent.bubbleFading) {
        const fadeProgress = agent.bubbleFadeTimer / BUBBLE_FADE_FRAMES;
        agent.bubbleContainer.alpha = Math.max(0, 1 - fadeProgress);
        if (fadeProgress >= 1) {
            agent.container.removeChild(agent.bubbleContainer);
            agent.bubbleContainer = null;
            agent.bubbleFading = false;
            agent.bubbleFadeTimer = 0;
        }
    }
}

/**
 * Per-frame animation tick for a non-raccoon agent.
 * Handles SUCCESS/ERROR/THINKING animations and movement along paths.
 * Returns true if the agent was in a special animation state (SUCCESS/ERROR/THINKING)
 * and movement should be skipped.
 */
export function tickAgentAnimation(
    agent: AgentRuntime,
    now: number,
    agentSpeedPx: number,
    onWanderDest: (agent: AgentRuntime) => void,
    onZoneDest: (agent: AgentRuntime, zone: ZoneType) => void,
): void {
    const { container, sprite, shadow } = agent;

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
            onWanderDest(agent);
        }
        return;
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
            onWanderDest(agent);
        }
        return;
    }

    // Reset offsets from SUCCESS/ERROR
    sprite.x = 0;
    sprite.tint = 0xffffff;

    // ── THINKING: sway animation, no movement ──
    if (agent.state === 'THINKING') {
        sprite.rotation = Math.sin(now * 0.0015) * 0.06;
        // Subtle bob
        sprite.y = Math.sin(now * 0.002) * 2;
        return;
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
            ? agentSpeedPx * 1.6
            : agentSpeedPx;

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
                onWanderDest(agent);
            } else if (agent.state === 'RUNNING') {
                // Stay at work zone, pick new position within it
                onZoneDest(agent, 'work');
            }
        }
    }

    // Shadow alpha
    shadow.alpha = agent.path.length > 0 ? 0.12 : 0.08 + Math.sin(now * 0.003) * 0.02;
}

/** Create a new AgentRuntime from a profile and PIXI texture. */
export function createAgentRuntime(
    profile: AgentProfile,
    tex: PIXI.Texture,
    spawnPos: { x: number; y: number },
    tileSize: number,
): { runtime: AgentRuntime; container: PIXI.Container } {
    // Create container
    const agentContainer = new PIXI.Container();
    agentContainer.x = (spawnPos.x + 0.5) * tileSize;
    agentContainer.y = (spawnPos.y + 0.5) * tileSize;

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

    return { runtime, container: agentContainer };
}

