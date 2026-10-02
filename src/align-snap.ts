/**
 * Snap a dragged element to neighbouring centres and edges.
 *
 * Precedence when a visible snap grid is also on: grid snap runs first, on the
 * proposed top-left. Neighbour alignment is then measured from that
 * grid-snapped box and applied only when the centre or edge is still within
 * the align threshold. If nothing is in range, the grid-snapped position
 * stands. Alignment may leave the grid only in that within-threshold case.
 * Omit `gridSnap` when the grid is off.
 *
 * X and Y are chosen independently. The previous lock sticks until the pointer
 * leaves the threshold by `release`, and a rival has to be closer by that same
 * margin, so nearby candidates do not alternate.
 */

/** On-screen distance at which a centre or edge catches. */
export const ALIGN_SNAP_SCREEN_PX = 8;

/** Extra on-screen distance a lock keeps before it lets go. */
export const ALIGN_SNAP_RELEASE_SCREEN_PX = 4;

const GUIDE_PAD = 6;
const EPS = 1e-6;

export type AlignRect = {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Grid-snap hook for the visible snap grid.
 * Receives the proposed box and returns the grid-snapped top-left.
 * `alignDraggedBox` applies this before neighbour alignment.
 */
export type GridSnapFn = (box: AlignRect) => { x: number; y: number };

export type AlignAxisLock = {
  /** Stationary guide coordinate this axis is stuck to. */
  guide: number;
  /** Distance from the dragged top-left to the anchor on `guide`. */
  offset: number;
  kind: "center" | "edge";
};

export type AlignLock = {
  x: AlignAxisLock | null;
  y: AlignAxisLock | null;
};

export type AlignGuide = {
  /** `x` is a vertical line; `y` is a horizontal line. */
  axis: "x" | "y";
  position: number;
  from: number;
  to: number;
  kind: "center" | "edge";
};

export type AlignSnapResult = {
  x: number;
  y: number;
  guides: AlignGuide[];
  lock: AlignLock;
};

type Axis = "x" | "y";

type Anchor = {
  at: number;
  offset: number;
  kind: "center" | "edge";
};

type Candidate = {
  guide: number;
  offset: number;
  kind: "center" | "edge";
  distance: number;
  sourceId: string;
  crossStart: number;
  crossEnd: number;
};

/** Convert a screen-pixel snap distance into user units at the current zoom. */
export function userSnapDistance(screenPx: number, pixelsPerUser: number): number {
  const scale = Number.isFinite(pixelsPerUser) && pixelsPerUser > 0 ? pixelsPerUser : 1;
  const px = Number.isFinite(screenPx) ? Math.max(0, screenPx) : 0;
  return px / scale;
}

export function alignDraggedBox(input: {
  moving: AlignRect;
  others: readonly AlignRect[];
  /** User units. Used for an axis when that axis does not pass its own threshold. */
  threshold: number;
  thresholdX?: number;
  thresholdY?: number;
  /**
   * Extra user units past the threshold before the current lock releases.
   * A rival must also be closer by this margin. Omitted release is half the
   * axis threshold. Pass 0 to always take the closest candidate.
   */
  release?: number;
  releaseX?: number;
  releaseY?: number;
  lock?: AlignLock | null;
  /** Runs first when the snap grid is on. See the module note for precedence. */
  gridSnap?: GridSnapFn | null;
}): AlignSnapResult {
  const moving = input.moving;
  const empty: AlignSnapResult = {
    x: moving.x,
    y: moving.y,
    guides: [],
    lock: { x: null, y: null },
  };
  if (!Number.isFinite(moving.x) || !Number.isFinite(moving.y) || !Number.isFinite(moving.width) || !Number.isFinite(moving.height)) {
    return empty;
  }

  const base = applyGridSnap(moving, input.gridSnap);
  const thresholdX = axisDistance(input.thresholdX, input.threshold);
  const thresholdY = axisDistance(input.thresholdY, input.threshold);
  const releaseX = axisRelease(input.releaseX, input.release, thresholdX);
  const releaseY = axisRelease(input.releaseY, input.release, thresholdY);
  const measured: AlignRect = { ...moving, x: base.x, y: base.y };

  const xPick = pickAxis(
    "x",
    measured,
    input.others,
    input.lock?.x ?? null,
    thresholdX,
    releaseX,
  );
  const yPick = pickAxis(
    "y",
    measured,
    input.others,
    input.lock?.y ?? null,
    thresholdY,
    releaseY,
  );

  const x = xPick.chosen ? xPick.chosen.guide - xPick.chosen.offset : base.x;
  const y = yPick.chosen ? yPick.chosen.guide - yPick.chosen.offset : base.y;
  const snapped: AlignRect = { ...moving, x, y };
  const guides: AlignGuide[] = [];
  if (xPick.chosen) {
    guides.push(guideFor("x", xPick.chosen, xPick.matches, snapped));
  }
  if (yPick.chosen) {
    guides.push(guideFor("y", yPick.chosen, yPick.matches, snapped));
  }

  return {
    x,
    y,
    guides,
    lock: {
      x: xPick.chosen
        ? { guide: xPick.chosen.guide, offset: xPick.chosen.offset, kind: xPick.chosen.kind }
        : null,
      y: yPick.chosen
        ? { guide: yPick.chosen.guide, offset: yPick.chosen.offset, kind: yPick.chosen.kind }
        : null,
    },
  };
}

function applyGridSnap(moving: AlignRect, gridSnap?: GridSnapFn | null): { x: number; y: number } {
  if (!gridSnap) {
    return { x: moving.x, y: moving.y };
  }
  const next = gridSnap(moving);
  if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y)) {
    return { x: moving.x, y: moving.y };
  }
  return { x: next.x, y: next.y };
}

