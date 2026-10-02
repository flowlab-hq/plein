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
 * Sideways pan for a vertical wheel when the canvas is wider than the pane
 * and not taller. Native overflow scrolling ignores that wheel, so a clipped
 * element on a short wide diagram (the catalogue at default zoom) cannot be
 * reached. A mostly-horizontal gesture, Shift+wheel, and a pane that also
 * overflows vertically keep the browser's own pan.
 * Returns CSS pixels to add to `scrollLeft`, or null to leave the wheel alone.
 */
export function horizontalPanFromVerticalWheel(input: {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  shiftKey: boolean;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}): number | null {
  if (input.shiftKey) {
    return null;
  }
  const deltaX = Number.isFinite(input.deltaX) ? input.deltaX : 0;
  const deltaY = Number.isFinite(input.deltaY) ? input.deltaY : 0;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return null;
  }
  const clientWidth = Number.isFinite(input.clientWidth) ? input.clientWidth : 0;
  const clientHeight = Number.isFinite(input.clientHeight) ? input.clientHeight : 0;
  const scrollWidth = Number.isFinite(input.scrollWidth) ? input.scrollWidth : 0;
  const scrollHeight = Number.isFinite(input.scrollHeight) ? input.scrollHeight : 0;
  const overflowX = scrollWidth - clientWidth > 1;
  const overflowY = scrollHeight - clientHeight > 1;
  if (!overflowX || overflowY) {
    return null;
  }
  const pixels = normalizeWheelDelta(deltaY, input.deltaMode);
  if (pixels === 0) {
    return null;
  }
  return pixels;
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
 * Scroll offsets that keep the content point under the pointer fixed
 * when the SVG sits at the scroll-content origin and the result is not
 * negative. `pointerX/Y` are CSS pixels from the pane’s padding edge.
 * `scale` is `nextZoom / previousZoom`.
 */
export function scrollToKeepPoint(input: {
  scrollLeft: number;
  scrollTop: number;
  pointerX: number;
  pointerY: number;
  scale: number;
}): { scrollLeft: number; scrollTop: number } {
  const placed = placeZoomAnchor({
    localX: input.scrollLeft + input.pointerX,
    localY: input.scrollTop + input.pointerY,
    pointerX: input.pointerX,
    pointerY: input.pointerY,
    scale: input.scale,
  });
  return {
    scrollLeft: placed.scrollLeft - placed.marginLeft,
    scrollTop: placed.scrollTop - placed.marginTop,
  };
}

/**
 * Place the scaled SVG so the point under the pointer stays put.
 * `localX/Y` are CSS pixels from the SVG’s top-left to the pointer.
 * `pointerX/Y` are CSS pixels from the pane’s padding edge to the pointer.
 * Negative scroll is expressed as margin so zoom-out still centres when
 * the diagram is already at the top-left of the pane.
 */
export function placeZoomAnchor(input: {
  localX: number;
  localY: number;
  pointerX: number;
  pointerY: number;
  scale: number;
}): { scrollLeft: number; scrollTop: number; marginLeft: number; marginTop: number } {
  const scale = Number.isFinite(input.scale) && input.scale > 0 ? input.scale : 1;
  const x = placeAxis(input.localX, input.pointerX, scale);
  const y = placeAxis(input.localY, input.pointerY, scale);
  return {
    scrollLeft: x.scroll,
    scrollTop: y.scroll,
    marginLeft: x.margin,
    marginTop: y.margin,
  };
}

function placeAxis(local: number, pointer: number, scale: number): { scroll: number; margin: number } {
  const scroll = local * scale - pointer;
  if (scroll >= 0) {
    return { scroll, margin: 0 };
  }
  return { scroll: 0, margin: -scroll };
}
