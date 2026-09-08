import { filterModel } from "./list-model.js";
import type { ElementKeyword, RelationshipKeyword } from "./keywords.js";
import type { ElementDecl, PleinModel, RelationshipDecl } from "./parser.js";

/** Box size for one element in the viewpoint diagram. */
export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 52;
/** Gap along the rank axis (left→right for `lr`, top→bottom for `tb`). */
export const RANK_GAP = 56;
/** Gap between siblings in the same rank. */
export const LANE_GAP = 28;
export const PADDING = 24;

export type LayoutDirection = "tb" | "lr";

export type LayoutNode = {
  id: string;
  label: string;
  keyword: ElementKeyword;
  x: number;
  y: number;
  width: number;
  height: number;
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
 * Lay out the include/exclude set of one named view. Unknown view names throw.
 * Membership is the same set `filterModel` uses for the list UI.
 */
export function layoutViewpoint(model: PleinModel, viewName: string): ViewpointLayout {
  const view = model.views.find((candidate) => candidate.name === viewName);
  if (!view) {
    throw new Error(`unknown view '${viewName}'`);
  }

  const list = filterModel(model, viewName);
  const direction = parseLayoutDirection(view.autoLayout);
  const ranks = assignRanks(list.elements, list.relationships);
  const lanes = assignLanes(list.elements, ranks);
  const maxRank = maxValue(ranks);
  const maxLane = maxValue(lanes);

  const width =
    direction === "lr"
      ? PADDING * 2 + (maxRank + 1) * NODE_WIDTH + maxRank * RANK_GAP
      : PADDING * 2 + (maxLane + 1) * NODE_WIDTH + maxLane * LANE_GAP;
  const height =
    direction === "lr"
      ? PADDING * 2 + (maxLane + 1) * NODE_HEIGHT + maxLane * LANE_GAP
      : PADDING * 2 + (maxRank + 1) * NODE_HEIGHT + maxRank * RANK_GAP;

  const nodes: LayoutNode[] = list.elements.map((element) => {
    const rank = ranks.get(element.id) ?? 0;
    const lane = lanes.get(element.id) ?? 0;
    const x =
      direction === "lr"
        ? PADDING + rank * (NODE_WIDTH + RANK_GAP)
        : PADDING + lane * (NODE_WIDTH + LANE_GAP);
    const y =
      direction === "lr"
        ? PADDING + lane * (NODE_HEIGHT + LANE_GAP)
        : PADDING + rank * (NODE_HEIGHT + RANK_GAP);
    return {
      id: element.id,
      label: element.label,
      keyword: element.keyword,
      x,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: LayoutEdge[] = list.relationships.map((rel) => {
    const source = byId.get(rel.source);
    const target = byId.get(rel.target);
    if (!source || !target) {
      throw new Error(`layout missing endpoint for ${edgeId(rel.source, rel.target, rel.type)}`);
    }
    const anchors = edgeAnchors(source, target, direction);
    return {
      id: edgeId(rel.source, rel.target, rel.type),
      source: rel.source,
      target: rel.target,
      type: rel.type,
      ...anchors,
    };
  });

  return {
    viewName: view.name,
    title: view.title,
    viewpoint: view.viewpoint,
    direction,
    width: Math.max(width, PADDING * 2 + NODE_WIDTH),
    height: Math.max(height, PADDING * 2 + NODE_HEIGHT),
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
  const edgeMarkup = layout.edges
    .map(
      (edge) => `    <g data-edge-id="${escapeXml(edge.id)}">
      <line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="#6e6e73" stroke-width="1.5" marker-end="url(#${markerId})" />
    </g>`,
    )
    .join("\n");
  const nodeMarkup = layout.nodes
    .map(
      (node) => `    <g data-node-id="${escapeXml(node.id)}" transform="translate(${node.x} ${node.y})">
      <rect width="${node.width}" height="${node.height}" rx="8" fill="#ffffff" stroke="#d2d2d7" />
      <text x="12" y="20" fill="#6e6e73" font-size="10" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(node.keyword)}</text>
      <text x="12" y="38" fill="#1d1d1f" font-size="13" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(node.label)}</text>
    </g>`,
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" data-view="${escapeXml(layout.viewName)}" data-layout="${layout.direction}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <marker id="${markerId}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#6e6e73" />
    </marker>
  </defs>
  <g class="edges">
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
    values.add(match[1]!);
  }
  return [...values].sort();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlId(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "-");
  return cleaned.length > 0 ? cleaned : "view";
}
