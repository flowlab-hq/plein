/**
 * Visible snap grid for the diagram canvas.
 *
 * Boxes and orthogonal routes sit on the snap lattice for manual placement
 * and for automatic packing (ELK layered, layers, organic), including the
 * default file-open path. This is not `autoLayout grid` (catalogue packing
 * by kind or name): that mode is left as packed.
 *
 * Two pitches share one model-space origin, (0, 0):
 * - Drawn lines use `DRAWN_CANVAS_GRID_PITCH`. Grid → Spacing does not
 *   change that pitch, so at a fixed zoom the lines look the same. Zoom scales
 *   the SVG, which is what changes how big the lines look on screen.
 * - Snap spacing is the Grid cell size (default 24). Every offered size is
 *   a multiple of the drawn pitch, so a snapped coordinate lands on a drawn line.
 *
 * The lines fill model space from its top-left outward (including empty canvas
 * past the content box). They are not a patch painted only under the boxes.
 *
 * Drag placement is `alignDraggedBox` (`src/align-snap.ts`). The Mac UI
 * passes `snapProposedOrigin` as that function's `gridSnap` hook
 * (`gridSnapForDrag`). Order:
 * 1. Grid snap rounds the unclamped pointer position onto the snap spacing.
 * 2. Neighbour-align (centres and edges) may then move that point, and only
 *    when the candidate is still within the align threshold. Otherwise the
 *    grid-snapped position stands.
 *
 * Hiding the lines does not skip step 1. `gridSnapForDrag` stays wired
 * whether or not the overlay is painted.
 */

/** Cell pitch in model units. The default box width is an integer number of these. */
export const DEFAULT_CANVAS_GRID_SIZE = 24;

/**
 * Snap spacings offered under Grid. Each divides evenly into the drawn pitch
 * below, so a snap lands on a visible line.
 */
export const CANVAS_GRID_SIZES = [8, 16, 24, 32, 48] as const;

export type CanvasGridSize = (typeof CANVAS_GRID_SIZES)[number];

/**
 * Drawn line pitch in model units. Fixed: snap spacing does not change it.
 * Zoom is the only control that changes how large this pitch looks on screen.
 */
export const DRAWN_CANVAS_GRID_PITCH = 8;

/** A stronger line every this many drawn cells, so the pitch stays readable. */
export const CANVAS_GRID_MAJOR_EVERY = 4;

export function normalizeCanvasGridSize(cellSize: number): number {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return DEFAULT_CANVAS_GRID_SIZE;
  }
  return cellSize;
}

/** Nearest multiple of the cell size. Halfway cases round away from zero. Origin is model-space 0. */
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

/** Smallest multiple of `size` that is >= `value` (model origin 0). */
export function ceilToLattice(value: number, cellSize: number): number {
  const size = normalizeCanvasGridSize(cellSize);
  if (!Number.isFinite(value)) {
    return 0;
  }
  const index = Math.ceil(value / size - 1e-9);
  const snapped = index * size;
  return snapped === 0 ? 0 : snapped;
}

/**
 * Top-left after grid snap only.
 * `shift` is the unclamped pointer delta in model space (`manualDragShift`).
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

export type ModelSpaceFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Model-space rectangle the lines must fill.
 * The top-left is the model origin, or further out when content has crossed
 * into negative coordinates. The far edges reach the content box and the
 * visible pane, so empty canvas is gridded too — not only the area under boxes.
 */
export function modelSpaceFrame(
  content: { x: number; y: number; width: number; height: number },
  pane: { width: number; height: number },
): ModelSpaceFrame {
  const contentX = Number.isFinite(content.x) ? content.x : 0;
  const contentY = Number.isFinite(content.y) ? content.y : 0;
  const contentWidth = Number.isFinite(content.width) ? Math.max(0, content.width) : 0;
  const contentHeight = Number.isFinite(content.height) ? Math.max(0, content.height) : 0;
  const paneWidth = Number.isFinite(pane.width) ? Math.max(0, pane.width) : 0;
  const paneHeight = Number.isFinite(pane.height) ? Math.max(0, pane.height) : 0;
  const x = Math.min(0, contentX);
  const y = Math.min(0, contentY);
  const right = Math.max(contentX + contentWidth, x + paneWidth);
  const bottom = Math.max(contentY + contentHeight, y + paneHeight);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

export type CanvasGridLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
};

/** Lattice coordinates from `start` through `end`, measured from model-space 0. */
export function latticeCoordinates(start: number, end: number, pitch: number): number[] {
  const size = pitch > 0 && Number.isFinite(pitch) ? pitch : DRAWN_CANVAS_GRID_PITCH;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const first = Math.floor(lo / size + 1e-9);
  const last = Math.ceil(hi / size - 1e-9);
  const values: number[] = [];
  for (let index = first; index <= last; index += 1) {
    const value = index * size;
    values.push(value === 0 ? 0 : value);
  }
  return values;
}

