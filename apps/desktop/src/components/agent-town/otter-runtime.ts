import * as PIXI from 'pixi.js';

// ── Isometric direction and character state types ──

/** Isometric direction for character facing */
export type IsoDirection = 'NW' | 'NE' | 'SW' | 'SE';

/** Character visual state */
export type CharacterAnimState = 'idle' | 'walk' | 'think' | 'success' | 'error';

// ── Otter texture bundle ──

/** Otter sprite textures loaded per direction */
export interface OtterTextures {
    nw: PIXI.Texture;
    ne: PIXI.Texture;
    sw: PIXI.Texture;
    se: PIXI.Texture;
}

// ── Per-agent otter visual handle ──

/** Per-agent otter visual runtime */
export interface OtterVisual {
    container: PIXI.Container;
    sprite: PIXI.Sprite;
    shadow: PIXI.Graphics;
    nameLabel: PIXI.Text;
    stateDot: PIXI.Graphics;
    direction: IsoDirection;
    animState: CharacterAnimState;
    animTimer: number;
    baseScale: number;
    /** Normalized walk cycle position (0-1), incremented by time delta */
    stepPhase: number;
    // Bubble
    bubbleContainer: PIXI.Container | null;
    bubbleFadeTimer: number;
    bubbleFading: boolean;
    // Internal animation state
    _lastTickTime: number;
    _prevAnimState: CharacterAnimState;
    _idleMicroTimer: number;
    _idleBlinkTimer: number;
    _successBounceIndex: number;
    _successBounceTime: number;
    _errorStartTime: number;
}

// ── Constants ──

const OTTER_SPRITE_HEIGHT = 72; // Larger for better visibility in iso view

const OTTER_PATHS = {
    nw: '/sprites/iso/otter-nw.png',
    ne: '/sprites/iso/otter-ne.png',
    sw: '/sprites/iso/otter-sw.png',
    se: '/sprites/iso/otter-se.png',
} as const;

const BUBBLE_DISPLAY_FRAMES = 210; // ~3.5s at 60fps
const BUBBLE_FADE_FRAMES = 60;     // ~1s fade

// Walk animation tuning
const WALK_HOP_HEIGHT = 1.5;        // Minimal hop — feet stay near the tile surface
const WALK_STEP_DURATION = 0.35;    // Seconds per full step cycle
const WALK_TILT_DEGREES = 2.5;      // Forward lean in degrees
const WALK_TILT_RAD = WALK_TILT_DEGREES * (Math.PI / 180);
const WALK_SQUASH_Y = 0.92;         // Landing squash scaleY multiplier
const WALK_STRETCH_X = 1.06;        // Landing squash scaleX multiplier
const WALK_ARM_SWING = 0.05;        // Rotation oscillation in radians

// Idle animation tuning
const IDLE_BREATH_SPEED = 0.0015;   // Breathing cycle speed
const IDLE_BREATH_RANGE = 0.02;     // ScaleY oscillation range
const IDLE_MICRO_INTERVAL = 3500;   // Micro-movement interval in ms
const IDLE_MICRO_RANGE = 0.5;       // Micro-movement pixel range
const IDLE_BLINK_MIN = 3000;        // Min time between blinks in ms
const IDLE_BLINK_MAX = 5000;        // Max time between blinks in ms
const IDLE_BLINK_DURATION = 100;    // Blink duration in ms

// Think animation tuning
const THINK_FLOAT_HEIGHT = 1.5;     // Float amplitude in pixels (keep grounded)
const THINK_FLOAT_SPEED = 0.002;    // Float cycle speed
const THINK_PULSE_INTERVAL = 2000;  // Pulse every 2 seconds

// Success animation tuning
const SUCCESS_BOUNCE_HEIGHTS = [12, 8, 4]; // Decreasing bounce heights
const SUCCESS_BOUNCE_DURATION = 300;        // Duration per bounce in ms

