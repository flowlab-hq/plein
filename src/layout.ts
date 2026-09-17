import ElkJs from "elkjs/lib/elk.bundled.js";
import type { ELK, ElkExtendedEdge, ElkNode, ElkPoint } from "elkjs";
import { elementStyle, layerOf, renderTypeIcon } from "./archimate-style.js";
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

/** Mac/web viewer engine: Eclipse Layout Kernel layered (elkjs). */
export const LAYOUT_ENGINE = "elk-layered";

export const LAYOUT_DIRECTIONS = ["tb", "bt", "lr", "rl"] as const;

export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number];

/**
 * `layered` is plain ELK Layered (edge ranks). `layers` still uses ELK Layered
 * but first partitions root nodes into ArchiMate aspect bands.
 */
export const LAYOUT_MODES = ["layered", "layers"] as const;

export type LayoutMode = (typeof LAYOUT_MODES)[number];

/**
 * ArchiMate aspect bands used by `autoLayout layers`.
 * Motivation/Strategy share a band; Technology/Physical share a band.
 * `other` is composite/unknown, and is omitted when nothing maps to it.
 */
export const LAYER_BANDS = [
  "motivation-strategy",
  "business",
  "application",
  "technology-physical",
  "implementation",
  "other",
] as const;

export type LayerBand = (typeof LAYER_BANDS)[number];

/**
 * How aggregation/composition children are placed.
 * Default is `beside` (side-by-side layered graph) so existing samples stay put.
 */
export type NestingMode = "beside" | "nested";