function isMajorLine(coordinate: number, pitch: number): boolean {
  const index = Math.round(coordinate / pitch);
  return index % CANVAS_GRID_MAJOR_EVERY === 0;
}

/**
 * Drawn grid lines for `frame`. Pitch is always `DRAWN_CANVAS_GRID_PITCH`,
 * never the snap spacing, so changing snap spacing does not redraw a coarser
 * or finer grid.
 */
export function canvasGridLines(frame: ModelSpaceFrame): CanvasGridLine[] {
  const pitch = DRAWN_CANVAS_GRID_PITCH;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const lines: CanvasGridLine[] = [];
  for (const x of latticeCoordinates(frame.x, right, pitch)) {
    lines.push({
      x1: x,
      y1: frame.y,
      x2: x,
      y2: bottom,
      major: isMajorLine(x, pitch),
    });
  }
  for (const y of latticeCoordinates(frame.y, bottom, pitch)) {
    lines.push({
      x1: frame.x,
      y1: y,
      x2: right,
      y2: y,
      major: isMajorLine(y, pitch),
    });
  }
  return lines;
}

export function canvasGridLinePaths(frame: ModelSpaceFrame): { minor: string; major: string } {
  const minor: string[] = [];
  const major: string[] = [];
  for (const line of canvasGridLines(frame)) {
    const command = `M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}`;
    (line.major ? major : minor).push(command);
  }
  return { minor: minor.join(" "), major: major.join(" ") };
}

export type GridBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GridSeatNode = GridBox & {
  id: string;
  parentId?: string;
};

export type GridPoint = { x: number; y: number };

export type GridSeatEdge = {
  source: string;
  target: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points?: GridPoint[];
  impliedByNest?: boolean;
};

export type GridRouteDirection = "tb" | "bt" | "lr" | "rl";
export type GridRouteStyle = "orthogonal" | "polyline";

/** Span whose far edge lands on the snap lattice. `origin` stays put. */
export function spanOnLattice(origin: number, span: number, cellSize: number): number {
  const size = normalizeCanvasGridSize(cellSize);
  const length = Number.isFinite(span) ? Math.max(0, span) : 0;
  const far = ceilToLattice(origin + length, size);
  const grown = far - origin;
  return grown > 0 ? grown : size;
}

function seatOne<T extends GridBox>(box: T, cellSize: number, holdOrigin: boolean): T {
  const x = holdOrigin ? box.x : snapToGrid(box.x, cellSize);
  const y = holdOrigin ? box.y : snapToGrid(box.y, cellSize);
  return {
    ...box,
    x,
    y,
    width: spanOnLattice(x, box.width, cellSize),
    height: spanOnLattice(y, box.height, cellSize),
  };
}

function coverChildren<T extends GridSeatNode>(nodes: T[], cellSize: number, hold: ReadonlySet<string>): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) {
      continue;
    }
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const visit = (id: string): void => {
    for (const childId of children.get(id) ?? []) {
      visit(childId);
    }
    const parent = byId.get(id);
    const childIds = children.get(id);
    if (!parent || !childIds || childIds.length === 0) {
      return;
    }
    let left = parent.x;
    let top = parent.y;
    let right = parent.x + parent.width;
    let bottom = parent.y + parent.height;
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) {
        continue;
      }
      left = Math.min(left, child.x);
      top = Math.min(top, child.y);
      right = Math.max(right, child.x + child.width);
      bottom = Math.max(bottom, child.y + child.height);
    }
    if (!hold.has(parent.id)) {
      parent.x = snapToGrid(left, cellSize);
      parent.y = snapToGrid(top, cellSize);
    }
    parent.width = spanOnLattice(parent.x, right - parent.x, cellSize);
    parent.height = spanOnLattice(parent.y, bottom - parent.y, cellSize);
  };
  for (const node of nodes) {
    if (!node.parentId) {
      visit(node.id);
    }
  }
  return nodes;
}

function attachAxis(center: number, lo: number, hi: number, size: number): number {
  const start = Math.min(lo, hi);
  const end = Math.max(lo, hi);
  const first = Math.ceil(start / size - 1e-9);
  const last = Math.floor(end / size + 1e-9);
  if (last < first) {
    return snapToGrid(center, size);
  }
  let best = first * size;
  let bestDist = Math.abs(best - center);
  for (let index = first + 1; index <= last; index += 1) {
    const value = index * size;
    const dist = Math.abs(value - center);
    if (dist < bestDist) {
      best = value === 0 ? 0 : value;
      bestDist = dist;
    }
  }
  return best === 0 ? 0 : best;
}

function dedupe(points: GridPoint[]): GridPoint[] {
  const out: GridPoint[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && prev.x === point.x && prev.y === point.y) {
      continue;
    }
    out.push(point);
  }
  return out.length >= 2 ? out : points;
}

