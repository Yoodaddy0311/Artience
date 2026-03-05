import * as PIXI from 'pixi.js';
import { assetPath } from '../../lib/assetPath';
import { type WorldObject } from '../../types/project';

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

// ── Zone Colors ──
// Matching the established palette from agent-runtime

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
import { gridToIso, isoToGrid } from '../../systems/isometric';

export async function createRoomSprites(
    parentContainer: PIXI.Container,
    objects: WorldObject[],
    isEditMode: boolean,
    onObjectMoved?: (id: string, col: number, row: number, offsetX?: number, offsetY?: number, rotation?: number) => void,
    onDragStart?: () => boolean,
    onDragCancel?: () => void,
    onObjectSelected?: (id: string | null) => void,
    onCornersMoved?: (id: string, corners: { x: number, y: number }[]) => void
): Promise<{ id: string; sprite: PIXI.Container }[]> {
    const sprites: { id: string; sprite: PIXI.Container }[] = [];

    for (const obj of objects) {
        if (!obj.properties?.asset) continue;
        const assetStr = obj.properties.asset as string;
        try {
            const texture = await PIXI.Assets.load(assetPath(assetStr));

            // Build 10x10 sub-divided mesh for smooth bilinear deformation
            const geometry = new PIXI.PlaneGeometry({ width: texture.width, height: texture.height, verticesX: 10, verticesY: 10 });
            const mesh = new PIXI.Mesh({ geometry, texture });

            // Wrap in a container so translation/rotation works similarly to the old Sprite
            const sprite = new PIXI.Container() as PIXI.Container & { animState?: string };
            sprite.addChild(mesh);

            // Calculate anchor offsets (simulate anchor 0.5, 0.7)
            const w = texture.width;
            const h = texture.height;
            const ancX = 0.5;
            const ancY = 0.7;

            // Default corners if none are saved
            const baseCorners = [
                { x: -w * ancX, y: -h * ancY },           // Top-Left
                { x: w * (1 - ancX), y: -h * ancY },        // Top-Right
                { x: w * (1 - ancX), y: h * (1 - ancY) },     // Bottom-Right
                { x: -w * ancX, y: h * (1 - ancY) }         // Bottom-Left
            ];

            const currentCorners = (obj.properties.corners as { x: number, y: number }[]) || baseCorners;

            // Save original vertices of the plane for u,v calc
            const originalVertices = new Float32Array(geometry.getAttribute('aPosition').buffer.data);

            // Function to re-map geometry based on current 4 corners
            const updateMeshVertices = (corners: { x: number, y: number }[]) => {
                const positions = geometry.getAttribute('aPosition').buffer.data;
                const p0 = corners[0], p1 = corners[1], p2 = corners[2], p3 = corners[3];

                for (let i = 0; i < originalVertices.length; i += 2) {
                    const ox = originalVertices[i];
                    const oy = originalVertices[i + 1];
                    const u = ox / w;
                    const v = oy / h;

                    // Bilinear interpolation
                    const tx = p0.x + u * (p1.x - p0.x);
                    const ty = p0.y + u * (p1.y - p0.y);
                    const bx = p3.x + u * (p2.x - p3.x);
                    const by = p3.y + u * (p2.y - p3.y);

                    positions[i] = tx + v * (bx - tx);
                    positions[i + 1] = ty + v * (by - ty);
                }
                geometry.getAttribute('aPosition').buffer.update();
            };

            // Initial map
            updateMeshVertices(currentCorners);

            const isoPos = gridToIso(obj.x, obj.y);
            sprite.x = isoPos.x + ((obj.properties.offsetX as number) || 0);
            sprite.y = isoPos.y + ((obj.properties.offsetY as number) || 0);
            sprite.rotation = (obj.properties.rotation as number) || 0;
            sprite.scale.set((obj.properties.scale as number) || 1);
            sprite.alpha = 0.85;

            // Dynamic depth sorting: Base 100 + grid depth. 
            // Characters use a similar formula so they interleve correctly.
            const depth = obj.x + obj.y;
            sprite.zIndex = 100 + depth;

            console.log(`[Room] Loaded ${assetStr} at iso(${sprite.x}, ${sprite.y}), scale=${sprite.scale.x}, zIndex=${sprite.zIndex}`);

            // Add interactivity for Tycoon-style drag & drop ONLY in Edit Mode
            if (isEditMode) {
                // 1. Base Draggable behavior
                sprite.eventMode = 'static';
                sprite.cursor = 'pointer';

                let isDragging = false;
                let isTransforming = false;

                // Create corner handles for Distort Mode
                let selectedHandleIndex = -1;
                const handles: PIXI.Graphics[] = [];
                const handlesContainer = new PIXI.Container();

                // Create a visual frame for transform mode
                const transformFrame = new PIXI.Graphics();
                transformFrame.alpha = 0;
                sprite.addChild(transformFrame);

                const updateTransformFrame = () => {
                    transformFrame.clear();
                    transformFrame.moveTo(currentCorners[0].x, currentCorners[0].y);
                    transformFrame.lineTo(currentCorners[1].x, currentCorners[1].y);
                    transformFrame.lineTo(currentCorners[2].x, currentCorners[2].y);
                    transformFrame.lineTo(currentCorners[3].x, currentCorners[3].y);
                    transformFrame.closePath();
                    transformFrame.stroke({ width: 2, color: 0x3b82f6, alpha: 0.8 }); // Blue outline
                };
                updateTransformFrame();

                currentCorners.forEach((corner, i) => {
                    const handle = new PIXI.Graphics();
                    handle.circle(0, 0, 8);
                    handle.fill(0xff0000);
                    handle.stroke({ width: 2, color: 0xffffff });
                    handle.eventMode = 'static';
                    handle.cursor = 'crosshair';
                    handle.x = corner.x;
                    handle.y = corner.y;
                    // Inverse scale so handles don't become tiny if the building is scaled down
                    const invScale = 1 / ((obj.properties?.scale as number) || 1);
                    handle.scale.set(invScale * 1.5);
                    handle.alpha = 0; // Hidden by default

                    let isDraggingHandle = false;
                    let startCorners: { x: number, y: number }[] = [];
                    let startCx = 0;
                    let startCy = 0;
                    let startDist = 0;

                    handle.on('pointerdown', (e) => {
                        if (onDragStart && !onDragStart()) return;
                        e.stopPropagation();
                        isDraggingHandle = true;
                        isTransforming = true;
                        selectedHandleIndex = i;

                        startCorners = currentCorners.map(c => ({ ...c }));
                        startCx = (startCorners[0].x + startCorners[1].x + startCorners[2].x + startCorners[3].x) / 4;
                        startCy = (startCorners[0].y + startCorners[1].y + startCorners[2].y + startCorners[3].y) / 4;
                        startDist = Math.hypot(startCorners[i].x - startCx, startCorners[i].y - startCy);
                    });

                    handle.on('globalpointermove', (e) => {
                        if (isDraggingHandle) {
                            const newPos = sprite.toLocal(e.global);

                            if (e.shiftKey && startDist > 0) {
                                const newDist = Math.hypot(newPos.x - startCx, newPos.y - startCy);
                                const scale = newDist / startDist;

                                startCorners.forEach((sc, idx) => {
                                    currentCorners[idx].x = startCx + (sc.x - startCx) * scale;
                                    currentCorners[idx].y = startCy + (sc.y - startCy) * scale;
                                    handles[idx].x = currentCorners[idx].x;
                                    handles[idx].y = currentCorners[idx].y;
                                });
                            } else {
                                handle.x = newPos.x;
                                handle.y = newPos.y;
                                currentCorners[i] = { x: newPos.x, y: newPos.y };

                                // Update proportional reference constraints for if user later holds Shift
                                startCorners = currentCorners.map(c => ({ ...c }));
                                startCx = (startCorners[0].x + startCorners[1].x + startCorners[2].x + startCorners[3].x) / 4;
                                startCy = (startCorners[0].y + startCorners[1].y + startCorners[2].y + startCorners[3].y) / 4;
                                startDist = Math.hypot(startCorners[i].x - startCx, startCorners[i].y - startCy);
                            }
                            updateMeshVertices(currentCorners);
                            updateTransformFrame();
                        }
                    });

                    const endHandleDrag = () => {
                        if (isDraggingHandle) {
                            if (onDragCancel) onDragCancel();
                            isDraggingHandle = false;
                            isTransforming = false;
                            selectedHandleIndex = -1;
                            if (onCornersMoved) {
                                onCornersMoved(obj.id, currentCorners);
                            }
                        }
                    };

                    handle.on('pointerup', endHandleDrag);
                    handle.on('pointerupoutside', endHandleDrag);

                    handles.push(handle);
                    handlesContainer.addChild(handle);
                });

                sprite.addChild(handlesContainer);

                // Listen for custom toggle from parent UI
                sprite.on('toggleTransformMode', (enabled: boolean) => {
                    handles.forEach(h => h.alpha = enabled ? 1 : 0);
                    transformFrame.alpha = enabled ? 1 : 0;
                    if (enabled) {
                        // Suppress pointermove on the main sprite to prevent dragging the whole object
                        sprite.eventMode = 'passive';
                        handles.forEach(h => h.eventMode = 'static');
                        updateTransformFrame();
                    } else {
                        sprite.eventMode = 'static';
                        handles.forEach(h => h.eventMode = 'none');
                    }
                });

                sprite.on('pointerdown', (e) => {
                    if (onDragStart && !onDragStart()) return;
                    e.stopPropagation();
                    isDragging = true;
                    if (onObjectSelected) onObjectSelected(obj.id);
                    // Provide visual feedback for selection
                    sprites.forEach(s => {
                        // reset all others
                        if (s.sprite !== sprite) {
                            s.sprite.tint = 0xffffff;
                            s.sprite.emit('toggleTransformMode', false);
                        }
                    });
                    sprite.tint = 0xffffaa;
                    sprite.alpha = 0.6;
                    sprite.zIndex = 1000;
                    sprite.y -= 10;

                    // If we were in transform mode, disable it upon body drag start
                    if ((sprite as any).isTransformMode) {
                        (sprite as any).isTransformMode = false;
                        sprite.emit('toggleTransformMode', false);
                    }
                });

                sprite.on('globalpointermove', (e) => {
                    if (isDragging && !isTransforming) {
                        const newPos = parentContainer.toLocal(e.global);
                        sprite.x = newPos.x;
                        sprite.y = newPos.y;
                    }
                });

                const handleDragEnd = () => {
                    if (isDragging && !isTransforming) {
                        isDragging = false;
                        sprite.alpha = 0.85;
                        const depth = obj.x + obj.y;
                        sprite.zIndex = 100 + depth;
                        if (onObjectMoved) {
                            // Extract grid vs fine offset
                            const newGrid = isoToGrid(sprite.x, sprite.y);
                            const newBaseIso = gridToIso(newGrid.col, newGrid.row);
                            const newOffsetX = sprite.x - newBaseIso.x;
                            const newOffsetY = sprite.y - newBaseIso.y;
                            onObjectMoved(obj.id, newGrid.col, newGrid.row, newOffsetX, newOffsetY, sprite.rotation);
                        }
                        if (onDragCancel) onDragCancel();
                    }
                };

                sprite.on('pointerup', handleDragEnd);
                sprite.on('pointerupoutside', handleDragEnd);
            } else {
                sprite.eventMode = 'none';
            }

            parentContainer.addChild(sprite);
            sprites.push({ id: obj.id, sprite });
        } catch (e) {
            console.warn(`Failed to load room asset: ${assetStr}`, e);
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
