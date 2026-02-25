import type { ZoneType } from '../../systems/grid-world';
import type { DraftSummary, DraftData, DraftThemeRaw } from './draft-types';

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

export function renderWorldPreview(
    ctx: CanvasRenderingContext2D,
    summary: DraftSummary,
    draftData: DraftData | null,
): void {
    const themeColors = extractThemeColors(draftData?.theme);
    const rooms = draftData?.world?.rooms ?? [];
    const zones = draftData?.world?.zones ?? [];
    const agents = draftData?.agents ?? [];

    // Determine grid bounds from room data
    let maxX = 40;
    let maxY = 25;

    if (rooms.length > 0) {
        for (const room of rooms) {
            const rx = room.x + room.width;
            const ry = room.y + room.height;
            if (rx > maxX) maxX = rx;
            if (ry > maxY) maxY = ry;
        }
        // Add margin
        maxX = Math.max(maxX + 2, 20);
        maxY = Math.max(maxY + 2, 12);
    }

    const cellW = CANVAS_WIDTH / maxX;
    const cellH = CANVAS_HEIGHT / maxY;

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

    // ── Draw agent spawn points ──
    if (agents.length > 0 && rooms.length > 0) {
        // Distribute agents across rooms for spawn visualization
        agents.forEach((agent, idx) => {
            const room = rooms[idx % rooms.length];
            // Distribute within room bounds with margin
            const margin = 1;
            const slotsPerRow = Math.max(Math.floor((room.width - margin * 2) / 1.5), 1);
            const col = idx % slotsPerRow;
            const row = Math.floor(idx / slotsPerRow) % Math.max(Math.floor((room.height - margin * 2) / 1.5), 1);

            const ax = (room.x + margin + col * 1.5 + 0.5) * cellW;
            const ay = (room.y + margin + row * 1.5 + 0.5) * cellH;

            const dotRadius = Math.min(cellW, cellH) * 0.35;

            // Agent dot with theme-based color
            const agentColor = getRoomColor(idx, themeColors);
            ctx.fillStyle = agentColor;
            ctx.beginPath();
            ctx.arc(ax, ay, dotRadius, 0, Math.PI * 2);
            ctx.fill();

            // Outline
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Agent initial letter inside the dot
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold ${Math.max(Math.floor(dotRadius * 1.2), 6)}px Pretendard, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(agent.name.charAt(0).toUpperCase(), ax, ay);
        });
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
}
