/**
 * Manual node drag while auto-layout is off.
 * The pointer delta is not clamped to the current content box: dragging the
 * outermost node further outward is a real move, and the canvas grows to match.
 */

/** User-space shift from a pointer delta. `pixelsPerUser` is the on-screen scale. */
export function manualDragShift(
  deltaClientX: number,
  deltaClientY: number,
  pixelsPerUserX: number,
  pixelsPerUserY: number,
): { x: number; y: number } {
  const scaleX = Number.isFinite(pixelsPerUserX) && pixelsPerUserX !== 0 ? pixelsPerUserX : 1;
  const scaleY = Number.isFinite(pixelsPerUserY) && pixelsPerUserY !== 0 ? pixelsPerUserY : 1;
  const dx = Number.isFinite(deltaClientX) ? deltaClientX : 0;
  const dy = Number.isFinite(deltaClientY) ? deltaClientY : 0;
  return { x: dx / scaleX, y: dy / scaleY };
}

export type DragBox = { id: string; x: number; y: number; width: number; height: number };

/**
 * Apply a drag shift to the nodes that started under the pointer (a container
 * and its children). Every other node keeps its coordinates.
 */
export function nodeBoxesAfterDrag(
  nodes: ReadonlyArray<DragBox>,
  origins: ReadonlyMap<string, { x: number; y: number }>,
  shift: { x: number; y: number },
): DragBox[] {
  return nodes.map((node) => {
    const origin = origins.get(node.id);
    if (!origin) {
      return node;
    }
    return {
      ...node,
      x: origin.x + shift.x,
      y: origin.y + shift.y,
    };
  });
}

/**
 * Extra end margin so `scroll` is reachable when the SVG is still smaller
 * than the pane. Expanding past the left or top needs that room: the browser
 * will not scroll before 0 unless the content is taller or wider than the pane.
 * A zero or negative scroll needs no slack. Content that already overflows
 * enough needs none either.
 */
export function slackMargin(clientSize: number, contentSize: number, scroll: number): number {
  if (!Number.isFinite(scroll) || scroll <= 0) {
    return 0;
  }
  if (!Number.isFinite(clientSize) || clientSize <= 0) {
    return 0;
  }
  const content = Number.isFinite(contentSize) && contentSize > 0 ? contentSize : 0;
  return Math.max(0, scroll + clientSize - content);
}

export function fitCanvasScroll(input: {
  clientWidth: number;
  clientHeight: number;
  contentWidth: number;
  contentHeight: number;
  scrollLeft: number;
  scrollTop: number;
}): { marginRight: number; marginBottom: number } {
  return {
    marginRight: slackMargin(input.clientWidth, input.contentWidth, input.scrollLeft),
    marginBottom: slackMargin(input.clientHeight, input.contentHeight, input.scrollTop),
  };
}
