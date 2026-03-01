import * as PIXI from 'pixi.js';
import { assetPath } from '../../lib/assetPath';

/**
 * Isometric floor and room renderer for the Town view.
 *
 * Draws:
 * 1. Diamond-shaped floor tiles for each zone with zone-specific colors
 * 2. Room asset sprites (meeting room, server room PNGs) placed at their zone centers
 * 3. Zone labels floating above each zone
 * 4. Subtle grid lines on the isometric floor
 */

// ── Isometric Constants ──
// Standard 2:1 isometric tile dimensions
const ISO_TILE_W = 64;
const ISO_TILE_H = 32;

/** Convert grid col,row to isometric pixel x,y. */
function gridToIso(col: number, row: number): { x: number; y: number } {
    return {
        x: (col - row) * (ISO_TILE_W / 2),
        y: (col + row) * (ISO_TILE_H / 2),
    };
}

// ── Zone Colors ──
// Matching the established palette from agent-runtime / canvas-renderer

const ZONE_COLORS: Record<string, { fill: number; alpha: number }> = {
    work: { fill: 0xfde68a, alpha: 0.35 },
    meeting: { fill: 0xa7f3d0, alpha: 0.35 },
    rest: { fill: 0xbfdbfe, alpha: 0.35 },
    entrance: { fill: 0xfecaca, alpha: 0.35 },
    hallway: { fill: 0xe5e7eb, alpha: 0.2 },
};

const ZONE_LABELS: Record<string, string> = {
    work: 'WORK ZONE',
    meeting: 'MEETING',
    rest: 'REST AREA',
    entrance: 'ENTRANCE',
    hallway: 'HALLWAY',
};

// ── Room Definitions ──
// Zones that have room asset sprites placed on the isometric map

interface RoomDef {
    zone: string;
    asset: string;
    gridCol: number;
    gridRow: number;
    scale: number;
}

const ROOM_ASSETS: RoomDef[] = [
    { zone: 'meeting', asset: '/sprites/iso/room-meeting.png', gridCol: 27, gridRow: 5, scale: 0.55 },
    { zone: 'entrance', asset: '/sprites/iso/room-server.png', gridCol: 28, gridRow: 19, scale: 0.45 },
];

// ── Isometric Tile Drawing ──

/**
 * Draw a single isometric diamond tile at grid position (col, row).
 *
 * The diamond vertices in pixel space (relative to the iso center):
 *   top:    (x, y - hh)
 *   right:  (x + hw, y)
 *   bottom: (x, y + hh)
 *   left:   (x - hw, y)
 */
function drawIsoTile(
    g: PIXI.Graphics,
    col: number,
    row: number,
    fillColor: number,
    fillAlpha: number,
    strokeColor?: number,
    strokeAlpha?: number,
): void {
    const { x, y } = gridToIso(col, row);
    const hw = ISO_TILE_W / 2;
    const hh = ISO_TILE_H / 2;

    g.moveTo(x, y - hh);       // top
    g.lineTo(x + hw, y);       // right
    g.lineTo(x, y + hh);       // bottom
    g.lineTo(x - hw, y);       // left
    g.closePath();
    g.fill({ color: fillColor, alpha: fillAlpha });

    if (strokeColor !== undefined) {
        g.stroke({ width: 0.5, color: strokeColor, alpha: strokeAlpha ?? 0.15 });
    }
}

// ── Isometric Floor Renderer ──

/**
 * Render the entire isometric floor grid.
 * Creates a PIXI.Container with:
 * - Floor tiles colored by zone
 * - Wall tiles (darker, with a "height" side-face for 3D effect)
 * - Collision/furniture tiles (medium tone)
 * - Subtle grid line strokes
 *
 * Tiles are drawn row-by-row (back to front) for correct depth ordering.
 */
export function createIsoFloor(
    gridCells: { zone?: string; wall: boolean; collision: boolean }[][],
    gridCols: number,
    gridRows: number,
): PIXI.Container {
    const container = new PIXI.Container();
    const floorGraphics = new PIXI.Graphics();

    // Draw tiles row by row (back to front for proper depth)
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const cell = gridCells[row]?.[col];
            if (!cell) continue;

            if (cell.wall) {
                // Wall tile: darker fill with a "height" side-face for 3D effect
                drawIsoTile(floorGraphics, col, row, 0x94a3b8, 0.5, 0x64748b, 0.3);

                // Draw wall side faces for 3D depth illusion
                const { x, y } = gridToIso(col, row);
                const hw = ISO_TILE_W / 2;
                const hh = ISO_TILE_H / 2;
                const wallH = 8;

                // Left face
                floorGraphics.moveTo(x - hw, y);
                floorGraphics.lineTo(x, y + hh);
                floorGraphics.lineTo(x, y + hh + wallH);
                floorGraphics.lineTo(x - hw, y + wallH);
                floorGraphics.closePath();
                floorGraphics.fill({ color: 0x6b7280, alpha: 0.4 });

                // Right face
                floorGraphics.moveTo(x, y + hh);
                floorGraphics.lineTo(x + hw, y);
                floorGraphics.lineTo(x + hw, y + wallH);
                floorGraphics.lineTo(x, y + hh + wallH);
                floorGraphics.closePath();
                floorGraphics.fill({ color: 0x4b5563, alpha: 0.4 });
            } else if (cell.collision) {
                // Desk/furniture: medium tone to visually distinguish from floor
                drawIsoTile(floorGraphics, col, row, 0xd1d5db, 0.6, 0x9ca3af, 0.3);
            } else {
                // Floor tile: zone-colored with subtle grid stroke
                const zoneStyle = cell.zone ? ZONE_COLORS[cell.zone] : null;
                const fill = zoneStyle?.fill ?? 0xf3f4f6;
                const alpha = zoneStyle?.alpha ?? 0.15;
                drawIsoTile(floorGraphics, col, row, fill, alpha, 0xd1d5db, 0.1);
            }
        }
    }

    container.addChild(floorGraphics);
    return container;
}

