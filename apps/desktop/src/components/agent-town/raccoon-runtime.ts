import * as PIXI from 'pixi.js';
import { type AgentState } from '../../types/platform';
import {
    STATE_COLORS,
    BUBBLE_DISPLAY_FRAMES,
    BUBBLE_FADE_FRAMES,
} from './agent-runtime';

// ── Raccoon-specific runtime state ──

export interface RaccoonRuntime {
    container: PIXI.Container | null;
    sprite: PIXI.Sprite | null;
    shadow: PIXI.Graphics | null;
    frames: PIXI.Texture[][]; // [row][col]
    label: PIXI.Text | null;
    stateDotGfx: PIXI.Graphics | null;
    baseScaleX: number;
    stateDotNeedsRecalc: boolean;
    state: AgentState;
    stateAnimTimer: number;
    frameIndex: number;
    animRow: number;
    frameTimer: number;
    path: { x: number; y: number }[];
    pauseTimer: number;
    bubbleContainer: PIXI.Container | null;
    bubbleFadeTimer: number;
    bubbleFading: boolean;
}

export const RACCOON_SPEED = 1.8; // pixels per frame
export const RACCOON_PAUSE_FRAMES = 90; // ~1.5 seconds pause at waypoint
export const RACCOON_COLS = 5;

export const ROW_LABELS = [
    'Row 1: Idle/Work',
    'Row 2: Walk Back',
    'Row 3: Walk Front',
];

export function createRaccoonRuntime(): RaccoonRuntime {
    return {
        container: null,
        sprite: null,
        shadow: null,
        frames: [],
        label: null,
        stateDotGfx: null,
        baseScaleX: 1,
        stateDotNeedsRecalc: true,
        state: 'IDLE',
        stateAnimTimer: 0,
        frameIndex: 0,
        animRow: 0,
        frameTimer: 0,
        path: [],
        pauseTimer: 0,
        bubbleContainer: null,
        bubbleFadeTimer: 0,
        bubbleFading: false,
    };
}

/** Update raccoon state dot visual. */
export function updateRaccoonStateDot(raccoon: RaccoonRuntime, state: AgentState): void {
    if (!raccoon.stateDotGfx) return;
    raccoon.stateDotGfx.clear();
    raccoon.stateDotGfx.circle(0, 0, 5);
    raccoon.stateDotGfx.fill(STATE_COLORS[state] || STATE_COLORS.IDLE);
}

/**
 * Per-frame tick for raccoon animation: movement, spritesheet cycling,
 * SUCCESS/ERROR/THINKING animations, and bubble fade.
 *
 * @param raccoon Mutable raccoon state
 * @param now Current time from Date.now()
 * @param highlightGlow Reference to the highlight glow graphics (or null)
 * @param isMounted Whether the component is still mounted
 * @param setRaccoonDisplayState Setter for React display state
 * @param pickNewDestination Callback to pick a random walkable destination
 * @param screenPosRef Ref to update screen position for inspector placement
 */
