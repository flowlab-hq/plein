/**
 * Orthogonal connectors for organic layouts.
 *
 * Force placement plus the density pack leaves about one node-gap between
 * boxes. The old midpoint bend drew every association as a Z through that
 * gap, so parallel spans sat on the same pixel and long bars cut through
 * other boxes. This router is organic-only: it keeps those node coordinates
 * and picks a right-angle path that would rather use an open channel.
 * Layered and layers stay on ELK's own edge router.
 */

type Point = { x: number; y: number };

export type OrganicNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
};

type Side = "top" | "bottom" | "left" | "right";

type Segment = {
  a: Point;
  b: Point;
  horizontal: boolean;
  vertical: boolean;
};

type Route = {
  id: string;
  source: OrganicNode;
  target: OrganicNode;
  points: Point[];
};

type Direction = "tb" | "bt" | "lr" | "rl";

/** Parallel overlapping spans sit at least this far apart. */
const LANE = 10;
/** Channel lines sit this far outside a foreign box. */
const CHANNEL_MARGIN = 12;
/** The bend into the arrow has to clear the head, same idea as ELK's ~10px stub. */
const TARGET_STUB = 12;
const SOURCE_STUB = 6;
const PORT_INSET = 14;

function round(value: number): number {
  return Math.round(value);
}

function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1));
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const next = { x: round(point.x), y: round(point.y) };
    const last = out[out.length - 1];
    if (last && last.x === next.x && last.y === next.y) {
      continue;
    }
    const previous = out[out.length - 2];
    if (
      last &&
      previous &&
      ((previous.x === last.x && last.x === next.x) || (previous.y === last.y && last.y === next.y))
    ) {
      out[out.length - 1] = next;
      continue;
    }
    out.push(next);
  }
  return out;
}

function segments(points: Point[]): Segment[] {
  const segs: Segment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) {
      continue;
    }
    segs.push({
      a,
      b,
      horizontal: Math.abs(a.y - b.y) <= 0.6,
      vertical: Math.abs(a.x - b.x) <= 0.6,
    });
  }
  return segs;
}

function obstaclesFor(nodes: readonly OrganicNode[], source: OrganicNode, target: OrganicNode): OrganicNode[] {
  const skip = new Set([source.id, target.id]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const id of [source.id, target.id]) {
    let parent = byId.get(id)?.parentId;
    while (parent) {
      skip.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  return nodes.filter((node) => !skip.has(node.id));
}

function segmentHits(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  nodes: readonly OrganicNode[],
): { count: number; length: number } {
  const horizontal = Math.abs(y0 - y1) <= 0.5;
  const vertical = Math.abs(x0 - x1) <= 0.5;
  let count = 0;
  let length = 0;
  for (const node of nodes) {
    const left = node.x + 1;
    const right = node.x + node.width - 1;
    const top = node.y + 1;
    const bottom = node.y + node.height - 1;
    if (horizontal) {
      const y = (y0 + y1) / 2;
      if (y <= top || y >= bottom) {
        continue;
      }
      const overlap = overlap1d(x0, x1, left, right);
      if (overlap > 2) {
        count += 1;
        length += overlap;
      }
    } else if (vertical) {
      const x = (x0 + x1) / 2;
      if (x <= left || x >= right) {
        continue;
      }
      const overlap = overlap1d(y0, y1, top, bottom);
      if (overlap > 2) {
        count += 1;
        length += overlap;
      }
    }
  }
  return { count, length };
}

function nodePenalty(points: Point[], obstacles: readonly OrganicNode[]): { count: number; length: number } {
  let count = 0;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const hit = segmentHits(points[index - 1]!.x, points[index - 1]!.y, points[index]!.x, points[index]!.y, obstacles);
    count += hit.count;
    length += hit.length;
  }
  return { count, length };
}

function properCross(a: Segment, b: Segment): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = side(a.a, a.b, b.a);
  const o2 = side(a.a, a.b, b.b);
  const o3 = side(b.a, b.b, a.a);
  const o4 = side(b.a, b.b, a.b);
  if (Math.abs(o1) < 0.5 && Math.abs(o2) < 0.5) {
    return false;
  }
  return o1 * o2 < -0.5 && o3 * o4 < -0.5;
}

