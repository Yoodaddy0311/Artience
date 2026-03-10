import * as PIXI from 'pixi.js';
import { assetPath } from '../../lib/assetPath';

// ── Isometric direction and character state types ──

/** Isometric direction for character facing */
export type IsoDirection = 'NW' | 'NE' | 'SW' | 'SE';

/** Character visual state */
export type CharacterAnimState =
    | 'idle'
    | 'walk'
    | 'think'
    | 'success'
    | 'error'
    | 'read'
    | 'type'
    | 'write'
    | 'sleep';

// ── Animal texture bundle ──

export type AnimalType =
    | 'otter'
    | 'cat'
    | 'hamster'
    | 'dog'
    | 'rabbit'
    | 'raccoon';

/** Animal sprite textures loaded per direction */
export interface AnimalTextures {
    nw: PIXI.Texture;
    ne: PIXI.Texture;
    sw: PIXI.Texture;
    se: PIXI.Texture;
}

// ── Desk animation (sprite sheet) ──

/** Desk sprite sheet animation frames */
export interface DeskAnimationFrames {
    frames: PIXI.Texture[];
    frameWidth: number;
    frameHeight: number;
}

// ── Per-agent animal visual handle ──

/** Per-agent animal visual runtime */
export interface AnimalVisual {
    container: PIXI.Container;
    sprite: PIXI.Sprite;
    shadow: PIXI.Graphics;
    nameLabel: PIXI.Text;
    stateDot: PIXI.Graphics;
    direction: IsoDirection;
    animState: CharacterAnimState;
    animTimer: number;
    baseScale: number;
    animalType: AnimalType;
    /** Normalized walk cycle position (0-1), incremented by time delta */
    stepPhase: number;
    // Bubble
    bubbleContainer: PIXI.Container | null;
    bubbleFadeTimer: number;
    bubbleFading: boolean;
    bubblePopTimer: number; // pop-in animation frame counter (0 = start, POP_FRAMES = done)
    bubblePopping: boolean; // true while pop-in is active
    bubbleMinTimer: number; // frames since current bubble was shown (anti-flicker)
    bubblePendingText: string | null; // queued text while min display timer is active
    // Desk animation
    deskSprite: PIXI.AnimatedSprite | null;
    isAtDesk: boolean;
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

const ANIMAL_SPRITE_HEIGHT = 72; // Larger for better visibility in iso view

const ANIMAL_PATHS: Record<
    Exclude<AnimalType, 'raccoon'>,
    { nw: string; ne: string; sw: string; se: string }
> = {
    otter: {
        nw: '/sprites/iso/otter-nw.png',
        ne: '/sprites/iso/otter-ne.png',
        sw: '/sprites/iso/otter-sw.png',
        se: '/sprites/iso/otter-se.png',
    },
    cat: {
        nw: '/sprites/iso/cat-nw.png',
        ne: '/sprites/iso/cat-ne.png',
        sw: '/sprites/iso/cat-sw.png',
        se: '/sprites/iso/cat-se.png',
    },
    hamster: {
        nw: '/sprites/iso/hamster-nw.png',
        ne: '/sprites/iso/hamster-ne.png',
        sw: '/sprites/iso/hamster-sw.png',
        se: '/sprites/iso/hamster-se.png',
    },
    dog: {
        nw: '/sprites/iso/dog-nw.png',
        ne: '/sprites/iso/dog-ne.png',
        sw: '/sprites/iso/dog-sw.png',
        se: '/sprites/iso/dog-se.png',
    },
    rabbit: {
        nw: '/sprites/iso/rabbit-nw.png',
        ne: '/sprites/iso/rabbit-ne.png',
        sw: '/sprites/iso/rabbit-sw.png',
        se: '/sprites/iso/rabbit-se.png',
    },
};

const BUBBLE_DISPLAY_FRAMES = 210; // ~3.5s at 60fps
const BUBBLE_FADE_FRAMES = 60; // ~1s fade
const BUBBLE_POP_FRAMES = 12; // ~0.2s pop-in animation
const MIN_BUBBLE_DISPLAY_FRAMES = 60; // ~1s minimum display before replacing (anti-flicker)
const BUBBLE_POP_OVERSHOOT = 1.15; // scale overshoots to 115% then settles

// Walk animation tuning
const WALK_HOP_HEIGHT = 1.5; // Minimal hop — feet stay near the tile surface
const WALK_STEP_DURATION = 0.35; // Seconds per full step cycle
const WALK_TILT_DEGREES = 2.5; // Forward lean in degrees
const WALK_TILT_RAD = WALK_TILT_DEGREES * (Math.PI / 180);
const WALK_SQUASH_Y = 0.92; // Landing squash scaleY multiplier
const WALK_STRETCH_X = 1.06; // Landing squash scaleX multiplier
const WALK_ARM_SWING = 0.05; // Rotation oscillation in radians

// Idle animation tuning
const IDLE_BREATH_SPEED = 0.0015; // Breathing cycle speed
const IDLE_BREATH_RANGE = 0.02; // ScaleY oscillation range
const IDLE_MICRO_INTERVAL = 3500; // Micro-movement interval in ms
const IDLE_MICRO_RANGE = 0.5; // Micro-movement pixel range
const IDLE_BLINK_MIN = 3000; // Min time between blinks in ms
const IDLE_BLINK_MAX = 5000; // Max time between blinks in ms
const IDLE_BLINK_DURATION = 100; // Blink duration in ms

// Think animation tuning
const THINK_FLOAT_HEIGHT = 1.5; // Float amplitude in pixels (keep grounded)
const THINK_FLOAT_SPEED = 0.002; // Float cycle speed
const THINK_PULSE_INTERVAL = 2000; // Pulse every 2 seconds

// Success animation tuning
const SUCCESS_BOUNCE_HEIGHTS = [12, 8, 4]; // Decreasing bounce heights
const SUCCESS_BOUNCE_DURATION = 300; // Duration per bounce in ms

// Desk animation tuning
const DESK_ANIM_SPEED = 0.12; // ~7fps: 7/60 ≈ 0.12

// Error animation tuning
const ERROR_SHAKE_AMPLITUDE = 5; // Horizontal shake in pixels
const ERROR_SHAKE_DURATION = 500; // Total shake duration in ms
const ERROR_SHAKE_FREQUENCY = 0.04; // Shake speed

// ── Easing helpers ──

/**
 * Quadratic ease-in-out interpolation.
 * Maps t in [0,1] to a smooth curve that accelerates then decelerates.
 */
export function easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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
 * Load all animal directional textures for a specific animal type.
 * Call once on mount, reuse across all agents.
 */
export async function loadAnimalTextures(
    type: Exclude<AnimalType, 'raccoon'>,
): Promise<AnimalTextures> {
    const paths = ANIMAL_PATHS[type];
    const [nw, ne, sw, se] = await Promise.all([
        PIXI.Assets.load(assetPath(paths.nw)),
        PIXI.Assets.load(assetPath(paths.ne)),
        PIXI.Assets.load(assetPath(paths.sw)),
        PIXI.Assets.load(assetPath(paths.se)),
    ]);
    return { nw, ne, sw, se };
}

/**
 * Load the desk sprite sheet and slice into 8 frames (4 cols x 2 rows).
 * Used for working animation when agents are at their desks.
 */
export async function loadDeskAnimation(): Promise<DeskAnimationFrames> {
    const sheetTexture = await PIXI.Assets.load(
        assetPath('/sprites/iso/desk-work.png'),
    );

    const cols = 4;
    const rows = 2;
    const frameWidth = sheetTexture.width / cols;
    const frameHeight = sheetTexture.height / rows;

    const frames: PIXI.Texture[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const frame = new PIXI.Texture({
                source: sheetTexture.source,
                frame: new PIXI.Rectangle(
                    col * frameWidth,
                    row * frameHeight,
                    frameWidth,
                    frameHeight,
                ),
            });
            frames.push(frame);
        }
    }

