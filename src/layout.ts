import { elementStyle, renderTypeIcon } from "./archimate-style.js";
import { toKebabCaseKeyword, type ElementKeyword, type RelationshipKeyword } from "./keywords.js";
import { filterModel } from "./list-model.js";
import type { ElementDecl, PleinModel, RelationshipDecl, ViewDecl } from "./parser.js";

/** Box size for one element in the viewpoint diagram. */
export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 52;
/** Gap along the rank axis (left→right for `lr`, top→bottom for `tb`). */
export const RANK_GAP = 56;
/** Gap between siblings in the same rank. */
export const LANE_GAP = 28;
export const PADDING = 24;
/** Header band inside a nested parent (keyword + label). */
export const NEST_HEADER_HEIGHT = 48;
/** Padding around nested children inside a parent. */
export const NEST_PAD = 16;

export type LayoutDirection = "tb" | "lr";

/**
 * How aggregation/composition children are placed.
 * Default is `beside` (today’s rank/lane graph) so existing samples stay put.
 */
export type NestingMode = "beside" | "nested";

/** Tool override for local preview. When set, wins over the view’s `nesting` clause. */
export type LayoutOptions = {
  nesting?: NestingMode;
};

export type LayoutNode = {
  id: string;
  label: string;
  keyword: ElementKeyword;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Set when this node is drawn inside a nested parent. */
  parentId?: string;
  /** True when this node is a nested container wrapping children. */
  container?: boolean;
};

export type LayoutEdge = {
  /** Stable id: `source->target:type`. */
  id: string;
  source: string;
  target: string;
  type: RelationshipKeyword;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** True when containment already shows this composedOf/aggregates edge. */
  impliedByNest?: boolean;
};

/**
 * Graph + coordinates for one named viewpoint. A diagram pane can consume this
 * as JSON (nodes/edges) or pass it to `renderViewpointSvg`.
 */
export type ViewpointLayout = {
  viewName: string;
  title?: string;
  viewpoint?: string;
  direction: LayoutDirection;
  nesting: NestingMode;
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
};

/** Sorted membership snapshot used by the golden fixture assert. */
export type LayoutMembership = {
  view: string;
  direction: LayoutDirection;
  nodes: string[];
  edges: string[];
};

const NEST_TYPES = new Set<RelationshipKeyword>(["composedOf", "aggregates"]);

export function edgeId(source: string, target: string, type: string): string {
  return `${source}->${target}:${type}`;
}

export function parseLayoutDirection(value?: string): LayoutDirection {
  const normalized = (value ?? "tb").toLowerCase();
  if (normalized === "lr" || normalized === "left-right" || normalized === "horizontal") {
    return "lr";
  }
  return "tb";
}

/**
 * File default is `beside` when the view omits `nesting`.
 * `nested` / `inside` draw children inside the parent; everything else is beside.
 */
export function parseNestingMode(value?: string): NestingMode {
  const normalized = (value ?? "beside").toLowerCase().replaceAll("_", "-");
  if (normalized === "nested" || normalized === "inside") {
    return "nested";
  }
  return "beside";
}

/** Resolve file default, then optional tool override (Mac local preview). */
export function resolveNestingMode(view: ViewDecl, options?: LayoutOptions): NestingMode {
  if (options?.nesting) {
    return options.nesting;
  }
  return parseNestingMode(view.nesting);
}

/**
 * Lay out the include/exclude set of one named view. Unknown view names throw.
 * Membership is the same set `filterModel` uses for the list UI.
 *
 * `options.nesting` is the Mac/tool override. The `.plein` `nesting` clause is
 * the source of truth for PRs when the override is omitted.
 */
