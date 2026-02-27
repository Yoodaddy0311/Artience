import * as PIXI from 'pixi.js';
import {
    type OtterTextures,
    type OtterVisual,
    createOtterVisual,
    setOtterDirection,
    tickOtterAnimation,
    updateOtterStateDot,
    showOtterBubble,
    tickOtterBubble,
} from './otter-runtime';
import { STATE_COLORS } from './agent-runtime';
import { gridToIso, getIsoDirection } from '../../systems/isometric';
import {
    findPath,
    getNearestWalkable,
    getRandomWalkableNear,
    type GridWorld,
} from '../../systems/grid-world';
import type { AgentState } from '../../types/platform';

// ── User character status types ──

export type UserStatus = 'idle' | 'coding' | 'reviewing' | 'testing' | 'away';

export interface RoomMember {
    id: string;
    username: string;
    job_slot: string;
    status: UserStatus;
    is_online: boolean;
    task_progress?: number; // 0-100
    current_task?: string;
    avatar_color?: number; // tint color for user distinction
}

// ── User character runtime state ──

export interface UserCharacterRuntime {
    memberId: string;
    username: string;
    jobSlot: string;
    visual: OtterVisual;
    /** User icon badge (lucide-style) above the character */
    userBadge: PIXI.Graphics;
    /** Task progress bar container */
    progressBar: PIXI.Container | null;
    progressFill: PIXI.Graphics | null;
    /** Status bubble text */
    statusText: string;
    state: AgentState;
    gridX: number;
    gridY: number;
    path: { x: number; y: number }[];
    pauseTimer: number;
    isUser: true; // discriminator to distinguish from AI agents
}

// ── Status label mapping ──

const STATUS_LABELS: Record<UserStatus, string> = {
    idle: '대기 중',
    coding: '코딩 중...',
    reviewing: '리뷰 중...',
    testing: '테스트 중...',
    away: '자리 비움',
};

const STATUS_TO_AGENT_STATE: Record<UserStatus, AgentState> = {
    idle: 'IDLE',
    coding: 'RUNNING',
    reviewing: 'THINKING',
    testing: 'RUNNING',
    away: 'IDLE',
};

// ── User badge tint color (distinct from AI) ──

const USER_BADGE_COLOR = 0x3b82f6; // blue-500
const USER_BADGE_SIZE = 6;

// ── Job slot to grid zone mapping ──

const JOB_SLOT_ZONES: Record<string, { x: number; y: number }> = {
    'PM': { x: 5, y: 3 },
    'backend': { x: 8, y: 5 },
    'frontend': { x: 11, y: 5 },
    'data': { x: 14, y: 3 },
    'qa': { x: 17, y: 5 },
    'devops': { x: 5, y: 7 },
    'design': { x: 8, y: 7 },
    'security': { x: 11, y: 7 },
    'docs': { x: 14, y: 7 },
    'infra': { x: 17, y: 7 },
};

// ── Create user character visual ──

export function createUserCharacter(
    textures: OtterTextures,
    member: RoomMember,
    gridWorld: GridWorld,
): UserCharacterRuntime {
    // Determine spawn position from job slot
    const homePos = JOB_SLOT_ZONES[member.job_slot] || { x: 10, y: 10 };
    const spawnPos = getNearestWalkable(gridWorld, homePos.x, homePos.y);

    // Create otter visual with user-specific name
    const stateColor = STATE_COLORS[STATUS_TO_AGENT_STATE[member.status]] || STATE_COLORS.IDLE;
    const visual = createOtterVisual(textures, member.username, stateColor);

    // Apply user-specific tint to distinguish from AI
    if (member.avatar_color) {
        visual.sprite.tint = member.avatar_color;
    }

    // Position in isometric coords
    const isoPos = gridToIso(spawnPos.x, spawnPos.y);
    visual.container.x = isoPos.x;
    visual.container.y = isoPos.y;

    // Add user badge (small circle with "U" icon above head)
    const userBadge = new PIXI.Graphics();
    userBadge.circle(0, 0, USER_BADGE_SIZE);
    userBadge.fill(USER_BADGE_COLOR);
    userBadge.stroke({ width: 1.5, color: 0x000000 });
    userBadge.x = -visual.nameLabel.width / 2 - 8;
    userBadge.y = 10;
    userBadge.zIndex = 3;
    visual.container.addChild(userBadge);

    // Add user icon indicator (small "U" text inside badge)
    const badgeLabel = new PIXI.Text({
        text: 'U',
        style: {
            fontSize: 7,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: '900',
            fill: 0xffffff,
        },
    });
    badgeLabel.anchor.set(0.5, 0.5);
    badgeLabel.x = userBadge.x;
    badgeLabel.y = userBadge.y;
    badgeLabel.zIndex = 4;
    visual.container.addChild(badgeLabel);

    // Create progress bar (hidden by default)
    let progressBar: PIXI.Container | null = null;
    let progressFill: PIXI.Graphics | null = null;

    if (member.task_progress !== undefined && member.task_progress > 0) {
        const result = createProgressBar(member.task_progress);
        progressBar = result.container;
        progressFill = result.fill;
        visual.container.addChild(progressBar);
    }

    // Make clickable
    visual.container.eventMode = 'static';
    visual.container.cursor = 'pointer';
    visual.container.hitArea = new PIXI.Rectangle(-30, -80, 60, 100);

    // Show initial status bubble
    const statusLabel = STATUS_LABELS[member.status] || STATUS_LABELS.idle;
    if (member.status !== 'idle') {
        showOtterBubble(visual, member.current_task || statusLabel);
    }

    return {
        memberId: member.id,
        username: member.username,
        jobSlot: member.job_slot,
        visual,
        userBadge,
        progressBar,
        progressFill,
        statusText: statusLabel,
        state: STATUS_TO_AGENT_STATE[member.status],
        gridX: spawnPos.x,
        gridY: spawnPos.y,
        path: [],
        pauseTimer: Math.floor(Math.random() * 120) + 60,
        isUser: true,
    };
}

