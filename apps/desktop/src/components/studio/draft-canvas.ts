import type { ZoneType } from '../../systems/grid-world';
import type { DraftSummary, DraftData, DraftThemeRaw, DraftAgent, DraftRoom } from './draft-types';

// ── Theme color extraction helpers ──

export function extractThemeColors(theme?: DraftThemeRaw): {
    primary: string;
    secondary: string;
    background: string;
} {
    if (!theme) {
        return { primary: '#FFD100', secondary: '#9DE5DC', background: '#FFF8E7' };
    }
    // Handle both raw server format and ProjectTheme palette format
    const primary = theme.primary_color ?? theme.palette?.primary ?? '#FFD100';
    const secondary = theme.secondary_color ?? theme.palette?.secondary ?? '#9DE5DC';
    const background = theme.background ?? theme.palette?.background ?? '#FFF8E7';
    return { primary, secondary, background };
}

// ── Zone Color Map ──

export const ZONE_COLORS: Record<ZoneType, string> = {
    work: '#FBBF24',     // yellow
    meeting: '#34D399',  // green
    rest: '#60A5FA',     // blue
    entrance: '#A78BFA', // purple
    hallway: '#D1D5DB',  // gray
};

export const ZONE_LABELS: Record<ZoneType, string> = {
    work: 'Work',
    meeting: 'Meeting',
    rest: 'Rest',
    entrance: 'Entrance',
    hallway: 'Hallway',
};

// ── Role color map for agent badges ──

const ROLE_COLORS: Record<string, string> = {
    Manager: '#EF4444',
    Developer: '#3B82F6',
    Designer: '#8B5CF6',
    Analyst: '#F59E0B',
    General: '#6B7280',
};

function getRoleColor(role?: string): string {
    if (!role) return '#6B7280';
    return ROLE_COLORS[role] ?? '#6B7280';
}

// ── Room color assignment based on theme ──

export function getRoomColor(index: number, themeColors: { primary: string; secondary: string }): string {
    const palette = [
        themeColors.primary,
        themeColors.secondary,
        '#FBBF24',
        '#34D399',
        '#60A5FA',
        '#A78BFA',
        '#F87171',
        '#FB923C',
    ];
    return palette[index % palette.length];
}

// ── Canvas World Renderer (Real Data) ──

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 300;

/** Stored agent positions for hit-testing (populated during render). */
export interface AgentHitArea {
    agent: DraftAgent;
    cx: number;
    cy: number;
    radius: number;
    roomIndex: number;
    color: string;
}

/** Result of computeGridLayout — shared between render and hit-test. */
export interface GridLayout {
    maxX: number;
    maxY: number;
    cellW: number;
    cellH: number;
}

/** Compute grid layout dimensions from rooms. */
export function computeGridLayout(rooms: DraftRoom[]): GridLayout {
    let maxX = 40;
    let maxY = 25;

    if (rooms.length > 0) {
        for (const room of rooms) {
            const rx = room.x + room.width;
            const ry = room.y + room.height;
            if (rx > maxX) maxX = rx;
            if (ry > maxY) maxY = ry;
        }
        maxX = Math.max(maxX + 2, 20);
        maxY = Math.max(maxY + 2, 12);
    }

    return {
        maxX,
        maxY,
        cellW: CANVAS_WIDTH / maxX,
        cellH: CANVAS_HEIGHT / maxY,
    };
}

/** Compute agent pixel positions for a given layout. */
export function computeAgentPositions(
    agents: DraftAgent[],
    rooms: DraftRoom[],
    layout: GridLayout,
    themeColors: { primary: string; secondary: string },
): AgentHitArea[] {
    if (agents.length === 0 || rooms.length === 0) return [];

    const { cellW, cellH } = layout;
    const positions: AgentHitArea[] = [];

    agents.forEach((agent, idx) => {
        const roomIndex = idx % rooms.length;
        const room = rooms[roomIndex];
        const margin = 1;
        const slotsPerRow = Math.max(Math.floor((room.width - margin * 2) / 1.5), 1);
        const col = idx % slotsPerRow;
        const row = Math.floor(idx / slotsPerRow) % Math.max(Math.floor((room.height - margin * 2) / 1.5), 1);

        const cx = (room.x + margin + col * 1.5 + 0.5) * cellW;
        const cy = (room.y + margin + row * 1.5 + 0.5) * cellH;
        const radius = Math.min(cellW, cellH) * 0.4;
        const color = getRoomColor(idx, themeColors);

        positions.push({ agent, cx, cy, radius, roomIndex, color });
    });

    return positions;
}

