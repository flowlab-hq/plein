/**
 * Resize one element by dragging a single edge while auto-layout is off.
 * The moving edge snaps to the canvas lattice. The other three edges stay.
 * Corners are not handles: a corner drag is a move, not a two-axis resize.
 */

import { ceilToLattice, normalizeCanvasGridSize, snapToGrid } from "./canvas-grid.js";
import { MIN_RESIZE_HEIGHT, MIN_RESIZE_WIDTH } from "./label-fit.js";

export { MIN_RESIZE_HEIGHT, MIN_RESIZE_WIDTH };

export type ResizeEdge = "left" | "right" | "top" | "bottom";

export type ResizeBox = { x: number; y: number; width: number; height: number };

/** Hit strip thickness in user units. At zoom 1 that is CSS pixels. */
export const RESIZE_HANDLE_THICKNESS = 10;

export function parseResizeEdge(value: string | null | undefined): ResizeEdge | null {
  if (value === "left" || value === "right" || value === "top" || value === "bottom") {
    return value;
  }
  return null;
}

/**
 * Local hit strips for one box, inset from the corners so a corner stays a move.
 * Coordinates are inside the node group (origin at the box top-left).
 * Strips extend half their thickness outside the box so the stroke is easy to grab.
 */
export function resizeHandleRects(
  box: { width: number; height: number },
  thickness = RESIZE_HANDLE_THICKNESS,
): Array<{ edge: ResizeEdge; x: number; y: number; width: number; height: number }> {
  const spanX = Number.isFinite(box.width) && box.width > 0 ? box.width : 0;
  const spanY = Number.isFinite(box.height) && box.height > 0 ? box.height : 0;
  const t = Number.isFinite(thickness) && thickness > 0 ? thickness : RESIZE_HANDLE_THICKNESS;
  const corner = Math.min(t, spanX / 3, spanY / 3);
  const innerW = Math.max(1, spanX - corner * 2);
  const innerH = Math.max(1, spanY - corner * 2);
  return [
    { edge: "left", x: -t / 2, y: corner, width: t, height: innerH },
    { edge: "right", x: spanX - t / 2, y: corner, width: t, height: innerH },
    { edge: "top", x: corner, y: -t / 2, width: innerW, height: t },
    { edge: "bottom", x: corner, y: spanY - t / 2, width: innerW, height: t },
  ];
}

function floorToLattice(value: number, cellSize: number): number {
  const size = normalizeCanvasGridSize(cellSize);
  if (!Number.isFinite(value)) {
    return 0;
  }
  const index = Math.floor(value / size + 1e-9);
  const snapped = index * size;
  return snapped === 0 ? 0 : snapped;
}

/** Moving edge that grows away from `fixed` (right or bottom). Lands on the lattice. */
function snapHighEdge(fixed: number, proposed: number, minSpan: number, cellSize: number): number {
  const size = normalizeCanvasGridSize(cellSize);
  const min = Math.max(minSpan, size);
  const moving = snapToGrid(proposed, size);
  const lowest = ceilToLattice(fixed + min, size);
  return moving < lowest ? lowest : moving;
}

/** Moving edge that grows toward `fixed` from below (left or top). Lands on the lattice. */
function snapLowEdge(fixed: number, proposed: number, minSpan: number, cellSize: number): number {
  const size = normalizeCanvasGridSize(cellSize);
  const min = Math.max(minSpan, size);
  const moving = snapToGrid(proposed, size);
  const highest = floorToLattice(fixed - min, size);
  return moving > highest ? highest : moving;
}

/**
 * Box after one edge moves by `delta` in user units.
 * Width changes only for left/right. Height changes only for top/bottom.
 * The moving edge snaps to `cellSize`. The result is at least one cell, and
 * at least `MIN_RESIZE_WIDTH` / `MIN_RESIZE_HEIGHT`, with that far edge still
 * on the lattice (so a later grid seat does not grow it again).
 */
export function boxAfterEdgeDrag(
  origin: ResizeBox,
  edge: ResizeEdge,
  delta: { x: number; y: number },
  cellSize: number,
): ResizeBox {
  const dx = Number.isFinite(delta.x) ? delta.x : 0;
  const dy = Number.isFinite(delta.y) ? delta.y : 0;
  const x = Number.isFinite(origin.x) ? origin.x : 0;
  const y = Number.isFinite(origin.y) ? origin.y : 0;
  const width = Number.isFinite(origin.width) ? origin.width : 0;
  const height = Number.isFinite(origin.height) ? origin.height : 0;
  if (edge === "right") {
    const right = snapHighEdge(x, x + width + dx, MIN_RESIZE_WIDTH, cellSize);
    return { x, y, width: right - x, height };
  }
  if (edge === "left") {
    const right = x + width;
    const left = snapLowEdge(right, x + dx, MIN_RESIZE_WIDTH, cellSize);
    return { x: left, y, width: right - left, height };
  }
  if (edge === "bottom") {
    const bottom = snapHighEdge(y, y + height + dy, MIN_RESIZE_HEIGHT, cellSize);
    return { x, y, width, height: bottom - y };
  }
  const bottom = y + height;
  const top = snapLowEdge(bottom, y + dy, MIN_RESIZE_HEIGHT, cellSize);
  return { x, y: top, width, height: bottom - top };
}