function busBetween(from: number, to: number, size: number): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let bus = snapToGrid((from + to) / 2, size);
  if (hi - lo >= size * 2) {
    if (bus <= lo) {
      bus = lo + size;
    }
    if (bus >= hi) {
      bus = hi - size;
    }
  }
  if (bus < lo) {
    bus = lo;
  }
  if (bus > hi) {
    bus = hi;
  }
  return bus === 0 ? 0 : bus;
}

function horizontalRoute(source: GridBox, target: GridBox, size: number): GridPoint[] {
  const rightward = target.x + target.width / 2 >= source.x + source.width / 2;
  const x1 = rightward ? source.x + source.width : source.x;
  const x2 = rightward ? target.x : target.x + target.width;
  const y1 = attachAxis(source.y + source.height / 2, source.y, source.y + source.height, size);
  const y2 = attachAxis(target.y + target.height / 2, target.y, target.y + target.height, size);
  if (y1 === y2) {
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }
  const bus = busBetween(x1, x2, size);
  return dedupe([
    { x: x1, y: y1 },
    { x: bus, y: y1 },
    { x: bus, y: y2 },
    { x: x2, y: y2 },
  ]);
}

function verticalRoute(source: GridBox, target: GridBox, size: number): GridPoint[] {
  const downward = target.y + target.height / 2 >= source.y + source.height / 2;
  const y1 = downward ? source.y + source.height : source.y;
  const y2 = downward ? target.y : target.y + target.height;
  const x1 = attachAxis(source.x + source.width / 2, source.x, source.x + source.width, size);
  const x2 = attachAxis(target.x + target.width / 2, target.x, target.x + target.width, size);
  if (x1 === x2) {
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }
  const bus = busBetween(y1, y2, size);
  return dedupe([
    { x: x1, y: y1 },
    { x: x1, y: bus },
    { x: x2, y: bus },
    { x: x2, y: y2 },
  ]);
}

function borderPoint(box: GridBox, toward: GridPoint, size: number): GridPoint {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? box.x + box.width : box.x,
      y: attachAxis(cy, box.y, box.y + box.height, size),
    };
  }
  return {
    x: attachAxis(cx, box.x, box.x + box.width, size),
    y: dy >= 0 ? box.y + box.height : box.y,
  };
}

/** Orthogonal segments lie on the snap lattice. Polyline keeps a straight segment between lattice points on the borders. */
export function routeOnGrid(
  source: GridBox,
  target: GridBox,
  cellSize: number,
  routing: GridRouteStyle,
  direction: GridRouteDirection,
): GridPoint[] {
  const size = normalizeCanvasGridSize(cellSize);
  if (routing === "polyline") {
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    return dedupe([borderPoint(source, targetCenter, size), borderPoint(target, sourceCenter, size)]);
  }
  const vertical = direction === "tb" || direction === "bt";
  return vertical ? verticalRoute(source, target, size) : horizontalRoute(source, target, size);
}

function withRoute<E extends GridSeatEdge>(edge: E, points: GridPoint[]): E {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return edge;
  }
  return {
    ...edge,
    x1: first.x,
    y1: first.y,
    x2: last.x,
    y2: last.y,
    points,
  };
}

/**
 * Whether the diagram should seat boxes and routes on the snap lattice.
 *
 * Auto Off always seats (manual positions and a frozen snapshot).
 * Auto On seats ELK and organic packing the same way, including a file that
 * never says `autoLayout off`. Catalogue packing (`mode` `grid` while
 * automatic) stays where the packer put it.
 */
export function layoutSitsOnSnapGrid(layout: { auto?: boolean; mode?: string }): boolean {
  if (layout.mode === "grid" && layout.auto !== false) {
    return false;
  }
  return true;
}

/**
 * Move boxes onto the snap lattice and rebuild relationship routes so
 * orthogonal segments track those lines. `hold` keeps a top-left that
 * neighbour-align pulled off the lattice; the far edges still land on a line.
 * Nested parents grow to keep their children inside. Children are not shifted
 * relative to a drag — the caller moves them with the parent.
 */
export function seatLayoutOnGrid<N extends GridSeatNode, E extends GridSeatEdge>(
  nodes: readonly N[],
  edges: readonly E[],
  cellSize: number,
  routing: GridRouteStyle,
  direction: GridRouteDirection,
  hold?: ReadonlySet<string>,
): { nodes: N[]; edges: E[] } {
  const keep = hold ?? new Set<string>();
  const seated = coverChildren(
    nodes.map((node) => seatOne(node, cellSize, keep.has(node.id))),
    cellSize,
    keep,
  );
  const byId = new Map(seated.map((node) => [node.id, node]));
  const routed = edges.map((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      return edge;
    }
    if (edge.impliedByNest) {
      return {
        ...edge,
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        points: undefined,
      };
    }
    return withRoute(edge, routeOnGrid(source, target, cellSize, routing, direction));
  });
  return { nodes: seated, edges: routed };
}