    return { frames, frameWidth, frameHeight };
}

// ── Desk animation show/hide ──

/**
 * Show desk animation, hiding the walking sprite.
 * Creates an AnimatedSprite on first call, reuses it afterwards.
 */
export function showDeskAnimation(
    visual: AnimalVisual,
    deskFrames: DeskAnimationFrames,
): void {
    if (visual.isAtDesk) return;

    // Hide the walking sprite
    visual.sprite.visible = false;
    visual.shadow.visible = false;

    if (!visual.deskSprite) {
        const animSprite = new PIXI.AnimatedSprite(deskFrames.frames);
        animSprite.anchor.set(0.5, 0.78);
        const targetHeight = 90;
        const scale = targetHeight / deskFrames.frameHeight;
        animSprite.scale.set(scale);
        animSprite.animationSpeed = DESK_ANIM_SPEED;
        animSprite.loop = true;
        animSprite.zIndex = 1;
        animSprite.play();
        visual.container.addChild(animSprite);
        visual.deskSprite = animSprite;
    } else {
        visual.deskSprite.visible = true;
        visual.deskSprite.play();
    }

    visual.isAtDesk = true;
}

/**
 * Hide desk animation, restoring the walking sprite.
 */
export function hideDeskAnimation(visual: AnimalVisual): void {
    if (!visual.isAtDesk) return;

    visual.sprite.visible = true;
    visual.shadow.visible = true;

    if (visual.deskSprite) {
        visual.deskSprite.visible = false;
        visual.deskSprite.stop();
    }

    visual.isAtDesk = false;
}