/** Find the agent at the given canvas-space coordinate. */
export function hitTestAgent(
    x: number,
    y: number,
    agentPositions: AgentHitArea[],
): AgentHitArea | null {
    // Check in reverse so top-most drawn agents are hit first
    for (let i = agentPositions.length - 1; i >= 0; i--) {
        const a = agentPositions[i];
        const dx = x - a.cx;
        const dy = y - a.cy;
        if (dx * dx + dy * dy <= a.radius * a.radius) {
            return a;
        }
    }
    return null;
}

export function renderWorldPreview(
    ctx: CanvasRenderingContext2D,
    summary: DraftSummary,
    draftData: DraftData | null,
    highlightAgentId?: string | null,
): AgentHitArea[] {
    const themeColors = extractThemeColors(draftData?.theme);
    const rooms = draftData?.world?.rooms ?? [];
    const zones = draftData?.world?.zones ?? [];
    const agents = draftData?.agents ?? [];

    const layout = computeGridLayout(rooms);
    const { maxX, maxY, cellW, cellH } = layout;

    // ── Background ──
    ctx.fillStyle = themeColors.background;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── Grid lines (subtle) ──
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= maxX; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellW, 0);
        ctx.lineTo(x * cellW, CANVAS_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= maxY; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellH);
        ctx.lineTo(CANVAS_WIDTH, y * cellH);
        ctx.stroke();
    }

    // ── Draw rooms as colored rectangles ──
    if (rooms.length > 0) {
        rooms.forEach((room, idx) => {
            const color = getRoomColor(idx, themeColors);
            const rx = room.x * cellW;
            const ry = room.y * cellH;
            const rw = room.width * cellW;
            const rh = room.height * cellH;

            // Room fill (semi-transparent)
            ctx.fillStyle = color + '35';
            ctx.fillRect(rx, ry, rw, rh);

            // Room border (Neo-Brutalist thick border)
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, rw, rh);

            // Inner color accent border
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);

            // Room name label (centered)
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 9px Pretendard, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const label = room.name || room.id;
            const labelX = rx + rw / 2;
            const labelY = ry + rh / 2;

            // Label background pill
            const textMetrics = ctx.measureText(label);
            const pillW = textMetrics.width + 8;
            const pillH = 14;
            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            ctx.fillRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH);

            ctx.fillStyle = '#000000';
            ctx.fillText(label, labelX, labelY);
        });
    } else {
        // Fallback: no room data -- show placeholder message
        ctx.fillStyle = '#9CA3AF';
        ctx.font = 'bold 12px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No room layout data available', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }

    // ── Draw zone labels at top ──
    if (zones.length > 0) {
        const zoneBarY = 4;
        ctx.font = 'bold 8px Pretendard, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        zones.forEach((zone, idx) => {
            const zx = 6 + idx * 80;
            const zoneType = zone.type as ZoneType;
            const color = ZONE_COLORS[zoneType] ?? '#D1D5DB';

            // Zone badge
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillRect(zx - 2, zoneBarY - 1, 76, 13);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(zx - 2, zoneBarY - 1, 76, 13);

            // Color dot
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(zx + 4, zoneBarY + 5, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Zone name
            ctx.fillStyle = '#374151';
            ctx.fillText(zone.name, zx + 10, zoneBarY + 1);
        });
    }

    // ── Draw agent spawn points (enhanced) ──
    const agentPositions = computeAgentPositions(agents, rooms, layout, themeColors);

    for (const pos of agentPositions) {
        const { agent, cx, cy, radius, color } = pos;
        const isHighlighted = highlightAgentId != null && agent.id === highlightAgentId;

        // Highlight ring for selected agent
        if (isHighlighted) {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Agent dot with theme-based color
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Agent initial letter inside the dot
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(Math.floor(radius * 1.2), 6)}px Pretendard, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(agent.name.charAt(0).toUpperCase(), cx, cy);

        // Role badge (small colored dot below agent)
        if (agent.role && agent.role !== 'General') {
            const badgeR = 3;
            const badgeX = cx + radius * 0.6;
            const badgeY = cy - radius * 0.6;
            ctx.fillStyle = getRoleColor(agent.role);
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    // ── Draw highlighted agent tooltip ──
    if (highlightAgentId) {
        const hit = agentPositions.find(a => a.agent.id === highlightAgentId);
        if (hit) {
            drawAgentTooltip(ctx, hit);
        }
    }

    // ── Legend overlay (bottom-right) ──
    const legendEntries: Array<{ color: string; label: string }> = [];
    if (rooms.length > 0) {
        rooms.slice(0, 5).forEach((room, idx) => {
            legendEntries.push({
                color: getRoomColor(idx, themeColors),
                label: room.name || room.id,
            });
        });
        if (rooms.length > 5) {
            legendEntries.push({ color: '#9CA3AF', label: `+${rooms.length - 5} more` });
        }
    }

    if (legendEntries.length > 0) {
        const legendH = legendEntries.length * 13 + 10;
        const legendW = 112;
        const legendX = CANVAS_WIDTH - legendW - 6;
        const legendY = CANVAS_HEIGHT - legendH - 6;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(legendX - 4, legendY - 4, legendW, legendH);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(legendX - 4, legendY - 4, legendW, legendH);

        ctx.font = 'bold 8px Pretendard, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        legendEntries.forEach((item, i) => {
            const ly = legendY + 6 + i * 13;
            ctx.fillStyle = item.color;
            ctx.fillRect(legendX + 2, ly - 4, 10, 10);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(legendX + 2, ly - 4, 10, 10);
            ctx.fillStyle = '#374151';
            ctx.fillText(item.label, legendX + 16, ly + 1);
        });
    }

    // ── Stats overlay (top-left, below zones) ──
    const agentCount = agents.length || summary.agents;
    const statsText = `${rooms.length || summary.rooms} rooms | ${agentCount} agents | ${summary.spawnPoints} spawns`;
    ctx.font = 'bold 9px Pretendard, sans-serif';
    const statsWidth = ctx.measureText(statsText).width + 12;
    const statsY = zones.length > 0 ? 20 : 4;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(4, statsY, statsWidth, 18);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(4, statsY, statsWidth, 18);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(statsText, 10, statsY + 10);

    return agentPositions;
}