function crossingsWith(points: Point[], routed: Segment[][]): number {
  const mine = segments(points);
  let count = 0;
  for (const other of routed) {
    for (const left of mine) {
      for (const right of other) {
        if (properCross(left, right)) {
          count += 1;
        }
      }
    }
  }
  return count;
}

function stackPenalty(points: Point[], routed: Segment[][]): number {
  const mine = segments(points);
  let exact = 0;
  let near = 0;
  for (const other of routed) {
    for (const left of mine) {
      for (const right of other) {
        if (left.horizontal && right.horizontal) {
          const dy = Math.abs(left.a.y - right.a.y);
          const overlap = overlap1d(left.a.x, left.b.x, right.a.x, right.b.x);
          if (overlap >= 16 && dy < 3) {
            exact += 1;
          } else if (overlap >= 16 && dy < LANE) {
            near += 1;
          }
        } else if (left.vertical && right.vertical) {
          const dx = Math.abs(left.a.x - right.a.x);
          const overlap = overlap1d(left.a.y, left.b.y, right.a.y, right.b.y);
          if (overlap >= 16 && dx < 3) {
            exact += 1;
          } else if (overlap >= 16 && dx < LANE) {
            near += 1;
          }
        }
      }
    }
  }
  return exact * 5000 + near * 800;
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  }
  return length;
}

/**
 * A slash through a label costs more than one crossing in a gap, and a
 * coincident span costs more than either. Length only breaks ties.
 */
function score(points: Point[], obstacles: readonly OrganicNode[], routed: Segment[][], directionBias: number): number {
  const nodes = nodePenalty(points, obstacles);
  return (
    nodes.count * 4000 +
    nodes.length * 20 +
    crossingsWith(points, routed) * 500 +
    stackPenalty(points, routed) +
    pathLength(points) * 0.2 +
    Math.max(0, points.length - 2) * 4 -
    directionBias
  );
}

function unique(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }
    const rounded = round(value);
    if (seen.has(rounded)) {
      continue;
    }
    seen.add(rounded);
    out.push(rounded);
  }
  return out;
}

function yCandidates(source: OrganicNode, target: OrganicNode, obstacles: readonly OrganicNode[]): number[] {
  const raw: number[] = [];
  const boxes = [source, target, ...obstacles];
  for (const box of boxes) {
    raw.push(box.y - CHANNEL_MARGIN, box.y + box.height + CHANNEL_MARGIN);
  }
  const bands: number[] = [];
  for (const box of boxes) {
    bands.push(box.y, box.y + box.height);
  }
  bands.sort((a, b) => a - b);
  for (let index = 1; index < bands.length; index += 1) {
    const gap = bands[index]! - bands[index - 1]!;
    if (gap >= 8) {
      raw.push((bands[index - 1]! + bands[index]!) / 2);
    }
  }
  if (source.y + source.height <= target.y) {
    const mid = (source.y + source.height + target.y) / 2;
    for (const step of [-2, -1, 0, 1, 2]) {
      raw.push(mid + step * LANE);
    }
  } else if (target.y + target.height <= source.y) {
    const mid = (target.y + target.height + source.y) / 2;
    for (const step of [-2, -1, 0, 1, 2]) {
      raw.push(mid + step * LANE);
    }
  }
  return unique(raw);
}

function xCandidates(source: OrganicNode, target: OrganicNode, obstacles: readonly OrganicNode[]): number[] {
  const raw: number[] = [];
  const boxes = [source, target, ...obstacles];
  for (const box of boxes) {
    raw.push(box.x - CHANNEL_MARGIN, box.x + box.width + CHANNEL_MARGIN);
  }
  const bands: number[] = [];
  for (const box of boxes) {
    bands.push(box.x, box.x + box.width);
  }
  bands.sort((a, b) => a - b);
  for (let index = 1; index < bands.length; index += 1) {
    const gap = bands[index]! - bands[index - 1]!;
    if (gap >= 8) {
      raw.push((bands[index - 1]! + bands[index]!) / 2);
    }
  }
  if (source.x + source.width <= target.x) {
    const mid = (source.x + source.width + target.x) / 2;
    for (const step of [-2, -1, 0, 1, 2]) {
      raw.push(mid + step * LANE);
    }
  } else if (target.x + target.width <= source.x) {
    const mid = (target.x + target.width + source.x) / 2;
    for (const step of [-2, -1, 0, 1, 2]) {
      raw.push(mid + step * LANE);
    }
  }
  return unique(raw);
}

