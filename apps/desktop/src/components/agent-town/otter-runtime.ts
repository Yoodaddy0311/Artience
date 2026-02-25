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
    // SE uses NE texture with flipped scale.x
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
    // Bubble
    bubbleContainer: PIXI.Container | null;
    bubbleFadeTimer: number;
    bubbleFading: boolean;
}

// ── Constants ──

const OTTER_SPRITE_HEIGHT = 52; // Slightly larger for iso view

const OTTER_PATHS = {
    nw: '/sprites/iso/otter-nw.png',
    ne: '/sprites/iso/otter-ne.png',
    sw: '/sprites/iso/otter-sw.png',
} as const;

const BUBBLE_DISPLAY_FRAMES = 210; // ~3.5s at 60fps
const BUBBLE_FADE_FRAMES = 60;     // ~1s fade

// ── Texture loading ──

/**
 * Load all otter directional textures.
 * Call once on mount, reuse across all agents.
 */
export async function loadOtterTextures(): Promise<OtterTextures> {
    const [nw, ne, sw] = await Promise.all([
        PIXI.Assets.load(OTTER_PATHS.nw),
        PIXI.Assets.load(OTTER_PATHS.ne),
        PIXI.Assets.load(OTTER_PATHS.sw),
    ]);
    return { nw, ne, sw };
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

    // Sprite (default: SW = facing camera)
    const sprite = new PIXI.Sprite(textures.sw);
    sprite.anchor.set(0.5, 1.0);
    const baseScale = OTTER_SPRITE_HEIGHT / textures.sw.height;
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
        bubbleContainer: null,
        bubbleFadeTimer: 0,
        bubbleFading: false,
    };
}

// ── Direction handling ──

/**
 * Update otter sprite direction based on movement.
 * Swaps texture and adjusts scale.x for SE mirroring.
 *
 * SE direction is achieved by horizontally flipping the NE texture (scale.x = -baseScale).
 */
export function setOtterDirection(
    visual: OtterVisual,
    textures: OtterTextures,
    direction: IsoDirection,
): void {
    if (visual.direction === direction) return;
    visual.direction = direction;

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
            visual.sprite.texture = textures.sw;
            visual.sprite.scale.x = visual.baseScale;
            break;
        case 'SE':
            // Mirror NE texture horizontally
            visual.sprite.texture = textures.ne;
            visual.sprite.scale.x = -visual.baseScale;
            break;
    }
}

// ── Per-frame animation ──

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
    const { sprite, shadow } = visual;

    switch (visual.animState) {
        case 'idle': {
            // Gentle breathing animation
            sprite.y = Math.sin(now * 0.002) * 1;
            sprite.rotation = 0;
            shadow.alpha = 0.1 + Math.sin(now * 0.003) * 0.02;
            break;
        }

        case 'walk': {
            // Bobbing walk animation (simulated hop for static sprites)
            const bobPhase = now * 0.012;
            sprite.y = Math.abs(Math.sin(bobPhase)) * -4; // Hop up
            // Slight left-right lean while walking
            sprite.rotation = Math.sin(bobPhase * 0.8) * 0.04;
            // Squash-stretch effect
            const squash = 1 + Math.sin(bobPhase * 2) * 0.03;
            sprite.scale.y = visual.baseScale * squash;
            shadow.alpha = 0.12 + Math.abs(Math.sin(bobPhase)) * 0.04;
            break;
        }

        case 'think': {
            // Sway animation
            sprite.rotation = Math.sin(now * 0.0015) * 0.06;
            sprite.y = Math.sin(now * 0.002) * 2;
            // Thinking "pulse" on shadow
            shadow.alpha = 0.08 + Math.sin(now * 0.004) * 0.04;
            break;
        }

        case 'success': {
            // Celebratory bounce
            const jumpPhase = (now % 600) / 600;
            sprite.y = -Math.sin(jumpPhase * Math.PI) * 12;
            sprite.rotation = Math.sin(now * 0.01) * 0.08;
            // Scale pulse
            const scaleBoost = 1 + Math.sin(jumpPhase * Math.PI) * 0.05;
            sprite.scale.y = visual.baseScale * scaleBoost;
            break;
        }

        case 'error': {
            // Shake + red tint
            sprite.x = Math.sin(now * 0.03) * 3;
            sprite.rotation = Math.sin(now * 0.02) * 0.06;
            if (visual.animTimer < 30) {
                sprite.tint = 0xff6666;
            } else {
                sprite.tint = 0xffffff;
            }
            break;
        }
    }

    // Auto-detect walk state from movement
    if (isMoving && visual.animState === 'idle') {
        visual.animState = 'walk';
    } else if (!isMoving && visual.animState === 'walk') {
        visual.animState = 'idle';
        sprite.rotation = 0;
        sprite.y = 0;
        sprite.scale.y = visual.baseScale;
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
