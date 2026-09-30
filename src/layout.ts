import ElkJs from "elkjs/lib/elk.bundled.js";
import type { ELK, ElkExtendedEdge, ElkNode, ElkPoint } from "elkjs";
import { elementStyle, layerOf, renderTypeIcon } from "./archimate-style.js";
import { toKebabCaseKeyword, type ElementKeyword, type RelationshipKeyword } from "./keywords.js";
import {
  LABEL_PAD_X,
  NODE_HEIGHT,
  NODE_WIDTH,
  TYPE_ICON_INSET_X,
  bandHeightForLines,
  fitLeafBox,
  labelBaselines,
  labelContentWidth,
  wrapLabel,
} from "./label-fit.js";
import { filterModel } from "./list-model.js";
import type { ElementDecl, PleinModel, RelationshipDecl, ViewDecl } from "./parser.js";

/** Default element box. Short labels stay this size; longer names wrap and may grow. */
export { NODE_HEIGHT, NODE_WIDTH };

/** Gap along the rank axis (left→right for `lr`, top→bottom for `tb`). */
export const RANK_GAP = 56;
/** Gap between siblings in the same rank. */
export const LANE_GAP = 28;
export const PADDING = 24;
/** Extra gap between ArchiMate aspect bands in `autoLayout layers`. */
export const BAND_GAP = RANK_GAP;
/** Header band inside a nested parent (keyword + label). */
export const NEST_HEADER_HEIGHT = 48;
/** Padding around nested children inside a parent. */
export const NEST_PAD = 16;

/** Element border stroke. It is centered on the rect, so half of it lies outside the box. */
const NODE_STROKE_WIDTH = 1.25;
const EDGE_STROKE_WIDTH = 1.5;

/**
 * Unmarked end. The shaft centerline stops on the outer edge of the element
 * stroke — attached, not floating, and not buried in the fill.
 */
export const CONNECTOR_SHAFT_GAP = NODE_STROKE_WIDTH / 2;

/**
 * Air between a marker tip and that outer stroke edge.
 * v0.1.17 applied one 6px inset at both ends: unmarked shafts floated off the
 * boxes, and the tip still sat on the marker clip edge so the head looked crushed.
 */
export const CONNECTOR_TIP_CLEARANCE = 3;

/** Distance from the geometric border to a marker tip (stroke outer edge + clearance). */
export const CONNECTOR_TIP_GAP = CONNECTOR_SHAFT_GAP + CONNECTOR_TIP_CLEARANCE;

/**
 * Arrowhead in marker user units. The viewport is padded past the triangle and
 * `overflow` is visible so the tip is not clipped — that clip is what read as a
 * squashed head. `refX` sits one unit behind the tip; that overhang is retracted
 * only at a marked end, so the tip (not the shaft) lands on `CONNECTOR_TIP_GAP`.
 */
const MARKER_TIP_X = 10;
const MARKER_TIP_Y = 3.5;
const MARKER_BASE_HEIGHT = 7;
const MARKER_PAD = 1;
const MARKER_REF_X = MARKER_TIP_X - MARKER_PAD;
const MARKER_REF_Y = MARKER_TIP_Y;
const MARKER_WIDTH = MARKER_TIP_X + MARKER_PAD * 2;
const MARKER_HEIGHT = MARKER_BASE_HEIGHT + MARKER_PAD * 2;
/** How far the tip extends past the path endpoint, in user px. Marker units are strokeWidth. */
const MARKER_OVERHANG = (MARKER_TIP_X - MARKER_REF_X) * EDGE_STROKE_WIDTH;
const EDGE_STROKE_ATTRS = `fill="none" stroke="#6e6e73" stroke-width="${EDGE_STROKE_WIDTH}" stroke-linejoin="round"`;

/** Mac/web viewer engine: Eclipse Layout Kernel layered (elkjs). */
export const LAYOUT_ENGINE = "elk-layered";

export const LAYOUT_DIRECTIONS = ["tb", "bt", "lr", "rl"] as const;

export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number];

/**
 * `layered` is plain ELK Layered (edge ranks) and stays the default.
 * `layers` still uses that engine once per ArchiMate aspect band, then stacks
 * the bands. `organic` is a seeded ELK Force layout. `grid` packs a catalogue.
 * Organic is not the default.
 */
export const LAYOUT_MODES = ["layered", "layers", "organic", "grid"] as const;

export type LayoutMode = (typeof LAYOUT_MODES)[number];

/**
 * Catalogue order for `autoLayout grid`.
 * `kind` groups by element keyword, then by name. `name` packs by label.
 * Omitted order is `kind`.
 */
export const GRID_ORDERS = ["kind", "name"] as const;

export type GridOrder = (typeof GRID_ORDERS)[number];

export const DEFAULT_GRID_ORDER: GridOrder = "kind";

/**
 * Fixed ELK seed for `organic`. elkjs treats seed `0` as unseeded, so the
 * stable seed is `1` (the same value layered already sets). Same file → same
 * coordinates.
 */
export const ORGANIC_RANDOM_SEED = "1";

/**
 * `elk.spacing.nodeNode` for organic. The ELK Force Fruchterman-Reingold step
 * treats this as a distance scale, but the cooled footprint is not monotonic
 * in it: lowering the default 80 sometimes spreads a service line further,
 * and the values that do shrink the canvas also leave boxes a few pixels
 * apart. Density is the pack below, not this knob. Layered keeps `LANE_GAP`.
 */
export const ORGANIC_NODE_SPACING = 80;

/**
 * Canvas area divided by the sum of node areas, after the seeded force pass.
 * A layered service line sits near 7. Force at the spacing above sits near
 * 16 on the same graph. Organic scales that seeded result toward 8 — closer
 * to layered, still a little looser — and does not run a different algorithm.
 */
export const ORGANIC_PACK_RATIO = 8;

/**
 * Minimum box gap restored when that scale would stack nodes. Organic only.
 */
export const ORGANIC_PACK_GAP = 24;

/**
 * Edge routing on top of ELK Layered placement.
 * `orthogonal` is the viewer default (right-angle connectors).
 * `polyline` is the non-orthogonal alternative and may draw diagonal segments.
 */
export const EDGE_ROUTINGS = ["orthogonal", "polyline"] as const;

export type EdgeRouting = (typeof EDGE_ROUTINGS)[number];

export const DEFAULT_EDGE_ROUTING: EdgeRouting = "orthogonal";

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

/** `auto` forces a fresh layout. `off` freezes positions. Omit to follow the view clause. */
export type AutoLayoutSetting = "auto" | "off";

/**
 * A frozen top-left (and optional box size) for one element.
 * Session snapshots from the Mac toolbar may include width and height so a
 * nested container does not resize when auto-layout is turned off.
 * File `position` clauses only set x and y.
 */
export type ManualPosition = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

