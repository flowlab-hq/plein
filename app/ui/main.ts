import {
  filterModel,
  firstNamedView,
  formatLoadError,
  loadPleinSource,
  reloadPleinSource,
  viewAfterReload,
  type LoadResult,
} from "../../src/list-model.ts";
import {
  browseNamedView,
  currentViewCaption,
  viewSwitcherLabel,
} from "../../src/browser.ts";
import { elementStyle } from "../../src/archimate-style.ts";
import {
  contentBounds,
  edgeId,
  EDGE_ROUTINGS,
  isAutoLayoutEnabled,
  LAYOUT_DIRECTIONS,
  LAYOUT_MODES,
  NODE_HEIGHT,
  NODE_WIDTH,
  PADDING,
  renderViewpointSvg,
  edgeRoutingTitle,
  layoutDirectionTitle,
  layoutModeLabel,
  layoutModeTitle,
  type EdgeRouting,
  type LayoutDirection,
  type LayoutMode,
  type LayoutOptions,
  type ManualPosition,
  type NestingMode,
  type ViewpointLayout,
} from "../../src/layout.ts";
import {
  nextSelectionFromClick,
  normalizeMarquee,
  retainSelections,
  selectedElementIds,
  selectionFromDiagramHit,
  selectionFromMarquee,
  type DiagramSelection,
} from "../../src/selection.ts";
import {
  clampCanvasZoom,
  nextCanvasZoom,
  placeZoomAnchor,
  wheelGestureIsZoom,
} from "../../src/canvas-zoom.ts";
import { fitCanvasScroll, groupDragIds, manualDragShift } from "../../src/manual-drag.ts";
import {
  ALIGN_SNAP_RELEASE_SCREEN_PX,
  ALIGN_SNAP_SCREEN_PX,
  alignDraggedBox,
  userSnapDistance,
  type AlignGuide,
  type AlignLock,
  type GridSnapFn,
} from "../../src/align-snap.ts";
import {
  CANVAS_GRID_SIZES,
  DEFAULT_CANVAS_GRID_SIZE,
  DRAWN_CANVAS_GRID_PITCH,
  canvasGridLinePaths,
  modelSpaceFrame,
  seatLayoutOnGrid,
  snapProposedOrigin,
} from "../../src/canvas-grid.ts";
import {
  ExportError,
  exportSavePaths,
  exportViewpoint,
  isMacExportFormat,
  openExchangeSuggestedStem,
  type MacExportFormat,
} from "../../src/export.ts";
import {
  exportOpenExchange,
  formatImportReport,
  importOpenExchange,
} from "../../src/open-exchange.ts";

type TauriBridge = {
  core: {
    invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
  event: {
    listen: (event: string, handler: (event: { payload: unknown }) => void) => Promise<unknown>;
  };
};

type OpenedFile = {
  path: string;
  contents: string;
};

const openButton = document.querySelector("#open-button") as HTMLButtonElement;
const importButton = document.querySelector("#import-button") as HTMLButtonElement;
const reloadButton = document.querySelector("#reload-button") as HTMLButtonElement;
const exportButton = document.querySelector("#export-button") as HTMLButtonElement;
const fileInput = document.querySelector("#file-input") as HTMLInputElement;
const importInput = document.querySelector("#import-input") as HTMLInputElement;
const fileLabel = document.querySelector("#file-label") as HTMLElement;
const errorBox = document.querySelector("#error") as HTMLElement;
const errorLead = document.querySelector("#error-lead") as HTMLElement;
const errorDetail = document.querySelector("#error-detail") as HTMLElement;
const importNoticeBox = document.querySelector("#import-notice") as HTMLElement;
const importNoticeDetail = document.querySelector("#import-notice-detail") as HTMLElement;
const exportDialog = document.querySelector("#export-dialog") as HTMLElement;
const exportDialogTitle = document.querySelector("#export-dialog-title") as HTMLElement;
const exportDialogDetail = document.querySelector("#export-dialog-detail") as HTMLElement;
const exportForm = document.querySelector("#export-form") as HTMLFormElement;
const exportFormatNote = document.querySelector("#export-format-note") as HTMLElement;
const exportCancel = document.querySelector("#export-cancel") as HTMLButtonElement;
const workspace = document.querySelector("#workspace") as HTMLElement;
const emptyHint = document.querySelector("#empty-hint") as HTMLElement;
const viewList = document.querySelector("#view-list") as HTMLElement;
const elementList = document.querySelector("#element-list") as HTMLElement;
const relationshipList = document.querySelector("#relationship-list") as HTMLElement;
const elementsHeading = document.querySelector("#elements-heading") as HTMLElement;
const relationshipHeading = document.querySelector("#relationship-heading") as HTMLElement;
const currentView = document.querySelector("#current-view") as HTMLElement;
const diagramHeading = document.querySelector("#diagram-heading") as HTMLElement;
const diagram = document.querySelector("#diagram") as HTMLElement;
const autoLayoutSwitcher = document.querySelector("#auto-layout-switcher") as HTMLElement;
const modeSwitcher = document.querySelector("#mode-switcher") as HTMLElement;
const directionSwitcher = document.querySelector("#direction-switcher") as HTMLElement;
const routingSwitcher = document.querySelector("#routing-switcher") as HTMLElement;
const nestingSwitcher = document.querySelector("#nesting-switcher") as HTMLElement;
const layoutOverflow = document.querySelector(".layout-overflow") as HTMLElement;
const layoutOptionsButton = document.querySelector("#layout-options") as HTMLButtonElement;
const layoutOptionsPanel = document.querySelector("#layout-options-panel") as HTMLElement;
const layoutOptionsSummary = document.querySelector("#layout-options-summary") as HTMLElement;
const canvasGridToggle = document.querySelector("#canvas-grid-toggle") as HTMLButtonElement;
const canvasGridSizeSwitcher = document.querySelector("#canvas-grid-size") as HTMLElement;

let loaded: LoadResult | null = null;
let selectedView: string | null = null;
let lastNamedView: string | null = null;
let lastSource: string | null = null;
/**
 * Diagram and left-list selection, in click order.
 * More than one element or relationship can be selected. Dragging a selected
 * element moves every selected element together.
 */
let selectedItems: DiagramSelection[] = [];
/** `file` follows the `.plein` nesting clause; nested/beside is local preview only. */
let nestingOverride: "file" | NestingMode = "file";
/** `file` follows the view’s `autoLayout`; tb/bt/lr/rl is local preview only. */
let directionOverride: "file" | LayoutDirection = "file";
/** `file` follows the view’s `autoLayout`; layered/layers/organic/grid is local preview only. */
let modeOverride: "file" | LayoutMode = "file";
/** `file` follows the view’s `autoLayout`; orthogonal/polyline is local preview only. */
let routingOverride: "file" | EdgeRouting = "file";
/**
 * `file` follows the view. `auto` recomputes with ELK. `off` freezes positions.
 * Not written back to the file. Survives Reload; cleared when another file is opened.
 */
let autoLayoutOverride: "file" | "auto" | "off" = "file";
/**
 * Canvas snap grid. Visibility only draws the lines. Snap stays on either
 * way: `gridSnapForDrag` is always passed to `alignDraggedBox`, which runs
 * grid snap first and then neighbour-align only within threshold.
 * `canvasGridSize` is snap spacing (Options, default 24). Drawn lines stay
 * on `DRAWN_CANVAS_GRID_PITCH` until the user zooms. Neither is written to the file.
 * `alignHold` keeps a top-left that neighbour-align pulled off the lattice.
 */
let canvasGridVisible = true;
let canvasGridSize: number = DEFAULT_CANVAS_GRID_SIZE;
const alignHold = new Set<string>();
/**
 * Frozen top-lefts per view, from turning auto-layout off or from dragging.
 * Survives Reload so a disabled view does not jump. Cleared when auto-layout
 * is turned back on for that view, or when a different file is opened.
 */
const manualPositions = new Map<string, Map<string, { x: number; y: number; width?: number; height?: number }>>();
/** Last diagram laid out, so a drag can move from the coordinates on screen. */
let lastLayout: ViewpointLayout | null = null;
/** Drop stale ELK results when the user switches views mid-layout. */
let renderSeq = 0;
/** Drop a slow Off-snapshot if the user picks File or On first. */
let autoSelectSeq = 0;
/**
 * Pointer drag of one node, or of every selected element, while auto-layout is off.
 * `id` is the node under the pointer. Snap follows that box; the rest of the
 * selection keeps its offset from it.
 */
type NodeDrag = {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  origins: Map<string, { x: number; y: number; width: number; height: number }>;
  /** CSS pixels per user unit, frozen at pointer-down so a growing viewBox does not feed back into the shift. */
  pixelsPerUserX: number;
  pixelsPerUserY: number;
  /** ViewBox origin and pane scroll when the gesture started. */
  baseOriginX: number;
  baseOriginY: number;
  baseScrollLeft: number;
  baseScrollTop: number;
  /** Centre/edge lock from the previous move, so nearby guides do not alternate. */
  alignLock: AlignLock;
};
let nodeDrag: NodeDrag | null = null;
/**
 * Empty-canvas drag that selects every element box it meets.
 * Shift-marquee unions with the selection captured at pointer-down.
 */
type MarqueeDrag = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startUserX: number;
  startUserY: number;
  additive: boolean;
  moved: boolean;
  baseSelection: DiagramSelection[];
};
let marqueeDrag: MarqueeDrag | null = null;
/** Last laid-out user size, so a zoomed canvas grows when a drag expands the content box. */
let contentUserWidth = 0;
let contentUserHeight = 0;
/**
 * Viewport scale for the SVG on screen. 1 is the laid-out size used on open.
 * Plain wheel pans (`overflow: auto`); ⌘/Ctrl+wheel changes this and keeps
 * the diagram point under the pointer. Reset when the file or named view changes.
 */
let canvasZoom = 1;
/** Named view `canvasZoom` applies to. A different view opens at 100%. */
let canvasZoomView: string | null = null;
/**
 * CSS pixel size of the SVG at zoom 1. Captured from the on-screen box
 * (including the pane’s min-height) so the first zoom does not collapse
 * that letterboxing and shove the point under the cursor.
 */
let zoomBasisWidth = 0;
let zoomBasisHeight = 0;
/** Shift used when zoom-out would otherwise scroll above the top-left. */
let canvasMarginLeft = 0;
let canvasMarginTop = 0;
/** Last format chosen in Export…. HTML matches `plein export`. */
let lastExportFormat: MacExportFormat = "html";
/** View caption shown in the sheet for HTML, SVG, and HTML and SVG. */
let exportViewCaption = "";