// ── Agent Tooltip (drawn on canvas near agent) ──

function drawAgentTooltip(ctx: CanvasRenderingContext2D, hit: AgentHitArea): void {
    const { agent, cx, cy, radius, color } = hit;
    const name = agent.name;
    const role = agent.role || 'General';
    const skills = agent.skills?.slice(0, 3).join(', ') ?? '';

    ctx.font = 'bold 9px Pretendard, sans-serif';
    const nameWidth = ctx.measureText(name).width;
    ctx.font = '8px Pretendard, sans-serif';
    const roleWidth = ctx.measureText(role).width;
    const skillsWidth = skills ? ctx.measureText(skills).width : 0;

    const tipW = Math.max(nameWidth, roleWidth, skillsWidth) + 16;
    const tipH = skills ? 42 : 30;

    // Position tooltip above agent, clamp within canvas
    let tipX = cx - tipW / 2;
    let tipY = cy - radius - tipH - 6;
    if (tipX < 2) tipX = 2;
    if (tipX + tipW > CANVAS_WIDTH - 2) tipX = CANVAS_WIDTH - tipW - 2;
    if (tipY < 2) tipY = cy + radius + 6; // flip below if no space above

    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tipX, tipY, tipW, tipH);

    // Top accent bar
    ctx.fillStyle = color;
    ctx.fillRect(tipX, tipY, tipW, 3);

    // Name
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px Pretendard, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(name, tipX + 6, tipY + 6);

    // Role
    ctx.fillStyle = getRoleColor(agent.role);
    ctx.font = '8px Pretendard, sans-serif';
    ctx.fillText(role, tipX + 6, tipY + 18);

    // Skills
    if (skills) {
        ctx.fillStyle = '#6B7280';
        ctx.fillText(skills, tipX + 6, tipY + 29);
    }
}