function insideBox(box: OrganicNode, x: number, y: number): boolean {
  return x > box.x + 0.5 && x < box.x + box.width - 0.5 && y > box.y + 0.5 && y < box.y + box.height - 0.5;
}

function stubOk(target: OrganicNode, side: Side, coord: number): boolean {
  if (side === "top") {
    return coord <= target.y - TARGET_STUB + 0.5;
  }
  if (side === "bottom") {
    return coord >= target.y + target.height + TARGET_STUB - 0.5;
  }
  if (side === "left") {
    return coord <= target.x - TARGET_STUB + 0.5;
  }
  return coord >= target.x + target.width + TARGET_STUB - 0.5;
}

function clampPort(node: OrganicNode, side: Side, along: number): Point {
  const span = side === "top" || side === "bottom" ? node.width : node.height;
  const inset = Math.min(PORT_INSET, Math.max(4, span / 2 - 4));
  const offset = Math.min(span - inset, Math.max(inset, along));
  if (side === "top") {
    return { x: node.x + offset, y: node.y };
  }
  if (side === "bottom") {
    return { x: node.x + offset, y: node.y + node.height };
  }
  if (side === "left") {
    return { x: node.x, y: node.y + offset };
  }
  return { x: node.x + node.width, y: node.y + offset };
}

function outsideY(node: OrganicNode, side: Side, stub: number): number | null {
  if (side === "bottom") {
    return round(node.y + node.height + stub);
  }
  if (side === "top") {
    return round(node.y - stub);
  }
  return null;
}

function outsideX(node: OrganicNode, side: Side, stub: number): number | null {
  if (side === "right") {
    return round(node.x + node.width + stub);
  }
  if (side === "left") {
    return round(node.x - stub);
  }
  return null;
}

function hasDiagonal(points: Point[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const dx = Math.abs(points[index]!.x - points[index - 1]!.x);
    const dy = Math.abs(points[index]!.y - points[index - 1]!.y);
    if (dx > 0.6 && dy > 0.6) {
      return true;
    }
  }
  return false;
}

