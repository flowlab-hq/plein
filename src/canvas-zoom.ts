/**
 * Diagram-canvas zoom.
 *
 * The Mac pane pans with the browser’s overflow scroll (plain wheel / trackpad).
 * Zoom is an explicit modifier gesture — ⌘ or Ctrl plus the wheel — so pan,
 * selection, and node drag keep their existing pointers. Trackpad pinch arrives
 * as Ctrl+wheel in the webview and uses the same path.
 *
 * The factor is viewport-level: nested containers, auto-layout, and manual
 * positions all sit in one SVG, so they scale together.
 */

/** Smallest scale. Below this the boxes collapse into an unusable speck. */
export const MIN_CANVAS_ZOOM = 0.25;
/** Largest scale. Above this a single box fills the pane and pan becomes pointless. */
export const MAX_CANVAS_ZOOM = 4;
/**
 * Wheel pixels (after line/page normalisation) that double or halve the zoom.
 * A typical mouse notch is about 100px, ~15% per click.
 */
const PIXELS_PER_DOUBLING = 480;

export function clampCanvasZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
}

/** True when this wheel event should zoom instead of letting the pane pan. */
export function wheelGestureIsZoom(input: {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  return (input.metaKey || input.ctrlKey) && !input.altKey;
}

function normalizeWheelDelta(delta: number, deltaMode: number): number {
  if (!Number.isFinite(delta)) {
    return 0;
  }
  if (deltaMode === 1) {
    return delta * 40;
  }
  if (deltaMode === 2) {
    return delta * 800;
  }
  return delta;
}

/**
 * Next zoom after one wheel event.
 * Positive `deltaY` (scroll down / wheel away) zooms out; negative zooms in.
 * When `deltaY` is 0, `deltaX` is used so a shifted horizontal wheel still zooms.
 */
export function nextCanvasZoom(
  current: number,
  deltaY: number,
  deltaMode: number,
  deltaX = 0,
): number {
  const dominant = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
  const pixels = normalizeWheelDelta(dominant, deltaMode);
  const safe = clampCanvasZoom(current);
  if (pixels === 0) {
    return safe;
  }
  const factor = Math.pow(2, -pixels / PIXELS_PER_DOUBLING);
  return clampCanvasZoom(safe * factor);
}

/**
 * Scroll offsets that keep the content point under the pointer fixed.
 * `pointerX/Y` are CSS pixels from the pane’s padding edge.
 * `scale` is `nextZoom / previousZoom`. The content origin is the top-left
 * of the diagram SVG.
 */
export function scrollToKeepPoint(input: {
  scrollLeft: number;
  scrollTop: number;
  pointerX: number;
  pointerY: number;
  scale: number;
}): { scrollLeft: number; scrollTop: number } {
  const scale = Number.isFinite(input.scale) && input.scale > 0 ? input.scale : 1;
  const contentX = input.scrollLeft + input.pointerX;
  const contentY = input.scrollTop + input.pointerY;
  return {
    scrollLeft: contentX * scale - input.pointerX,
    scrollTop: contentY * scale - input.pointerY,
  };
}
