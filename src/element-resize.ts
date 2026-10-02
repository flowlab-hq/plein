/**
 * Resize one element by dragging a single edge.
 *
 * Left and right change width. Top and bottom change height. The opposite
 * edge stays put, so a left or top drag also moves the top-left. Corners are
 * not a handle: a point that is as close to two axes is a body drag, so a
 * group move and a marquee stay distinct from a resize.
 *
 * The moving edge snaps with the same grid the body drag uses. Minimum size
 * wins over that snap, so a box cannot collapse.
 */

export type ResizeEdge = "left" | "right" | "top" | "bottom";

export type ResizeBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** On-screen width of the edge band, before it is converted to user units. */
export const EDGE_HIT_SCREEN_PX = 8;

export function resizeCursorAxis(edge: ResizeEdge): "ew" | "ns" {
  return edge === "left" || edge === "right" ? "ew" : "ns";
}

/**
 * Which edge the pointer is on, in the same user space as the layout box.
 * A corner, the interior, and a point outside the slop return null so the
 * gesture can move the box or start a marquee instead.
 */
export function resizeEdgeAtPoint(
  box: ResizeBox,
  x: number,
  y: number,
  threshold: number,
): ResizeEdge | null {
  if (
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    !(box.width > 0) ||
    !(box.height > 0) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(threshold) ||
    threshold < 0
  ) {
    return null;
  }
  if (
    x < box.x - threshold ||
    x > box.x + box.width + threshold ||
    y < box.y - threshold ||
    y > box.y + box.height + threshold
  ) {
    return null;
  }
  const hits: Array<{ edge: ResizeEdge; distance: number; axis: "x" | "y" }> = [
    { edge: "left", distance: Math.abs(x - box.x), axis: "x" },
    { edge: "right", distance: Math.abs(x - (box.x + box.width)), axis: "x" },
    { edge: "top", distance: Math.abs(y - box.y), axis: "y" },
    { edge: "bottom", distance: Math.abs(y - (box.y + box.height)), axis: "y" },
  ];
  const near = hits.filter((hit) => hit.distance <= threshold + 1e-6);
  if (near.length === 0) {
    return null;
  }
  near.sort((a, b) => a.distance - b.distance);
  const best = near[0]!;
  const rival = near.find((hit) => hit.axis !== best.axis);
  const cornerSlack = Math.max(1, threshold * 0.35);
  if (rival && rival.distance - best.distance <= cornerSlack) {
    return null;
  }
  return best.edge;
}

/**
 * Apply a pointer delta to one edge.
 * `snapEdge` receives the unclamped moving-edge coordinate and returns the
 * coordinate to use. The minimum span is applied after that snap.
 */
export function resizeBoxByEdge(input: {
  box: ResizeBox;
  edge: ResizeEdge;
  deltaX: number;
  deltaY: number;
  minWidth: number;
  minHeight: number;
  snapEdge?: (edgeCoord: number) => number;
}): ResizeBox {
  const box = input.box;
  const dx = Number.isFinite(input.deltaX) ? input.deltaX : 0;
  const dy = Number.isFinite(input.deltaY) ? input.deltaY : 0;
  const minWidth = Number.isFinite(input.minWidth) && input.minWidth > 0 ? input.minWidth : 1;
  const minHeight = Number.isFinite(input.minHeight) && input.minHeight > 0 ? input.minHeight : 1;
  const snap = input.snapEdge ?? ((value: number) => value);
  const right = box.x + box.width;
  const bottom = box.y + box.height;

  if (input.edge === "right") {
    let edge = snap(right + dx);
    if (!Number.isFinite(edge) || edge - box.x < minWidth) {
      edge = box.x + minWidth;
    }
    return { x: box.x, y: box.y, width: edge - box.x, height: box.height };
  }
  if (input.edge === "left") {
    let edge = snap(box.x + dx);
    if (!Number.isFinite(edge) || right - edge < minWidth) {
      edge = right - minWidth;
    }
    return { x: edge, y: box.y, width: right - edge, height: box.height };
  }
  if (input.edge === "bottom") {
    let edge = snap(bottom + dy);
    if (!Number.isFinite(edge) || edge - box.y < minHeight) {
      edge = box.y + minHeight;
    }
    return { x: box.x, y: box.y, width: box.width, height: edge - box.y };
  }
  let edge = snap(box.y + dy);
  if (!Number.isFinite(edge) || bottom - edge < minHeight) {
    edge = bottom - minHeight;
  }
  return { x: box.x, y: edge, width: box.width, height: bottom - edge };
}