// Error animation tuning
const ERROR_SHAKE_AMPLITUDE = 5;    // Horizontal shake in pixels
const ERROR_SHAKE_DURATION = 500;   // Total shake duration in ms
const ERROR_SHAKE_FREQUENCY = 0.04; // Shake speed

// ── Easing helpers ──

/**
 * Quadratic ease-in-out interpolation.
 * Maps t in [0,1] to a smooth curve that accelerates then decelerates.
 */
export function easeInOutQuad(t: number): number {
    return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Quadratic ease-out for landing deceleration.
 */
function easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
}

/**
 * Quadratic ease-in for lift acceleration.
 */
function easeInQuad(t: number): number {
    return t * t;
}

// ── Texture loading ──

/**
 * Load all otter directional textures.
 * Call once on mount, reuse across all agents.
 */
export async function loadOtterTextures(): Promise<OtterTextures> {
    const [nw, ne, sw, se] = await Promise.all([
        PIXI.Assets.load(OTTER_PATHS.nw),
        PIXI.Assets.load(OTTER_PATHS.ne),
        PIXI.Assets.load(OTTER_PATHS.sw),
        PIXI.Assets.load(OTTER_PATHS.se),
    ]);
    return { nw, ne, sw, se };
}

// ── Visual creation ──

/**
 * Create an otter visual for one agent.
 * Returns the OtterVisual handle whose `container` should be added to the stage.
 *
 * Default direction is SW (front-facing, shows the otter's face).
 */
export function createOtterVisual(
    textures: OtterTextures,
    agentName: string,
    stateColor: number,
): OtterVisual {
    const container = new PIXI.Container();
    container.sortableChildren = true;

    // Shadow ellipse
    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 0, 16, 6);
    shadow.fill({ color: 0x000000, alpha: 0.15 });
    shadow.y = 2;
    shadow.zIndex = 0;
    container.addChild(shadow);

    // Sprite (default: SW direction = use SE view sprite, otter faces left-down showing face)
    // anchor.y = 0.92 compensates for transparent padding below the otter's feet in the PNG,
    // pushing the visual sprite down so feet actually touch the iso tile surface.
    const sprite = new PIXI.Sprite(textures.se);
    sprite.anchor.set(0.5, 0.78);
    const baseScale = OTTER_SPRITE_HEIGHT / textures.se.height;
    sprite.scale.set(baseScale);
    sprite.zIndex = 1;
    container.addChild(sprite);

    // Name label (small, below sprite)
    const nameLabel = new PIXI.Text({
        text: agentName,
        style: {
            fontSize: 9,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: '700',
            fill: 0x374151,
        },
    });
    nameLabel.anchor.set(0.5, 0);
    nameLabel.y = 4;
    nameLabel.zIndex = 2;
    container.addChild(nameLabel);

    // State dot (positioned to the right of the name label)
    const stateDot = new PIXI.Graphics();
    stateDot.circle(0, 0, 3);
    stateDot.fill(stateColor);
    stateDot.x = nameLabel.width / 2 + 6;
    stateDot.y = 10;
    stateDot.zIndex = 2;
    container.addChild(stateDot);

    const now = Date.now();

    return {
        container,
        sprite,
        shadow,
        nameLabel,
        stateDot,
        direction: 'SW',
        animState: 'idle',
        animTimer: 0,
        baseScale,
        stepPhase: 0,
        bubbleContainer: null,
        bubbleFadeTimer: 0,
        bubbleFading: false,
        _lastTickTime: now,
        _prevAnimState: 'idle',
        _idleMicroTimer: now + IDLE_MICRO_INTERVAL + Math.random() * 2000,
        _idleBlinkTimer: now + IDLE_BLINK_MIN + Math.random() * (IDLE_BLINK_MAX - IDLE_BLINK_MIN),
        _successBounceIndex: 0,
        _successBounceTime: 0,
        _errorStartTime: 0,
    };
}

// ── Direction handling ──

/**
 * Update otter sprite direction based on movement.
 * Swaps texture and adjusts scale.x. SE now uses its own dedicated texture.
 */