export function tickRaccoon(
    raccoon: RaccoonRuntime,
    now: number,
    highlightGlow: PIXI.Graphics | null,
    isMounted: boolean,
    setRaccoonDisplayState: (state: AgentState) => void,
    pickNewDestination: () => void,
    screenPosRef: { current: { x: number; y: number } },
): void {
    const { sprite, container, frames } = raccoon;
    if (!sprite || !container || frames.length === 0) return;

    // Recalculate state dot x on first rendered frame (text width now reliable)
    if (raccoon.stateDotNeedsRecalc && raccoon.stateDotGfx && raccoon.label) {
        const nameEl = container.children.find(
            (c): c is PIXI.Text => c instanceof PIXI.Text && (c as PIXI.Text).text === 'Raccoon'
        );
        if (nameEl && nameEl.width > 0) {
            raccoon.stateDotGfx.x = nameEl.width / 2 + 10;
            raccoon.stateDotNeedsRecalc = false;
        }
    }

    // P2-9: Highlight glow pulse animation
    if (highlightGlow && highlightGlow.visible) {
        const pulse = 0.2 + Math.sin(now * 0.006) * 0.15;
        highlightGlow.alpha = pulse;
        highlightGlow.scale.set(1 + Math.sin(now * 0.004) * 0.08);
    }

    // P2-11: Speech bubble fade management
    if (raccoon.bubbleContainer) {
        raccoon.bubbleFadeTimer++;
        if (!raccoon.bubbleFading && raccoon.bubbleFadeTimer >= BUBBLE_DISPLAY_FRAMES) {
            raccoon.bubbleFading = true;
            raccoon.bubbleFadeTimer = 0;
        }
        if (raccoon.bubbleFading) {
            const fadeProgress = raccoon.bubbleFadeTimer / BUBBLE_FADE_FRAMES;
            raccoon.bubbleContainer.alpha = Math.max(0, 1 - fadeProgress);
            if (fadeProgress >= 1) {
                container.removeChild(raccoon.bubbleContainer);
                raccoon.bubbleContainer = null;
                raccoon.bubbleFading = false;
                raccoon.bubbleFadeTimer = 0;
            }
        }
    }

    let isMoving = false;

    // ── SUCCESS animation: celebration jump (freeze in place) ──
    if (raccoon.state === 'SUCCESS') {
        raccoon.stateAnimTimer++;
        const jumpT = (now % 800) / 800;
        const jumpY = Math.sin(jumpT * Math.PI) * 18;
        const squash = jumpT < 0.2 ? 1 - jumpT * 0.8 : (jumpT > 0.8 ? 1 - (1 - jumpT) * 0.8 : 1);
        sprite.y = -jumpY;
        sprite.scale.y = Math.abs(sprite.scale.y) * squash;
        sprite.rotation = Math.sin(now * 0.012) * 0.1;

        // Frame cycling for idle row (row 0) during celebration
        raccoon.frameTimer++;
        if (raccoon.frameTimer >= 6) {
            raccoon.frameTimer = 0;
            raccoon.frameIndex = (raccoon.frameIndex + 1) % RACCOON_COLS;
            sprite.texture = frames[0][raccoon.frameIndex];
        }

        // Auto-reset to IDLE after ~1.2 seconds (72 frames)
        if (raccoon.stateAnimTimer >= 72) {
            raccoon.state = 'IDLE';
            raccoon.stateAnimTimer = 0;
            sprite.y = 0;
            sprite.rotation = 0;
            sprite.scale.set(raccoon.baseScaleX);
            updateRaccoonStateDot(raccoon, 'IDLE');
            if (isMounted) setRaccoonDisplayState('IDLE');
            pickNewDestination();
        }
    }
    // ── ERROR animation: angry shake (freeze in place) ──
    else if (raccoon.state === 'ERROR') {
        raccoon.stateAnimTimer++;
        const shakeX = Math.sin(now * 0.03) * 5;
        sprite.x = shakeX;
        sprite.y = 0;
        sprite.rotation = Math.sin(now * 0.02) * 0.1;

        // Frame cycling for idle row (row 0) during shake
        raccoon.frameTimer++;
        if (raccoon.frameTimer >= 5) {
            raccoon.frameTimer = 0;
            raccoon.frameIndex = (raccoon.frameIndex + 1) % RACCOON_COLS;
            sprite.texture = frames[0][raccoon.frameIndex];
        }

        // Auto-reset to IDLE after ~1.2 seconds (72 frames)
        if (raccoon.stateAnimTimer >= 72) {
            raccoon.state = 'IDLE';
            raccoon.stateAnimTimer = 0;
            sprite.x = 0;
            sprite.y = 0;
            sprite.rotation = 0;
            updateRaccoonStateDot(raccoon, 'IDLE');
            if (isMounted) setRaccoonDisplayState('IDLE');
            pickNewDestination();
        }
    }
    // ── Normal movement states ──
    else {
        // Reset any residual shake/jump offsets
        sprite.x = 0;

        // THINKING sway animation (gentle rotation oscillation)
        if (raccoon.state === 'THINKING') {
            sprite.rotation = Math.sin(now * 0.0015) * 0.08;
        } else {
            sprite.rotation = 0;
        }

        if (raccoon.path.length > 0) {
            const target = raccoon.path[0];
            const dx = target.x - container.x;
            const dy = target.y - container.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Adjust speed based on state
            const currentSpeed = raccoon.state === 'RUNNING' ? RACCOON_SPEED * 1.8
                : raccoon.state === 'THINKING' ? RACCOON_SPEED * 0.6
                : RACCOON_SPEED;

            if (dist > currentSpeed) {
                // Move towards target
                container.x += (dx / dist) * currentSpeed;
                container.y += (dy / dist) * currentSpeed;
                if (Math.abs(dx) > Math.abs(dy)) {
                    sprite.scale.x = dx > 0 ? raccoon.baseScaleX : -raccoon.baseScaleX;
                }
                isMoving = true;
            } else {
                // Reached node
                container.x = target.x;
                container.y = target.y;
                raccoon.path.shift(); // remove reached node
            }
        } else {
            // Pause at final waypoint
            raccoon.pauseTimer++;
            if (raccoon.pauseTimer >= RACCOON_PAUSE_FRAMES) {
                raccoon.pauseTimer = 0;
                // Only pick random destination in IDLE/WALK states
                if (raccoon.state === 'IDLE' || raccoon.state === 'WALK') {
                    pickNewDestination();
                }
            }
        }

        // Select animation row based on state
        let targetRow: number;
        if (raccoon.state === 'THINKING') {
            targetRow = 0;
        } else if (raccoon.state === 'RUNNING') {
            targetRow = 2;
        } else {
            targetRow = isMoving ? 2 : 0;
        }

        if (targetRow !== raccoon.animRow) {
            raccoon.animRow = targetRow;
            raccoon.frameIndex = 0;
            if (raccoon.label) raccoon.label.text = ROW_LABELS[raccoon.animRow];
        }

        // Frame cycling -- speed varies by state
        raccoon.frameTimer++;
        let frameSpeed: number;
        if (raccoon.state === 'THINKING') {
            frameSpeed = 18; // slow, contemplative
        } else if (raccoon.state === 'RUNNING') {
            frameSpeed = 4; // fast running (~15fps)
        } else {
            frameSpeed = isMoving ? 5 : 5; // walk 12fps / idle 12fps
        }

        if (raccoon.frameTimer >= frameSpeed) {
            raccoon.frameTimer = 0;
            raccoon.frameIndex = (raccoon.frameIndex + 1) % RACCOON_COLS;
            sprite.texture = frames[raccoon.animRow][raccoon.frameIndex];
        }
    }

    // Subtle shadow pulse when idle
    if (raccoon.shadow) {
        raccoon.shadow.alpha = (raccoon.state === 'SUCCESS' || raccoon.state === 'ERROR')
            ? 0.1 + Math.sin(now * 0.005) * 0.05
            : (raccoon.path.length > 0 ? 0.15 : 0.12 + Math.sin(now * 0.003) * 0.03);
    }

    // Update screen position ref for inspector card placement
    screenPosRef.current = {
        x: container.x,
        y: container.y,
    };
}

/** Show a speech bubble above the raccoon. */
export function showRaccoonBubble(raccoon: RaccoonRuntime, text: string): void {
    if (!raccoon.container) return;

    // Remove existing bubble
    if (raccoon.bubbleContainer) {
        raccoon.container.removeChild(raccoon.bubbleContainer);
        raccoon.bubbleContainer = null;
    }

    const bubble = new PIXI.Container();
    bubble.y = -130;

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

    raccoon.container.addChild(bubble);
    raccoon.bubbleContainer = bubble;
    raccoon.bubbleFadeTimer = 0;
    raccoon.bubbleFading = false;
}
