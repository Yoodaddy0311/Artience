/**
 * Isometric coordinate system for Dokba Studio Town view.
 * Uses standard 2:1 isometric projection (tile width = 2 * tile height).
 */

// Tile dimensions in isometric view
export const ISO_TILE_WIDTH = 64; // pixel width of one iso tile
export const ISO_TILE_HEIGHT = 32; // pixel height of one iso tile

// Map dimensions (same grid as before: 40x25)
export const ISO_MAP_COLS = 40;
export const ISO_MAP_ROWS = 25;

/** Convert grid (col, row) to isometric screen (x, y) pixel coordinates */
export function gridToIso(
  col: number,
  row: number,
): { x: number; y: number } {
  return {
    x: (col - row) * (ISO_TILE_WIDTH / 2),
    y: (col + row) * (ISO_TILE_HEIGHT / 2),
  };
}

/** Convert screen pixel (x, y) back to grid (col, row) */
export function isoToGrid(
  screenX: number,
  screenY: number,
): { col: number; row: number } {
  return {
    col: Math.floor(
      (screenX / (ISO_TILE_WIDTH / 2) + screenY / (ISO_TILE_HEIGHT / 2)) / 2,
    ),
    row: Math.floor(
      (screenY / (ISO_TILE_HEIGHT / 2) - screenX / (ISO_TILE_WIDTH / 2)) / 2,
    ),
  };
}

/** Calculate the total canvas size needed for the isometric map */
export function getIsoCanvasSize(): { width: number; height: number } {
  const totalCols = ISO_MAP_COLS;
  const totalRows = ISO_MAP_ROWS;
  return {
    width: (totalCols + totalRows) * (ISO_TILE_WIDTH / 2),
    height: (totalCols + totalRows) * (ISO_TILE_HEIGHT / 2),
  };
}

/** Get camera offset to center the map in the viewport */
export function getCameraOffset(
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  return {
    x: viewportWidth / 2, // Center horizontally (the 0,0 iso point is at top-center)
    y: 50, // Small top padding
  };
}

/**
 * Sort entities by depth for proper isometric overlap.
 * Entities further from camera (higher row + col) should render first (behind).
 * Returns comparison value for Array.sort().
 */
export function isoDepthCompare(
  a: { gridCol: number; gridRow: number },
  b: { gridCol: number; gridRow: number },
): number {
  const depthA = a.gridCol + a.gridRow;
  const depthB = b.gridCol + b.gridRow;
  return depthA - depthB;
}

/**
 * Direction from movement delta in grid coordinates.
 * Returns one of: 'NW' | 'NE' | 'SW' | 'SE'
 */
export type IsoDirection = "NW" | "NE" | "SW" | "SE";

export function getIsoDirection(dx: number, dy: number): IsoDirection {
  // Convert grid delta to isometric screen delta:
  //   screenDx = (dx - dy)  → positive = right on screen
  //   screenDy = (dx + dy)  → positive = down on screen
  const screenDx = dx - dy;
  const screenDy = dx + dy;

  if (screenDx >= 0 && screenDy > 0) return "SE";  // screen right-down
  if (screenDx > 0 && screenDy <= 0) return "NE";  // screen right-up
  if (screenDx <= 0 && screenDy > 0) return "SW";  // screen left-down
  if (screenDx < 0 && screenDy <= 0) return "NW";  // screen left-up

  return "SE"; // fallback (dx=0, dy=0)
}

/**
 * Room definition for isometric zones.
 * Each room has a grid position, size, and asset reference.
 */
export interface IsoRoom {
  id: string;
  zone: string;
  label: string;
  // Grid position (top-left corner of the room in grid coords)
  gridCol: number;
  gridRow: number;
  // Size in grid tiles
  cols: number;
  rows: number;
  // Visual
  asset: string | null; // null = use programmatic floor tiles
  color: number; // floor tile tint color
}

/** Default room layout matching the existing zone structure */
export const ISO_ROOMS: IsoRoom[] = [
  {
    id: "work",
    zone: "work",
    label: "WORK ZONE",
    gridCol: 1,
    gridRow: 1,
    cols: 18,
    rows: 11,
    asset: null,
    color: 0xfde68a,
  },
  {
    id: "meeting",
    zone: "meeting",
    label: "MEETING",
    gridCol: 20,
    gridRow: 1,
    cols: 19,
    rows: 11,
    asset: "/sprites/iso/room-meeting.png",
    color: 0xa7f3d0,
  },
  {
    id: "hallway",
    zone: "hallway",
    label: "HALLWAY",
    gridCol: 1,
    gridRow: 13,
    cols: 38,
    rows: 4,
    asset: null,
    color: 0xe5e7eb,
  },
  {
    id: "rest",
    zone: "rest",
    label: "REST AREA",
    gridCol: 1,
    gridRow: 17,
    cols: 18,
    rows: 7,
    asset: null,
    color: 0xbfdbfe,
  },
  {
    id: "entrance",
    zone: "entrance",
    label: "ENTRANCE",
    gridCol: 20,
    gridRow: 17,
    cols: 19,
    rows: 7,
    asset: "/sprites/iso/room-server.png",
    color: 0xfecaca,
  },
];