export function setOtterDirection(
    visual: OtterVisual,
    textures: OtterTextures,
    direction: IsoDirection,
): void {
    if (visual.direction === direction) return;
    visual.direction = direction;

    // Sprite file names use CAMERA viewpoint (e.g. "SE View" = camera at SE = otter faces NW on screen).
    // So movement direction → sprite mapping is opposite:
    //   Moving SW (screen left-down)  → otter-se.png (otter faces left-down, shows face)
    //   Moving SE (screen right-down) → otter-sw.png (otter faces right-down, shows face)
    //   Moving NE (screen right-up)   → otter-nw.png (otter faces right-up, shows back)
    //   Moving NW (screen left-up)    → otter-ne.png (otter faces left-up, shows back)
    switch (direction) {
        case 'NW':
            visual.sprite.texture = textures.nw;
            visual.sprite.scale.x = visual.baseScale;
            break;
        case 'NE':
            visual.sprite.texture = textures.ne;
            visual.sprite.scale.x = visual.baseScale;
            break;
        case 'SW':
            visual.sprite.texture = textures.se;
            visual.sprite.scale.x = visual.baseScale;
            break;
        case 'SE':
            visual.sprite.texture = textures.sw;
            visual.sprite.scale.x = visual.baseScale;
            break;
    }
}

// ── Per-frame animation ──

/**
 * Compute the walk cycle hop height for a given step phase (0-1).
 * The cycle has distinct phases: lift (0-0.3), airborne (0.3-0.6), land (0.6-1.0).
 * Returns a negative Y offset (upward displacement).
 */
function computeWalkHop(phase: number): number {
    if (phase < 0.3) {
        // Lift phase: accelerate upward
        const t = phase / 0.3;
        return -WALK_HOP_HEIGHT * easeInQuad(t);
    } else if (phase < 0.6) {
        // Airborne phase: at peak, gentle arc
        const t = (phase - 0.3) / 0.3;
        const arc = Math.sin(t * Math.PI);
        return -WALK_HOP_HEIGHT * (1 - arc * 0.1);
    } else {
        // Land phase: decelerate downward
        const t = (phase - 0.6) / 0.4;
        return -WALK_HOP_HEIGHT * (1 - easeOutQuad(t));
    }
}

/**
 * Compute squash-stretch multipliers for the landing phase of a walk step.
 * Returns { scaleX, scaleY } multipliers (1.0 = no deformation).
 */
function computeWalkSquash(phase: number): { scaleX: number; scaleY: number } {
    // Landing impact zone: phase 0.85 to 1.0 then 0.0 to 0.1
    // Squash on land, then recover
    if (phase >= 0.85) {
        // Approaching ground -> squash
        const t = (phase - 0.85) / 0.15;
        const squashAmount = easeInOutQuad(t);
        return {
            scaleX: 1 + (WALK_STRETCH_X - 1) * squashAmount,
            scaleY: 1 - (1 - WALK_SQUASH_Y) * squashAmount,
        };
    } else if (phase < 0.1) {
        // Recovering from squash
        const t = phase / 0.1;
        const recovery = easeOutQuad(t);
        return {
            scaleX: WALK_STRETCH_X - (WALK_STRETCH_X - 1) * recovery,
            scaleY: WALK_SQUASH_Y + (1 - WALK_SQUASH_Y) * recovery,
        };
    }
    return { scaleX: 1, scaleY: 1 };
}

/**
 * Per-frame animation tick for an otter character.
 * Handles walk bobbing, think swaying, success bounce, error shake.
 *
 * Since otter sprites are static PNGs (not spritesheets), walk animation
 * is simulated through bobbing, squash-stretch, and rotation effects.
 *
 * Also auto-transitions between idle/walk based on movement state.
 */