/** Tool override for local preview. When set, wins over the view’s clause. */
export type LayoutOptions = {
  nesting?: NestingMode;
  direction?: LayoutDirection;
  mode?: LayoutMode;
  routing?: EdgeRouting;
  /**
   * `auto` recomputes with the selected mode and ignores saved positions.
   * `off` keeps file `position` clauses and `manualPositions`.
   * Omit to follow the view (`autoLayout off` / `manual` disables; anything else stays automatic,
   * including layered, layers, organic, and grid).
   */
  autoLayout?: AutoLayoutSetting;
  /**
   * Positions captured when auto-layout was turned off, or moved by drag.
   * Used only while auto-layout is off. Wins over a file `position` for the same id.
   */
  manualPositions?: ManualPosition[];
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
  /** Right-angle (`orthogonal`) or diagonal-capable (`polyline`) connectors. */
  routing: EdgeRouting;
  /** Set for `grid`: pack by element kind (then name) or by name. */
  gridOrder?: GridOrder;
  nesting: NestingMode;
  /**
   * False when this view is placed from saved positions (`autoLayout off`).
   * Omit or true means the selected mode recomputed the graph.
   */
  auto?: boolean;
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
};

/** SVG engine token when node positions come from `position` clauses, not a layout algorithm. */
export const MANUAL_LAYOUT_ENGINE = "manual";

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
  if (compact === "organic") {
    return "organic";
  }
  if (compact === "grid") {
    return "grid";
  }
  return undefined;
}

function gridOrderFromCompact(compact: string): GridOrder | undefined {
  if (compact === "kind") {
    return "kind";
  }
  if (compact === "name") {
    return "name";
  }
  return undefined;
}

