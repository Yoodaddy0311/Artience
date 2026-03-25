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
    READING: 0x3b82f6,
    TYPING: 0xf97316,
    WRITING: 0x8b5cf6,
    SLEEPING: 0x6b7280,
};

export const STATE_COLORS_CSS: Record<string, string> = {
    IDLE: '#9ca3af',
    WALK: '#60a5fa',
    THINKING: '#fbbf24',
    RUNNING: '#22c55e',
    SUCCESS: '#34d399',
    ERROR: '#ef4444',
    NEEDS_INPUT: '#a855f7',
    READING: '#3b82f6',
    TYPING: '#f97316',
    WRITING: '#8b5cf6',
    SLEEPING: '#6b7280',
};

export const STATE_LABELS: Record<AgentState, string> = {
    IDLE: '\uB300\uAE30',
    WALK: '\uC774\uB3D9',
    THINKING: '\uACE0\uBBFC \uC911',
    RUNNING: '\uC791\uC5C5 \uC911',
    SUCCESS: '\uC131\uACF5',
    ERROR: '\uC624\uB958',
    NEEDS_INPUT: '\uC785\uB825 \uB300\uAE30',
    READING: '\uC77D\uB294 \uC911',
    TYPING: '\uBA85\uB839 \uC2E4\uD589',
    WRITING: '\uCF54\uB4DC \uC791\uC131',
    SLEEPING: '\uC218\uBA74 \uC911',
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

export const AGENT_SPEED_TILES_PER_SEC = 1.0; // 1 tile per second
export const IDLE_WANDER_RADIUS = 5; // tiles
export const IDLE_PAUSE_MIN_MS = 2000;
export const IDLE_PAUSE_MAX_MS = 5000;
export const SUCCESS_ANIM_FRAMES = 72; // ~1.2s at 60fps
export const ERROR_ANIM_FRAMES = 72;
export const AGENT_SPRITE_HEIGHT = 48; // target sprite height in pixels
export const STAGGER_DELAY_MS = 80; // ms between initial path calculations
export const BUBBLE_DISPLAY_FRAMES = 210; // ~3.5 seconds at 60fps
export const BUBBLE_FADE_FRAMES = 60; // ~1 second fade

// ── Bubble configuration for state transitions ──

export interface BubbleConfig {
    emoji: string;
    texts: string[];
    displayFrames: number;
    fadeFrames: number;
}

/** Activity → bubble config mapping (texts[] for random selection) */
export const BUBBLE_CONFIGS: Record<string, BubbleConfig> = {
    idle: {
        emoji: '\u{1F4A4}',
        texts: [
            '\uC26C\uB294 \uC911~',
            '\uCEE4\uD53C \uD0C0\uC784 \u2615',
            '\uB300\uAE30 \uC911\uC774\uC57C',
            '\uBD88\uB7EC\uC8FC\uBA74 \uB2EC\uB824\uAC08\uAC8C!',
        ],
        displayFrames: 300,
        fadeFrames: 60,
    },
    connecting: {
        emoji: '\u{1F4E1}',
        texts: [
            '\uC5F0\uACB0 \uC911...',
            '\uD130\uBBF8\uB110 \uC900\uBE44 \uC911...',
        ],
        displayFrames: 210,
        fadeFrames: 60,
    },
    team_join: {
        emoji: '\u{1F91D}',
        texts: [
            '\uD300\uC5D0 \uD569\uB958!',
            '\uD568\uAED8 \uC77C\uD558\uC790!',
            '\uB3C4\uC6C0 \uC904\uAC8C!',
            '\uC900\uBE44 \uC644\uB8CC!',
        ],
        displayFrames: 210,
        fadeFrames: 60,
    },
    thinking: {
        emoji: '\u{1F914}',
        texts: [
            '\uC0DD\uAC01 \uC911...',
            '\uC74C... \uC774\uAC70 \uC5B4\uB5BB\uAC8C \uD558\uC9C0',
            '\uBD84\uC11D\uD558\uACE0 \uC788\uC5B4',
        ],
        displayFrames: 0,
        fadeFrames: 60,
    },
    working: {
        emoji: '\u{1F527}',
        texts: ['\uC791\uC5C5 \uC911...'],
        displayFrames: 0,
        fadeFrames: 60,
    },
    needs_input: {
        emoji: '\u{1F64B}',
        texts: [
            '\uD655\uC778\uD574\uC904 \uAC83\uC774 \uC788\uC5B4!',
            '\uC785\uB825\uC744 \uAE30\uB2E4\uB9AC\uB294 \uC911...',
        ],
        displayFrames: 0,
        fadeFrames: 60,
    },
    reading: {
        emoji: '\u{1F50D}',
        texts: [
            '\uD30C\uC77C \uD655\uC778 \uC911...',
            '\uBB38\uC11C \uC77D\uB294 \uC911...',
        ],
        displayFrames: 0,
        fadeFrames: 60,
    },
    typing: {
        emoji: '\u{2328}\u{FE0F}',
        texts: [
            '\uBA85\uB839\uC5B4 \uC785\uB825 \uC911...',
            '\uD130\uBBF8\uB110 \uC2E4\uD589 \uC911~',
        ],
        displayFrames: 0,
        fadeFrames: 60,
    },
    writing: {
        emoji: '\u{270D}\u{FE0F}',
        texts: [
            '\uCF54\uB4DC \uC791\uC131 \uC911...',
            '\uD30C\uC77C \uC4F0\uB294 \uC911...',
        ],
        displayFrames: 0,
        fadeFrames: 60,
    },
    sleeping: {
        emoji: '\u{1F4A4}',
        texts: ['Zzz...', 'zzZ... \uD734\uC2DD\uC774 \uD544\uC694\uD574'],
        displayFrames: 300,
        fadeFrames: 60,
    },
    success: {
        emoji: '\u{2705}',
        texts: [
            '\uC644\uB8CC!',
            '\uD574\uB0C8\uB2E4! \u{1F389}',
            '\uC798 \uB410\uC5B4! \u{1F44D}',
        ],
        displayFrames: 210,
        fadeFrames: 60,
    },
    error: {
        emoji: '\u{274C}',
        texts: [
            '\uC624\uB958 \uBC1C\uC0DD...',
            '\uBB38\uC81C\uAC00 \uC0DD\uACBC\uC5B4 \u{1F630}',
            '\uC5D0\uB7EC\uB2E4!',
        ],
        displayFrames: 300,
        fadeFrames: 60,
    },
    connected: {
        emoji: '\u{1F50C}',
        texts: [
            '\uD130\uBBF8\uB110 \uC5F0\uACB0\uB428!',
            '\uC900\uBE44 \uC644\uB8CC!',
        ],
        displayFrames: 210,
        fadeFrames: 60,
    },
    exited: {
        emoji: '\u{1F44B}',
        texts: [
            '\uC138\uC158 \uC885\uB8CC',
            '\uB2E4\uC74C\uC5D0 \uB610 \uB9CC\uB098!',
        ],
        displayFrames: 210,
        fadeFrames: 60,
    },
};

/** Tool-specific bubble text for working state */
export const TOOL_BUBBLES: Record<string, { emoji: string; text: string }> = {
    Edit: {
        emoji: '\u{270F}\u{FE0F}',
        text: '\uCF54\uB4DC \uC218\uC815 \uC911...',
    },
    Write: { emoji: '\u{1F4DD}', text: '\uD30C\uC77C \uC791\uC131 \uC911...' },
    Read: { emoji: '\u{1F4D6}', text: '\uD30C\uC77C \uC77D\uB294 \uC911...' },
    Bash: {
        emoji: '\u{26A1}',
        text: '\uBA85\uB839\uC5B4 \uC2E4\uD589 \uC911...',
    },
    Glob: { emoji: '\u{1F50D}', text: '\uD30C\uC77C \uCC3E\uB294 \uC911...' },
    Grep: { emoji: '\u{1F50E}', text: '\uCF54\uB4DC \uAC80\uC0C9 \uC911...' },
    WebFetch: {
        emoji: '\u{1F310}',
        text: '\uC6F9 \uB370\uC774\uD130 \uAC00\uC838\uC624\uB294 \uC911...',
    },
    WebSearch: { emoji: '\u{1F50D}', text: '\uC6F9 \uAC80\uC0C9 \uC911...' },
    TodoWrite: {
        emoji: '\u{1F4CB}',
        text: '\uD560\uC77C \uC815\uB9AC \uC911...',
    },
};

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
export function updateAgentStateDot(
    agent: AgentRuntime,
    state: AgentState,
): void {
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
        const speed =
            agent.state === 'RUNNING' ? agentSpeedPx * 1.6 : agentSpeedPx;

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
        const pauseFrames =
            (IDLE_PAUSE_MIN_MS +
                Math.random() * (IDLE_PAUSE_MAX_MS - IDLE_PAUSE_MIN_MS)) /
            (1000 / TARGET_FPS);

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
    shadow.alpha =
        agent.path.length > 0 ? 0.12 : 0.08 + Math.sin(now * 0.003) * 0.02;
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