export function tickOtterAnimation(
    visual: OtterVisual,
    now: number,
    isMoving: boolean,
): void {
    visual.animTimer++;

    // Compute time delta for frame-rate independent animation
    const dt = Math.min(now - visual._lastTickTime, 50); // Cap at 50ms to prevent jumps
    visual._lastTickTime = now;

    const { sprite, shadow } = visual;

    // Detect state transitions and reset internal animation state
    if (visual.animState !== visual._prevAnimState) {
        visual._prevAnimState = visual.animState;
        visual.stepPhase = 0;
        sprite.x = 0;
        sprite.y = 0;
        sprite.rotation = 0;
        sprite.tint = 0xffffff;
        sprite.scale.x = visual.baseScale;
        sprite.scale.y = visual.baseScale;
        shadow.scale.set(1, 1);
        shadow.alpha = 0.12;

        // Reset animation-specific internal state
        if (visual.animState === 'success') {
            visual._successBounceIndex = 0;
            visual._successBounceTime = 0;
        }
        if (visual.animState === 'error') {
            visual._errorStartTime = 0;
        }
        if (visual.animState === 'idle') {
            visual._idleMicroTimer = now + IDLE_MICRO_INTERVAL + Math.random() * 2000;
            visual._idleBlinkTimer = now + IDLE_BLINK_MIN + Math.random() * (IDLE_BLINK_MAX - IDLE_BLINK_MIN);
        }
    }

    switch (visual.animState) {
        case 'idle': {
            // ── Breathing: gentle scaleY oscillation ──
            const breathCycle = Math.sin(now * IDLE_BREATH_SPEED);
            const breathScale = 1 + breathCycle * IDLE_BREATH_RANGE; // 0.98 -> 1.02
            sprite.scale.y = visual.baseScale * breathScale;
            sprite.scale.x = visual.baseScale; // Reset X to base

            // ── Micro-movements: subtle random offset every few seconds ──
            if (now >= visual._idleMicroTimer) {
                sprite.x = (Math.random() - 0.5) * 2 * IDLE_MICRO_RANGE;
                sprite.y = (Math.random() - 0.5) * IDLE_MICRO_RANGE;
                visual._idleMicroTimer = now + IDLE_MICRO_INTERVAL + Math.random() * 2000;
            }

            // ── Blink simulation: brief scaleY squeeze ──
            if (now >= visual._idleBlinkTimer) {
                const blinkElapsed = now - visual._idleBlinkTimer;
                if (blinkElapsed < IDLE_BLINK_DURATION) {
                    // Quick squeeze down then back
                    const blinkT = blinkElapsed / IDLE_BLINK_DURATION;
                    const blinkCurve = Math.sin(blinkT * Math.PI); // 0 -> 1 -> 0
                    sprite.scale.y = visual.baseScale * (breathScale - 0.05 * blinkCurve);
                } else {
                    // Schedule next blink
                    visual._idleBlinkTimer = now + IDLE_BLINK_MIN + Math.random() * (IDLE_BLINK_MAX - IDLE_BLINK_MIN);
                }
            }

            // Idle rotation should be zero
            sprite.rotation = 0;

            // Gentle shadow breathing
            shadow.alpha = 0.12 + Math.sin(now * 0.003) * 0.02;
            shadow.scale.set(1, 1);
            break;
        }

        case 'walk': {
            // ── Step phase tracking: frame-rate independent ──
            const stepIncrement = (dt / 1000) / WALK_STEP_DURATION;
            visual.stepPhase = (visual.stepPhase + stepIncrement) % 1;
            const phase = visual.stepPhase;

            // ── Vertical hop with proper step phases ──
            const hopY = computeWalkHop(phase);
            sprite.y = hopY;

            // ── Body tilt: lean forward in movement direction ──
            // Determine tilt direction from facing
            const tiltSign = (visual.direction === 'SW' || visual.direction === 'SE') ? 1 : -1;
            sprite.rotation = tiltSign * WALK_TILT_RAD;

            // ── Arm swing simulation: rotation oscillation synced to step ──
            const armSwing = Math.sin(phase * Math.PI * 2) * WALK_ARM_SWING;
            sprite.rotation += armSwing;

            // ── Squash & stretch on landing ──
            const squash = computeWalkSquash(phase);
            const scaleXSign = sprite.scale.x >= 0 ? 1 : -1;
            sprite.scale.x = visual.baseScale * squash.scaleX * scaleXSign;
            sprite.scale.y = visual.baseScale * squash.scaleY;

            // ── Shadow sync: shrink at hop peak, expand on land ──
            // Normalize hop: 0 = ground, 1 = peak
            const normalizedHeight = Math.abs(hopY) / WALK_HOP_HEIGHT;
            const shadowScale = 1 - normalizedHeight * 0.3; // Shrink up to 30% at peak
            shadow.scale.set(shadowScale + normalizedHeight * 0.1, shadowScale);
            shadow.alpha = 0.12 + (1 - normalizedHeight) * 0.06;
            break;
        }

        case 'think': {
            // ── Float up/down ──
            const floatCycle = Math.sin(now * THINK_FLOAT_SPEED);
            sprite.y = floatCycle * THINK_FLOAT_HEIGHT;

            // ── Thought "pulse": slight scale increase every 2 seconds ──
            const pulseCycle = (now % THINK_PULSE_INTERVAL) / THINK_PULSE_INTERVAL;
            const pulseAmount = pulseCycle < 0.15
                ? easeInOutQuad(pulseCycle / 0.15) * 0.05
                : pulseCycle < 0.3
                    ? easeInOutQuad(1 - (pulseCycle - 0.15) / 0.15) * 0.05
                    : 0;

            sprite.scale.y = visual.baseScale * (1 + pulseAmount);
            sprite.scale.x = visual.baseScale * (1 + pulseAmount);

            // Gentle sway
            sprite.rotation = Math.sin(now * 0.0015) * 0.04;

            // Shadow floats with character
            const floatHeight = Math.abs(floatCycle);
            shadow.alpha = 0.08 + (1 - floatHeight) * 0.04;
            shadow.scale.set(1 - floatHeight * 0.15, 1 - floatHeight * 0.15);
            break;
        }

        case 'success': {
            // ── Happy bounce: 3 quick bounces decreasing in height ──
            if (visual._successBounceIndex === 0 && visual._successBounceTime === 0) {
                // Initialize success animation
                visual._successBounceIndex = 0;
                visual._successBounceTime = now;
            }

            const bounceElapsed = now - visual._successBounceTime;
            const bounceIndex = visual._successBounceIndex;

            if (bounceIndex < SUCCESS_BOUNCE_HEIGHTS.length) {
                const bounceHeight = SUCCESS_BOUNCE_HEIGHTS[bounceIndex];
                const t = Math.min(bounceElapsed / SUCCESS_BOUNCE_DURATION, 1);

                // Parabolic bounce: up then down
                const bounceY = Math.sin(t * Math.PI);
                sprite.y = -bounceY * bounceHeight;

                // Slight happy scale pulse at peak
                const scalePulse = 1 + bounceY * 0.04;
                sprite.scale.y = visual.baseScale * scalePulse;
                sprite.scale.x = visual.baseScale * scalePulse;

                // Small celebratory rotation
                sprite.rotation = Math.sin(t * Math.PI * 2) * 0.06;

                // Shadow sync
                shadow.alpha = 0.1 + (1 - bounceY) * 0.05;
                shadow.scale.set(1 - bounceY * 0.2, 1 - bounceY * 0.2);

                if (t >= 1) {
                    // Move to next bounce
                    visual._successBounceIndex++;
                    visual._successBounceTime = now;
                }
            } else {
                // All bounces done, settle to idle pose
                sprite.y = 0;
                sprite.rotation = 0;
                sprite.scale.y = visual.baseScale;
                sprite.scale.x = visual.baseScale;
                shadow.alpha = 0.12;
                shadow.scale.set(1, 1);
            }
            break;
        }

        case 'error': {
            // ── Sharp horizontal shake for ERROR_SHAKE_DURATION then stop ──
            if (visual._errorStartTime === 0) {
                visual._errorStartTime = now;
            }

            const errorElapsed = now - visual._errorStartTime;

            if (errorElapsed < ERROR_SHAKE_DURATION) {
                // Decaying shake: amplitude decreases over time
                const decay = 1 - (errorElapsed / ERROR_SHAKE_DURATION);
                const shakeX = Math.sin(errorElapsed * ERROR_SHAKE_FREQUENCY) * ERROR_SHAKE_AMPLITUDE * decay;
                sprite.x = shakeX;
                sprite.rotation = shakeX * 0.01; // Slight rotation with shake

                // Red tint fades out
                if (errorElapsed < ERROR_SHAKE_DURATION * 0.6) {
                    sprite.tint = 0xff6666;
                } else {
                    sprite.tint = 0xffffff;
                }
            } else {
                // Shake finished, hold still
                sprite.x = 0;
                sprite.rotation = 0;
                sprite.tint = 0xffffff;
            }

            // Shadow stays normal during error
            shadow.alpha = 0.12;
            break;
        }
    }

    // Auto-detect walk state from movement
    if (isMoving && visual.animState === 'idle') {
        visual.animState = 'walk';
        visual.stepPhase = 0; // Start fresh walk cycle
    } else if (!isMoving && visual.animState === 'walk') {
        visual.animState = 'idle';
        sprite.rotation = 0;
        sprite.y = 0;
        sprite.x = 0;
        sprite.scale.x = visual.baseScale;
        sprite.scale.y = visual.baseScale;
        shadow.scale.set(1, 1);
        shadow.alpha = 0.12;
        visual.stepPhase = 0;
    }
}