export function layoutViewpoint(
  model: PleinModel,
  viewName: string,
  options?: LayoutOptions,
): ViewpointLayout {
  const view = model.views.find((candidate) => candidate.name === viewName);
  if (!view) {
    throw new Error(`unknown view '${viewName}'`);
  }

  const list = filterModel(model, viewName);
  const direction = parseLayoutDirection(view.autoLayout);
  const nesting = resolveNestingMode(view, options);
  const nestForest =
    nesting === "nested" ? buildNestForest(list.elements, list.relationships) : emptyForest();
  const parentOf = invertForest(nestForest);
  const byId = new Map(list.elements.map((element) => [element.id, element]));
  const sizes = computeSubtreeSizes(list.elements, list.relationships, direction, nestForest, parentOf);

  const rootIds = list.elements.filter((element) => !parentOf.has(element.id)).map((element) => element.id);
  const packed = placeGroup(
    rootIds,
    byId,
    list.relationships,
    direction,
    nestForest,
    parentOf,
    sizes,
    PADDING,
  );

  const nodes = packed.nodes.slice().sort((a, b) => {
    const left = byId.get(a.id)?.line ?? 0;
    const right = byId.get(b.id)?.line ?? 0;
    return left - right;
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: LayoutEdge[] = list.relationships.map((rel) => {
    const source = nodeById.get(rel.source);
    const target = nodeById.get(rel.target);
    if (!source || !target) {
      throw new Error(`layout missing endpoint for ${edgeId(rel.source, rel.target, rel.type)}`);
    }
    const impliedByNest = Boolean(
      NEST_TYPES.has(rel.type) && parentOf.get(rel.target) === rel.source,
    );
    const anchors = impliedByNest
      ? { x1: source.x, y1: source.y, x2: target.x, y2: target.y }
      : edgeAnchors(source, target, direction);
    return {
      id: edgeId(rel.source, rel.target, rel.type),
      source: rel.source,
      target: rel.target,
      type: rel.type,
      impliedByNest,
      ...anchors,
    };
  });

  return {
    viewName: view.name,
    title: view.title,
    viewpoint: view.viewpoint,
    direction,
    nesting,
    width: Math.max(packed.width, PADDING * 2 + NODE_WIDTH),
    height: Math.max(packed.height, PADDING * 2 + NODE_HEIGHT),
    nodes,
    edges,
  };
}

export function membershipOf(layout: ViewpointLayout): LayoutMembership {
  return {
    view: layout.viewName,
    direction: layout.direction,
    nodes: layout.nodes.map((node) => node.id).slice().sort(),
    edges: layout.edges.map((edge) => edge.id).slice().sort(),
  };
}

/** SVG pane payload. Node/edge ids are `data-node-id` / `data-edge-id` for tests. */
export function renderViewpointSvg(layout: ViewpointLayout): string {
  const title = layout.title ?? layout.viewName;
  const markerId = `arrow-${xmlId(layout.viewName)}`;
  // Containers draw behind edges so inbound child edges stay visible.
  // The parent is one group (chrome + title + type icon) — not a header
  // band stacked on a separate body rect, which selected as two items.
  const containerMarkup = layout.nodes
    .filter((node) => node.container)
    .map((node) => renderNode(node))
    .join("\n");
  const edgeMarkup = layout.edges
    .filter((edge) => !edge.impliedByNest)
    .map(
      (edge) => `    <g data-edge-id="${escapeXml(edge.id)}">
      <line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="#6e6e73" stroke-width="1.5" marker-end="url(#${markerId})" />
    </g>`,
    )
    .join("\n");
  const nodeMarkup = layout.nodes
    .filter((node) => !node.container)
    .map((node) => renderNode(node))
    .join("\n");
  const containersBlock = containerMarkup
    ? `  <g class="containers">
${containerMarkup}
  </g>
`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" data-view="${escapeXml(layout.viewName)}" data-layout="${layout.direction}" data-nesting="${layout.nesting ?? "beside"}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <marker id="${markerId}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#6e6e73" />
    </marker>
  </defs>
${containersBlock}  <g class="edges">
${edgeMarkup}
  </g>
  <g class="nodes">
${nodeMarkup}
  </g>
</svg>
`;
}

export function svgMembership(svg: string): { nodes: string[]; edges: string[] } {
  return {
    nodes: collectAttr(svg, "data-node-id"),
    edges: collectAttr(svg, "data-edge-id"),
  };
}

export type SvgNodeStyle = {
  id: string;
  keyword: string;
  layer: string;
  icon: string;
  fill: string;
};

/** Per-node type style attributes from `renderViewpointSvg`. */
export function svgNodeStyles(svg: string): SvgNodeStyle[] {
  const styles: SvgNodeStyle[] = [];
  const pattern =
    /<g data-node-id="([^"]+)" data-keyword="([^"]+)" data-layer="([^"]+)" data-icon="([^"]+)"[^>]*>[\s\S]*?<rect[^>]*\sfill="([^"]+)"/g;
  for (const match of svg.matchAll(pattern)) {
    styles.push({
      id: unescapeXml(match[1]!),
      keyword: unescapeXml(match[2]!),
      layer: unescapeXml(match[3]!),
      icon: unescapeXml(match[4]!),
      fill: match[5]!,
    });
  }
  return styles.sort((a, b) => a.id.localeCompare(b.id));
}

function renderNode(node: LayoutNode): string {
  const style = elementStyle(node.keyword);
  const typeName = toKebabCaseKeyword(style.keyword === "unknown" ? node.keyword : style.keyword);
  const parentAttr = node.parentId ? ` data-parent-id="${escapeXml(node.parentId)}"` : "";
  const containerAttr = node.container ? ` data-container="true"` : "";
  const containerIdAttr = node.container ? ` data-container-id="${escapeXml(node.id)}"` : "";
  const labelY = node.container ? 28 : Math.round(node.height / 2) + 4;
  const rx = node.container ? 10 : 8;
  return `    <g data-node-id="${escapeXml(node.id)}" data-keyword="${escapeXml(node.keyword)}" data-layer="${style.layer}" data-icon="${style.icon}"${parentAttr}${containerAttr}${containerIdAttr} transform="translate(${node.x} ${node.y})">
      <title>${escapeXml(`${typeName} — ${node.label}`)}</title>
      <rect width="${node.width}" height="${node.height}" rx="${rx}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.25" />
      ${renderTypeIcon(style.icon, style.stroke, node.width - 20, 4)}
      <text x="12" y="${labelY}" fill="${style.ink}" font-size="13" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(node.label)}</text>
    </g>`;
}

function emptyForest(): Map<string, string[]> {
  return new Map();
}

function invertForest(forest: Map<string, string[]>): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const [parent, children] of forest) {
    for (const child of children) {
      parentOf.set(child, parent);
    }
  }
  return parentOf;
}

function isDescendant(id: string, ancestor: string, forest: Map<string, string[]>): boolean {
  for (const child of forest.get(ancestor) ?? []) {
    if (child === id || isDescendant(id, child, forest)) {
      return true;
    }
  }
  return false;
}

/**
 * Parent → direct children for composedOf/aggregates when both ends are in view.
 * A child nests under at most one parent (composition wins over aggregation).
 */
function buildNestForest(elements: ElementDecl[], relationships: RelationshipDecl[]): Map<string, string[]> {
  const idSet = new Set(elements.map((element) => element.id));
  const order = new Map(elements.map((element, index) => [element.id, index]));
  const forest: Map<string, string[]> = new Map();
  const claimed = new Set<string>();
  const nestRels = relationships
    .filter(
      (rel) =>
        NEST_TYPES.has(rel.type) &&
        idSet.has(rel.source) &&
        idSet.has(rel.target) &&
        rel.source !== rel.target,
    )
    .slice()
    .sort((a, b) => {
      if (a.type === "composedOf" && b.type !== "composedOf") {
        return -1;
      }
      if (b.type === "composedOf" && a.type !== "composedOf") {
        return 1;
      }
      return a.line - b.line;
    });

  for (const rel of nestRels) {
    if (claimed.has(rel.target)) {
      continue;
    }
    if (isDescendant(rel.source, rel.target, forest)) {
      continue;
    }
    claimed.add(rel.target);
    const kids = forest.get(rel.source) ?? [];
    kids.push(rel.target);
    forest.set(rel.source, kids);
  }

  for (const kids of forest.values()) {
    kids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  }
  return forest;
}

function computeSubtreeSizes(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  const visiting = new Set<string>();

  const walk = (id: string): { width: number; height: number } => {
    const existing = sizes.get(id);
    if (existing) {
      return existing;
    }
    if (visiting.has(id)) {
      const fallback = { width: NODE_WIDTH, height: NODE_HEIGHT };
      sizes.set(id, fallback);
      return fallback;
    }
    visiting.add(id);
    const children = nestForest.get(id) ?? [];
    if (children.length === 0) {
      const leaf = { width: NODE_WIDTH, height: NODE_HEIGHT };
      sizes.set(id, leaf);
      visiting.delete(id);
      return leaf;
    }
    for (const child of children) {
      walk(child);
    }
    const inner = measureGroup(children, elements, relationships, direction, nestForest, parentOf, sizes, NEST_PAD);
    const size = {
      width: inner.width,
      height: NEST_HEADER_HEIGHT - NEST_PAD + inner.height,
    };
    sizes.set(id, size);
    visiting.delete(id);
    return size;
  };

  for (const element of elements) {
    walk(element.id);
  }
  return sizes;
}

function measureGroup(
  ids: string[],
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
  sizes: Map<string, { width: number; height: number }>,
  padding: number,
): { width: number; height: number } {
  const group = new Set(ids);
  const members = elements.filter((element) => group.has(element.id));
  const rels = rankingRelationships(group, relationships, parentOf);
  const ranks = assignRanks(members, rels);
  const lanes = assignLanes(members, ranks);
  return placeByRankLane(ids, ranks, lanes, sizes, direction, padding);
}

function placeGroup(
  ids: string[],
  byId: Map<string, ElementDecl>,
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
  sizes: Map<string, { width: number; height: number }>,
  padding: number,
): { nodes: LayoutNode[]; width: number; height: number } {
  const group = new Set(ids);
  const members = ids.flatMap((id) => {
    const element = byId.get(id);
    return element ? [element] : [];
  });
  const rels = rankingRelationships(group, relationships, parentOf);
  const ranks = assignRanks(members, rels);
  const lanes = assignLanes(members, ranks);
  const packed = placeByRankLane(ids, ranks, lanes, sizes, direction, padding);
  const nodes: LayoutNode[] = [];

  for (const id of ids) {
    const element = byId.get(id);
    if (!element) {
      continue;
    }
    const size = sizes.get(id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    const parentId = parentOf.get(id);
    const children = nestForest.get(id) ?? [];
    const node: LayoutNode = {
      id,
      label: element.label,
      keyword: element.keyword,
      x: packed.x.get(id) ?? padding,
      y: packed.y.get(id) ?? padding,
      width: size.width,
      height: size.height,
      ...(parentId ? { parentId } : {}),
      ...(children.length > 0 ? { container: true } : {}),
    };
    nodes.push(node);
    if (children.length === 0) {
      continue;
    }
    const inner = placeGroup(
      children,
      byId,
      relationships,
      direction,
      nestForest,
      parentOf,
      sizes,
      NEST_PAD,
    );
    const dy = NEST_HEADER_HEIGHT - NEST_PAD;
    for (const child of inner.nodes) {
      child.x += node.x;
      child.y += node.y + dy;
      nodes.push(child);
    }
  }

  return { nodes, width: packed.width, height: packed.height };
}

/**
 * Lift nested endpoints to a member of `group` so outer ranking sees
 * parent containers, not their hidden children.
 */
function rankingRelationships(
  group: Set<string>,
  relationships: RelationshipDecl[],
  parentOf: Map<string, string>,
): RelationshipDecl[] {
  const lifted: RelationshipDecl[] = [];
  for (const rel of relationships) {
    if (NEST_TYPES.has(rel.type) && parentOf.get(rel.target) === rel.source) {
      continue;
    }
    const source = liftToGroup(rel.source, group, parentOf);
    const target = liftToGroup(rel.target, group, parentOf);
    if (!source || !target || source === target) {
      continue;
    }
    lifted.push({ ...rel, source, target });
  }
  return lifted;
}

function liftToGroup(id: string, group: Set<string>, parentOf: Map<string, string>): string | null {
  let current = id;
  const seen = new Set<string>();
  while (!group.has(current)) {
    const parent = parentOf.get(current);
    if (!parent || seen.has(current)) {
      return null;
    }
    seen.add(current);
    current = parent;
  }
  return current;
}

function placeByRankLane(
  ids: string[],
  ranks: Map<string, number>,
  lanes: Map<string, number>,
  sizes: Map<string, { width: number; height: number }>,
  direction: LayoutDirection,
  padding: number,
): { x: Map<string, number>; y: Map<string, number>; width: number; height: number } {
  const x = new Map<string, number>();
  const y = new Map<string, number>();
  if (ids.length === 0) {
    return { x, y, width: padding * 2 + NODE_WIDTH, height: padding * 2 + NODE_HEIGHT };
  }

  const maxRank = maxValue(ranks);
  const maxLane = maxValue(lanes);
  const rankExtent: number[] = Array.from({ length: maxRank + 1 }, () => 0);
  const laneExtent: number[] = Array.from({ length: maxLane + 1 }, () => 0);

  for (const id of ids) {
    const size = sizes.get(id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    const rank = ranks.get(id) ?? 0;
    const lane = lanes.get(id) ?? 0;
    if (direction === "lr") {
      rankExtent[rank] = Math.max(rankExtent[rank] ?? 0, size.width);
      laneExtent[lane] = Math.max(laneExtent[lane] ?? 0, size.height);
    } else {
      rankExtent[rank] = Math.max(rankExtent[rank] ?? 0, size.height);
      laneExtent[lane] = Math.max(laneExtent[lane] ?? 0, size.width);
    }
  }

  const rankOffset = prefixOffsets(rankExtent, RANK_GAP);
  const laneOffset = prefixOffsets(laneExtent, LANE_GAP);

  for (const id of ids) {
    const rank = ranks.get(id) ?? 0;
    const lane = lanes.get(id) ?? 0;
    if (direction === "lr") {
      x.set(id, padding + (rankOffset[rank] ?? 0));
      y.set(id, padding + (laneOffset[lane] ?? 0));
    } else {
      x.set(id, padding + (laneOffset[lane] ?? 0));
      y.set(id, padding + (rankOffset[rank] ?? 0));
    }
  }

  const rankSpan = sum(rankExtent) + maxRank * RANK_GAP;
  const laneSpan = sum(laneExtent) + maxLane * LANE_GAP;
  const width = direction === "lr" ? padding * 2 + rankSpan : padding * 2 + laneSpan;
  const height = direction === "lr" ? padding * 2 + laneSpan : padding * 2 + rankSpan;
  return { x, y, width, height };
}

function prefixOffsets(extents: number[], gap: number): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const extent of extents) {
    offsets.push(cursor);
    cursor += extent + gap;
  }
  return offsets;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function assignRanks(elements: ElementDecl[], relationships: RelationshipDecl[]): Map<string, number> {
  const ids = elements.map((element) => element.id);
  const idSet = new Set(ids);
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of ids) {
    outgoing.set(id, []);
    indegree.set(id, 0);
  }
  for (const rel of relationships) {
    if (!idSet.has(rel.source) || !idSet.has(rel.target) || rel.source === rel.target) {
      continue;
    }
    outgoing.get(rel.source)!.push(rel.target);
    indegree.set(rel.target, (indegree.get(rel.target) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const remaining = new Map(indegree);
  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  for (const id of queue) {
    rank.set(id, 0);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const nextRank = (rank.get(id) ?? 0) + 1;
    for (const next of outgoing.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, nextRank));
      const degree = (remaining.get(next) ?? 1) - 1;
      remaining.set(next, degree);
      if (degree === 0) {
        queue.push(next);
      }
    }
  }

  let fallback = 0;
  for (const value of rank.values()) {
    fallback = Math.max(fallback, value);
  }
  for (const id of ids) {
    if (!rank.has(id)) {
      fallback += 1;
      rank.set(id, fallback);
    }
  }
  return rank;
}

function assignLanes(elements: ElementDecl[], ranks: Map<string, number>): Map<string, number> {
  const lanes = new Map<string, number>();
  const byRank = new Map<number, string[]>();
  for (const element of elements) {
    const rank = ranks.get(element.id) ?? 0;
    const bucket = byRank.get(rank) ?? [];
    bucket.push(element.id);
    byRank.set(rank, bucket);
  }
  for (const bucket of byRank.values()) {
    bucket.forEach((id, index) => {
      lanes.set(id, index);
    });
  }
  return lanes;
}

function maxValue(values: Map<string, number>): number {
  let max = 0;
  for (const value of values.values()) {
    max = Math.max(max, value);
  }
  return max;
}

function edgeAnchors(
  source: LayoutNode,
  target: LayoutNode,
  direction: LayoutDirection,
): { x1: number; y1: number; x2: number; y2: number } {
  if (direction === "lr") {
    return {
      x1: source.x + source.width,
      y1: source.y + source.height / 2,
      x2: target.x,
      y2: target.y + target.height / 2,
    };
  }
  return {
    x1: source.x + source.width / 2,
    y1: source.y + source.height,
    x2: target.x + target.width / 2,
    y2: target.y,
  };
}

function collectAttr(svg: string, attr: string): string[] {
  const values = new Set<string>();
  const pattern = new RegExp(`${attr}="([^"]+)"`, "g");
  for (const match of svg.matchAll(pattern)) {
    values.add(unescapeXml(match[1]!));
  }
  return [...values].sort();
}

function escapeXml(value: string): string {
  // Keep `>` unescaped so data-edge-id stays `source->target:type`.
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function xmlId(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "-");
  return cleaned.length > 0 ? cleaned : "view";
}