const LOAD_ERROR_LEAD = "This .plein did not load";
const IMPORT_ERROR_LEAD = "Could not import this Open Exchange file";
const EXPORT_ERROR_LEAD = "Could not export this view";
const OPEN_EXCHANGE_ERROR_LEAD = "Could not export Open Exchange";
/** Lead used the next time a load failure is shown. */
let bannerLead = LOAD_ERROR_LEAD;
/**
 * Open Exchange file this session was imported from. Reload re-runs
 * `importOpenExchange` on it. Cleared when a `.plein` file is opened.
 */
let openExchangeFile: string | null = null;
/** XML text from the browser file picker, which has no filesystem path. */
let openExchangeXml: string | null = null;
/** `formatImportReport` for the open import. Same notes as `plein import`. */
let importNotice: string | null = null;
const EXPORT_FORMAT_NOTES: Record<MacExportFormat, string> = {
  html: "A self-contained HTML page. It opens in a browser without Plein.",
  svg: "An SVG file. It opens in a browser or Preview without Plein.",
  both: "Saves two files from the name you choose: one .html and one .svg.",
  "open-exchange":
    "Open Exchange XML for the whole open model (not this view). Comments, geometry, and styles are omitted, same as plein export-open-exchange.",
};

function tauri(): TauriBridge | undefined {
  return (window as Window & { __TAURI__?: TauriBridge }).__TAURI__;
}

function isFilesystemPath(file: string): boolean {
  return file.includes("/") || file.includes("\\");
}

function showError(message: string | null, lead = LOAD_ERROR_LEAD): void {
  if (!message) {
    errorBox.hidden = true;
    errorLead.textContent = LOAD_ERROR_LEAD;
    errorDetail.textContent = "";
    return;
  }
  errorBox.hidden = false;
  errorLead.textContent = lead;
  errorDetail.textContent = message;
}

function showExportError(message: string): void {
  showError(message, EXPORT_ERROR_LEAD);
}

function showOpenExchangeError(message: string): void {
  showError(message, OPEN_EXCHANGE_ERROR_LEAD);
}

function showImportNotice(message: string | null): void {
  if (!message) {
    importNoticeBox.hidden = true;
    importNoticeDetail.textContent = "";
    return;
  }
  importNoticeBox.hidden = false;
  importNoticeDetail.textContent = message;
}

function forgetOpenExchange(): void {
  openExchangeFile = null;
  openExchangeXml = null;
  importNotice = null;
}

/** Open/read failures use the same banner as `checkPlein` / `plein check`. */
function failOpen(file: string, error: unknown): void {
  closeExportDialog(false);
  lastSource = null;
  loaded = { ok: false, file, error: formatLoadError(error) };
  selectedView = null;
  selectedItems = [];
  void render();
}

function setSelection(next: DiagramSelection | null): void {
  setSelections(next ? [next] : []);
}

function setSelections(next: readonly DiagramSelection[], options?: { scroll?: boolean }): void {
  selectedItems = next.map((item) => ({ kind: item.kind, id: item.id }));
  paintSelection(options);
}

function findByAttr(root: ParentNode, attr: string, value: string): Element | null {
  for (const node of root.querySelectorAll(`[${attr}]`)) {
    if (node.getAttribute(attr) === value) {
      return node;
    }
  }
  return null;
}

/**
 * Wide transparent stroke so relationship lines are clickable.
 * Visible strokes paint above element boxes (`pointer-events: none`). Hits
 * stay under those boxes, so a connector drawn across a box does not steal
 * the click or the drag.
 */
function enhanceEdgeHits(svg: SVGElement): void {
  const hits = edgeHitLayer(svg);
  for (const group of svg.querySelectorAll(":scope > g.edges [data-edge-id]")) {
    // Prefer the full shaft. The arrow lives on a terminal <line> and must not
    // be the only clickable piece.
    const id = group.getAttribute("data-edge-id");
    const stroke = group.querySelector("polyline, path, line");
    if (!id || !stroke || edgeHitExists(hits, id)) {
      continue;
    }
    const hit = stroke.cloneNode() as SVGElement;
    hit.removeAttribute("marker-end");
    hit.removeAttribute("marker-start");
    hit.removeAttribute("marker-mid");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "12");
    hit.setAttribute("pointer-events", "stroke");
    hit.classList.add("edge-hit");
    const wrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
    wrap.setAttribute("data-edge-hit-id", id);
    wrap.append(hit);
    hits.append(wrap);
  }
}

/** Hit targets sit under element boxes and above container chrome. */
function edgeHitLayer(svg: SVGElement): SVGGElement {
  const existing = svg.querySelector(":scope > g.edge-hits");
  if (existing instanceof SVGGElement) {
    return existing;
  }
  const hits = document.createElementNS("http://www.w3.org/2000/svg", "g");
  hits.setAttribute("class", "edge-hits");
  const anchor = svg.querySelector(":scope > g.nodes") ?? svg.querySelector(":scope > g.edges");
  if (anchor) {
    svg.insertBefore(hits, anchor);
  } else {
    svg.append(hits);
  }
  return hits;
}

function edgeHitExists(hits: ParentNode, id: string): boolean {
  for (const node of hits.querySelectorAll("[data-edge-hit-id]")) {
    if (node.getAttribute("data-edge-hit-id") === id) {
      return true;
    }
  }
  return false;
}