// ── State dot ──

/**
 * Update the state dot color.
 */
export function updateOtterStateDot(visual: OtterVisual, color: number): void {
    visual.stateDot.clear();
    visual.stateDot.circle(0, 0, 3);
    visual.stateDot.fill(color);
}

// ── Speech bubble ──

/**
 * Show a speech bubble above the otter.
 * Replaces any existing bubble. Text is truncated to 30 characters.
 */
export function showOtterBubble(visual: OtterVisual, text: string): void {
    if (visual.bubbleContainer) {
        visual.container.removeChild(visual.bubbleContainer);
        visual.bubbleContainer = null;
    }

    const bubble = new PIXI.Container();
    bubble.y = -75;
    bubble.zIndex = 10;

    const truncated = text.length > 30 ? text.slice(0, 30) + '...' : text;
    const bubbleText = new PIXI.Text({
        text: truncated,
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

    // Rounded rectangle background
    bg.roundRect(-bw / 2, -bh / 2, bw, bh, 4);
    bg.fill({ color: 0xffffff });
    bg.stroke({ width: 1.5, color: 0x18181b });

    // Speech bubble tail (triangle pointing down)
    bg.moveTo(-4, bh / 2);
    bg.lineTo(0, bh / 2 + 5);
    bg.lineTo(4, bh / 2);
    bg.closePath();
    bg.fill({ color: 0xffffff });
    bg.stroke({ width: 1.5, color: 0x18181b });

    bubble.addChild(bg);
    bubble.addChild(bubbleText);
    visual.container.addChild(bubble);
    visual.bubbleContainer = bubble;
    visual.bubbleFadeTimer = 0;
    visual.bubbleFading = false;
}

/**
 * Tick bubble fade animation. Call every frame.
 * Manages the display duration and fade-out transition.
 */
export function tickOtterBubble(visual: OtterVisual): void {
    if (!visual.bubbleContainer) return;

    visual.bubbleFadeTimer++;

    if (!visual.bubbleFading && visual.bubbleFadeTimer >= BUBBLE_DISPLAY_FRAMES) {
        visual.bubbleFading = true;
        visual.bubbleFadeTimer = 0;
    }
    if (visual.bubbleFading) {
        const progress = visual.bubbleFadeTimer / BUBBLE_FADE_FRAMES;
        visual.bubbleContainer.alpha = Math.max(0, 1 - progress);
        if (progress >= 1) {
            visual.container.removeChild(visual.bubbleContainer);
            visual.bubbleContainer = null;
            visual.bubbleFading = false;
            visual.bubbleFadeTimer = 0;
        }
    }
}