// ── Progress bar rendering ──

function createProgressBar(progress: number): {
    container: PIXI.Container;
    fill: PIXI.Graphics;
} {
    const container = new PIXI.Container();
    container.y = -85;
    container.zIndex = 10;

    const barWidth = 40;
    const barHeight = 5;

    // Background
    const bg = new PIXI.Graphics();
    bg.roundRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, 2);
    bg.fill({ color: 0x000000, alpha: 0.3 });
    bg.stroke({ width: 1, color: 0x000000 });
    container.addChild(bg);

    // Fill
    const fill = new PIXI.Graphics();
    const fillWidth = (barWidth - 2) * Math.min(progress / 100, 1);
    fill.roundRect(-barWidth / 2 + 1, -barHeight / 2 + 1, fillWidth, barHeight - 2, 1);
    fill.fill(progress >= 100 ? 0x22c55e : 0x3b82f6);
    container.addChild(fill);

    // Percentage label
    const pctLabel = new PIXI.Text({
        text: `${Math.round(progress)}%`,
        style: {
            fontSize: 7,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: '700',
            fill: 0xffffff,
        },
    });
    pctLabel.anchor.set(0.5, 0);
    pctLabel.y = barHeight / 2 + 1;
    container.addChild(pctLabel);

    return { container, fill };
}

// ── Update user character progress ──

export function updateUserProgress(
    userChar: UserCharacterRuntime,
    progress: number,
): void {
    // Remove old progress bar
    if (userChar.progressBar) {
        userChar.visual.container.removeChild(userChar.progressBar);
        userChar.progressBar = null;
        userChar.progressFill = null;
    }

    if (progress > 0) {
        const result = createProgressBar(progress);
        userChar.progressBar = result.container;
        userChar.progressFill = result.fill;
        userChar.visual.container.addChild(result.container);
    }
}

// ── Update user character status ──

export function updateUserStatus(
    userChar: UserCharacterRuntime,
    status: UserStatus,
    currentTask?: string,
): void {
    const newState = STATUS_TO_AGENT_STATE[status];
    userChar.state = newState;
    userChar.statusText = STATUS_LABELS[status];

    updateOtterStateDot(
        userChar.visual,
        STATE_COLORS[newState] || STATE_COLORS.IDLE,
    );

    // Show status bubble for active states
    if (status !== 'idle' && status !== 'away') {
        showOtterBubble(userChar.visual, currentTask || STATUS_LABELS[status]);
    }
}

// ── Tick user character (per-frame) ──

export function tickUserCharacter(
    userChar: UserCharacterRuntime,
    otterTextures: OtterTextures,
    gridWorld: GridWorld,
    now: number,
): void {
    // Bubble tick
    tickOtterBubble(userChar.visual);

    const isMoving = userChar.path.length > 0;

    // Handle movement
    if (userChar.path.length > 0) {
        const target = userChar.path[0];
        const targetIso = gridToIso(target.x, target.y);
        const dx = targetIso.x - userChar.visual.container.x;
        const dy = targetIso.y - userChar.visual.container.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const speed = 2.0; // pixels per frame

        if (dist > speed) {
            userChar.visual.container.x += (dx / dist) * speed;
            userChar.visual.container.y += (dy / dist) * speed;

            // Update otter direction
            const gridDx = target.x - userChar.gridX;
            const gridDy = target.y - userChar.gridY;
            const dir = getIsoDirection(gridDx, gridDy);
            setOtterDirection(userChar.visual, otterTextures, dir);
        } else {
            userChar.visual.container.x = targetIso.x;
            userChar.visual.container.y = targetIso.y;
            userChar.gridX = target.x;
            userChar.gridY = target.y;
            userChar.path.shift();
        }
    } else {
        // Idle wandering
        userChar.pauseTimer++;
        const pauseFrames = 180 + Math.random() * 240;
        if (userChar.pauseTimer >= pauseFrames) {
            userChar.pauseTimer = 0;
            const near = getRandomWalkableNear(
                gridWorld,
                userChar.gridX,
                userChar.gridY,
                4,
            );
            if (near) {
                const path = findPath(gridWorld, userChar.gridX, userChar.gridY, near.x, near.y);
                userChar.path = path;
            }
        }
    }

    tickOtterAnimation(userChar.visual, now, isMoving);
}

// ── Remove user character from world ──

export function removeUserCharacter(
    userChar: UserCharacterRuntime,
    worldContainer: PIXI.Container,
): void {
    worldContainer.removeChild(userChar.visual.container);
}