function routingFromCompact(compact: string): EdgeRouting | undefined {
  if (compact === "orthogonal" || compact === "ortho" || compact === "rightangle") {
    return "orthogonal";
  }
  if (compact === "polyline") {
    return "polyline";
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
 * First explicit mode token wins. `layers` / `layer` select ArchiMate aspect
 * bands. `organic` selects seeded force-directed layout. `grid` selects
 * catalogue packing. Anything else, including a direction-only clause, is
 * plain ELK Layered — organic is not the default.
 */
export function parseLayoutMode(value?: string): LayoutMode {
  for (const token of autoLayoutTokens(value)) {
    const mode = modeFromCompact(compactAutoLayoutToken(token));
    if (mode) {
      return mode;
    }
  }
  return "layered";
}

/** `kind` (default) or `name` from an `autoLayout grid` clause. */
export function parseGridOrder(value?: string): GridOrder {
  for (const token of autoLayoutTokens(value)) {
    const order = gridOrderFromCompact(compactAutoLayoutToken(token));
    if (order) {
      return order;
    }
  }
  return DEFAULT_GRID_ORDER;
}

/** True when the DSL token is a supported autoLayout direction or shorthand. */
export function isLayoutDirectionToken(value: string): boolean {
  return directionFromCompact(compactAutoLayoutToken(value)) !== undefined;
}

/** True when the DSL token selects a layout mode (`layered` / `layers` / `organic` / `grid`). */
export function isLayoutModeToken(value: string): boolean {
  return modeFromCompact(compactAutoLayoutToken(value)) !== undefined;
}

/** True when the DSL token selects a grid catalogue order (`kind` / `name`). */
export function isGridOrderToken(value: string): boolean {
  return gridOrderFromCompact(compactAutoLayoutToken(value)) !== undefined;
}

/**
 * `orthogonal` / `ortho` / `right-angle` select right-angle connectors.
 * `polyline` / `poly-line` select ELK polyline routing (segments may be diagonal).
 * A clause with no routing token stays on the viewer default (`orthogonal`).
 */
export function parseEdgeRouting(value?: string): EdgeRouting {
  for (const token of autoLayoutTokens(value)) {
    const routing = routingFromCompact(compactAutoLayoutToken(token));
    if (routing) {
      return routing;
    }
  }
  return DEFAULT_EDGE_ROUTING;
}

/** True when the DSL token selects an edge routing style. */
export function isEdgeRoutingToken(value: string): boolean {
  return routingFromCompact(compactAutoLayoutToken(value)) !== undefined;
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
    case "organic":
      return "Seeded force-directed layout for landscape and inventory diagrams (same file, same layout)";
    case "grid":
      return "Catalog grid packed by kind or name, including disconnected leftovers";
    default:
      return "ELK Layered (edge ranks)";
  }
}

/** Short toolbar label. `layered` stays the first choice. */
export function layoutModeLabel(mode: LayoutMode): string {
  switch (mode) {
    case "layers":
      return "Layers";
    case "organic":
      return "Organic";
    case "grid":
      return "Grid";
    default:
      return "Layered";
  }
}

/** SVG `data-layout-engine`. Layered and layers stay on ELK Layered. */
export function layoutEngineFor(mode: LayoutMode | undefined): string {
  switch (mode) {
    case "organic":
      return "elk-force";
    case "grid":
      return "grid-pack";
    default:
      return LAYOUT_ENGINE;
  }
}

export function edgeRoutingTitle(routing: EdgeRouting): string {
  switch (routing) {
    case "polyline":
      return "Polyline connectors (ELK polyline; segments may be diagonal)";
    default:
      return "Right-angle connectors (ELK orthogonal)";
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

/** Resolve file `autoLayout` routing, then optional tool override (Mac local preview). */
export function resolveEdgeRouting(view: ViewDecl, options?: LayoutOptions): EdgeRouting {
  if (options?.routing) {
    return options.routing;
  }
  return parseEdgeRouting(view.autoLayout);
}

/**
 * True unless the clause is exactly `off` or `manual`.
 * Bare `autoLayout`, a direction, `layered` / `layers` / `organic` / `grid`,
 * and a missing clause all stay automatic.
 */
export function isAutoLayoutEnabled(value?: string): boolean {
  const tokens = autoLayoutTokens(value).map(compactAutoLayoutToken);
  if (tokens.length === 1 && (tokens[0] === "off" || tokens[0] === "manual")) {
    return false;
  }
  return true;
}

/**
 * File `autoLayout`, then optional tool override.
 * `options.autoLayout: "auto"` recomputes even when the file says off.
 * `options.autoLayout: "off"` freezes even when the file is automatic.
 */
export function resolveAutoLayout(view: ViewDecl, options?: LayoutOptions): boolean {
  if (options?.autoLayout === "off") {
    return false;
  }
  if (options?.autoLayout === "auto") {
    return true;
  }
  return isAutoLayoutEnabled(view.autoLayout);
}

/**
 * Lay out the include/exclude set of one named view.
 * Unknown view names throw. Membership is the same set `filterModel` uses.
 *
 * `options.nesting` / `options.direction` / `options.mode` / `options.routing`
 * are Mac/tool overrides. The `.plein` clauses are the source of truth for
 * PRs when the override is omitted. Omitting a mode keeps ELK Layered.
 * `organic` and `grid` stay optional modes on the same path.
 *
 * When auto-layout is off, node top-lefts come from `position` clauses and
 * `options.manualPositions` (session wins per id). Elements with neither are
 * stacked in a column beside the placed nodes so the saved coordinates do not
 * move. Turning auto-layout back on (`autoLayout` direction or mode, or
 * `options.autoLayout: "auto"`) runs the selected algorithm again and ignores
 * those positions.
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
  const routing = resolveEdgeRouting(view, options);
  const gridOrder = parseGridOrder(view.autoLayout);
  const nesting = resolveNestingMode(view, options);
  const auto = resolveAutoLayout(view, options);
  const nestForest =
    nesting === "nested" ? buildNestForest(list.elements, list.relationships) : emptyForest();
  const parentOf = invertForest(nestForest);
  const byId = new Map(list.elements.map((element) => [element.id, element]));

  const packed = auto
    ? await layoutPacked(
        mode,
        gridOrder,
        list.elements,
        list.relationships,
        direction,
        routing,
        nestForest,
        parentOf,
      )
    : layoutManual(
        list.elements,
        nesting,
        nestForest,
        view.positions ?? [],
        options?.manualPositions ?? [],
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
      : (routed ??
        (routing === "orthogonal"
          ? orthogonalBetween(source, target, direction)
          : edgeAnchors(source, target)));
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
    routing,
    ...(mode === "grid" ? { gridOrder } : {}),
    nesting,
    auto,
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
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const edgeMarkup = layout.edges
    .filter((edge) => !edge.impliedByNest)
    .map((edge) => renderEdge(edge, markerId, nodeById))
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

  const manual = layout.auto === false;
  const gridOrderAttr =
    !manual && layout.mode === "grid"
      ? ` data-grid-order="${layout.gridOrder ?? DEFAULT_GRID_ORDER}"`
      : "";
  const autoAttr = manual ? ` data-layout-auto="off"` : "";
  const engine = manual ? MANUAL_LAYOUT_ENGINE : layoutEngineFor(layout.mode);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" data-view="${escapeXml(layout.viewName)}" data-layout="${layout.direction}" data-layout-mode="${layout.mode ?? "layered"}" data-layout-routing="${layout.routing ?? DEFAULT_EDGE_ROUTING}" data-layout-engine="${engine}"${gridOrderAttr}${autoAttr} data-nesting="${layout.nesting ?? "beside"}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <marker id="${markerId}" markerUnits="strokeWidth" markerWidth="${MARKER_WIDTH}" markerHeight="${MARKER_HEIGHT}" refX="${MARKER_REF_X}" refY="${MARKER_REF_Y}" orient="auto" viewBox="-${MARKER_PAD} -${MARKER_PAD} ${MARKER_WIDTH} ${MARKER_HEIGHT}" overflow="visible">
      <polygon points="0 0, ${MARKER_TIP_X} ${MARKER_TIP_Y}, 0 ${MARKER_BASE_HEIGHT}" fill="#6e6e73" />
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
  const rx = node.container ? 10 : 8;
  return `    <g data-node-id="${escapeXml(node.id)}" data-keyword="${escapeXml(node.keyword)}" data-layer="${style.layer}" data-icon="${style.icon}"${parentAttr}${containerAttr}${containerIdAttr} transform="translate(${node.x} ${node.y})">
      <title>${escapeXml(`${typeName} — ${node.label}`)}</title>
      <rect width="${node.width}" height="${node.height}" rx="${rx}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${NODE_STROKE_WIDTH}" />
      ${renderTypeIcon(style.icon, style.stroke, node.width - TYPE_ICON_INSET_X, 4)}
      ${renderLabelText(node, style.ink)}
    </g>`;
}

function linesForNode(node: LayoutNode): string[] {
  const fitted = fitLeafBox(node.label);
  if (node.width <= fitted.width) {
    return fitted.lines;
  }
  // A wider container can hold the same name on fewer lines. Never add lines:
  // the header and box were sized for the narrower wrap.
  const wider = wrapLabel(node.label, labelContentWidth(node.width));
  return wider.length <= fitted.lines.length ? wider : fitted.lines;
}

function renderLabelText(node: LayoutNode, ink: string): string {
  const lines = linesForNode(node);
  const bandHeight = node.container ? containerHeaderHeight(node.label) : node.height;
  const baselines = labelBaselines(lines.length, bandHeight);
  const attrs = `fill="${ink}" font-size="13" font-family="-apple-system, BlinkMacSystemFont, sans-serif"`;
  if (lines.length === 1) {
    return `<text x="${LABEL_PAD_X}" y="${baselines[0]}" ${attrs}>${escapeXml(lines[0]!)}</text>`;
  }
  const spans = lines
    .map((line, index) => `<tspan x="${LABEL_PAD_X}" y="${baselines[index]}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text x="${LABEL_PAD_X}" y="${baselines[0]}" ${attrs}>${spans}</text>`;
}

function renderEdge(
  edge: LayoutEdge,
  markerId: string,
  nodeById: Map<string, LayoutNode>,
): string {
  const raw =
    edge.points && edge.points.length >= 2
      ? edge.points
      : [
          { x: edge.x1, y: edge.y1 },
          { x: edge.x2, y: edge.y2 },
        ];
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  const opened = source && target ? insetConnectorEnds(raw, source, target) : raw;
  const points = opened.length >= 2 ? opened : raw;
  const pointAttr = points.map((point) => `${formatCoord(point.x)},${formatCoord(point.y)}`).join(" ");
  // The shaft stays one polyline so orthogonal corners keep a single round join.
  // `marker-end` is not on that polyline: WKWebView paints it at every segment
  // end, so a bend gets a head aimed along the segment that arrived there
  // (upward triangles on a horizontal span, shaft entering the side of the
  // triangle). A two-point line has no mid vertex, so the head can only sit on
  // the target attachment. The source stays unmarked. Tip clearance is still
  // `insetConnectorEnds` — shaft on the stroke, overhang only at this end.
  const shaft = `      <polyline points="${pointAttr}" ${EDGE_STROKE_ATTRS} marker-start="none" marker-mid="none" marker-end="none" />`;
  const terminal = terminalSegment(points);
  const tip = terminal
    ? `\n      <line x1="${formatCoord(terminal.from.x)}" y1="${formatCoord(terminal.from.y)}" x2="${formatCoord(terminal.to.x)}" y2="${formatCoord(terminal.to.y)}" ${EDGE_STROKE_ATTRS} marker-start="none" marker-mid="none" marker-end="url(#${markerId})" />`
    : "";
  return `    <g data-edge-id="${escapeXml(edge.id)}">
${shaft}${tip}
    </g>`;
}

/** Final non-degenerate segment. The marker line is only these two points. */
function terminalSegment(points: ElkPoint[]): { from: ElkPoint; to: ElkPoint } | null {
  if (points.length < 2) {
    return null;
  }
  const to = points[points.length - 1]!;
  const toKey = coordKey(to);
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const from = points[index]!;
    if (coordKey(from) !== toKey) {
      return { from, to };
    }
  }
  return null;
}

function coordKey(point: ElkPoint): string {
  return `${formatCoord(point.x)},${formatCoord(point.y)}`;
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * Place the unmarked start on the stroke and the marker tip `CONNECTOR_TIP_GAP`
 * outside the target border. The path end at a marked end is the tip gap plus
 * the arrow overhang, so the head — not an empty shaft gap — occupies that
 * space. A connector too short to hold both insets and the overhang scales
 * them down instead of folding back on itself.
 *
 * Only the end that carries a marker gets the overhang. Today that is the
 * target (`marker-end`). A markerless source stays at `CONNECTOR_SHAFT_GAP`.
 */
function insetConnectorEnds(points: ElkPoint[], source: LayoutNode, target: LayoutNode): ElkPoint[] {
  if (points.length < 2) {
    return points;
  }
  const bordered = trimEnds(points, source, target, 0, 0);
  const free = polylineLength(bordered);
  if (bordered.length < 2 || free <= 0) {
    return points;
  }
  const fitted = fitEndInsets(free);
  const cut = trimEnds(points, source, target, fitted.shaft, fitted.tip);
  const opened = retractEnd(cut, fitted.overhang);
  return opened.length >= 2 ? opened : bordered;
}

/**
 * Reserve the real arrow overhang when the span allows, so the tip lands on
 * `CONNECTOR_TIP_GAP`. Shorter spans scale the overhang with the gaps; pulling
 * the full head back would reverse the line.
 */
function fitEndInsets(free: number): { shaft: number; tip: number; overhang: number } {
  const shaft = CONNECTOR_SHAFT_GAP;
  const tip = CONNECTOR_TIP_GAP;
  const overhang = MARKER_OVERHANG;
  const minShaft = 1;
  const room = Math.max(0, free - minShaft - overhang);
  if (shaft + tip <= room) {
    return { shaft, tip, overhang };
  }
  const budget = Math.max(0, free - minShaft);
  const want = shaft + tip + overhang;
  if (budget <= 0 || want <= 0) {
    return { shaft: 0, tip: 0, overhang: 0 };
  }
  const scale = budget / want;
  return { shaft: shaft * scale, tip: tip * scale, overhang: overhang * scale };
}

function trimEnds(
  points: ElkPoint[],
  source: Box,
  target: Box,
  sourceGap: number,
  targetGap: number,
): ElkPoint[] {
  return dedupePoints(cutEnd(cutStart(points, inflate(source, sourceGap)), inflate(target, targetGap)));
}

/** Pull the marked end back along the polyline so the overhanging tip lands on the previous endpoint. */
function retractEnd(points: ElkPoint[], distance: number): ElkPoint[] {
  if (distance <= 0.01 || points.length < 2) {
    return points.slice();
  }
  let remaining = distance;
  for (let index = points.length - 1; index > 0; index -= 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length <= 0.01) {
      continue;
    }
    if (remaining <= length) {
      const t = (length - remaining) / length;
      return dedupePoints([...points.slice(0, index), lerp(from, to, t)]);
    }
    remaining -= length;
  }
  return points.slice();
}

function inflate(box: Box, gap: number): Box {
  return {
    x: box.x - gap,
    y: box.y - gap,
    width: box.width + gap * 2,
    height: box.height + gap * 2,
  };
}

function cutStart(points: ElkPoint[], rect: Box): ElkPoint[] {
  if (points.length < 2 || !contains(rect, points[0]!)) {
    return points.slice();
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    if (samePoint(from, to)) {
      continue;
    }
    if (!contains(rect, to)) {
      const hit = clipSegment(from, to, rect);
      const t = hit ? clamp01(hit.t1) : 1;
      return [lerp(from, to, t), ...points.slice(index + 1)];
    }
  }
  return points.slice();
}

function cutEnd(points: ElkPoint[], rect: Box): ElkPoint[] {
  if (points.length < 2 || !contains(rect, points[points.length - 1]!)) {
    return points.slice();
  }
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    if (samePoint(from, to)) {
      continue;
    }
    if (!contains(rect, from)) {
      const hit = clipSegment(from, to, rect);
      const t = hit ? clamp01(hit.t0) : 0;
      return [...points.slice(0, index + 1), lerp(from, to, t)];
    }
  }
  return points.slice();
}

/** Liang–Barsky clip of a segment to an axis-aligned box. `t` is 0 at `from` and 1 at `to`. */
function clipSegment(
  from: ElkPoint,
  to: ElkPoint,
  rect: Box,
): { t0: number; t1: number } | null {
  let t0 = 0;
  let t1 = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const edges: Array<[number, number]> = [
    [-dx, from.x - rect.x],
    [dx, rect.x + rect.width - from.x],
    [-dy, from.y - rect.y],
    [dy, rect.y + rect.height - from.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < -1e-6) {
        return null;
      }
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) {
        return null;
      }
      if (t > t0) {
        t0 = t;
      }
    } else if (t < t0) {
      return null;
    } else if (t < t1) {
      t1 = t;
    }
  }
  return { t0, t1 };
}

