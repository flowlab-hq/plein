/**
 * Visible snap grid for manual placement on the diagram canvas.
 *
 * This is not `autoLayout grid` (catalogue packing by kind or name). Cells
 * are a fixed pitch in view-space pixels, origin at user-space (0, 0), so a
 * drag is not clamped to the current content box and the lines do not slide
 * when that box grows.
 *
 * Drag placement is `alignDraggedBox` (`src/align-snap.ts`). The Mac UI
 * passes `snapProposedOrigin` as that function's `gridSnap` hook
 * (`gridSnapForDrag`). Order:
 * 1. Grid snap rounds the unclamped pointer position onto this cell size.
 * 2. Neighbour-align (centres and edges) may then move that point, and only
 *    when the candidate is still within the align threshold. Otherwise the
 *    grid-snapped position stands.
 *
 * Hiding the lines does not skip step 1. `gridSnapForDrag` stays wired
 * whether or not the overlay is painted.
 */

/** Cell pitch in view pixels. Matches diagram padding, and the default box width is an integer number of cells. */
export const DEFAULT_CANVAS_GRID_SIZE = 24;

/** Sizes offered in the diagram Options control. The default is included. */
export const CANVAS_GRID_SIZES = [8, 16, 24, 32, 48] as const;

export type CanvasGridSize = (typeof CANVAS_GRID_SIZES)[number];

/** A stronger line every this many cells, so the pitch stays readable. */
export const CANVAS_GRID_MAJOR_EVERY = 4;

export function normalizeCanvasGridSize(cellSize: number): number {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return DEFAULT_CANVAS_GRID_SIZE;
  }
  return cellSize;
}

/** Nearest multiple of the cell size. Halfway cases round away from zero. */
export function snapToGrid(value: number, cellSize: number): number {
  const size = normalizeCanvasGridSize(cellSize);
  if (!Number.isFinite(value)) {
    return 0;
  }
  const steps = value / size;
  const index = Math.sign(steps) * Math.round(Math.abs(steps));
  const snapped = index * size;
  return snapped === 0 ? 0 : snapped;
}

/**
 * Top-left after grid snap only.
 * `shift` is the unclamped pointer delta in user space (`manualDragShift`).
 * The grid origin is (0, 0), not the content box.
 */
export function gridSnapDragPosition(
  origin: { x: number; y: number },
  shift: { x: number; y: number },
  cellSize: number,
): { x: number; y: number } {
  const x = Number.isFinite(origin.x) ? origin.x : 0;
  const y = Number.isFinite(origin.y) ? origin.y : 0;
  const dx = Number.isFinite(shift.x) ? shift.x : 0;
  const dy = Number.isFinite(shift.y) ? shift.y : 0;
  return {
    x: snapToGrid(x + dx, cellSize),
    y: snapToGrid(y + dy, cellSize),
  };
}

/**
 * `gridSnap` callback body for `alignDraggedBox`.
 * `proposed` is the unclamped pointer top-left. Neighbour-align runs after
 * this inside `alignDraggedBox`, and only within its threshold.
 */
export function snapProposedOrigin(
  proposed: { x: number; y: number },
  cellSize: number,
): { x: number; y: number } {
  return gridSnapDragPosition(proposed, { x: 0, y: 0 }, cellSize);
}

export type CanvasGridPatternSpec = {
  size: number;
  majorEvery: number;
  /** Pattern tile in user units. Origin of the tile is user-space (0, 0). */
  tile: number;
  originX: number;
  originY: number;
  minorPath: string;
  majorPath: string;
};

/** Pattern geometry for a user-space overlay. Lines stay on multiples of `size` from (0, 0). */
export function canvasGridPatternSpec(cellSize: number): CanvasGridPatternSpec {
  const size = normalizeCanvasGridSize(cellSize);
  const every = CANVAS_GRID_MAJOR_EVERY;
  const tile = size * every;
  const minor: string[] = [];
  for (let step = 1; step < every; step += 1) {
    const offset = size * step;
    minor.push(`M ${offset} 0 V ${tile}`);
    minor.push(`M 0 ${offset} H ${tile}`);
  }
  return {
    size,
    majorEvery: every,
    tile,
    originX: 0,
    originY: 0,
    minorPath: minor.join(" "),
    majorPath: `M 0 0 H ${tile} M 0 0 V ${tile}`,
  };
}
