import * as PIXI from 'pixi.js';
import {
    TILE_SIZE,
    TileType,
    type ZoneType,
    type GridWorld,
} from '../../systems/grid-world';
import { ZONE_LABELS, ZONE_LABEL_COLORS } from './agent-runtime';

/**
 * Draw the grid background including grid lines, walls, desks, and zone tints.
 * Returns the PIXI.Graphics object added to the stage.
 */
export function drawGridBackground(
    app: PIXI.Application,
    gridWorld: GridWorld,
    W: number,
    H: number,
): PIXI.Graphics {
    const grid = new PIXI.Graphics();

    // Draw grid lines
    for (let x = 0; x <= W; x += TILE_SIZE) { grid.moveTo(x, 0); grid.lineTo(x, H); }
    for (let y = 0; y <= H; y += TILE_SIZE) { grid.moveTo(0, y); grid.lineTo(W, y); }
    grid.stroke({ width: 1, color: 0xe2e8f0, alpha: 0.5 });

    // Draw Walls, Desks, and Zone tints
    gridWorld.cells.forEach((row, y) => {
        row.forEach((cell, x) => {
            if (cell.wall || cell.collision) {
                grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                grid.fill({ color: cell.wall ? 0x94a3b8 : 0xd1d5db, alpha: cell.wall ? 0.3 : 0.5 });
            } else if (cell.zone === 'work') {
                grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                grid.fill({ color: 0xfde68a, alpha: 0.1 });
            } else if (cell.zone === 'meeting') {
                grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                grid.fill({ color: 0xa7f3d0, alpha: 0.1 });
            } else if (cell.zone === 'rest') {
                grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                grid.fill({ color: 0xbfdbfe, alpha: 0.1 });
            } else if (cell.zone === 'entrance') {
                grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                grid.fill({ color: 0xfecaca, alpha: 0.1 });
            } else if (cell.zone === 'hallway') {
                grid.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                grid.fill({ color: 0xe5e7eb, alpha: 0.06 });
            }
        });
    });

    app.stage.addChild(grid);
    return grid;
}

/**
 * Create and add zone name labels to the stage based on zone bounding boxes.
 */
export function drawZoneLabels(
    app: PIXI.Application,
    gridWorld: GridWorld,
): void {
    // Compute zone bounding boxes
    const zoneBounds: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {};
    gridWorld.cells.forEach((row, y) => {
        row.forEach((cell, x) => {
            if (cell.zone && !cell.wall && !cell.collision) {
                if (!zoneBounds[cell.zone]) {
                    zoneBounds[cell.zone] = { minX: x, minY: y, maxX: x, maxY: y };
                } else {
                    const b = zoneBounds[cell.zone];
                    if (x < b.minX) b.minX = x;
                    if (y < b.minY) b.minY = y;
                    if (x > b.maxX) b.maxX = x;
                    if (y > b.maxY) b.maxY = y;
                }
            }
        });
    });

    for (const [zone, bounds] of Object.entries(zoneBounds)) {
        const zoneType = zone as ZoneType;
        const label = ZONE_LABELS[zoneType] || zone.toUpperCase();
        const centerX = ((bounds.minX + bounds.maxX + 1) / 2) * TILE_SIZE;
        const topY = bounds.minY * TILE_SIZE + 6;

        const zoneLabelContainer = new PIXI.Container();
        zoneLabelContainer.x = centerX;
        zoneLabelContainer.y = topY;

        const labelText = new PIXI.Text({
            text: label,
            style: {
                fontSize: 11,
                fontFamily: 'system-ui, sans-serif',
                fontWeight: '900',
                fill: 0x18181b,
                letterSpacing: 1.5,
            },
        });
        labelText.anchor.set(0.5, 0);

        // Background rectangle (Neo-Brutalist)
        const padding = 6;
        const bgWidth = labelText.width + padding * 2;
        const bgHeight = labelText.height + padding;
        const bg = new PIXI.Graphics();
        bg.roundRect(-bgWidth / 2, -padding / 2, bgWidth, bgHeight, 3);
        bg.fill({ color: ZONE_LABEL_COLORS[zoneType] || 0xffffff, alpha: 0.7 });
        bg.stroke({ width: 2, color: 0x18181b, alpha: 0.4 });

        zoneLabelContainer.addChild(bg);
        zoneLabelContainer.addChild(labelText);
        app.stage.addChild(zoneLabelContainer);
    }
}