function contains(rect: Box, point: ElkPoint): boolean {
  return (
    point.x >= rect.x - 1e-6 &&
    point.x <= rect.x + rect.width + 1e-6 &&
    point.y >= rect.y - 1e-6 &&
    point.y <= rect.y + rect.height + 1e-6
  );
}

function distanceToRect(point: ElkPoint, rect: Box): number {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const dx = point.x < rect.x ? rect.x - point.x : point.x > right ? point.x - right : 0;
  const dy = point.y < rect.y ? rect.y - point.y : point.y > bottom ? point.y - bottom : 0;
  return Math.hypot(dx, dy);
}

function polylineLength(points: ElkPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  }
  return length;
}

function lerp(from: ElkPoint, to: ElkPoint, t: number): ElkPoint {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function samePoint(a: ElkPoint, b: ElkPoint): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function dedupePoints(points: ElkPoint[]): ElkPoint[] {
  const out: ElkPoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && samePoint(last, point)) {
      continue;
    }
    out.push(point);
  }
  return out;
}

function formatCoord(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
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

async function layoutPacked(
  mode: LayoutMode,
  gridOrder: GridOrder,
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  routing: EdgeRouting,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
): Promise<PackedLayout> {
  if (mode === "layers") {
    return layoutLayerBands(elements, relationships, direction, routing, nestForest, parentOf);
  }
  if (mode === "organic") {
    return layoutOrganic(elements, relationships, direction, routing, nestForest, parentOf);
  }
  if (mode === "grid") {
    return layoutGrid(
      elements,
      relationships,
      direction,
      routing,
      gridOrder,
      nestForest,
      parentOf,
    );
  }
  return layoutWithElk(elements, relationships, direction, routing, nestForest, parentOf);
}

type Placement = {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
};

type SizedNode = ElementDecl & { width: number; height: number; header?: number };

/** Header band for a nested parent. One-line titles keep `NEST_HEADER_HEIGHT`. */
function containerHeaderHeight(label: string): number {
  return bandHeightForLines(fitLeafBox(label).lines.length, NEST_HEADER_HEIGHT);
}

type LevelPlacer = (
  nodes: SizedNode[],
  edges: RelationshipDecl[],
  pad: number,
) => Promise<Placement>;

/**
 * Seeded ELK Force (Fruchterman–Reingold), then a deterministic scale toward
 * `ORGANIC_PACK_RATIO`. `elk.randomSeed` is fixed so the same graph yields
 * the same coordinates. Direction does not re-rank nodes; orthogonal routing
 * still uses it for bend axis. Disconnected components are simulated
 * separately and then packed with the rest of the level.
 */
async function layoutOrganic(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  routing: EdgeRouting,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
): Promise<PackedLayout> {
  return layoutCompound(
    elements,
    relationships,
    direction,
    routing,
    nestForest,
    parentOf,
    placeOrganic,
  );
}

/**
 * Catalogue packing. Relationships do not decide coordinates.
 * `kind` makes one strip per element keyword (items ordered by name).
 * `name` wraps a single name-sorted sequence.
 * Roots with no relationship (and no related descendant) are disconnected
 * leftovers: they are packed in a following strip, not dropped.
 */
async function layoutGrid(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  routing: EdgeRouting,
  gridOrder: GridOrder,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
): Promise<PackedLayout> {
  const roots = elements.filter((element) => !parentOf.has(element.id)).map((element) => element.id);
  const leftovers = leftoverRoots(roots, relationships, nestForest, parentOf);
  return layoutCompound(
    elements,
    relationships,
    direction,
    routing,
    nestForest,
    parentOf,
    (nodes, _edges, pad) => Promise.resolve(placeGrid(nodes, direction, gridOrder, leftovers, pad)),
  );
}

async function layoutCompound(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  routing: EdgeRouting,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
  place: LevelPlacer,
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
  const topIds = elements.filter((element) => !parentOf.has(element.id)).map((element) => element.id);
  const innerByParent = new Map<string, PackedLayout>();

  const layoutIds = async (ids: string[], pad: number): Promise<PackedLayout> => {
    const sized: SizedNode[] = [];
    for (const id of ids) {
      const element = byId.get(id);
      if (!element) {
        continue;
      }
      const kids = nestForest.get(id) ?? [];
      if (kids.length === 0) {
        const box = fitLeafBox(element.label);
        sized.push({ ...element, width: box.width, height: box.height });
        continue;
      }
      const inner = await layoutIds(kids, NEST_PAD);
      innerByParent.set(id, inner);
      const box = fitLeafBox(element.label);
      const header = containerHeaderHeight(element.label);
      sized.push({
        ...element,
        width: Math.max(box.width, inner.width),
        height: header + inner.height,
        header,
      });
    }

    const idSet = new Set(sized.map((node) => node.id));
    const levelEdges = relationships.filter((rel) => {
      if (!idSet.has(rel.source) || !idSet.has(rel.target)) {
        return false;
      }
      return !(NEST_TYPES.has(rel.type) && parentOf.get(rel.target) === rel.source);
    });
    const placement = await place(sized, levelEdges, pad);
    const nodes: LayoutNode[] = [];
    for (const element of sized) {
      const pos = placement.positions.get(element.id);
      if (!pos) {
        throw new Error(`layout missing position for '${element.id}'`);
      }
      const kids = nestForest.get(element.id) ?? [];
      nodes.push({
        id: element.id,
        label: element.label,
        keyword: element.keyword,
        x: pos.x,
        y: pos.y,
        width: element.width,
        height: element.height,
        ...(kids.length > 0 ? { container: true } : {}),
      });
      const inner = innerByParent.get(element.id);
      if (!inner) {
        continue;
      }
      for (const child of inner.nodes) {
        nodes.push({
          ...child,
          x: child.x + pos.x,
          y: child.y + pos.y + (element.header ?? NEST_HEADER_HEIGHT),
          parentId: child.parentId ?? element.id,
        });
      }
    }
    return {
      nodes,
      edges: new Map(),
      width: Math.max(placement.width, pad * 2),
      height: Math.max(placement.height, pad * 2),
    };
  };

  const packed = await layoutIds(topIds, PADDING);
  attachInterBandEdges(packed, elements, relationships, direction, routing, parentOf);
  return packed;
}

async function placeOrganic(
  nodes: SizedNode[],
  edges: RelationshipDecl[],
  pad: number,
): Promise<Placement> {
  if (nodes.length === 0) {
    return { positions: new Map(), width: pad * 2, height: pad * 2 };
  }

  const ordered = nodes.slice().sort((a, b) => compareText(a.id, b.id));
  const elkEdges = edges
    .slice()
    .sort((a, b) =>
      compareText(edgeId(a.source, a.target, a.type), edgeId(b.source, b.target, b.type)),
    )
    .map((rel) => ({
      id: edgeId(rel.source, rel.target, rel.type),
      sources: [rel.source],
      targets: [rel.target],
    }));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "force",
      "elk.randomSeed": ORGANIC_RANDOM_SEED,
      "elk.force.model": "FRUCHTERMAN_REINGOLD",
      "elk.force.iterations": "300",
      "elk.spacing.nodeNode": String(ORGANIC_NODE_SPACING),
      "elk.separateConnectedComponents": "true",
      "elk.aspectRatio": "1.6",
      "elk.padding": `[top=${pad},left=${pad},bottom=${pad},right=${pad}]`,
    },
    children: ordered.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
    })),
  };
  if (elkEdges.length > 0) {
    graph.edges = elkEdges;
  }
  const laidOut = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of laidOut.children ?? []) {
    positions.set(child.id, {
      x: child.x ?? 0,
      y: child.y ?? 0,
    });
  }
  for (const node of ordered) {
    if (!positions.has(node.id)) {
      throw new Error(`organic layout missing position for '${node.id}'`);
    }
  }
  return packOrganic(ordered, positions, pad, laidOut.width ?? 0, laidOut.height ?? 0);
}