function routeEdge(
  source: OrganicNode,
  target: OrganicNode,
  obstacles: readonly OrganicNode[],
  routed: Segment[][],
  direction: Direction,
): Point[] {
  const preferH = direction === "tb" || direction === "bt" ? 30 : 0;
  const preferV = direction === "lr" || direction === "rl" ? 30 : 0;
  let bestPath: Point[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const consider = (points: Point[], bias: number): void => {
    const path = dedupe(points);
    if (path.length < 2 || hasDiagonal(path)) {
      return;
    }
    const next = score(path, obstacles, routed, bias);
    if (next < bestScore) {
      bestScore = next;
      bestPath = path;
    }
  };

  const yOverlap = overlap1d(source.y, source.y + source.height, target.y, target.y + target.height);
  const xOverlap = overlap1d(source.x, source.x + source.width, target.x, target.x + target.width);
  const xSep = source.x + source.width <= target.x || target.x + target.width <= source.x;
  const ySep = source.y + source.height <= target.y || target.y + target.height <= source.y;

  if (yOverlap >= 18 && xSep) {
    const top = Math.max(source.y, target.y);
    const bottom = Math.min(source.y + source.height, target.y + target.height);
    const sideS: Side = target.x >= source.x ? "right" : "left";
    const sideT: Side = target.x >= source.x ? "left" : "right";
    const ys = [(top + bottom) / 2];
    for (const step of [-2, -1, 1, 2]) {
      ys.push((top + bottom) / 2 + step * LANE);
    }
    for (const y of ys) {
      if (y <= top + 4 || y >= bottom - 4) {
        continue;
      }
      const start = clampPort(source, sideS, y - source.y);
      const end = clampPort(target, sideT, y - target.y);
      const yy = round(y);
      consider(
        [
          { x: start.x, y: yy },
          { x: end.x, y: yy },
        ],
        preferH,
      );
    }
  }
  if (xOverlap >= 18 && ySep) {
    const left = Math.max(source.x, target.x);
    const right = Math.min(source.x + source.width, target.x + target.width);
    const sideS: Side = target.y >= source.y ? "bottom" : "top";
    const sideT: Side = target.y >= source.y ? "top" : "bottom";
    const xs = [(left + right) / 2];
    for (const step of [-2, -1, 1, 2]) {
      xs.push((left + right) / 2 + step * LANE);
    }
    for (const x of xs) {
      if (x <= left + 4 || x >= right - 4) {
        continue;
      }
      const xx = round(x);
      const start = clampPort(source, sideS, xx - source.x);
      const end = clampPort(target, sideT, xx - target.x);
      consider(
        [
          { x: xx, y: start.y },
          { x: xx, y: end.y },
        ],
        preferV,
      );
    }
  }

  const sourceBelow = target.y + target.height / 2 >= source.y + source.height / 2;
  {
    const sourceSide: Side = sourceBelow ? "bottom" : "top";
    const targetSide: Side = sourceSide === "bottom" ? "top" : "bottom";
    for (const y of yCandidates(source, target, obstacles)) {
      if (!stubOk(target, targetSide, y)) {
        continue;
      }
      if (insideBox(source, source.x + source.width / 2, y) || insideBox(target, target.x + target.width / 2, y)) {
        continue;
      }
      const sourceBorder = sourceSide === "bottom" ? source.y + source.height : source.y;
      if (sourceSide === "bottom" && y < sourceBorder + 2) {
        continue;
      }
      if (sourceSide === "top" && y > sourceBorder - 2) {
        continue;
      }
      const start = clampPort(source, sourceSide, source.width / 2);
      const end = clampPort(target, targetSide, target.width / 2);
      consider([start, { x: start.x, y }, { x: end.x, y }, end], preferH);
    }
  }
  {
    const sourceSide: Side = target.x + target.width / 2 >= source.x + source.width / 2 ? "right" : "left";
    const targetSide: Side = sourceSide === "right" ? "left" : "right";
    for (const x of xCandidates(source, target, obstacles)) {
      if (!stubOk(target, targetSide, x)) {
        continue;
      }
      if (insideBox(source, x, source.y + source.height / 2) || insideBox(target, x, target.y + target.height / 2)) {
        continue;
      }
      const sourceBorder = sourceSide === "right" ? source.x + source.width : source.x;
      if (sourceSide === "right" && x < sourceBorder + 2) {
        continue;
      }
      if (sourceSide === "left" && x > sourceBorder - 2) {
        continue;
      }
      const start = clampPort(source, sourceSide, source.height / 2);
      const end = clampPort(target, targetSide, target.height / 2);
      consider([start, { x, y: start.y }, { x, y: end.y }, end], preferV);
    }
  }

  // One jog cannot always clear a dense pack. A bracket runs the long span
  // in a channel beside the cluster, then stubs back into each box.
  {
    const sourceYSides: Side[] = sourceBelow ? ["bottom", "top"] : ["top", "bottom"];
    const targetYSides: Side[] = sourceYSides[0] === "bottom" ? ["top", "bottom"] : ["bottom", "top"];
    const xs = xCandidates(source, target, obstacles);
    for (const sourceSide of sourceYSides) {
      for (const targetSide of targetYSides) {
        const yS = outsideY(source, sourceSide, SOURCE_STUB);
        const yT = outsideY(target, targetSide, TARGET_STUB);
        if (yS === null || yT === null || !stubOk(target, targetSide, yT)) {
          continue;
        }
        const start = clampPort(source, sourceSide, source.width / 2);
        const end = clampPort(target, targetSide, target.width / 2);
        for (const x of xs) {
          if (insideBox(source, x, yS) || insideBox(target, x, yT)) {
            continue;
          }
          consider(
            [start, { x: start.x, y: yS }, { x, y: yS }, { x, y: yT }, { x: end.x, y: yT }, end],
            preferH,
          );
        }
      }
    }
    const sourceXSides: Side[] = target.x >= source.x ? ["right", "left"] : ["left", "right"];
    const targetXSides: Side[] = sourceXSides[0] === "right" ? ["left", "right"] : ["right", "left"];
    const ys = yCandidates(source, target, obstacles);
    for (const sourceSide of sourceXSides) {
      for (const targetSide of targetXSides) {
        const xS = outsideX(source, sourceSide, SOURCE_STUB);
        const xT = outsideX(target, targetSide, TARGET_STUB);
        if (xS === null || xT === null || !stubOk(target, targetSide, xT)) {
          continue;
        }
        const start = clampPort(source, sourceSide, source.height / 2);
        const end = clampPort(target, targetSide, target.height / 2);
        for (const y of ys) {
          if (insideBox(source, xS, y) || insideBox(target, xT, y)) {
            continue;
          }
          consider(
            [start, { x: xS, y: start.y }, { x: xS, y }, { x: xT, y }, { x: xT, y: end.y }, end],
            preferV,
          );
        }
      }
    }
  }

  if (!bestPath) {
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const midY = round((start.y + end.y) / 2);
    return dedupe([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]);
  }
  return bestPath;
}

function sideOf(node: OrganicNode, point: Point): Side {
  const left = Math.abs(point.x - node.x);
  const right = Math.abs(point.x - (node.x + node.width));
  const top = Math.abs(point.y - node.y);
  const bottom = Math.abs(point.y - (node.y + node.height));
  const nearest = Math.min(left, right, top, bottom);
  if (nearest === top) {
    return "top";
  }
  if (nearest === bottom) {
    return "bottom";
  }
  if (nearest === left) {
    return "left";
  }
  return "right";
}

function applyPort(points: Point[], which: "source" | "target", side: Side, port: Point): Point[] {
  const next = points.map((point) => ({ ...point }));
  if (which === "source") {
    const following = next[1];
    if (!following) {
      return next;
    }
    if (side === "top" || side === "bottom") {
      next[0] = { x: port.x, y: next[0]!.y };
      if (Math.abs(following.y - next[0]!.y) < 0.5 || Math.abs(following.x - next[0]!.x) > 0.5) {
        next[1] = { x: port.x, y: following.y };
      }
    } else {
      next[0] = { x: next[0]!.x, y: port.y };
      if (Math.abs(following.y - next[0]!.y) < 0.5 || Math.abs(following.x - next[0]!.x) > 0.5) {
        next[1] = { x: following.x, y: port.y };
      }
    }
  } else {
    const last = next.length - 1;
    const previous = next[last - 1];
    if (!previous) {
      return next;
    }
    if (side === "top" || side === "bottom") {
      next[last] = { x: port.x, y: next[last]!.y };
      next[last - 1] = { x: port.x, y: previous.y };
    } else {
      next[last] = { x: next[last]!.x, y: port.y };
      next[last - 1] = { x: previous.x, y: port.y };
    }
  }
  return dedupe(next);
}

function pushSpread(
  groups: Map<string, Array<{ route: Route; which: "source" | "target"; node: OrganicNode; side: Side; along: number }>>,
  route: Route,
  which: "source" | "target",
  node: OrganicNode,
  side: Side,
  other: OrganicNode,
): void {
  const key = `${node.id}|${side}`;
  const group = groups.get(key) ?? [];
  const along =
    side === "top" || side === "bottom" ? other.x + other.width / 2 : other.y + other.height / 2;
  group.push({ route, which, node, side, along });
  groups.set(key, group);
}

/** Fan ports along a shared side. Straight two-point runs keep the coordinate they already share. */
function spreadPorts(routes: Route[], nodes: readonly OrganicNode[]): void {
  const groups = new Map<string, Array<{ route: Route; which: "source" | "target"; node: OrganicNode; side: Side; along: number }>>();
  for (const route of routes) {
    if (route.points.length < 3) {
      continue;
    }
    const sourceSide = sideOf(route.source, route.points[0]!);
    const targetSide = sideOf(route.target, route.points[route.points.length - 1]!);
    pushSpread(groups, route, "source", route.source, sourceSide, route.target);
    pushSpread(groups, route, "target", route.target, targetSide, route.source);
  }

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    group.sort((a, b) => a.along - b.along || (a.route.id < b.route.id ? -1 : a.route.id > b.route.id ? 1 : 0));
    const node = group[0]!.node;
    const side = group[0]!.side;
    const span = side === "top" || side === "bottom" ? node.width : node.height;
    const inset = Math.min(PORT_INSET, Math.max(4, span / 2 - 4));
    const usable = Math.max(4, span - inset * 2);
    for (let index = 0; index < group.length; index += 1) {
      const entry = group[index]!;
      const before = entry.route.points.map((point) => ({ ...point }));
      const beforeHits = nodePenalty(before, obstaclesFor(nodes, entry.route.source, entry.route.target)).count;
      const offset = inset + (usable * index) / (group.length - 1);
      const port = clampPort(node, side, offset);
      const next = applyPort(entry.route.points, entry.which, side, port);
      if (hasDiagonal(next)) {
        continue;
      }
      const afterHits = nodePenalty(next, obstaclesFor(nodes, entry.route.source, entry.route.target)).count;
      if (afterHits > beforeHits) {
        continue;
      }
      entry.route.points = next;
    }
  }
}