/**
 * Destroy desk animation sprite and clean up resources.
 */
export function destroyDeskAnimation(visual: AnimalVisual): void {
    // Restore walking sprite visibility in case destroyed while at desk
    visual.sprite.visible = true;
    visual.shadow.visible = true;

    if (visual.deskSprite) {
        visual.container.removeChild(visual.deskSprite);
        visual.deskSprite.destroy();
        visual.deskSprite = null;
    }
    visual.isAtDesk = false;
}

// ── Visual creation ──

/**
 * Create an animal visual for one agent.
 * Returns the AnimalVisual handle whose `container` should be added to the stage.
 *
 * Default direction is SW (front-facing).
 */
export function createAnimalVisual(
    textures: AnimalTextures,
    agentName: string,
    stateColor: number,
    animalType: AnimalType = 'otter',
): AnimalVisual {
    const container = new PIXI.Container();
    container.sortableChildren = true;

    // Shadow ellipse
    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 0, 16, 6);
    shadow.fill({ color: 0x000000, alpha: 0.15 });
    shadow.y = 2;
    shadow.zIndex = 0;
    container.addChild(shadow);

    // Sprite (default: SW direction = use SE view sprite, animal faces left-down showing face)
    // anchor.y = 0.92 compensates for transparent padding below the animal's feet in the PNG,
    // pushing the visual sprite down so feet actually touch the iso tile surface.
    const sprite = new PIXI.Sprite(textures.se);
    sprite.anchor.set(0.5, 0.78);
    // Per-animal scale correction: normalizes visible character size
    // despite different art proportions within each sprite canvas.
    // Otter (1.0) is the reference size — adjust others to visually match.
    const SCALE_CORRECTION: Record<string, number> = {
        otter: 1.0, // 500x500 — reference
        cat: 1.0, // 268x269 — smaller canvas
        hamster: 1.0, // 500x500 — same as otter
        dog: 0.72, // 500x500 — art fills more canvas
        rabbit: 1.0, // 314x314 — smaller canvas, boost to match otter
    };
    const correction = SCALE_CORRECTION[animalType] ?? 1.0;
    const baseScale = (ANIMAL_SPRITE_HEIGHT / textures.se.height) * correction;
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
        bubblePopTimer: 0,
        bubblePopping: false,
        bubbleMinTimer: 0,
        bubblePendingText: null,
        animalType,
        deskSprite: null,
        isAtDesk: false,
        _lastTickTime: now,
        _prevAnimState: 'idle',
        _idleMicroTimer: now + IDLE_MICRO_INTERVAL + Math.random() * 2000,
        _idleBlinkTimer:
            now +
            IDLE_BLINK_MIN +
            Math.random() * (IDLE_BLINK_MAX - IDLE_BLINK_MIN),
        _successBounceIndex: 0,
        _successBounceTime: 0,
        _errorStartTime: 0,
    };
}

// ── Direction handling ──

/**
 * Update animal sprite direction based on movement.
 * Swaps texture and adjusts scale.x. SE now uses its own dedicated texture.
 */