// ── Room Asset Sprites ──

/**
 * Load and place room asset sprites on the isometric map.
 * Each room is positioned at its defined grid coordinate, converted to
 * isometric pixel space.
 *
 * Returns array of sprites that were successfully added to the container.
 * Failures are logged as warnings and skipped gracefully.
 */
export async function createRoomSprites(
    parentContainer: PIXI.Container,
): Promise<PIXI.Sprite[]> {
    const sprites: PIXI.Sprite[] = [];

    for (const room of ROOM_ASSETS) {
        try {
            const texture = await PIXI.Assets.load(assetPath(room.asset));
            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5, 0.7); // Anchor near bottom-center for proper iso placement

            const isoPos = gridToIso(room.gridCol, room.gridRow);
            sprite.x = isoPos.x;
            sprite.y = isoPos.y;
            sprite.scale.set(room.scale);
            sprite.alpha = 0.85;

            parentContainer.addChild(sprite);
            sprites.push(sprite);
        } catch (e) {
            console.warn(`Failed to load room asset: ${room.asset}`, e);
        }
    }

    return sprites;
}

// ── Zone Labels ──

/**
 * Create floating zone labels above each zone.
 *
 * Calculates the bounding box for each zone from the grid cells,
 * finds the center in isometric space, and places a styled label
 * container with a rounded background pill and bold text.
 */
export function createZoneLabels(
    gridCells: { zone?: string; wall: boolean; collision: boolean }[][],
    gridCols: number,
    gridRows: number,
): PIXI.Container {
    const container = new PIXI.Container();

    // Calculate zone bounding boxes in grid coordinates
    const zoneBounds: Record<string, { minCol: number; minRow: number; maxCol: number; maxRow: number }> = {};

    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const cell = gridCells[row]?.[col];
            if (!cell?.zone || cell.wall || cell.collision) continue;

            if (!zoneBounds[cell.zone]) {
                zoneBounds[cell.zone] = { minCol: col, minRow: row, maxCol: col, maxRow: row };
            } else {
                const b = zoneBounds[cell.zone];
                if (col < b.minCol) b.minCol = col;
                if (row < b.minRow) b.minRow = row;
                if (col > b.maxCol) b.maxCol = col;
                if (row > b.maxRow) b.maxRow = row;
            }
        }
    }

    for (const [zone, bounds] of Object.entries(zoneBounds)) {
        const label = ZONE_LABELS[zone] || zone.toUpperCase();
        const centerCol = (bounds.minCol + bounds.maxCol) / 2;
        const centerRow = (bounds.minRow + bounds.maxRow) / 2;
        const isoPos = gridToIso(centerCol, centerRow);

        // Label container positioned in isometric space, floated above the floor
        const labelContainer = new PIXI.Container();
        labelContainer.x = isoPos.x;
        labelContainer.y = isoPos.y - 20; // Float above the floor plane

        const text = new PIXI.Text({
            text: label,
            style: {
                fontSize: 11,
                fontFamily: 'system-ui, sans-serif',
                fontWeight: '900',
                fill: 0x18181b,
                letterSpacing: 1.5,
            },
        });
        text.anchor.set(0.5, 0.5);

        // Rounded background pill (Neo-Brutalist style matching canvas-renderer)
        const padding = 6;
        const bg = new PIXI.Graphics();
        const bgW = text.width + padding * 2;
        const bgH = text.height + padding;
        bg.roundRect(-bgW / 2, -bgH / 2, bgW, bgH, 3);
        const zoneColor = ZONE_COLORS[zone]?.fill ?? 0xffffff;
        bg.fill({ color: zoneColor, alpha: 0.85 });
        bg.stroke({ width: 2, color: 0x18181b, alpha: 0.5 });

        labelContainer.addChild(bg);
        labelContainer.addChild(text);
        container.addChild(labelContainer);
    }

    return container;
}