/**
 * Pull each end one pixel inside its box so the existing shaft/tip inset
 * clips an axis-aligned run. The outside bends stay where the search put them.
 */
function pullEndsInside(points: Point[], source: OrganicNode, target: OrganicNode): Point[] {
  const next = points.map((point) => ({ ...point }));
  pullEnd(next, source, false);
  pullEnd(next, target, true);
  return dedupe(next);
}

function pullEnd(points: Point[], node: OrganicNode, atEnd: boolean): void {
  const index = atEnd ? points.length - 1 : 0;
  const otherIndex = atEnd ? points.length - 2 : 1;
  const point = points[index];
  const other = points[otherIndex];
  if (!point || !other) {
    return;
  }
  const vertical = Math.abs(point.x - other.x) <= 0.6;
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  if (vertical) {
    point.y = round(point.y + (Math.sign(centerY - point.y) || 1));
  } else {
    point.x = round(point.x + (Math.sign(centerX - point.x) || 1));
  }
}

function compareRoute(a: { id: string; dist: number }, b: { id: string; dist: number }): number {
  if (a.dist !== b.dist) {
    return a.dist - b.dist;
  }
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}

export function routeOrganicOrthogonal(
  nodes: readonly OrganicNode[],
  edges: readonly { id: string; source: string; target: string }[],
  direction: Direction,
): Map<string, Point[]> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const jobs = edges
    .map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target || source.id === target.id) {
        return null;
      }
      return {
        id: edge.id,
        source,
        target,
        dist: Math.hypot(source.x - target.x, source.y - target.y),
      };
    })
    .filter((job): job is { id: string; source: OrganicNode; target: OrganicNode; dist: number } => job !== null)
    .sort(compareRoute);

  const routes: Route[] = [];
  for (const job of jobs) {
    const obstacles = obstaclesFor(nodes, job.source, job.target);
    const routed = routes.map((route) => segments(route.points));
    routes.push({
      id: job.id,
      source: job.source,
      target: job.target,
      points: routeEdge(job.source, job.target, obstacles, routed, direction),
    });
  }

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const job of jobs) {
      const current = routes.find((route) => route.id === job.id);
      if (!current) {
        continue;
      }
      const others = routes.filter((route) => route.id !== job.id).map((route) => segments(route.points));
      const obstacles = obstaclesFor(nodes, job.source, job.target);
      const path = routeEdge(job.source, job.target, obstacles, others, direction);
      const before = score(current.points, obstacles, others, 0);
      const after = score(path, obstacles, others, 0);
      if (after + 1 < before) {
        current.points = path;
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  spreadPorts(routes, nodes);

  const out = new Map<string, Point[]>();
  for (const route of routes) {
    out.set(route.id, pullEndsInside(route.points, route.source, route.target));
  }
  return out;
}