function axisDistance(primary: number | undefined, fallback: number): number {
  const value = primary ?? fallback;
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

function axisRelease(primary: number | undefined, fallback: number | undefined, threshold: number): number {
  const value = primary ?? fallback;
  if (value === undefined) {
    return threshold / 2;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

function pickAxis(
  axis: Axis,
  moving: AlignRect,
  others: readonly AlignRect[],
  lock: AlignAxisLock | null,
  threshold: number,
  release: number,
): { chosen: Candidate | null; matches: Candidate[] } {
  const size = axis === "x" ? moving.width : moving.height;
  if (!(size > 0)) {
    return { chosen: null, matches: [] };
  }
  const candidates = collect(axis, moving, others);
  const hold = threshold + Math.max(0, release);
  const held = lock
    ? candidates.find((candidate) => sameLock(candidate, lock) && candidate.distance <= hold + EPS)
    : undefined;
  const engaged = candidates.filter((candidate) => candidate.distance <= threshold + EPS);

  const chosen = held && engaged.every((candidate) => sameLock(candidate, lock) || candidate.distance + release >= held.distance - EPS)
    ? { ...held, kind: lock?.kind ?? held.kind }
    : best(engaged);
  if (!chosen) {
    return { chosen: null, matches: [] };
  }
  const matches = candidates.filter(
    (candidate) => nearly(candidate.guide, chosen.guide) && nearly(candidate.offset, chosen.offset),
  );
  return { chosen, matches };
}

function collect(axis: Axis, moving: AlignRect, others: readonly AlignRect[]): Candidate[] {
  const origin = axis === "x" ? moving.x : moving.y;
  const size = axis === "x" ? moving.width : moving.height;
  const movingAnchors = anchors(origin, size);
  const found: Candidate[] = [];
  for (const other of others) {
    if (other.id !== undefined && moving.id !== undefined && other.id === moving.id) {
      continue;
    }
    if (!Number.isFinite(other.x) || !Number.isFinite(other.y) || !(other.width > 0) || !(other.height > 0)) {
      continue;
    }
    const otherOrigin = axis === "x" ? other.x : other.y;
    const otherSize = axis === "x" ? other.width : other.height;
    const crossStart = axis === "x" ? other.y : other.x;
    const crossEnd = axis === "x" ? other.y + other.height : other.x + other.width;
    for (const stationary of anchors(otherOrigin, otherSize)) {
      for (const movingAnchor of movingAnchors) {
        found.push({
          guide: stationary.at,
          offset: movingAnchor.offset,
          kind: movingAnchor.kind === "center" || stationary.kind === "center" ? "center" : "edge",
          distance: Math.abs(stationary.at - movingAnchor.at),
          sourceId: other.id ?? "",
          crossStart,
          crossEnd,
        });
      }
    }
  }
  return found;
}

function anchors(origin: number, size: number): Anchor[] {
  return [
    { at: origin, offset: 0, kind: "edge" },
    { at: origin + size / 2, offset: size / 2, kind: "center" },
    { at: origin + size, offset: size, kind: "edge" },
  ];
}

function sameLock(candidate: Candidate, lock: AlignAxisLock | null): boolean {
  if (!lock) {
    return false;
  }
  return nearly(candidate.guide, lock.guide) && nearly(candidate.offset, lock.offset);
}

function best(candidates: readonly Candidate[]): Candidate | null {
  let winner: Candidate | null = null;
  for (const candidate of candidates) {
    if (!winner || better(candidate, winner)) {
      winner = candidate;
    }
  }
  return winner;
}

function better(next: Candidate, current: Candidate): boolean {
  if (Math.abs(next.distance - current.distance) > EPS) {
    return next.distance < current.distance;
  }
  if (next.kind !== current.kind) {
    return next.kind === "center";
  }
  if (next.sourceId !== current.sourceId) {
    return next.sourceId < current.sourceId;
  }
  return next.guide < current.guide;
}

function guideFor(axis: Axis, chosen: Candidate, matches: readonly Candidate[], snapped: AlignRect): AlignGuide {
  let from = axis === "x" ? snapped.y : snapped.x;
  let to = axis === "x" ? snapped.y + snapped.height : snapped.x + snapped.width;
  for (const match of matches) {
    from = Math.min(from, match.crossStart);
    to = Math.max(to, match.crossEnd);
  }
  return {
    axis,
    position: chosen.guide,
    from: from - GUIDE_PAD,
    to: to + GUIDE_PAD,
    kind: chosen.kind,
  };
}

function nearly(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}