type OrganicBox = { id: string; x: number; y: number; width: number; height: number };

/**
 * Scale a seeded force layout when its canvas is sparse compared with the
 * boxes on it, then push any stacked pair back to `ORGANIC_PACK_GAP`.
 * Pair order is by id, so the pack is deterministic. A layout already inside
 * `ORGANIC_PACK_RATIO` keeps the rounded ELK coordinates.
 */
function packOrganic(
  nodes: SizedNode[],
  positions: Map<string, { x: number; y: number }>,
  pad: number,
  elkWidth: number,
  elkHeight: number,
): Placement {
  const boxes: OrganicBox[] = nodes.map((node) => {
    const pos = positions.get(node.id)!;
    return { id: node.id, x: pos.x, y: pos.y, width: node.width, height: node.height };
  });
  const ratio = boxes.length >= 2 ? organicCanvasRatio(boxes) : 1;
  if (boxes.length < 2 || ratio <= ORGANIC_PACK_RATIO) {
    const rounded = new Map<string, { x: number; y: number }>();
    for (const box of boxes) {
      rounded.set(box.id, { x: roundCoord(box.x), y: roundCoord(box.y) });
    }
    return {
      positions: rounded,
      width: Math.max(roundCoord(elkWidth), pad * 2),
      height: Math.max(roundCoord(elkHeight), pad * 2),
    };
  }
  scaleOrganicAboutPad(boxes, pad, Math.sqrt(ORGANIC_PACK_RATIO / ratio));
  separateOrganicBoxes(boxes, ORGANIC_PACK_GAP);
  let minX = Infinity;
  let minY = Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  }
  const packed = new Map<string, { x: number; y: number }>();
  let maxX = 0;
  let maxY = 0;
  for (const box of boxes) {
    const x = roundCoord(box.x + pad - minX);
    const y = roundCoord(box.y + pad - minY);
    packed.set(box.id, { x, y });
    maxX = Math.max(maxX, x + box.width);
    maxY = Math.max(maxY, y + box.height);
  }
  return {
    positions: packed,
    width: Math.max(roundCoord(maxX + pad), pad * 2),
    height: Math.max(roundCoord(maxY + pad), pad * 2),
  };
}

/** Bounding box from the origin over the sum of box areas. Padding is included. */
function organicCanvasRatio(boxes: OrganicBox[]): number {
  let nodeArea = 0;
  let maxX = 0;
  let maxY = 0;
  for (const box of boxes) {
    nodeArea += box.width * box.height;
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (nodeArea <= 0) {
    return 1;
  }
  return (maxX * maxY) / nodeArea;
}

function scaleOrganicAboutPad(boxes: OrganicBox[], pad: number, scale: number): void {
  for (const box of boxes) {
    const cx = pad + (box.x + box.width / 2 - pad) * scale;
    const cy = pad + (box.y + box.height / 2 - pad) * scale;
    box.x = cx - box.width / 2;
    box.y = cy - box.height / 2;
  }
}

/** Gap between two boxes. Negative when they overlap. */
function organicBoxGap(a: OrganicBox, b: OrganicBox): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX > 0 && overlapY > 0) {
    return -Math.min(overlapX, overlapY);
  }
  const gapX = overlapX > 0 ? 0 : -overlapX;
  const gapY = overlapY > 0 ? 0 : -overlapY;
  return Math.hypot(gapX, gapY);
}