/** Tool override for local preview. When set, wins over the view’s clause. */
export type LayoutOptions = {
  nesting?: NestingMode;
  direction?: LayoutDirection;
  mode?: LayoutMode;
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
  /** Orthogonal polyline in absolute coordinates (ELK sections). */
  points?: Array<{ x: number; y: number }>;
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
  mode: LayoutMode;
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

const elk = new (ElkJs as unknown as new () => ELK)();

export function edgeId(source: string, target: string, type: string): string {
  return `${source}->${target}:${type}`;
}

function autoLayoutTokens(value?: string): string[] {
  return (value ?? "").trim().split(/\s+/).filter((token) => token.length > 0);
}

function compactAutoLayoutToken(token: string): string {
  return token.toLowerCase().replaceAll("_", "").replaceAll("-", "");
}

function directionFromCompact(compact: string): LayoutDirection | undefined {
  if (compact === "lr" || compact === "leftright" || compact === "horizontal") {
    return "lr";
  }
  if (compact === "rl" || compact === "rightleft") {
    return "rl";
  }
  if (compact === "bt" || compact === "bottomtop") {
    return "bt";
  }
  if (compact === "tb" || compact === "topbottom" || compact === "vertical") {
    return "tb";
  }
  return undefined;
}

function modeFromCompact(compact: string): LayoutMode | undefined {
  if (compact === "layers" || compact === "layer") {
    return "layers";
  }
  if (compact === "layered") {
    return "layered";
  }
  return undefined;
}

/**
 * Canonical `tb|bt|lr|rl`. Existing shorthand (`left-right`, `horizontal`,
 * `top-bottom`, `vertical`) still maps. `autoLayout layers lr` picks `lr`;
 * a mode-only clause (`layers`) falls back to `tb`.
 */
export function parseLayoutDirection(value?: string): LayoutDirection {
  for (const token of autoLayoutTokens(value)) {
    const direction = directionFromCompact(compactAutoLayoutToken(token));
    if (direction) {
      return direction;
    }
  }
  return "tb";
}

/**
 * `layers` / `layer` select ArchiMate aspect bands. Anything else, including
 * a direction-only clause, is plain ELK Layered.
 */
export function parseLayoutMode(value?: string): LayoutMode {
  for (const token of autoLayoutTokens(value)) {
    const mode = modeFromCompact(compactAutoLayoutToken(token));
    if (mode === "layers") {
      return "layers";
    }
  }
  return "layered";
}

/** True when the DSL token is a supported autoLayout direction or shorthand. */
export function isLayoutDirectionToken(value: string): boolean {
  return directionFromCompact(compactAutoLayoutToken(value)) !== undefined;
}

/** True when the DSL token selects a layout mode (`layers` / `layered`). */
export function isLayoutModeToken(value: string): boolean {
  return modeFromCompact(compactAutoLayoutToken(value)) !== undefined;
}

export function layoutDirectionTitle(direction: LayoutDirection): string {
  switch (direction) {
    case "tb":
      return "Top → bottom";
    case "bt":
      return "Bottom → top";
    case "lr":
      return "Left → right";
    case "rl":
      return "Right → left";
  }
}

export function layoutModeTitle(mode: LayoutMode): string {
  switch (mode) {
    case "layers":
      return "ArchiMate layer bands (Motivation/Strategy → Business → Application → Technology → Implementation)";
    default:
      return "ELK Layered (edge ranks)";
  }
}

/** ArchiMate aspect band for one element keyword. */
export function layerBandOf(keyword: string): LayerBand {
  switch (layerOf(keyword)) {
    case "motivation":
    case "strategy":
      return "motivation-strategy";
    case "business":
      return "business";
    case "application":
      return "application";
    case "technology":
    case "physical":
      return "technology-physical";
    case "implementation":
      return "implementation";
    default:
      return "other";
  }
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

/** Resolve file `autoLayout`, then optional tool override (Mac local preview). */
export function resolveLayoutDirection(view: ViewDecl, options?: LayoutOptions): LayoutDirection {
  if (options?.direction) {
    return options.direction;
  }
  return parseLayoutDirection(view.autoLayout);
}

/** Resolve file `autoLayout` mode, then optional tool override (Mac local preview). */
export function resolveLayoutMode(view: ViewDecl, options?: LayoutOptions): LayoutMode {
  if (options?.mode) {
    return options.mode;
  }
  return parseLayoutMode(view.autoLayout);
}

/**
 * Lay out the include/exclude set of one named view with ELK Layered.
 * Unknown view names throw. Membership is the same set `filterModel` uses.
 *
 * `options.nesting` / `options.direction` / `options.mode` are Mac/tool
 * overrides. The `.plein` clauses are the source of truth for PRs when the
 * override is omitted.
 */
export async function layoutViewpoint(
  model: PleinModel,
  viewName: string,
  options?: LayoutOptions,
): Promise<ViewpointLayout> {
  const view = model.views.find((candidate) => candidate.name === viewName);
  if (!view) {
    throw new Error(`unknown view '${viewName}'`);
  }

  const list = filterModel(model, viewName);
  const direction = resolveLayoutDirection(view, options);
  const mode = resolveLayoutMode(view, options);
  const nesting = resolveNestingMode(view, options);
  const nestForest =
    nesting === "nested" ? buildNestForest(list.elements, list.relationships) : emptyForest();
  const parentOf = invertForest(nestForest);
  const byId = new Map(list.elements.map((element) => [element.id, element]));

  const packed = await layoutWithElk(
    list.elements,
    list.relationships,
    direction,
    nestForest,
    parentOf,
    mode,
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
    const id = edgeId(rel.source, rel.target, rel.type);
    const impliedByNest = Boolean(
      NEST_TYPES.has(rel.type) && parentOf.get(rel.target) === rel.source,
    );
    const routed = packed.edges.get(id);
    const anchors = impliedByNest
      ? { x1: source.x, y1: source.y, x2: target.x, y2: target.y }
      : (routed ?? edgeAnchors(source, target));
    return {
      id,
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
    mode,
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
    .map((edge) => renderEdge(edge, markerId))
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" data-view="${escapeXml(layout.viewName)}" data-layout="${layout.direction}" data-layout-mode="${layout.mode ?? "layered"}" data-layout-engine="${LAYOUT_ENGINE}" data-nesting="${layout.nesting ?? "beside"}" role="img" aria-label="${escapeXml(title)}">
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

function renderEdge(edge: LayoutEdge, markerId: string): string {
  const points =
    edge.points && edge.points.length >= 2
      ? edge.points
      : [
          { x: edge.x1, y: edge.y1 },
          { x: edge.x2, y: edge.y2 },
        ];
  const pointAttr = points.map((point) => `${point.x},${point.y}`).join(" ");
  return `    <g data-edge-id="${escapeXml(edge.id)}">
      <polyline points="${pointAttr}" fill="none" stroke="#6e6e73" stroke-width="1.5" stroke-linejoin="round" marker-end="url(#${markerId})" />
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

type PackedLayout = {
  nodes: LayoutNode[];
  edges: Map<string, { x1: number; y1: number; x2: number; y2: number; points: ElkPoint[] }>;
  width: number;
  height: number;
};

async function layoutWithElk(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
  mode: LayoutMode,
): Promise<PackedLayout> {
  if (elements.length === 0) {
    return {
      nodes: [],
      edges: new Map(),
      width: PADDING * 2 + NODE_WIDTH,
      height: PADDING * 2 + NODE_HEIGHT,
    };
  }

  const byId = new Map(elements.map((element) => [element.id, element]));
  const graph = buildElkGraph(elements, relationships, direction, nestForest, parentOf, mode);
  const laidOut = await elk.layout(graph);
  return flattenElkLayout(laidOut, byId, nestForest, parentOf);
}

function elkDirection(direction: LayoutDirection): "UP" | "DOWN" | "LEFT" | "RIGHT" {
  switch (direction) {
    case "bt":
      return "UP";
    case "lr":
      return "RIGHT";
    case "rl":
      return "LEFT";
    default:
      return "DOWN";
  }
}

function buildElkGraph(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
  mode: LayoutMode,
): ElkNode {
  const rootIds = elements.filter((element) => !parentOf.has(element.id)).map((element) => element.id);
  const partitions = mode === "layers" ? layerBandPartitions(rootIds, elements, nestForest) : null;
  const edges: ElkExtendedEdge[] = relationships
    .filter((rel) => {
      if (NEST_TYPES.has(rel.type) && parentOf.get(rel.target) === rel.source) {
        return false;
      }
      return Boolean(elements.some((element) => element.id === rel.source)) &&
        Boolean(elements.some((element) => element.id === rel.target));
    })
    .map((rel) => ({
      id: edgeId(rel.source, rel.target, rel.type),
      sources: [rel.source],
      targets: [rel.target],
    }));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": elkDirection(direction),
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": `[top=${PADDING},left=${PADDING},bottom=${PADDING},right=${PADDING}]`,
      "elk.spacing.nodeNode": String(LANE_GAP),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(RANK_GAP),
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
      "elk.separateConnectedComponents": "false",
      "elk.randomSeed": "1",
      ...(partitions
        ? {
            "elk.partitioning.activate": "true",
          }
        : {}),
    },
    children: rootIds.map((id) => buildElkSubtree(id, nestForest, partitions?.get(id))),
  };
  if (edges.length > 0) {
    graph.edges = edges;
  }
  return graph;
}

function buildElkSubtree(id: string, nestForest: Map<string, string[]>, partition?: number): ElkNode {
  const childIds = nestForest.get(id) ?? [];
  const partitionOptions =
    partition === undefined ? undefined : { "elk.partitioning.partition": String(partition) };
  if (childIds.length === 0) {
    return {
      id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      ...(partitionOptions ? { layoutOptions: partitionOptions } : {}),
    };
  }
  return {
    id,
    layoutOptions: {
      "elk.padding": `[top=${NEST_HEADER_HEIGHT},left=${NEST_PAD},bottom=${NEST_PAD},right=${NEST_PAD}]`,
      ...partitionOptions,
    },
    children: childIds.map((childId) => buildElkSubtree(childId, nestForest)),
  };
}

/**
 * Compact 0..n-1 partitions for bands that actually have a **root** member.
 * Nested children stay inside the parent and are not partitioned on their own.
 */
function layerBandPartitions(
  rootIds: string[],
  elements: ElementDecl[],
  nestForest: Map<string, string[]>,
): Map<string, number> {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const bandOf = new Map<string, LayerBand>();
  for (const id of rootIds) {
    bandOf.set(id, resolveRootLayerBand(id, byId, nestForest));
  }
  const present = LAYER_BANDS.filter((band) => rootIds.some((id) => bandOf.get(id) === band));
  const index = new Map(present.map((band, partition) => [band, partition]));
  const partitions = new Map<string, number>();
  for (const id of rootIds) {
    partitions.set(id, index.get(bandOf.get(id)!) ?? 0);
  }
  return partitions;
}

/**
 * Nested containers are first-class: the parent gets one band, children stay
 * inside it. Composite/unknown groupings inherit the dominant descendant band
 * so a grouping of application components sits in Application, not `other`.
 */
function resolveRootLayerBand(
  id: string,
  byId: Map<string, ElementDecl>,
  nestForest: Map<string, string[]>,
): LayerBand {
  const own = layerBandOf(byId.get(id)?.keyword ?? "unknown");
  if (own !== "other") {
    return own;
  }
  const descendantBands: LayerBand[] = [];
  const walk = (nodeId: string): void => {
    for (const childId of nestForest.get(nodeId) ?? []) {
      const band = layerBandOf(byId.get(childId)?.keyword ?? "unknown");
      if (band !== "other") {
        descendantBands.push(band);
      }
      walk(childId);
    }
  };
  walk(id);
  return dominantLayerBand(descendantBands);
}

function dominantLayerBand(bands: LayerBand[]): LayerBand {
  if (bands.length === 0) {
    return "other";
  }
  const counts = new Map<LayerBand, number>();
  for (const band of bands) {
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  let best: LayerBand = "other";
  let bestCount = 0;
  for (const band of LAYER_BANDS) {
    const count = counts.get(band) ?? 0;
    if (count > bestCount) {
      best = band;
      bestCount = count;
    }
  }
  return best;
}

function flattenElkLayout(
  root: ElkNode,
  byId: Map<string, ElementDecl>,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
): PackedLayout {
  const nodes: LayoutNode[] = [];
  const absById = new Map<string, { x: number; y: number }>();
  const rootX = roundCoord(root.x ?? 0);
  const rootY = roundCoord(root.y ?? 0);

  const walk = (elkNode: ElkNode, originX: number, originY: number, parentId?: string): void => {
    for (const child of elkNode.children ?? []) {
      const x = roundCoord(originX + (child.x ?? 0));
      const y = roundCoord(originY + (child.y ?? 0));
      const element = byId.get(child.id);
      if (element) {
        const nestedKids = nestForest.get(child.id) ?? [];
        nodes.push({
          id: child.id,
          label: element.label,
          keyword: element.keyword,
          x,
          y,
          width: roundCoord(child.width ?? NODE_WIDTH),
          height: roundCoord(child.height ?? NODE_HEIGHT),
          ...(parentId ? { parentId } : {}),
          ...(nestedKids.length > 0 ? { container: true } : {}),
        });
        absById.set(child.id, { x, y });
      }
      walk(child, x, y, child.id);
    }
  };
  walk(root, rootX, rootY);

  const routed = new Map<string, { x1: number; y1: number; x2: number; y2: number; points: ElkPoint[] }>();
  collectElkEdges(root, absById, { x: rootX, y: rootY }, routed);

  for (const [id, parentId] of parentOf) {
    const child = nodes.find((node) => node.id === id);
    const parent = nodes.find((node) => node.id === parentId);
    if (child && parent && !child.parentId) {
      child.parentId = parentId;
    }
  }

  return {
    nodes,
    edges: routed,
    width: Math.max(roundCoord(root.width ?? 0), PADDING * 2 + NODE_WIDTH),
    height: Math.max(roundCoord(root.height ?? 0), PADDING * 2 + NODE_HEIGHT),
  };
}

function collectElkEdges(
  elkNode: ElkNode,
  absById: Map<string, { x: number; y: number }>,
  rootOrigin: { x: number; y: number },
  out: Map<string, { x1: number; y1: number; x2: number; y2: number; points: ElkPoint[] }>,
): void {
  const containerAbs =
    elkNode.id === "root" ? rootOrigin : (absById.get(elkNode.id) ?? rootOrigin);
  for (const edge of elkNode.edges ?? []) {
    const offset =
      !edge.container || edge.container === "root"
        ? rootOrigin
        : (absById.get(edge.container) ?? containerAbs);
    const points = polylineFromEdge(edge, offset);
    if (points.length < 2) {
      continue;
    }
    const start = points[0]!;
    const end = points[points.length - 1]!;
    out.set(edge.id, {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      points,
    });
  }
  for (const child of elkNode.children ?? []) {
    collectElkEdges(child, absById, rootOrigin, out);
  }
}

function polylineFromEdge(edge: ElkExtendedEdge, offset: ElkPoint): ElkPoint[] {
  const points: ElkPoint[] = [];
  const push = (point: ElkPoint): void => {
    const next = { x: roundCoord(point.x + offset.x), y: roundCoord(point.y + offset.y) };
    const last = points[points.length - 1];
    if (last && last.x === next.x && last.y === next.y) {
      return;
    }
    points.push(next);
  };
  for (const section of edge.sections ?? []) {
    push(section.startPoint);
    for (const bend of section.bendPoints ?? []) {
      push(bend);
    }
    push(section.endPoint);
  }
  return points;
}

function roundCoord(value: number): number {
  return Math.round(value);
}

function edgeAnchors(
  source: LayoutNode,
  target: LayoutNode,
): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: source.x + source.width / 2,
    y1: source.y + source.height / 2,
    x2: target.x + target.width / 2,
    y2: target.y + target.height / 2,
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