function paintListSelection(
  list: HTMLElement,
  attr: string,
  ids: ReadonlySet<string>,
  focusId: string | null,
  scroll: boolean,
): void {
  for (const row of list.querySelectorAll(`[${attr}]`)) {
    const rowId = row.getAttribute(attr);
    const on = rowId !== null && ids.has(rowId);
    row.classList.toggle("selected", on);
    row.setAttribute("aria-selected", on ? "true" : "false");
    if (scroll && on && rowId === focusId) {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
}

function paintSelection(options?: { scroll?: boolean }): void {
  const scroll = options?.scroll !== false;
  const elementIds = new Set(selectedElementIds(selectedItems));
  const relationshipIds = new Set(
    selectedItems.filter((item) => item.kind === "relationship").map((item) => item.id),
  );
  const focus = selectedItems[selectedItems.length - 1] ?? null;
  paintListSelection(
    elementList,
    "data-element-id",
    elementIds,
    focus?.kind === "element" ? focus.id : null,
    scroll,
  );
  paintListSelection(
    relationshipList,
    "data-relationship-id",
    relationshipIds,
    focus?.kind === "relationship" ? focus.id : null,
    scroll,
  );

  const svg = diagram.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) {
    return;
  }
  for (const marked of svg.querySelectorAll("[data-selected]")) {
    marked.removeAttribute("data-selected");
  }
  for (const item of selectedItems) {
    if (item.kind === "element") {
      const node = findByAttr(svg, "data-node-id", item.id);
      const container = findByAttr(svg, "data-container-id", item.id);
      node?.setAttribute("data-selected", "true");
      container?.setAttribute("data-selected", "true");
      if (scroll && focus?.kind === "element" && focus.id === item.id) {
        (node ?? container)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      continue;
    }
    const edge = findByAttr(svg, "data-edge-id", item.id);
    edge?.setAttribute("data-selected", "true");
    if (scroll && focus?.kind === "relationship" && focus.id === item.id) {
      edge?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  paintSelectionBounds(svg, { x: 0, y: 0 });
}

/** Dashed union of two or more selected element boxes. One box keeps its own stroke. */
function selectionBoundsRect(shift: { x: number; y: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!lastLayout) {
    return null;
  }
  const ids = new Set(selectedElementIds(selectedItems));
  if (ids.size < 2) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const node of lastLayout.nodes) {
    if (!ids.has(node.id)) {
      continue;
    }
    const origin = nodeDrag?.origins.get(node.id);
    const x = origin ? origin.x + shift.x : node.x;
    const y = origin ? origin.y + shift.y : node.y;
    const width = origin ? origin.width : node.width;
    const height = origin ? origin.height : node.height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    count += 1;
  }
  if (count < 2) {
    return null;
  }
  const pad = 8;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

function paintSelectionBounds(svg: SVGSVGElement, shift: { x: number; y: number }): void {
  const rect = selectionBoundsRect(shift);
  const existing = svg.querySelector(":scope > [data-selection-bounds]");
  if (!rect) {
    existing?.remove();
    return;
  }
  const layer =
    existing instanceof SVGGElement ? existing : document.createElementNS("http://www.w3.org/2000/svg", "g");
  if (!(existing instanceof SVGGElement)) {
    layer.setAttribute("data-selection-bounds", "true");
    layer.setAttribute("pointer-events", "none");
    layer.setAttribute("aria-hidden", "true");
  }
  svg.append(layer);
  let box = layer.querySelector("rect");
  if (!(box instanceof SVGRectElement)) {
    box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    layer.replaceChildren(box);
  }
  box.setAttribute("x", String(rect.x));
  box.setAttribute("y", String(rect.y));
  box.setAttribute("width", String(rect.width));
  box.setAttribute("height", String(rect.height));
  box.setAttribute("rx", "4");
}

function paintMarqueeRect(
  svg: SVGSVGElement,
  rect: { x: number; y: number; width: number; height: number },
): void {
  let box = svg.querySelector(":scope > rect.selection-marquee");
  if (!(box instanceof SVGRectElement)) {
    box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    box.setAttribute("class", "selection-marquee");
    box.setAttribute("pointer-events", "none");
    box.setAttribute("aria-hidden", "true");
  }
  svg.append(box);
  box.setAttribute("x", String(rect.x));
  box.setAttribute("y", String(rect.y));
  box.setAttribute("width", String(rect.width));
  box.setAttribute("height", String(rect.height));
}

function clearMarqueeRect(): void {
  diagram.querySelector("svg")?.querySelector(":scope > rect.selection-marquee")?.remove();
}

function namedViewForDiagram(): string | null {
  if (!loaded?.ok) {
    return null;
  }
  if (selectedView !== null) {
    return selectedView;
  }
  return lastNamedView ?? firstNamedView(loaded.model);
}

function currentViewDecl(viewName: string | null) {
  if (!loaded?.ok || !viewName) {
    return undefined;
  }
  return loaded.model.views.find((view) => view.name === viewName);
}

/** True when the diagram should run ELK. `force` is the toolbar choice being applied. */
function autoIsOn(viewName: string | null, force?: "auto" | "off"): boolean {
  if (force === "auto") {
    return true;
  }
  if (force === "off") {
    return false;
  }
  if (autoLayoutOverride === "auto") {
    return true;
  }
  if (autoLayoutOverride === "off") {
    return false;
  }
  return isAutoLayoutEnabled(currentViewDecl(viewName)?.autoLayout);
}

function previewLayoutOptions(force?: "auto" | "off"): LayoutOptions | undefined {
  const options: LayoutOptions = {};
  if (nestingOverride !== "file") {
    options.nesting = nestingOverride;
  }
  if (directionOverride !== "file") {
    options.direction = directionOverride;
  }
  if (modeOverride !== "file") {
    options.mode = modeOverride;
  }
  if (routingOverride !== "file") {
    options.routing = routingOverride;
  }
  const viewName = namedViewForDiagram();
  if (force === "auto" || (!force && autoLayoutOverride === "auto")) {
    options.autoLayout = "auto";
  } else if (force === "off" || (!force && autoLayoutOverride === "off")) {
    options.autoLayout = "off";
  }
  if (!autoIsOn(viewName, force) && viewName) {
    const session = manualPositions.get(viewName);
    if (session && session.size > 0) {
      options.autoLayout = "off";
      const positions: ManualPosition[] = [];
      for (const [id, point] of session) {
        positions.push({
          id,
          x: point.x,
          y: point.y,
          ...(point.width !== undefined ? { width: point.width } : {}),
          ...(point.height !== undefined ? { height: point.height } : {}),
        });
      }
      options.manualPositions = positions;
    }
  }
  return options.nesting ||
    options.direction ||
    options.mode ||
    options.routing ||
    options.autoLayout ||
    options.manualPositions
    ? options
    : undefined;
}

/**
 * Turning auto-layout off snapshots the current ELK placement so reload
 * restores those coordinates. Turning it back on (File or On) drops the
 * snapshot and the next render recomputes from the model.
 */
async function selectAutoLayout(next: "file" | "auto" | "off"): Promise<void> {
  const seq = ++autoSelectSeq;
  const viewName = namedViewForDiagram();
  if (next === "auto" && viewName) {
    manualPositions.delete(viewName);
  } else if (next === "file" && autoLayoutOverride !== "file" && viewName) {
    manualPositions.delete(viewName);
  }
  if (next === "off" && viewName && loaded?.ok && autoIsOn(viewName)) {
    try {
      const browsed = await browseNamedView(loaded.model, viewName, previewLayoutOptions("auto"));
      if (seq !== autoSelectSeq) {
        return;
      }
      const map = new Map<string, { x: number; y: number; width?: number; height?: number }>();
      for (const node of browsed.layout.nodes) {
        map.set(node.id, { x: node.x, y: node.y, width: node.width, height: node.height });
      }
      manualPositions.set(viewName, map);
    } catch {
      // File positions or the stable fallback column still apply.
    }
  }
  if (seq !== autoSelectSeq) {
    return;
  }
  autoLayoutOverride = next;
  void render();
}

function radioButton(
  checked: boolean,
  label: string,
  title: string,
  onSelect: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "radio");
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-checked", checked ? "true" : "false");
  button.addEventListener("click", onSelect);
  return button;
}

function renderAutoLayoutSwitcher(): void {
  const choices: Array<{ id: "file" | "auto" | "off"; label: string; title: string }> = [
    {
      id: "file",
      label: "File",
      title: "Follow autoLayout in the open view. off or manual keeps position clauses; anything else is automatic.",
    },
    {
      id: "auto",
      label: "On",
      title: "Recompute placement from the model. Saved positions are ignored.",
    },
    {
      id: "off",
      label: "Off",
      title: "Freeze element positions. They stay put across Reload until you turn auto-layout back on.",
    },
  ];
  autoLayoutSwitcher.replaceChildren(
    ...choices.map((choice) =>
      radioButton(choice.id === autoLayoutOverride, choice.label, choice.title, () => {
        void selectAutoLayout(choice.id);
      }),
    ),
  );
}

function renderModeSwitcher(): void {
  const choices: Array<{ id: "file" | LayoutMode; label: string; title: string }> = [
    { id: "file", label: "File", title: "Use autoLayout from the open view" },
    ...LAYOUT_MODES.map((mode) => ({
      id: mode,
      label: layoutModeLabel(mode),
      title: layoutModeTitle(mode),
    })),
  ];
  modeSwitcher.replaceChildren(
    ...choices.map((choice) =>
      radioButton(choice.id === modeOverride, choice.label, choice.title, () => {
        modeOverride = choice.id;
        void render();
      }),
    ),
  );
}

function renderDirectionSwitcher(): void {
  const choices: Array<{ id: "file" | LayoutDirection; label: string; title: string }> = [
    { id: "file", label: "File", title: "Use autoLayout from the open view" },
    ...LAYOUT_DIRECTIONS.map((direction) => ({
      id: direction,
      label: direction.toUpperCase(),
      title: layoutDirectionTitle(direction),
    })),
  ];
  directionSwitcher.replaceChildren(
    ...choices.map((choice) =>
      radioButton(choice.id === directionOverride, choice.label, choice.title, () => {
        directionOverride = choice.id;
        void render();
      }),
    ),
  );
}

function renderRoutingSwitcher(): void {
  const choices: Array<{ id: "file" | EdgeRouting; label: string; title: string }> = [
    { id: "file", label: "File", title: "Use autoLayout routing from the open view" },
    ...EDGE_ROUTINGS.map((routing) => ({
      id: routing,
      label: routing === "orthogonal" ? "Orthogonal" : "Polyline",
      title: edgeRoutingTitle(routing),
    })),
  ];
  routingSwitcher.replaceChildren(
    ...choices.map((choice) =>
      radioButton(choice.id === routingOverride, choice.label, choice.title, () => {
        routingOverride = choice.id;
        void render();
      }),
    ),
  );
}

function renderNestingSwitcher(): void {
  const choices: Array<{ id: "file" | NestingMode; label: string }> = [
    { id: "file", label: "File default" },
    { id: "nested", label: "Nested" },
    { id: "beside", label: "Beside" },
  ];
  nestingSwitcher.replaceChildren(
    ...choices.map((choice) =>
      radioButton(
        choice.id === nestingOverride,
        choice.label,
        choice.id === "file"
          ? "Use nesting from the open view"
          : `${choice.label} preview — not written back to the file`,
        () => {
          nestingOverride = choice.id;
          void render();
        },
      ),
    ),
  );
}

/** Direction, routing, nesting, and a non-default grid size stay in Options. */
function secondaryLayoutSummary(): string {
  const parts: string[] = [];
  if (directionOverride !== "file") {
    parts.push(directionOverride.toUpperCase());
  }
  if (routingOverride !== "file") {
    parts.push(routingOverride === "orthogonal" ? "Orthogonal" : "Polyline");
  }
  if (nestingOverride !== "file") {
    parts.push(nestingOverride === "nested" ? "Nested" : "Beside");
  }
  if (canvasGridSize !== DEFAULT_CANVAS_GRID_SIZE) {
    parts.push(`Grid ${canvasGridSize}`);
  }
  return parts.join(" · ");
}

function layoutOptionsOpen(): boolean {
  return layoutOptionsButton.getAttribute("aria-expanded") === "true";
}

function setLayoutOptionsOpen(open: boolean): void {
  layoutOptionsButton.setAttribute("aria-expanded", open ? "true" : "false");
  layoutOptionsPanel.hidden = !open;
}

function syncLayoutOptionsButton(): void {
  const summary = secondaryLayoutSummary();
  layoutOptionsSummary.textContent = summary;
  layoutOptionsSummary.hidden = summary.length === 0;
  layoutOptionsButton.classList.toggle("is-active", summary.length > 0);
  const detail =
    summary.length > 0
      ? `Options. Direction, routing, nesting, and grid size. Current preview: ${summary}.`
      : "Options. Direction, routing, nesting, and grid size. File follows the open view.";
  layoutOptionsButton.setAttribute("aria-label", detail);
  layoutOptionsButton.title =
    summary.length > 0
      ? `Direction, routing, nesting, and grid size (${summary}). Local preview only.`
      : "Direction, routing, nesting, and grid size. Local preview only — not written back to the file.";
}

function syncCanvasGridToggle(): void {
  canvasGridToggle.setAttribute("aria-pressed", canvasGridVisible ? "true" : "false");
  canvasGridToggle.setAttribute("aria-label", canvasGridVisible ? "Hide canvas grid" : "Show canvas grid");
  canvasGridToggle.title = canvasGridVisible
    ? "Hide the snap grid. Hiding the lines does not turn snap off."
    : "Show the snap grid. Snap stays on while the lines are hidden.";
}

function renderCanvasGridSizeSwitcher(): void {
  canvasGridSizeSwitcher.replaceChildren(
    ...CANVAS_GRID_SIZES.map((size) =>
      radioButton(
        size === canvasGridSize,
        String(size),
        size === DEFAULT_CANVAS_GRID_SIZE
          ? `${size} snap spacing (default). The drawn lines stay the same until you zoom. Dragged boxes snap to this spacing even when the grid is hidden.`
          : `${size} snap spacing. The drawn lines stay the same until you zoom. Dragged boxes snap to this spacing even when the grid is hidden.`,
        () => {
          canvasGridSize = size;
          alignHold.clear();
          renderCanvasGridSizeSwitcher();
          syncLayoutOptionsButton();
          void render();
        },
      ),
    ),
  );
}

function rememberModelContent(
  svg: SVGSVGElement,
  bounds: { x: number; y: number; width: number; height: number },
): void {
  svg.dataset.modelX = String(bounds.x);
  svg.dataset.modelY = String(bounds.y);
  svg.dataset.modelWidth = String(bounds.width);
  svg.dataset.modelHeight = String(bounds.height);
}

function readModelContent(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const x = Number(svg.dataset.modelX);
  const y = Number(svg.dataset.modelY);
  const width = Number(svg.dataset.modelWidth);
  const height = Number(svg.dataset.modelHeight);
  if ([x, y, width, height].every((value) => Number.isFinite(value)) && width > 0 && height > 0) {
    return { x, y, width, height };
  }
  const box = svg.viewBox.baseVal;
  return {
    x: box.width > 0 ? box.x : 0,
    y: box.height > 0 ? box.y : 0,
    width: box.width > 0 ? box.width : Number(svg.getAttribute("width")) || 0,
    height: box.height > 0 ? box.height : Number(svg.getAttribute("height")) || 0,
  };
}

function modelScale(): { x: number; y: number } {
  if (nodeDrag) {
    return { x: nodeDrag.pixelsPerUserX, y: nodeDrag.pixelsPerUserY };
  }
  const zoom = canvasZoom > 0 ? canvasZoom : 1;
  return { x: zoom, y: zoom };
}

/**
 * Stretch the SVG across model space from the top-left, covering the pane
 * as well as the content box. `preserveAspectRatio="none"` maps that
 * rectangle onto the element with no letterbox margin.
 */
function fitModelSpace(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } | null {
  const content = readModelContent(svg);
  if (!(content.width > 0) || !(content.height > 0)) {
    return null;
  }
  const scale = modelScale();
  const pane = {
    width: scale.x > 0 ? diagram.clientWidth / scale.x : content.width,
    height: scale.y > 0 ? diagram.clientHeight / scale.y : content.height,
  };
  const frame = modelSpaceFrame(content, pane);
  if (!(frame.width > 0) || !(frame.height > 0)) {
    return null;
  }
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("viewBox", `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
  svg.setAttribute("width", String(frame.width));
  svg.setAttribute("height", String(frame.height));
  svg.style.minWidth = "0";
  svg.style.minHeight = "0";
  svg.style.width = `${frame.width * scale.x}px`;
  svg.style.height = `${frame.height * scale.y}px`;
  zoomBasisWidth = frame.width;
  zoomBasisHeight = frame.height;
  contentUserWidth = frame.width;
  contentUserHeight = frame.height;
  return frame;
}

let paintingGrid = false;

/**
 * Draw or remove the snap-grid overlay. Lines use the fixed drawn pitch
 * from model-space (0, 0) across the whole frame. Snap spacing is separate,
 * so the drawn lines stay the same until you zoom.
 */
function paintCanvasGrid(svg: SVGSVGElement): void {
  if (paintingGrid) {
    return;
  }
  paintingGrid = true;
  try {
    paintCanvasGridNow(svg);
  } finally {
    paintingGrid = false;
  }
}

function paintCanvasGridNow(svg: SVGSVGElement): void {
  const frame = fitModelSpace(svg);
  svg.querySelector(":scope > g.canvas-grid")?.remove();
  svg.querySelector("#plein-canvas-grid")?.remove();
  if (!canvasGridVisible || !frame) {
    delete svg.dataset.canvasGrid;
    return;
  }
  const paths = canvasGridLinePaths(frame);
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "canvas-grid");
  group.setAttribute("pointer-events", "none");
  group.setAttribute("aria-hidden", "true");
  const minor = document.createElementNS("http://www.w3.org/2000/svg", "path");
  minor.setAttribute("class", "minor");
  minor.setAttribute("d", paths.minor);
  const major = document.createElementNS("http://www.w3.org/2000/svg", "path");
  major.setAttribute("class", "major");
  major.setAttribute("d", paths.major);
  group.append(minor, major);
  const anchor = svg.querySelector(":scope > g.containers, :scope > g.nodes, :scope > g.edges");
  if (anchor) {
    svg.insertBefore(group, anchor);
  } else {
    svg.append(group);
  }
  svg.dataset.canvasGrid = String(DRAWN_CANVAS_GRID_PITCH);
}

function forgetCanvasZoom(): void {
  canvasZoom = 1;
  canvasZoomView = null;
  zoomBasisWidth = 0;
  zoomBasisHeight = 0;
  canvasMarginLeft = 0;
  canvasMarginTop = 0;
  contentUserWidth = 0;
  contentUserHeight = 0;
  delete diagram.dataset.zoom;
}

/**
 * Keep the current zoom factor when the laid-out user size changes.
 * The basis stays a CSS-pixel size at zoom 1; scaling it by the user-size
 * ratio preserves a stretched first capture and still lets the canvas grow.
 */
function followContentSize(width: number, height: number): void {
  if (!(width > 0) || !(height > 0)) {
    return;
  }
  if (
    canvasZoom !== 1 &&
    zoomBasisWidth > 0 &&
    zoomBasisHeight > 0 &&
    contentUserWidth > 0 &&
    contentUserHeight > 0 &&
    (width !== contentUserWidth || height !== contentUserHeight)
  ) {
    zoomBasisWidth *= width / contentUserWidth;
    zoomBasisHeight *= height / contentUserHeight;
  }
  contentUserWidth = width;
  contentUserHeight = height;
}

/** Size the SVG in CSS pixels. Layout user units stay put, so drag math still matches. */
function applyCanvasZoom(svg: SVGSVGElement): boolean {
  if (canvasZoom === 1) {
    svg.style.removeProperty("width");
    svg.style.removeProperty("height");
    svg.style.removeProperty("margin-left");
    svg.style.removeProperty("margin-top");
    delete diagram.dataset.zoom;
    zoomBasisWidth = 0;
    zoomBasisHeight = 0;
    canvasMarginLeft = 0;
    canvasMarginTop = 0;
    return true;
  }
  if (!(zoomBasisWidth > 0) || !(zoomBasisHeight > 0)) {
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    if (!(width > 0) || !(height > 0)) {
      return false;
    }
    zoomBasisWidth = width;
    zoomBasisHeight = height;
  }
  svg.style.width = `${zoomBasisWidth * canvasZoom}px`;
  svg.style.height = `${zoomBasisHeight * canvasZoom}px`;
  svg.style.marginLeft = canvasMarginLeft > 0 ? `${canvasMarginLeft}px` : "";
  svg.style.marginTop = canvasMarginTop > 0 ? `${canvasMarginTop}px` : "";
  diagram.dataset.zoom = canvasZoom.toFixed(4);
  return true;
}

function setCurrentViewChrome(title: string, viewName: string | null): void {
  diagramHeading.textContent = title;
  if (viewName) {
    currentView.dataset.viewName = viewName;
    currentView.title = viewName;
  } else {
    delete currentView.dataset.viewName;
    currentView.removeAttribute("title");
  }
}

async function renderDiagram(seq: number): Promise<void> {
  renderAutoLayoutSwitcher();
  renderModeSwitcher();
  renderDirectionSwitcher();
  renderRoutingSwitcher();
  renderNestingSwitcher();
  renderCanvasGridSizeSwitcher();
  syncCanvasGridToggle();
  syncLayoutOptionsButton();
  if (!loaded?.ok) {
    setCurrentViewChrome("Viewpoint", null);
    diagram.replaceChildren();
    lastLayout = null;
    delete diagram.dataset.manualLayout;
    forgetCanvasZoom();
    return;
  }

  const viewName = namedViewForDiagram();
  const exists = viewName !== null && loaded.model.views.some((view) => view.name === viewName);
  if (!viewName || !exists) {
    setCurrentViewChrome(currentViewCaption(loaded.model, viewName), null);
    const hint = document.createElement("p");
    hint.className = "diagram-empty";
    hint.textContent = "This file has no named viewpoint in the views block.";
    diagram.replaceChildren(hint);
    lastLayout = null;
    delete diagram.dataset.manualLayout;
    forgetCanvasZoom();
    return;
  }

  try {
    const browsed = await browseNamedView(loaded.model, viewName, previewLayoutOptions());
    if (seq !== renderSeq) {
      return;
    }
    setCurrentViewChrome(browsed.title, browsed.viewName);
    const sameView = canvasZoomView !== null && browsed.viewName === canvasZoomView;
    const scrollLeft = diagram.scrollLeft;
    const scrollTop = diagram.scrollTop;
    if (!sameView) {
      canvasZoom = 1;
    }
    canvasZoomView = browsed.viewName;
    let layout = browsed.layout;
    let svgMarkup = browsed.svg;
    if (layout.auto === false) {
      const seated = seatLayoutOnGrid(
        layout.nodes,
        layout.edges,
        canvasGridSize,
        layout.routing,
        layout.direction,
        alignHold,
      );
      const bounds = contentBounds(
        seated.nodes,
        PADDING,
        PADDING * 2 + NODE_WIDTH,
        PADDING * 2 + NODE_HEIGHT,
      );
      layout = {
        ...layout,
        nodes: seated.nodes,
        edges: seated.edges,
        x: bounds.x,
        y: bounds.y,
        width: Math.max(bounds.width, PADDING * 2 + NODE_WIDTH),
        height: Math.max(bounds.height, PADDING * 2 + NODE_HEIGHT),
      };
      svgMarkup = renderViewpointSvg(layout);
    }
    diagram.innerHTML = svgMarkup;
    lastLayout = layout;
    if (browsed.layout.auto === false) {
      diagram.dataset.manualLayout = "true";
    } else {
      delete diagram.dataset.manualLayout;
    }
    const svg = diagram.querySelector("svg");
    if (svg instanceof SVGSVGElement) {
      enhanceEdgeHits(svg);
      rememberModelContent(svg, {
        x: layout.x ?? 0,
        y: layout.y ?? 0,
        width: layout.width,
        height: layout.height,
      });
      followContentSize(layout.width, layout.height);
      if (!applyCanvasZoom(svg)) {
        canvasZoom = 1;
        delete diagram.dataset.zoom;
      }
      paintCanvasGrid(svg);
      if (sameView) {
        holdScrollForExpandedCanvas(svg, scrollLeft, scrollTop);
      }
    }
  } catch (error) {
    if (seq !== renderSeq) {
      return;
    }
    const hint = document.createElement("p");
    hint.className = "diagram-empty";
    hint.textContent = error instanceof Error ? error.message : String(error);
    diagram.replaceChildren(hint);
    lastLayout = null;
    delete diagram.dataset.manualLayout;
    forgetCanvasZoom();
  }
}

async function render(): Promise<void> {
  const seq = ++renderSeq;
  reloadButton.disabled = loaded === null;
  reloadButton.title = openExchangeFile
    ? "Re-import the open Open Exchange XML and redraw the diagram (⌘R)"
    : "Re-read the open .plein and redraw the diagram (⌘R)";

  if (!loaded) {
    workspace.classList.add("empty");
    emptyHint.hidden = false;
    fileLabel.textContent = "No file open";
    showImportNotice(null);
    showError(null);
    viewList.replaceChildren();
    elementList.replaceChildren();
    relationshipList.replaceChildren();
    await renderDiagram(seq);
    return;
  }

  emptyHint.hidden = true;
  fileLabel.textContent = loaded.file;

  if (!loaded.ok) {
    workspace.classList.add("empty");
    showImportNotice(null);
    showError(loaded.error, bannerLead);
    viewList.replaceChildren();
    elementList.replaceChildren();
    relationshipList.replaceChildren();
    await renderDiagram(seq);
    return;
  }

  showError(null);
  showImportNotice(importNotice);
  workspace.classList.remove("empty");
  const list = filterModel(loaded.model, selectedView);

  const diagramView = namedViewForDiagram();
  const views = [
    buttonForView({
      name: null,
      label: "All",
      showingOnCanvas: false,
      listingThis: selectedView === null,
    }),
    ...list.views.map((view) => {
      return buttonForView({
        name: view.name,
        label: viewSwitcherLabel(view),
        hint: view.title ? `${view.name} — ${view.title}` : view.name,
        showingOnCanvas: view.name === diagramView,
        listingThis: selectedView === view.name,
      });
    }),
  ];
  viewList.replaceChildren(...views);
  viewList.querySelector("[aria-current='true']")?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });

  elementsHeading.textContent = `Elements (${list.elements.length})`;
  elementList.replaceChildren(
    ...list.elements.map((element) => {
      const item = document.createElement("li");
      const style = elementStyle(element.keyword);
      item.setAttribute("role", "option");
      item.setAttribute("data-element-id", element.id);
      item.tabIndex = 0;
      item.innerHTML = `<span class="swatch" style="background:${escapeHtml(style.fill)}" title="${escapeHtml(style.layer)}"></span><span class="row-body"><span class="row-title">${escapeHtml(element.label)}</span><span class="row-meta"><span class="kw">${escapeHtml(element.keyword)}</span><code>${escapeHtml(element.id)}</code></span></span>`;
      item.addEventListener("click", (event) => {
        setSelections(
          nextSelectionFromClick(selectedItems, { kind: "element", id: element.id }, event.shiftKey),
        );
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelections(
            nextSelectionFromClick(selectedItems, { kind: "element", id: element.id }, event.shiftKey),
          );
        }
      });
      return item;
    }),
  );

  relationshipHeading.textContent = `Relationships (${list.relationships.length})`;
  relationshipList.replaceChildren(
    ...list.relationships.map((rel) => {
      const item = document.createElement("li");
      const id = edgeId(rel.source, rel.target, rel.type);
      item.className = "rel";
      item.setAttribute("role", "option");
      item.setAttribute("data-relationship-id", id);
      item.tabIndex = 0;
      item.innerHTML = `<span class="row-body"><span class="row-title"><code>${escapeHtml(rel.source)}</code><span class="meta">→</span><code>${escapeHtml(rel.target)}</code></span><span class="row-meta"><span class="kw">${escapeHtml(rel.type)}</span></span></span>`;
      item.addEventListener("click", (event) => {
        setSelections(
          nextSelectionFromClick(selectedItems, { kind: "relationship", id }, event.shiftKey),
        );
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelections(
            nextSelectionFromClick(selectedItems, { kind: "relationship", id }, event.shiftKey),
          );
        }
      });
      return item;
    }),
  );

  await renderDiagram(seq);
  if (seq === renderSeq) {
    paintSelection();
  }
}

function buttonForView(options: {
  name: string | null;
  label: string;
  hint?: string;
  showingOnCanvas: boolean;
  listingThis: boolean;
}): HTMLLIElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  if (options.hint) {
    button.title = options.hint;
  }
  const label = document.createElement("span");
  label.className = "view-label";
  label.textContent = options.label;
  button.append(label);
  if (options.showingOnCanvas) {
    button.setAttribute("aria-current", "true");
    const mark = document.createElement("span");
    mark.className = "showing-mark";
    mark.textContent = "Showing";
    button.append(mark);
  }
  if (options.listingThis) {
    button.setAttribute("aria-pressed", "true");
  }
  button.addEventListener("click", () => {
    selectedView = options.name;
    if (options.name !== null) {
      lastNamedView = options.name;
    }
    if (loaded?.ok) {
      selectedItems = retainSelections(selectedItems, filterModel(loaded.model, selectedView));
    }
    void render();
  });
  item.append(button);
  return item;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openSource(source: string, file: string): void {
  closeExportDialog(false);
  lastSource = source;
  manualPositions.clear();
  alignHold.clear();
  autoLayoutOverride = "file";
  lastLayout = null;
  forgetCanvasZoom();
  loaded = loadPleinSource(source, file);
  selectedView = loaded.ok ? firstNamedView(loaded.model) : null;
  lastNamedView = selectedView;
  selectedItems = [];
  void render();
}

/** Open a `.plein` file. Drops any Open Exchange import session. */
function openPlein(source: string, file: string): void {
  forgetOpenExchange();
  bannerLead = LOAD_ERROR_LEAD;
  openSource(source, file);
}

/**
 * Import Open Exchange XML with `importOpenExchange`, then open the `.plein`
 * through the same path as Open. `reload` keeps the current viewpoint.
 */
function commitImported(xml: string, file: string, reload: boolean): void {
  openExchangeFile = file;
  openExchangeXml = xml;
  let imported;
  try {
    imported = importOpenExchange(xml, file);
  } catch (error) {
    importNotice = null;
    bannerLead = IMPORT_ERROR_LEAD;
    closeExportDialog(false);
    lastSource = null;
    loaded = { ok: false, file, error: formatLoadError(error) };
    if (!reload) {
      selectedView = null;
      selectedItems = [];
    }
    void render();
    return;
  }
  importNotice = formatImportReport(file, imported.report);
  bannerLead = LOAD_ERROR_LEAD;
  if (reload) {
    applyReload(imported.source, file);
    return;
  }
  openSource(imported.source, file);
}

function applyReload(source: string, file: string): void {
  closeExportDialog(false);
  lastSource = source;
  const next = reloadPleinSource(source, file, selectedView);
  loaded = next.loaded;
  selectedView = next.selectedView;
  lastNamedView = loaded.ok ? viewAfterReload(loaded.model, lastNamedView) : lastNamedView;
  selectedItems = loaded.ok
    ? retainSelections(selectedItems, filterModel(loaded.model, selectedView))
    : [];
  void render();
}

async function openFromTauriDialog(): Promise<void> {
  const api = tauri();
  if (!api) {
    fileInput.click();
    return;
  }
  try {
    const opened = await api.core.invoke<OpenedFile | null>("open_plein_dialog");
    if (opened) {
      openPlein(opened.contents, opened.path);
    }
  } catch (error) {
    forgetOpenExchange();
    bannerLead = LOAD_ERROR_LEAD;
    failOpen("Open…", error);
  }
}

async function importFromTauriDialog(): Promise<void> {
  closeExportDialog(false);
  const api = tauri();
  if (!api) {
    importInput.click();
    return;
  }
  try {
    const opened = await api.core.invoke<OpenedFile | null>("open_open_exchange_dialog");
    if (!opened) {
      return;
    }
    commitImported(opened.contents, opened.path, false);
  } catch (error) {
    forgetOpenExchange();
    bannerLead = IMPORT_ERROR_LEAD;
    failOpen("Import…", error);
  }
}

async function openPath(path: string): Promise<void> {
  const api = tauri();
  if (!api) {
    return;
  }
  try {
    const opened = await api.core.invoke<OpenedFile>("read_plein_file", { path });
    openPlein(opened.contents, opened.path);
  } catch (error) {
    forgetOpenExchange();
    bannerLead = LOAD_ERROR_LEAD;
    failOpen(path, error);
  }
}

async function reloadOpen(): Promise<void> {
  if (!loaded && !openExchangeFile) {
    return;
  }
  if (openExchangeFile) {
    const api = tauri();
    if (api && isFilesystemPath(openExchangeFile)) {
      try {
        const opened = await api.core.invoke<OpenedFile>("read_plein_file", { path: openExchangeFile });
        commitImported(opened.contents, opened.path, true);
      } catch (error) {
        showError(formatLoadError(error), IMPORT_ERROR_LEAD);
      }
      return;
    }
    if (openExchangeXml !== null) {
      commitImported(openExchangeXml, openExchangeFile, true);
    }
    return;
  }
  if (!loaded) {
    return;
  }
  const api = tauri();
  if (api && isFilesystemPath(loaded.file)) {
    try {
      const opened = await api.core.invoke<OpenedFile>("read_plein_file", { path: loaded.file });
      applyReload(opened.contents, opened.path);
    } catch (error) {
      showError(formatLoadError(error));
    }
    return;
  }
  if (lastSource !== null) {
    applyReload(lastSource, loaded.file);
  }
}

openButton.addEventListener("click", () => {
  void openFromTauriDialog();
});

importButton.addEventListener("click", () => {
  void importFromTauriDialog();
});

reloadButton.addEventListener("click", () => {
  void reloadOpen();
});

exportButton.addEventListener("click", () => {
  beginExport();
});

exportCancel.addEventListener("click", () => {
  closeExportDialog();
});

exportDialog.addEventListener("click", (event) => {
  if (event.target === exportDialog) {
    closeExportDialog();
  }
});

exportForm.addEventListener("change", () => {
  syncExportFormatNote();
});

exportForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const format = selectedExportFormat();
  const viewName = exportDialog.dataset.viewName ?? "";
  lastExportFormat = format;
  closeExportDialog(false);
  void commitExport(format, viewName);
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }
  try {
    openPlein(await file.text(), file.name);
  } catch (error) {
    forgetOpenExchange();
    bannerLead = LOAD_ERROR_LEAD;
    failOpen(file.name, error);
  }
  fileInput.value = "";
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) {
    return;
  }
  try {
    commitImported(await file.text(), file.name, false);
  } catch (error) {
    forgetOpenExchange();
    bannerLead = IMPORT_ERROR_LEAD;
    failOpen(file.name, error);
  }
});

canvasGridToggle.addEventListener("click", () => {
  canvasGridVisible = !canvasGridVisible;
  syncCanvasGridToggle();
  const svg = diagram.querySelector("svg");
  if (svg instanceof SVGSVGElement) {
    paintCanvasGrid(svg);
  }
});

layoutOptionsButton.addEventListener("click", () => {
  const next = !layoutOptionsOpen();
  setLayoutOptionsOpen(next);
  if (!next) {
    return;
  }
  const selected = layoutOptionsPanel.querySelector('[aria-checked="true"]');
  if (selected instanceof HTMLElement) {
    selected.focus();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!layoutOptionsOpen()) {
    return;
  }
  const target = event.target;
  if (target instanceof Node && layoutOverflow.contains(target)) {
    return;
  }
  setLayoutOptionsOpen(false);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (!exportDialog.hidden) {
      event.preventDefault();
      closeExportDialog();
      return;
    }
    if (layoutOptionsOpen()) {
      event.preventDefault();
      setLayoutOptionsOpen(false);
      layoutOptionsButton.focus();
      return;
    }
    if (selectedItems.length > 0) {
      event.preventDefault();
      setSelection(null);
    }
    return;
  }
  if (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "e"
  ) {
    event.preventDefault();
    beginExport();
    return;
  }
  if (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "i"
  ) {
    event.preventDefault();
    void importFromTauriDialog();
    return;
  }
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "o") {
    event.preventDefault();
    void openFromTauriDialog();
    return;
  }
  if (key === "r") {
    event.preventDefault();
    void reloadOpen();
  }
});

let suppressDiagramClick = false;

function clientFromUser(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } | null {
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    return null;
  }
  const screen = point.matrixTransform(matrix);
  return { x: screen.x, y: screen.y };
}

function svgLocalPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } | null {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    return null;
  }
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function userPixelsPerUnit(svg: SVGSVGElement): { x: number; y: number } {
  const box = svg.getBoundingClientRect();
  const viewWidth = svg.viewBox.baseVal.width || Number(svg.getAttribute("width"));
  const viewHeight = svg.viewBox.baseVal.height || Number(svg.getAttribute("height"));
  const x = viewWidth > 0 && box.width > 0 ? box.width / viewWidth : 1;
  const y = viewHeight > 0 && box.height > 0 ? box.height / viewHeight : 1;
  return {
    x: Number.isFinite(x) && x !== 0 ? x : 1,
    y: Number.isFinite(y) && y !== 0 ? y : 1,
  };
}

/** Keep a pane scroll that sits past the previous left or top edge. */
function holdScrollForExpandedCanvas(svg: SVGSVGElement, scrollLeft: number, scrollTop: number): void {
  const marginLeft = Number.parseFloat(svg.style.marginLeft) || 0;
  const marginTop = Number.parseFloat(svg.style.marginTop) || 0;
  const slack = fitCanvasScroll({
    clientWidth: diagram.clientWidth,
    clientHeight: diagram.clientHeight,
    contentWidth: marginLeft + svg.offsetWidth,
    contentHeight: marginTop + svg.offsetHeight,
    scrollLeft,
    scrollTop,
  });
  svg.style.marginRight = slack.marginRight > 0.5 ? `${slack.marginRight}px` : "";
  svg.style.marginBottom = slack.marginBottom > 0.5 ? `${slack.marginBottom}px` : "";
  diagram.scrollLeft = scrollLeft;
  diagram.scrollTop = scrollTop;
}

/**
 * Grow the SVG around the dragged boxes. Outward moves past the previous
 * left or top shift the viewBox origin; right and bottom grow the size.
 * Scroll follows the origin so the rest of the diagram stays put and the
 * new region can be panned back into view.
 */
function growCanvasForDrag(svg: SVGSVGElement, shift: { x: number; y: number }): void {
  if (!nodeDrag || !lastLayout) {
    return;
  }
  const boxes = lastLayout.nodes.map((node) => {
    const origin = nodeDrag?.origins.get(node.id);
    if (!origin || !nodeDrag) {
      return { x: node.x, y: node.y, width: node.width, height: node.height };
    }
    return {
      x: Math.round(origin.x + shift.x),
      y: Math.round(origin.y + shift.y),
      width: origin.width,
      height: origin.height,
    };
  });
  const bounds = contentBounds(boxes, PADDING, PADDING * 2 + NODE_WIDTH, PADDING * 2 + NODE_HEIGHT);
  const scaleX = nodeDrag.pixelsPerUserX;
  const scaleY = nodeDrag.pixelsPerUserY;
  rememberModelContent(svg, bounds);
  paintCanvasGrid(svg);
  const scrollLeft = Math.max(0, nodeDrag.baseScrollLeft + (nodeDrag.baseOriginX - bounds.x) * scaleX);
  const scrollTop = Math.max(0, nodeDrag.baseScrollTop + (nodeDrag.baseOriginY - bounds.y) * scaleY);
  holdScrollForExpandedCanvas(svg, scrollLeft, scrollTop);
}

/**
 * Canvas cell snap for `alignDraggedBox`.
 * grid snap runs first, then a centre or edge match applies only if it is
 * still within the align threshold. Hiding the lines does not turn this off.
 * Visibility only paints the overlay.
 */
function gridSnapForDrag(): GridSnapFn | undefined {
  const size = canvasGridSize;
  return (box) => snapProposedOrigin(box, size);
}

/** Pointer shift after grid snap, then neighbour centre/edge snap within threshold. */
function dragPlacement(drag: NodeDrag, clientX: number, clientY: number): {
  shift: { x: number; y: number };
  guides: AlignGuide[];
  lock: AlignLock;
} {
  const raw = manualDragShift(
    clientX - drag.startClientX,
    clientY - drag.startClientY,
    drag.pixelsPerUserX,
    drag.pixelsPerUserY,
  );
  const root = drag.origins.get(drag.id);
  if (!root || !lastLayout) {
    return { shift: raw, guides: [], lock: { x: null, y: null } };
  }
  const others = lastLayout.nodes
    .filter((node) => !drag.origins.has(node.id))
    .map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    }));
  const snapped = alignDraggedBox({
    moving: {
      id: drag.id,
      x: root.x + raw.x,
      y: root.y + raw.y,
      width: root.width,
      height: root.height,
    },
    others,
    threshold: userSnapDistance(ALIGN_SNAP_SCREEN_PX, drag.pixelsPerUserX),
    thresholdX: userSnapDistance(ALIGN_SNAP_SCREEN_PX, drag.pixelsPerUserX),
    thresholdY: userSnapDistance(ALIGN_SNAP_SCREEN_PX, drag.pixelsPerUserY),
    releaseX: userSnapDistance(ALIGN_SNAP_RELEASE_SCREEN_PX, drag.pixelsPerUserX),
    releaseY: userSnapDistance(ALIGN_SNAP_RELEASE_SCREEN_PX, drag.pixelsPerUserY),
    lock: drag.alignLock,
    gridSnap: gridSnapForDrag(),
  });
  return {
    shift: { x: snapped.x - root.x, y: snapped.y - root.y },
    guides: snapped.guides,
    lock: snapped.lock,
  };
}

function paintAlignGuides(svg: SVGSVGElement, guides: readonly AlignGuide[]): void {
  const existing = svg.querySelector(":scope > [data-align-guides]");
  if (guides.length === 0) {
    existing?.remove();
    return;
  }
  const layer =
    existing instanceof SVGGElement ? existing : document.createElementNS("http://www.w3.org/2000/svg", "g");
  if (!(existing instanceof SVGGElement)) {
    layer.setAttribute("data-align-guides", "true");
    layer.setAttribute("pointer-events", "none");
    layer.setAttribute("aria-hidden", "true");
  }
  svg.append(layer);
  layer.replaceChildren();
  for (const guide of guides) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "align-guide");
    if (guide.axis === "x") {
      line.setAttribute("x1", String(guide.position));
      line.setAttribute("x2", String(guide.position));
      line.setAttribute("y1", String(guide.from));
      line.setAttribute("y2", String(guide.to));
    } else {
      line.setAttribute("y1", String(guide.position));
      line.setAttribute("y2", String(guide.position));
      line.setAttribute("x1", String(guide.from));
      line.setAttribute("x2", String(guide.to));
    }
    layer.append(line);
  }
}

function clearAlignGuides(svg: Element | null): void {
  if (!(svg instanceof SVGSVGElement)) {
    return;
  }
  svg.querySelector(":scope > [data-align-guides]")?.remove();
}

function releaseDiagramPointer(pointerId: number): void {
  try {
    if (diagram.hasPointerCapture(pointerId)) {
      diagram.releasePointerCapture(pointerId);
    }
  } catch {
    // Pointer capture was not taken.
  }
}

function updateMarquee(event: PointerEvent): void {
  const drag = marqueeDrag;
  if (!drag || event.pointerId !== drag.pointerId || !lastLayout) {
    return;
  }
  const travel = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
  if (!drag.moved && travel < 4) {
    return;
  }
  drag.moved = true;
  diagram.classList.add("is-marquee");
  const svg = diagram.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) {
    return;
  }
  const local = svgLocalPoint(svg, event.clientX, event.clientY);
  if (!local) {
    return;
  }
  const rect = normalizeMarquee({ x: drag.startUserX, y: drag.startUserY }, local);
  setSelections(selectionFromMarquee(lastLayout.nodes, rect, drag.baseSelection, drag.additive), {
    scroll: false,
  });
  paintMarqueeRect(svg, rect);
}

function finishMarquee(event: PointerEvent): void {
  const drag = marqueeDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  marqueeDrag = null;
  diagram.classList.remove("is-marquee");
  clearMarqueeRect();
  releaseDiagramPointer(event.pointerId);
  if (!drag.moved) {
    // preventDefault on pointerdown swallows the click. A background press
    // that does not move is still a click: plain click clears, shift-click does not.
    suppressDiagramClick = true;
    setSelections(nextSelectionFromClick(selectedItems, null, event.shiftKey));
    return;
  }
  suppressDiagramClick = true;
  const svg = diagram.querySelector("svg");
  if (!(svg instanceof SVGSVGElement) || !lastLayout) {
    setSelections(drag.baseSelection, { scroll: false });
    return;
  }
  const local = svgLocalPoint(svg, event.clientX, event.clientY);
  if (!local) {
    setSelections(drag.baseSelection, { scroll: false });
    return;
  }
  setSelections(
    selectionFromMarquee(
      lastLayout.nodes,
      normalizeMarquee({ x: drag.startUserX, y: drag.startUserY }, local),
      drag.baseSelection,
      drag.additive,
    ),
    { scroll: false },
  );
}

function cancelMarquee(pointerId: number): void {
  const drag = marqueeDrag;
  if (!drag || drag.pointerId !== pointerId) {
    return;
  }
  marqueeDrag = null;
  diagram.classList.remove("is-marquee");
  clearMarqueeRect();
  setSelections(drag.baseSelection, { scroll: false });
}

diagram.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || nodeDrag || marqueeDrag) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element) || !diagram.contains(target)) {
    return;
  }
  const nodeEl = target.closest("[data-node-id]");
  const onNode = nodeEl instanceof Element && diagram.contains(nodeEl);
  if (onNode && nodeEl && lastLayout?.auto === false && !event.shiftKey) {
    const id = nodeEl.getAttribute("data-node-id");
    if (!id || !lastLayout) {
      return;
    }
    const svg = nodeEl.closest("svg");
    if (!(svg instanceof SVGSVGElement)) {
      return;
    }
    const origins = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const movedId of groupDragIds(id, selectedElementIds(selectedItems), lastLayout.nodes)) {
      const node = lastLayout.nodes.find((candidate) => candidate.id === movedId);
      if (node) {
        origins.set(movedId, { x: node.x, y: node.y, width: node.width, height: node.height });
      }
    }
    if (!origins.has(id)) {
      return;
    }
    const scale = userPixelsPerUnit(svg);
    nodeDrag = {
      id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      origins,
      pixelsPerUserX: scale.x,
      pixelsPerUserY: scale.y,
      baseOriginX: svg.viewBox.baseVal.x,
      baseOriginY: svg.viewBox.baseVal.y,
      baseScrollLeft: diagram.scrollLeft,
      baseScrollTop: diagram.scrollTop,
      alignLock: { x: null, y: null },
    };
    try {
      diagram.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort; move and up still reach the diagram.
    }
    event.preventDefault();
    return;
  }
  if (onNode || target.closest("[data-edge-id], [data-edge-hit-id]")) {
    return;
  }
  const svg = target.closest("svg");
  if (!(svg instanceof SVGSVGElement) || !diagram.contains(svg) || !lastLayout) {
    return;
  }
  const local = svgLocalPoint(svg, event.clientX, event.clientY);
  if (!local) {
    return;
  }
  marqueeDrag = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startUserX: local.x,
    startUserY: local.y,
    additive: event.shiftKey,
    moved: false,
    baseSelection: selectedItems.map((item) => ({ kind: item.kind, id: item.id })),
  };
  try {
    diagram.setPointerCapture(event.pointerId);
  } catch {
    // Capture is best-effort; move and up still reach the diagram.
  }
  // Keep the browser from turning the drag into a native image drag or a scroll,
  // which cancels the pointer before the marquee can finish.
  event.preventDefault();
});

diagram.addEventListener("pointermove", (event) => {
  if (marqueeDrag && event.pointerId === marqueeDrag.pointerId) {
    updateMarquee(event);
    return;
  }
  if (!nodeDrag || event.pointerId !== nodeDrag.pointerId || !lastLayout) {
    return;
  }
  const travel = Math.hypot(event.clientX - nodeDrag.startClientX, event.clientY - nodeDrag.startClientY);
  if (!nodeDrag.moved && travel < 4) {
    return;
  }
  nodeDrag.moved = true;
  diagram.classList.add("is-dragging");
  const svg = diagram.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) {
    return;
  }
  const placement = dragPlacement(nodeDrag, event.clientX, event.clientY);
  nodeDrag.alignLock = placement.lock;
  for (const [movedId, origin] of nodeDrag.origins) {
    const group = findByAttr(svg, "data-node-id", movedId);
    group?.setAttribute(
      "transform",
      `translate(${Math.round(origin.x + placement.shift.x)} ${Math.round(origin.y + placement.shift.y)})`,
    );
  }
  growCanvasForDrag(svg, placement.shift);
  paintSelectionBounds(svg, placement.shift);
  paintAlignGuides(svg, placement.guides);
});

diagram.addEventListener("pointerup", (event) => {
  if (marqueeDrag && event.pointerId === marqueeDrag.pointerId) {
    finishMarquee(event);
    return;
  }
  if (!nodeDrag || event.pointerId !== nodeDrag.pointerId) {
    return;
  }
  const drag = nodeDrag;
  nodeDrag = null;
  diagram.classList.remove("is-dragging");
  clearAlignGuides(diagram.querySelector("svg"));
  releaseDiagramPointer(event.pointerId);
  if (!drag.moved) {
    // pointerdown calls preventDefault so the gesture cannot start a native
    // drag. That also swallows the click, so a press that does not move still
    // has to select here.
    suppressDiagramClick = true;
    setSelections(
      nextSelectionFromClick(selectedItems, { kind: "element", id: drag.id }, event.shiftKey),
    );
    return;
  }
  suppressDiagramClick = true;
  const viewName = namedViewForDiagram();
  const svg = diagram.querySelector("svg");
  if (!viewName || !(svg instanceof SVGSVGElement) || !lastLayout) {
    return;
  }
  const shift = dragPlacement(drag, event.clientX, event.clientY).shift;
  const root = drag.origins.get(drag.id);
  if (root) {
    const raw = manualDragShift(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY,
      drag.pixelsPerUserX,
      drag.pixelsPerUserY,
    );
    const gridPoint = snapProposedOrigin(
      { x: root.x + raw.x, y: root.y + raw.y },
      canvasGridSize,
    );
    const grabbedOffCell =
      Math.abs(root.x + shift.x - gridPoint.x) > 0.5 || Math.abs(root.y + shift.y - gridPoint.y) > 0.5;
    for (const [movedId, origin] of drag.origins) {
      const x = origin.x + shift.x;
      const y = origin.y + shift.y;
      const lattice = snapProposedOrigin({ x, y }, canvasGridSize);
      const offLattice = Math.abs(x - lattice.x) > 0.5 || Math.abs(y - lattice.y) > 0.5;
      // The grabbed box keeps a neighbour-align drop. Every other moved box
      // keeps the same delta, including one that is already off the lattice.
      if (grabbedOffCell || offLattice) {
        alignHold.add(movedId);
      } else {
        alignHold.delete(movedId);
      }
    }
  }
  const session = manualPositions.get(viewName) ?? new Map<string, { x: number; y: number; width?: number; height?: number }>();
  for (const [movedId, origin] of drag.origins) {
    const existing = session.get(movedId);
    const node = lastLayout.nodes.find((candidate) => candidate.id === movedId);
    session.set(movedId, {
      x: Math.round(origin.x + shift.x),
      y: Math.round(origin.y + shift.y),
      ...(existing?.width !== undefined ? { width: existing.width } : node ? { width: node.width } : {}),
      ...(existing?.height !== undefined ? { height: existing.height } : node ? { height: node.height } : {}),
    });
  }
  manualPositions.set(viewName, session);
  void render();
});

diagram.addEventListener("pointercancel", (event) => {
  if (marqueeDrag && event.pointerId === marqueeDrag.pointerId) {
    cancelMarquee(event.pointerId);
    return;
  }
  if (!nodeDrag || event.pointerId !== nodeDrag.pointerId) {
    return;
  }
  nodeDrag = null;
  diagram.classList.remove("is-dragging");
  clearAlignGuides(diagram.querySelector("svg"));
});

/**
 * Plain wheel keeps panning the overflow pane. ⌘/Ctrl+wheel (and trackpad pinch,
 * which the webview reports as Ctrl+wheel) zooms toward the pointer.
 * Clicks and node drags are untouched — this listener never handles pointer buttons.
 */
function zoomDiagramFromWheel(event: WheelEvent): void {
  if (!wheelGestureIsZoom(event)) {
    return;
  }
  const svg = diagram.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) {
    return;
  }
  event.preventDefault();
  if (nodeDrag || marqueeDrag) {
    return;
  }
  const previous = clampCanvasZoom(canvasZoom);
  const next = nextCanvasZoom(previous, event.deltaY, event.deltaMode, event.deltaX);
  if (next === previous) {
    return;
  }
  const pane = diagram.getBoundingClientRect();
  const box = svg.getBoundingClientRect();
  const pointerX = event.clientX - pane.left - diagram.clientLeft;
  const pointerY = event.clientY - pane.top - diagram.clientTop;
  const placed = placeZoomAnchor({
    localX: event.clientX - box.left,
    localY: event.clientY - box.top,
    pointerX,
    pointerY,
    scale: next / previous,
  });
  const anchor = svgLocalPoint(svg, event.clientX, event.clientY);
  if (!(zoomBasisWidth > 0) || !(zoomBasisHeight > 0)) {
    zoomBasisWidth = box.width / previous;
    zoomBasisHeight = box.height / previous;
  }
  canvasZoom = next;
  canvasMarginLeft = placed.marginLeft;
  canvasMarginTop = placed.marginTop;
  if (!applyCanvasZoom(svg)) {
    canvasZoom = previous;
    canvasMarginLeft = 0;
    canvasMarginTop = 0;
    return;
  }
  diagram.scrollLeft = placed.scrollLeft;
  diagram.scrollTop = placed.scrollTop;
  if (!anchor) {
    return;
  }
  const moved = clientFromUser(svg, anchor.x, anchor.y);
  if (!moved) {
    return;
  }
  nudgeZoomAxis(svg, "scrollLeft", "marginLeft", moved.x - event.clientX);
  nudgeZoomAxis(svg, "scrollTop", "marginTop", moved.y - event.clientY);
  canvasMarginLeft = Number.parseFloat(svg.style.marginLeft) || 0;
  canvasMarginTop = Number.parseFloat(svg.style.marginTop) || 0;
}

/** Slide the diagram if the anchor is still off the pointer after the scale. */
function nudgeZoomAxis(
  svg: SVGSVGElement,
  scrollKey: "scrollLeft" | "scrollTop",
  marginKey: "marginLeft" | "marginTop",
  delta: number,
): void {
  if (Math.abs(delta) < 0.5) {
    return;
  }
  const before = diagram[scrollKey];
  diagram[scrollKey] = before + delta;
  const applied = diagram[scrollKey] - before;
  const leftover = delta - applied;
  if (Math.abs(leftover) < 0.5) {
    return;
  }
  const margin = Number.parseFloat(svg.style[marginKey]) || 0;
  const next = margin - leftover;
  svg.style[marginKey] = next > 0.5 ? `${next}px` : "";
}

diagram.addEventListener("wheel", zoomDiagramFromWheel, { passive: false });

if (typeof ResizeObserver !== "undefined") {
  const modelSpaceObserver = new ResizeObserver(() => {
    const svg = diagram.querySelector("svg");
    if (svg instanceof SVGSVGElement && svg.dataset.modelWidth) {
      paintCanvasGrid(svg);
    }
  });
  modelSpaceObserver.observe(diagram);
}

diagram.addEventListener("click", (event) => {
  if (suppressDiagramClick) {
    suppressDiagramClick = false;
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const svg = target.closest("svg");
  if (!svg || !diagram.contains(svg)) {
    if (target === diagram && !event.shiftKey) {
      setSelection(null);
    }
    return;
  }
  setSelections(
    nextSelectionFromClick(
      selectedItems,
      selectionFromDiagramHit({
        nodeId: target.closest("[data-node-id]")?.getAttribute("data-node-id"),
        edgeId:
          target.closest("[data-edge-id]")?.getAttribute("data-edge-id") ??
          target.closest("[data-edge-hit-id]")?.getAttribute("data-edge-hit-id"),
        containerId: target.closest("[data-container-id]")?.getAttribute("data-container-id"),
      }),
      event.shiftKey,
    ),
  );
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
  document.body.classList.add("dragging");
});

window.addEventListener("dragleave", () => {
  document.body.classList.remove("dragging");
});

window.addEventListener("drop", async (event) => {
  event.preventDefault();
  document.body.classList.remove("dragging");
  if (tauri()) {
    // Native DragDrop in Rust emits open-file with a filesystem path.
    return;
  }
  const file = event.dataTransfer?.files[0];
  if (!file) {
    return;
  }
  try {
    openSource(await file.text(), file.name);
  } catch (error) {
    failOpen(file.name, error);
  }
});

function exportFileStem(viewName: string): string {
  const stem = viewName.replace(/[\\/]/g, "-").replace(/^\.+/, "");
  return stem.length > 0 ? stem : "view";
}

function exportDirectory(): string | null {
  if (!loaded?.ok) {
    return null;
  }
  return directoryOfPath(loaded.file);
}

function directoryOfPath(file: string): string | null {
  if (!isFilesystemPath(file)) {
    return null;
  }
  const slash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  if (slash <= 0) {
    return null;
  }
  return file.slice(0, slash);
}

function selectedExportFormat(): MacExportFormat {
  const chosen = new FormData(exportForm).get("export-format");
  if (typeof chosen === "string" && isMacExportFormat(chosen)) {
    return chosen;
  }
  return "html";
}

function syncExportFormatNote(): void {
  const format = selectedExportFormat();
  exportFormatNote.textContent = EXPORT_FORMAT_NOTES[format];
  if (format === "open-exchange") {
    exportDialogTitle.textContent = "Export Open Exchange";
    const stem = loaded?.ok ? openExchangeSuggestedStem(loaded.file) : "model";
    exportDialogDetail.textContent = `${stem}.plein — the whole model, not only the view on screen.`;
    return;
  }
  exportDialogTitle.textContent = "Export view";
  exportDialogDetail.textContent = exportViewCaption;
}

function closeExportDialog(restoreFocus = true): void {
  if (exportDialog.hidden) {
    return;
  }
  exportDialog.hidden = true;
  delete exportDialog.dataset.viewName;
  if (restoreFocus) {
    exportButton.focus();
  }
}

/** Why Export… cannot run. Null when the canvas is showing a named view. */
function exportBlockReason(): string | null {
  if (!loaded) {
    return "Open a .plein file before exporting.";
  }
  if (!loaded.ok) {
    return "This file did not load, so there is no view to export.";
  }
  const viewName = namedViewForDiagram();
  if (!viewName || !loaded.model.views.some((view) => view.name === viewName)) {
    return "This file has no named view to export.";
  }
  const empty = diagram.querySelector(".diagram-empty");
  if (empty) {
    const detail = empty.textContent?.trim();
    return detail && detail.length > 0
      ? detail
      : "The current view did not render, so it cannot be exported.";
  }
  if (!lastLayout || lastLayout.viewName !== viewName) {
    return "The current view is not ready to export yet.";
  }
  return null;
}

function beginExport(): void {
  if (!exportDialog.hidden) {
    return;
  }
  const reason = exportBlockReason();
  if (reason) {
    showExportError(reason);
    return;
  }
  if (!lastLayout) {
    showExportError("The current view is not ready to export yet.");
    return;
  }
  exportDialog.dataset.viewName = lastLayout.viewName;
  const caption = diagramHeading.textContent?.trim() || lastLayout.title || lastLayout.viewName;
  exportViewCaption = `${caption} (${lastLayout.viewName})`;
  const radio = exportForm.querySelector(`input[name="export-format"][value="${lastExportFormat}"]`);
  if (radio instanceof HTMLInputElement) {
    radio.checked = true;
  }
  syncExportFormatNote();
  exportDialog.hidden = false;
  const checked = exportForm.querySelector('input[name="export-format"]:checked');
  if (checked instanceof HTMLElement) {
    checked.focus();
  }
}

function idsByAttr(root: ParentNode, attr: string): string[] {
  return [...root.querySelectorAll(`[${attr}]`)]
    .map((node) => node.getAttribute(attr) ?? "")
    .filter((id) => id.length > 0)
    .sort();
}

function idsInExport(svg: string, attr: string): string[] {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    throw new ExportError("Export did not produce a diagram.");
  }
  return idsByAttr(doc, attr);
}

function assertExportMatchesCanvas(svg: string): void {
  for (const attr of ["data-node-id", "data-edge-id"]) {
    const onCanvas = idsByAttr(diagram, attr);
    const exported = idsInExport(svg, attr);
    if (onCanvas.join("\n") !== exported.join("\n")) {
      throw new ExportError(
        "Export does not match the diagram on screen. Wait for the view to finish drawing, then try again.",
      );
    }
  }
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  const text = String(error);
  return text && text !== "[object Object]" ? text : "Export failed.";
}

function downloadText(filename: string, mime: string, body: string): void {
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function commitExport(format: MacExportFormat, viewName: string): Promise<void> {
  if (format === "open-exchange") {
    await commitOpenExchangeExport();
    return;
  }
  const reason = exportBlockReason();
  if (reason) {
    showExportError(reason);
    return;
  }
  if (!loaded?.ok || !lastLayout || lastLayout.viewName !== viewName) {
    showExportError("The view changed before export. Choose Export… again.");
    return;
  }

  let exported;
  try {
    exported = exportViewpoint(lastLayout, loaded.file);
    if (!exported.svg.includes("<svg") || !exported.html.includes(exported.svg)) {
      throw new ExportError("Export did not produce a diagram.");
    }
    assertExportMatchesCanvas(exported.svg);
  } catch (error) {
    showExportError(error instanceof ExportError ? error.message : errorMessage(error));
    return;
  }

  const api = tauri();
  if (!api) {
    const stem = exportFileStem(exported.viewName);
    try {
      if (format === "html" || format === "both") {
        downloadText(`${stem}.html`, "text/html", exported.html);
      }
      if (format === "svg" || format === "both") {
        downloadText(`${stem}.svg`, "image/svg+xml", exported.svg);
      }
      showError(null);
    } catch (error) {
      showExportError(errorMessage(error));
    }
    return;
  }

  let targets;
  try {
    const picked = await api.core.invoke<string | null>("pick_export_path", {
      suggestedName: exportFileStem(exported.viewName),
      format,
      directory: exportDirectory(),
    });
    if (!picked) {
      return;
    }
    targets = exportSavePaths(picked, format);
  } catch (error) {
    showExportError(error instanceof ExportError ? error.message : errorMessage(error));
    return;
  }

  const jobs: Array<[string, string]> = [];
  if (targets.html) {
    jobs.push([targets.html, exported.html]);
  }
  if (targets.svg) {
    jobs.push([targets.svg, exported.svg]);
  }
  const written: string[] = [];
  try {
    for (const [path, contents] of jobs) {
      await api.core.invoke("write_export_file", { path, contents });
      written.push(path);
    }
  } catch (error) {
    const wrote = written.length > 0 ? `Wrote ${written.join(", ")}.` : "";
    const detail = [errorMessage(error).replace(/\.$/, ""), wrote].filter((part) => part.length > 0).join(" ");
    showExportError(detail);
    return;
  }
  showError(null);
}

/**
 * Write Open Exchange XML for the open model.
 * Same writer as `plein export-open-exchange` (`exportOpenExchange`).
 * Not the viewpoint on the canvas.
 */
async function commitOpenExchangeExport(): Promise<void> {
  if (!loaded?.ok) {
    showOpenExchangeError(
      loaded
        ? "This file did not load, so there is no model to export."
        : "Open a .plein file before exporting.",
    );
    return;
  }
  const model = loaded.model;
  const file = loaded.file;

  let xml: string;
  try {
    const exported = exportOpenExchange(model, { file });
    if (!exported.xml.includes("<model") || !exported.xml.includes("</model>")) {
      throw new ExportError("Export did not produce Open Exchange XML.");
    }
    xml = exported.xml;
  } catch (error) {
    showOpenExchangeError(error instanceof ExportError ? error.message : errorMessage(error));
    return;
  }

  const suggested = openExchangeSuggestedStem(file);
  const api = tauri();
  if (!api) {
    try {
      downloadText(`${suggested}.xml`, "application/xml", xml);
      showError(null);
    } catch (error) {
      showOpenExchangeError(errorMessage(error));
    }
    return;
  }

  let path: string;
  try {
    const picked = await api.core.invoke<string | null>("pick_export_path", {
      suggestedName: suggested,
      format: "open-exchange",
      directory: directoryOfPath(file),
    });
    if (!picked) {
      return;
    }
    const targets = exportSavePaths(picked, "open-exchange");
    if (!targets.xml) {
      throw new ExportError("Export did not produce an XML path.");
    }
    path = targets.xml;
  } catch (error) {
    showOpenExchangeError(error instanceof ExportError ? error.message : errorMessage(error));
    return;
  }

  try {
    await api.core.invoke("write_export_file", { path, contents: xml });
  } catch (error) {
    showOpenExchangeError(errorMessage(error));
    return;
  }
  showError(null);
}

async function boot(): Promise<void> {
  const api = tauri();
  if (api) {
    const startup = await api.core.invoke<string | null>("take_startup_path");
    if (startup) {
      await openPath(startup);
    }
    await api.event.listen("open-file", (event) => {
      void openPath(String(event.payload));
    });
    await api.event.listen("open-dialog", () => {
      void openFromTauriDialog();
    });
    await api.event.listen("import-open-exchange", () => {
      void importFromTauriDialog();
    });
    await api.event.listen("reload-file", () => {
      void reloadOpen();
    });
    await api.event.listen("export-view", () => {
      beginExport();
    });
  }
  void render();
}

void boot();