function separateOrganicBoxes(boxes: OrganicBox[], target: number): void {
  const ordered = boxes.slice().sort((a, b) => compareText(a.id, b.id));
  for (let pass = 0; pass < 16; pass += 1) {
    let moved = false;
    for (let left = 0; left < ordered.length; left += 1) {
      for (let right = left + 1; right < ordered.length; right += 1) {
        const a = ordered[left]!;
        const b = ordered[right]!;
        const gap = organicBoxGap(a, b);
        if (gap >= target) {
          continue;
        }
        const ax = a.x + a.width / 2;
        const ay = a.y + a.height / 2;
        const bx = b.x + b.width / 2;
        const by = b.y + b.height / 2;
        let dx = bx - ax;
        let dy = by - ay;
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) {
          dx = 1;
          dy = 0;
        } else {
          dx /= length;
          dy /= length;
        }
        const push = (target - gap) / 2 + 0.01;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
}

function placeGrid(
  nodes: SizedNode[],
  direction: LayoutDirection,
  order: GridOrder,
  leftoverIds: Set<string>,
  pad: number,
): Placement {
  if (nodes.length === 0) {
    return { positions: new Map(), width: pad * 2, height: pad * 2 };
  }
  const linked = nodes.filter((node) => !leftoverIds.has(node.id));
  const loose = nodes.filter((node) => leftoverIds.has(node.id));
  const blocks: PackedLayout[] = [];
  if (linked.length > 0) {
    blocks.push(placementToPacked(linked, packCatalog(linked, direction, order)));
  }
  if (loose.length > 0) {
    blocks.push(placementToPacked(loose, packCatalog(loose, direction, order)));
  }
  const stacked = stackBandLayouts(direction, blocks);
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of stacked.nodes) {
    positions.set(node.id, { x: node.x + pad, y: node.y + pad });
  }
  return {
    positions,
    width: stacked.width + pad * 2,
    height: stacked.height + pad * 2,
  };
}

function packCatalog(nodes: SizedNode[], direction: LayoutDirection, order: GridOrder): Placement {
  const vertical = direction === "tb" || direction === "bt";
  let strips = order === "name" ? nameStrips(nodes, vertical) : kindStrips(nodes);
  if (direction === "bt" || direction === "rl") {
    strips = strips.slice().reverse();
  }
  return packStrips(strips, vertical ? "row" : "column");
}

function kindStrips(nodes: SizedNode[]): SizedNode[][] {
  const groups = new Map<string, SizedNode[]>();
  for (const node of nodes) {
    const key = toKebabCaseKeyword(node.keyword);
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  return [...groups.keys()].sort(compareText).map((key) => groups.get(key)!.slice().sort(compareName));
}

function nameStrips(nodes: SizedNode[], rows: boolean): SizedNode[][] {
  const sorted = nodes.slice().sort(compareName);
  const span = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  if (rows) {
    const out: SizedNode[][] = [];
    for (let index = 0; index < sorted.length; index += span) {
      out.push(sorted.slice(index, index + span));
    }
    return out;
  }
  const rowCount = Math.max(1, Math.ceil(sorted.length / span));
  const columns: SizedNode[][] = Array.from({ length: span }, () => []);
  for (let index = 0; index < sorted.length; index += 1) {
    columns[Math.floor(index / rowCount)]!.push(sorted[index]!);
  }
  return columns.filter((column) => column.length > 0);
}

function packStrips(strips: SizedNode[][], along: "row" | "column"): Placement {
  const positions = new Map<string, { x: number; y: number }>();
  if (along === "row") {
    let y = 0;
    let width = 0;
    for (let stripIndex = 0; stripIndex < strips.length; stripIndex += 1) {
      const strip = strips[stripIndex]!;
      let x = 0;
      let rowHeight = 0;
      for (let index = 0; index < strip.length; index += 1) {
        const node = strip[index]!;
        positions.set(node.id, { x, y });
        rowHeight = Math.max(rowHeight, node.height);
        x += node.width;
        if (index < strip.length - 1) {
          x += LANE_GAP;
        }
      }
      width = Math.max(width, x);
      y += rowHeight;
      if (stripIndex < strips.length - 1) {
        y += LANE_GAP;
      }
    }
    return { positions, width, height: y };
  }

  let x = 0;
  let height = 0;
  for (let stripIndex = 0; stripIndex < strips.length; stripIndex += 1) {
    const strip = strips[stripIndex]!;
    let y = 0;
    let columnWidth = 0;
    for (let index = 0; index < strip.length; index += 1) {
      const node = strip[index]!;
      positions.set(node.id, { x, y });
      columnWidth = Math.max(columnWidth, node.width);
      y += node.height;
      if (index < strip.length - 1) {
        y += LANE_GAP;
      }
    }
    height = Math.max(height, y);
    x += columnWidth;
    if (stripIndex < strips.length - 1) {
      x += LANE_GAP;
    }
  }
  return { positions, width: x, height };
}

function placementToPacked(nodes: SizedNode[], placement: Placement): PackedLayout {
  return {
    width: placement.width,
    height: placement.height,
    edges: new Map(),
    nodes: nodes.map((node) => {
      const pos = placement.positions.get(node.id);
      if (!pos) {
        throw new Error(`grid layout missing position for '${node.id}'`);
      }
      return {
        id: node.id,
        label: node.label,
        keyword: node.keyword,
        x: pos.x,
        y: pos.y,
        width: node.width,
        height: node.height,
      };
    }),
  };
}

/**
 * A root is a disconnected leftover when neither it nor a descendant is an
 * endpoint of a non-nest relationship. Those roots are still packed.
 */
function leftoverRoots(
  rootIds: string[],
  relationships: RelationshipDecl[],
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
): Set<string> {
  const touched = new Set<string>();
  for (const rel of relationships) {
    if (NEST_TYPES.has(rel.type) && parentOf.get(rel.target) === rel.source) {
      continue;
    }
    touched.add(rel.source);
    touched.add(rel.target);
  }
  const leftovers = new Set<string>();
  for (const id of rootIds) {
    let linked = false;
    const walk = (nodeId: string): void => {
      if (touched.has(nodeId)) {
        linked = true;
      }
      for (const childId of nestForest.get(nodeId) ?? []) {
        walk(childId);
      }
    };
    walk(id);
    if (!linked) {
      leftovers.add(id);
    }
  }
  return leftovers;
}

function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function compareName(a: { label: string; id: string }, b: { label: string; id: string }): number {
  const byLabel = compareText(a.label, b.label);
  if (byLabel !== 0) {
    return byLabel;
  }
  return compareText(a.id, b.id);
}

/**
 * Place nodes from saved coordinates. Does not call ELK or the organic/grid
 * packers, so a later model edit cannot reflow boxes that already have a position.
 * Session positions win over file `position` clauses for the same id.
 * Missing positions stack in declaration order to the right of the placed set.
 */
function layoutManual(
  elements: ElementDecl[],
  nesting: NestingMode,
  nestForest: Map<string, string[]>,
  filePositions: Array<{ id: string; x: number; y: number }>,
  sessionPositions: ManualPosition[],
): PackedLayout {
  if (elements.length === 0) {
    return {
      nodes: [],
      edges: new Map(),
      width: PADDING * 2 + NODE_WIDTH,
      height: PADDING * 2 + NODE_HEIGHT,
    };
  }

  const coords = new Map<string, ManualPosition>();
  for (const position of filePositions) {
    coords.set(position.id, {
      id: position.id,
      x: position.x,
      y: position.y,
    });
  }
  for (const position of sessionPositions) {
    coords.set(position.id, {
      id: position.id,
      x: position.x,
      y: position.y,
      ...(position.width !== undefined ? { width: position.width } : {}),
      ...(position.height !== undefined ? { height: position.height } : {}),
    });
  }

  const parentOf = nesting === "nested" ? invertForest(nestForest) : new Map<string, string>();
  const nodes: LayoutNode[] = elements.map((element) => {
    const known = coords.get(element.id);
    const childIds = nesting === "nested" ? (nestForest.get(element.id) ?? []) : [];
    const parentId = parentOf.get(element.id);
    const box = fitLeafBox(element.label);
    const minHeight =
      childIds.length > 0 ? containerHeaderHeight(element.label) : box.height;
    return {
      id: element.id,
      label: element.label,
      keyword: element.keyword,
      x: known?.x ?? 0,
      y: known?.y ?? 0,
      width: Math.max(known?.width ?? box.width, box.width),
      height: Math.max(known?.height ?? minHeight, minHeight),
      ...(parentId ? { parentId } : {}),
      ...(childIds.length > 0 ? { container: true } : {}),
    };
  });

  const missing = nodes.filter((node) => !coords.has(node.id));
  if (missing.length > 0) {
    const placed = nodes.filter((node) => coords.has(node.id));
    const anchorX =
      placed.length === 0 ? PADDING : Math.max(...placed.map((node) => node.x + node.width)) + RANK_GAP;
    let cursorY = PADDING;
    for (const node of missing) {
      node.x = anchorX;
      node.y = cursorY;
      cursorY += node.height + LANE_GAP;
    }
  }

  if (nesting === "nested") {
    expandManualContainers(nodes, nestForest);
  }

  const width = Math.max(PADDING * 2 + NODE_WIDTH, ...nodes.map((node) => node.x + node.width + PADDING));
  const height = Math.max(
    PADDING * 2 + NODE_HEIGHT,
    ...nodes.map((node) => node.y + node.height + PADDING),
  );
  return {
    nodes,
    edges: new Map(),
    width,
    height,
  };
}

/** Grow a nested parent so it still covers its children. Declared top-lefts stay put. */
function expandManualContainers(nodes: LayoutNode[], nestForest: Map<string, string[]>): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const walk = (id: string): void => {
    const childIds = nestForest.get(id) ?? [];
    for (const childId of childIds) {
      walk(childId);
    }
    if (childIds.length === 0) {
      return;
    }
    const parent = byId.get(id);
    if (!parent) {
      return;
    }
    let maxX = parent.x + parent.width;
    const header = containerHeaderHeight(parent.label);
    let maxY = parent.y + Math.max(parent.height, header + NEST_PAD);
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) {
        continue;
      }
      maxX = Math.max(maxX, child.x + child.width + NEST_PAD);
      maxY = Math.max(maxY, child.y + child.height + NEST_PAD);
    }
    parent.width = roundCoord(Math.max(parent.width, maxX - parent.x));
    parent.height = roundCoord(Math.max(parent.height, maxY - parent.y));
    parent.container = true;
  };
  for (const node of nodes) {
    if (!node.parentId) {
      walk(node.id);
    }
  }
}