export function setAnimalDirection(
    visual: AnimalVisual,
    textures: AnimalTextures,
    direction: IsoDirection,
): void {
    if (visual.direction === direction) return;
    visual.direction = direction;

    // Sprite file names use CAMERA viewpoint (e.g. "SE View" = camera at SE = animal faces NW on screen).
    // So movement direction → sprite mapping is opposite:
    //   Moving SW (screen left-down)  → se.png (animal faces left-down, shows face)
    //   Moving SE (screen right-down) → sw.png (animal faces right-down, shows face)
    //   Moving NE (screen right-up)   → nw.png (animal faces right-up, shows back)
    //   Moving NW (screen left-up)    → ne.png (animal faces left-up, shows back)
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
 * Per-frame animation tick for an animal character.
 * Handles walk bobbing, think swaying, success bounce, error shake.
 *
 * Since animal sprites are static PNGs (not spritesheets), walk animation
 * is simulated through bobbing, squash-stretch, and rotation effects.
 *
 * Also auto-transitions between idle/walk based on movement state.
 */
export function tickAnimalAnimation(
    visual: AnimalVisual,
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
            visual._idleMicroTimer =
                now + IDLE_MICRO_INTERVAL + Math.random() * 2000;
            visual._idleBlinkTimer =
                now +
                IDLE_BLINK_MIN +
                Math.random() * (IDLE_BLINK_MAX - IDLE_BLINK_MIN);
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
                visual._idleMicroTimer =
                    now + IDLE_MICRO_INTERVAL + Math.random() * 2000;
            }

            // ── Blink simulation: brief scaleY squeeze ──
            if (now >= visual._idleBlinkTimer) {
                const blinkElapsed = now - visual._idleBlinkTimer;
                if (blinkElapsed < IDLE_BLINK_DURATION) {
                    // Quick squeeze down then back
                    const blinkT = blinkElapsed / IDLE_BLINK_DURATION;
                    const blinkCurve = Math.sin(blinkT * Math.PI); // 0 -> 1 -> 0
                    sprite.scale.y =
                        visual.baseScale * (breathScale - 0.05 * blinkCurve);
                } else {
                    // Schedule next blink
                    visual._idleBlinkTimer =
                        now +
                        IDLE_BLINK_MIN +
                        Math.random() * (IDLE_BLINK_MAX - IDLE_BLINK_MIN);
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
            const stepIncrement = dt / 1000 / WALK_STEP_DURATION;
            visual.stepPhase = (visual.stepPhase + stepIncrement) % 1;
            const phase = visual.stepPhase;

            // ── Vertical hop with proper step phases ──
            const hopY = computeWalkHop(phase);
            sprite.y = hopY;

            // ── Body tilt: lean forward in movement direction ──
            // Determine tilt direction from facing
            const tiltSign =
                visual.direction === 'SW' || visual.direction === 'SE' ? 1 : -1;
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
            const pulseCycle =
                (now % THINK_PULSE_INTERVAL) / THINK_PULSE_INTERVAL;
            const pulseAmount =
                pulseCycle < 0.15
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
            if (
                visual._successBounceIndex === 0 &&
                visual._successBounceTime === 0
            ) {
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
                const decay = 1 - errorElapsed / ERROR_SHAKE_DURATION;
                const shakeX =
                    Math.sin(errorElapsed * ERROR_SHAKE_FREQUENCY) *
                    ERROR_SHAKE_AMPLITUDE *
                    decay;
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

        case 'read':
        case 'type':
        case 'write': {
            // Task animations: subtle variations based on task type
            if (visual.animState === 'read') {
                // Slow bobbing like reading lines
                sprite.y = Math.sin(now * 0.003) * 2;
                sprite.x = 0;
                sprite.rotation = Math.sin(now * 0.001) * 0.02;
            } else {
                // Typing/Writing: rapid small shakes to simulate typing/writing
                sprite.y = Math.sin(now * 0.02) * 1.5;
                sprite.x = Math.sin(now * 0.04) * 0.5;
                sprite.rotation = Math.sin(now * 0.01) * 0.01;
            }
            shadow.alpha = 0.12;
            shadow.scale.set(1, 1);
            break;
        }

        case 'sleep': {
            // Heavy, slow breathing
            const breathCycle = Math.sin(now * (IDLE_BREATH_SPEED * 0.6));
            const breathScale = 1 + breathCycle * (IDLE_BREATH_RANGE * 1.5);
            sprite.scale.y = visual.baseScale * breathScale;
            sprite.scale.x = visual.baseScale * (1 - breathCycle * 0.01);
            sprite.rotation = 0;
            sprite.y = 0;
            sprite.x = 0;
            shadow.alpha =
                0.12 + Math.sin(now * (IDLE_BREATH_SPEED * 0.6)) * 0.02;
            break;
        }
    }

    // Auto-detect walk state from movement
    if (isMoving && visual.animState !== 'walk') {
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
export function updateAnimalStateDot(
    visual: AnimalVisual,
    color: number,
): void {
    visual.stateDot.clear();
    visual.stateDot.circle(0, 0, 3);
    visual.stateDot.fill(color);
}

// ── Speech bubble ──

/** Regex to detect emoji-only strings (common emoji ranges) */
const EMOJI_ONLY_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;

/**
 * Show a speech bubble above the animal.
 * Replaces any existing bubble. Text is truncated to 30 characters.
 * Emoji-only messages get a larger font size for visual impact.
 * Starts with a pop-in scale animation.
 */
export function showAnimalBubble(visual: AnimalVisual, text: string): void {
    // Anti-flicker: if a bubble is showing and hasn't reached minimum display time, queue the new text
    if (
        visual.bubbleContainer &&
        visual.bubbleMinTimer < MIN_BUBBLE_DISPLAY_FRAMES
    ) {
        visual.bubblePendingText = text;
        return;
    }

    if (visual.bubbleContainer) {
        visual.container.removeChild(visual.bubbleContainer);
        visual.bubbleContainer = null;
    }

    const bubble = new PIXI.Container();
    bubble.y = -75;
    bubble.zIndex = 10;

    const truncated = text.length > 30 ? text.slice(0, 30) + '...' : text;
    const isEmojiOnly = EMOJI_ONLY_RE.test(truncated.trim());

    const bubbleText = new PIXI.Text({
        text: truncated,
        style: {
            fontSize: isEmojiOnly ? 16 : 9,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: '700',
            fill: 0x18181b,
            wordWrap: true,
            wordWrapWidth: 100,
        },
    });
    bubbleText.anchor.set(0.5, 0.5);

    const padX = isEmojiOnly ? 8 : 6;
    const padY = isEmojiOnly ? 6 : 4;
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

    // Start pop-in from scale 0
    bubble.scale.set(0);
    bubble.alpha = 1;

    visual.container.addChild(bubble);
    visual.bubbleContainer = bubble;
    visual.bubbleFadeTimer = 0;
    visual.bubbleFading = false;
    visual.bubblePopTimer = 0;
    visual.bubblePopping = true;
    visual.bubbleMinTimer = 0;
    visual.bubblePendingText = null;
}

/**
 * Tick bubble animation. Call every frame.
 * Manages three phases: pop-in -> display -> fade-out.
 */
export function tickAnimalBubble(visual: AnimalVisual): void {
    // Anti-flicker: process pending text when no bubble is showing
    if (!visual.bubbleContainer) {
        if (visual.bubblePendingText) {
            const pending = visual.bubblePendingText;
            visual.bubblePendingText = null;
            showAnimalBubble(visual, pending);
        }
        return;
    }

    // Increment minimum display timer for anti-flicker
    visual.bubbleMinTimer++;

    // Phase 1: Pop-in animation (scale 0 -> overshoot -> 1)
    if (visual.bubblePopping) {
        visual.bubblePopTimer++;
        const t = Math.min(visual.bubblePopTimer / BUBBLE_POP_FRAMES, 1);
        // Elastic overshoot: rises to OVERSHOOT then settles to 1.0
        const eased =
            t < 0.6
                ? easeInOutQuad(t / 0.6) * BUBBLE_POP_OVERSHOOT
                : BUBBLE_POP_OVERSHOOT -
                  (BUBBLE_POP_OVERSHOOT - 1) * easeOutQuad((t - 0.6) / 0.4);
        visual.bubbleContainer.scale.set(eased);
        if (t >= 1) {
            visual.bubbleContainer.scale.set(1);
            visual.bubblePopping = false;
        }
        return; // Don't count display frames during pop-in
    }

    // Phase 2: Display hold
    visual.bubbleFadeTimer++;

    if (
        !visual.bubbleFading &&
        visual.bubbleFadeTimer >= BUBBLE_DISPLAY_FRAMES
    ) {
        visual.bubbleFading = true;
        visual.bubbleFadeTimer = 0;
    }

    // Phase 3: Fade-out
    if (visual.bubbleFading) {
        const progress = visual.bubbleFadeTimer / BUBBLE_FADE_FRAMES;
        visual.bubbleContainer.alpha = Math.max(0, 1 - progress);
        // Slight shrink during fade for polish
        const shrink = 1 - progress * 0.15;
        visual.bubbleContainer.scale.set(shrink);
        if (progress >= 1) {
            visual.container.removeChild(visual.bubbleContainer);
            visual.bubbleContainer = null;
            visual.bubbleFading = false;
            visual.bubbleFadeTimer = 0;
            visual.bubblePopping = false;
            visual.bubblePopTimer = 0;
        }
    }
}