async function layoutWithElk(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  routing: EdgeRouting,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
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
  const graph = buildElkGraph(elements, relationships, direction, routing, nestForest, parentOf);
  const laidOut = await elk.layout(graph);
  return flattenElkLayout(laidOut, byId, nestForest, parentOf);
}

/**
 * Rank root nodes into ArchiMate aspect bands, lay each band out with ELK
 * Layered, then stack the bands. A single ELK `partitioning` graph is not used:
 * serving/realization arrows that point against the aspect order (the usual
 * ArchiMate direction) would otherwise collapse or reverse the stack, and
 * nested containers plus reverse model order can NPE inside elkjs.
 */
async function layoutLayerBands(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  routing: EdgeRouting,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
): Promise<PackedLayout> {
  if (elements.length === 0) {
    return layoutWithElk(elements, relationships, direction, routing, nestForest, parentOf);
  }

  const byId = new Map(elements.map((element) => [element.id, element]));
  const rootIds = elements.filter((element) => !parentOf.has(element.id)).map((element) => element.id);
  const bandOf = new Map<string, LayerBand>();
  for (const id of rootIds) {
    bandOf.set(id, resolveRootLayerBand(id, byId, nestForest));
  }
  const present = LAYER_BANDS.filter((band) => rootIds.some((id) => bandOf.get(id) === band));

  const bandLayouts: PackedLayout[] = [];
  for (const band of present) {
    const bandRoots = rootIds.filter((id) => bandOf.get(id) === band);
    const bandIds = new Set<string>();
    for (const rootId of bandRoots) {
      collectSubtreeIds(rootId, nestForest, bandIds);
    }
    const bandForest = filterForest(nestForest, bandIds);
    const bandParentOf = invertForest(bandForest);
    const bandMembers = elements.filter((element) => bandIds.has(element.id));
    const bandElements = orderElementsForBand(bandRoots, bandMembers, bandForest);
    const bandRels = relationships.filter(
      (rel) => bandIds.has(rel.source) && bandIds.has(rel.target),
    );
    bandLayouts.push(
      await layoutWithElk(bandElements, bandRels, direction, routing, bandForest, bandParentOf),
    );
  }

  const stacked = stackBandLayouts(direction, bandLayouts);
  attachInterBandEdges(stacked, elements, relationships, direction, routing, parentOf);
  return stacked;
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

function elkEdgeRouting(routing: EdgeRouting): "ORTHOGONAL" | "POLYLINE" {
  return routing === "polyline" ? "POLYLINE" : "ORTHOGONAL";
}

function buildElkGraph(
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  routing: EdgeRouting,
  nestForest: Map<string, string[]>,
  parentOf: Map<string, string>,
): ElkNode {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const rootIds = elements.filter((element) => !parentOf.has(element.id)).map((element) => element.id);
  const idSet = new Set(elements.map((element) => element.id));
  const edges: ElkExtendedEdge[] = relationships
    .filter((rel) => {
      if (NEST_TYPES.has(rel.type) && parentOf.get(rel.target) === rel.source) {
        return false;
      }
      return idSet.has(rel.source) && idSet.has(rel.target);
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
      "elk.edgeRouting": elkEdgeRouting(routing),
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": `[top=${PADDING},left=${PADDING},bottom=${PADDING},right=${PADDING}]`,
      "elk.spacing.nodeNode": String(LANE_GAP),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(RANK_GAP),
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
      "elk.separateConnectedComponents": "false",
      "elk.randomSeed": "1",
    },
    children: rootIds.map((id) => buildElkSubtree(id, nestForest, byId)),
  };
  if (edges.length > 0) {
    graph.edges = edges;
  }
  return graph;
}

function buildElkSubtree(
  id: string,
  nestForest: Map<string, string[]>,
  byId: Map<string, ElementDecl>,
): ElkNode {
  const label = byId.get(id)?.label ?? "";
  const childIds = nestForest.get(id) ?? [];
  const box = fitLeafBox(label);
  if (childIds.length === 0) {
    return {
      id,
      width: box.width,
      height: box.height,
    };
  }
  const header = containerHeaderHeight(label);
  const node: ElkNode = {
    id,
    layoutOptions: {
      "elk.padding": `[top=${header},left=${NEST_PAD},bottom=${NEST_PAD},right=${NEST_PAD}]`,
    },
    children: childIds.map((childId) => buildElkSubtree(childId, nestForest, byId)),
  };
  if (box.width > NODE_WIDTH) {
    node.width = box.width;
    node.layoutOptions = {
      ...node.layoutOptions,
      "elk.nodeSize.constraints": "MINIMUM_SIZE",
    };
  }
  return node;
}

function collectSubtreeIds(id: string, nestForest: Map<string, string[]>, into: Set<string>): void {
  into.add(id);
  for (const childId of nestForest.get(id) ?? []) {
    collectSubtreeIds(childId, nestForest, into);
  }
}

function filterForest(forest: Map<string, string[]>, ids: Set<string>): Map<string, string[]> {
  const next: Map<string, string[]> = new Map();
  for (const [parent, kids] of forest) {
    if (!ids.has(parent)) {
      continue;
    }
    const kept = kids.filter((kid) => ids.has(kid));
    if (kept.length > 0) {
      next.set(parent, kept);
    }
  }
  return next;
}

/**
 * Kind-then-declaration order so disconnected nodes in a band form deterministic
 * type rows (business-actor before business-process, and so on).
 */
function orderElementsForBand(
  rootIds: string[],
  elements: ElementDecl[],
  nestForest: Map<string, string[]>,
): ElementDecl[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const sortedRoots = rootIds.slice().sort((left, right) => {
    const a = byId.get(left);
    const b = byId.get(right);
    const kind = (a?.keyword ?? "").localeCompare(b?.keyword ?? "");
    if (kind !== 0) {
      return kind;
    }
    return (a?.line ?? 0) - (b?.line ?? 0);
  });
  const seen = new Set<string>();
  const ordered: ElementDecl[] = [];
  const walk = (id: string): void => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    const element = byId.get(id);
    if (element) {
      ordered.push(element);
    }
    for (const childId of nestForest.get(id) ?? []) {
      walk(childId);
    }
  };
  for (const id of sortedRoots) {
    walk(id);
  }
  for (const element of elements) {
    if (!seen.has(element.id)) {
      ordered.push(element);
    }
  }
  return ordered;
}

function stackBandLayouts(direction: LayoutDirection, bands: PackedLayout[]): PackedLayout {
  if (bands.length === 0) {
    return {
      nodes: [],
      edges: new Map(),
      width: PADDING * 2 + NODE_WIDTH,
      height: PADDING * 2 + NODE_HEIGHT,
    };
  }
  if (bands.length === 1) {
    return bands[0]!;
  }

  const vertical = direction === "tb" || direction === "bt";
  const sizes = bands.map((band) => (vertical ? band.height : band.width));
  const crosses = bands.map((band) => (vertical ? band.width : band.height));
  const totalMain = sizes.reduce((sum, size) => sum + size, 0) + BAND_GAP * (bands.length - 1);
  const maxCross = Math.max(...crosses);
  const offsets: number[] = [];
  if (direction === "tb" || direction === "lr") {
    let pos = 0;
    for (const size of sizes) {
      offsets.push(pos);
      pos += size + BAND_GAP;
    }
  } else {
    let pos = totalMain;
    for (const size of sizes) {
      pos -= size;
      offsets.push(pos);
      pos -= BAND_GAP;
    }
  }

  const nodes: LayoutNode[] = [];
  const edges = new Map<string, { x1: number; y1: number; x2: number; y2: number; points: ElkPoint[] }>();
  for (let index = 0; index < bands.length; index += 1) {
    const dx = vertical ? Math.round((maxCross - crosses[index]!) / 2) : offsets[index]!;
    const dy = vertical ? offsets[index]! : Math.round((maxCross - crosses[index]!) / 2);
    for (const node of bands[index]!.nodes) {
      nodes.push({ ...node, x: node.x + dx, y: node.y + dy });
    }
    for (const [id, edge] of bands[index]!.edges) {
      edges.set(id, {
        x1: edge.x1 + dx,
        y1: edge.y1 + dy,
        x2: edge.x2 + dx,
        y2: edge.y2 + dy,
        points: edge.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      });
    }
  }

  return {
    nodes,
    edges,
    width: vertical ? maxCross : totalMain,
    height: vertical ? totalMain : maxCross,
  };
}

function attachInterBandEdges(
  packed: PackedLayout,
  elements: ElementDecl[],
  relationships: RelationshipDecl[],
  direction: LayoutDirection,
  routing: EdgeRouting,
  parentOf: Map<string, string>,
): void {
  const nodeById = new Map(packed.nodes.map((node) => [node.id, node]));
  const present = new Set(elements.map((element) => element.id));
  for (const rel of relationships) {
    if (!present.has(rel.source) || !present.has(rel.target)) {
      continue;
    }
    const id = edgeId(rel.source, rel.target, rel.type);
    if (packed.edges.has(id)) {
      continue;
    }
    if (NEST_TYPES.has(rel.type) && parentOf.get(rel.target) === rel.source) {
      continue;
    }
    const source = nodeById.get(rel.source);
    const target = nodeById.get(rel.target);
    if (!source || !target) {
      continue;
    }
    packed.edges.set(
      id,
      routing === "orthogonal"
        ? orthogonalBetween(source, target, direction)
        : straightBetween(source, target),
    );
  }
}

function nodeCenter(node: LayoutNode): ElkPoint {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

/** Straight center-line clipped to the two box borders (polyline inter-band edges). */
function straightBetween(
  source: LayoutNode,
  target: LayoutNode,
): { x1: number; y1: number; x2: number; y2: number; points: ElkPoint[] } {
  const start = borderPoint(source, nodeCenter(target));
  const end = borderPoint(target, nodeCenter(source));
  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    points: [start, end],
  };
}

function borderPoint(node: LayoutNode, toward: ElkPoint): ElkPoint {
  const center = nodeCenter(node);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) {
    return { x: roundCoord(center.x), y: roundCoord(center.y) };
  }
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : node.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : node.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return {
    x: roundCoord(center.x + dx * scale),
    y: roundCoord(center.y + dy * scale),
  };
}

function orthogonalBetween(
  source: LayoutNode,
  target: LayoutNode,
  direction: LayoutDirection,
): { x1: number; y1: number; x2: number; y2: number; points: ElkPoint[] } {
  const start = nodeCenter(source);
  const end = nodeCenter(target);
  const points: ElkPoint[] =
    direction === "tb" || direction === "bt"
      ? [
          start,
          { x: start.x, y: roundCoord((start.y + end.y) / 2) },
          { x: end.x, y: roundCoord((start.y + end.y) / 2) },
          end,
        ]
      : [
          start,
          { x: roundCoord((start.x + end.x) / 2), y: start.y },
          { x: roundCoord((start.x + end.x) / 2), y: end.y },
          end,
        ];
  return {
    x1: points[0]!.x,
    y1: points[0]!.y,
    x2: points[points.length - 1]!.x,
    y2: points[points.length - 1]!.y,
    points,
  };
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
