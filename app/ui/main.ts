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
  edgeId,
  EDGE_ROUTINGS,
  isAutoLayoutEnabled,
  LAYOUT_DIRECTIONS,
  LAYOUT_MODES,
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
  retainSelection,
  selectionFromDiagramHit,
  type DiagramSelection,
} from "../../src/selection.ts";
import {
  clampCanvasZoom,
  nextCanvasZoom,
  placeZoomAnchor,
  wheelGestureIsZoom,
} from "../../src/canvas-zoom.ts";
import {
  ExportError,
  exportSavePaths,
  exportViewpoint,
  isMacExportFormat,
  type MacExportFormat,
} from "../../src/export.ts";
import { exportOpenExchange } from "../../src/open-exchange.ts";

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
const reloadButton = document.querySelector("#reload-button") as HTMLButtonElement;
const exportButton = document.querySelector("#export-button") as HTMLButtonElement;
const fileInput = document.querySelector("#file-input") as HTMLInputElement;
const fileLabel = document.querySelector("#file-label") as HTMLElement;
const errorBox = document.querySelector("#error") as HTMLElement;
const errorLead = document.querySelector("#error-lead") as HTMLElement;
const errorDetail = document.querySelector("#error-detail") as HTMLElement;
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

let loaded: LoadResult | null = null;
let selectedView: string | null = null;
let lastNamedView: string | null = null;
let lastSource: string | null = null;
/** Single element or relationship shared by the diagram and left lists. */
let selectedItem: DiagramSelection | null = null;
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
/** Pointer drag of a node while auto-layout is off. */
let nodeDrag: {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  origins: Map<string, { x: number; y: number }>;
} | null = null;
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
const EXPORT_ERROR_LEAD = "Could not export this view";
const OPEN_EXCHANGE_ERROR_LEAD = "Could not export Open Exchange";
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

/** Open/read failures use the same banner as `checkPlein` / `plein check`. */
function failOpen(file: string, error: unknown): void {
  closeExportDialog(false);
  lastSource = null;
  loaded = { ok: false, file, error: formatLoadError(error) };
  selectedView = null;
  selectedItem = null;
  void render();
}

function setSelection(next: DiagramSelection | null): void {
  selectedItem = next;
  paintSelection();
}

function findByAttr(root: ParentNode, attr: string, value: string): Element | null {
  for (const node of root.querySelectorAll(`[${attr}]`)) {
    if (node.getAttribute(attr) === value) {
      return node;
    }
  }
  return null;
}

/** Wide transparent stroke so relationship lines are clickable. */
function enhanceEdgeHits(svg: SVGElement): void {
  for (const group of svg.querySelectorAll("[data-edge-id]")) {
    // Prefer the full shaft. The arrow lives on a terminal <line> and must not
    // be the only clickable piece.
    const stroke = group.querySelector("polyline, path, line");
    if (!stroke || group.querySelector(".edge-hit")) {
      continue;
    }
    const hit = stroke.cloneNode() as SVGElement;
    hit.removeAttribute("marker-end");
    hit.removeAttribute("marker-start");
    hit.removeAttribute("marker-mid");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "12");
    hit.classList.add("edge-hit");
    group.insertBefore(hit, stroke);
  }
}

function paintListSelection(list: HTMLElement, attr: string, id: string | null): void {
  for (const row of list.querySelectorAll(`[${attr}]`)) {
    const on = id !== null && row.getAttribute(attr) === id;
    row.classList.toggle("selected", on);
    row.setAttribute("aria-selected", on ? "true" : "false");
    if (on) {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
}

function paintSelection(): void {
  const elementId = selectedItem?.kind === "element" ? selectedItem.id : null;
  const relationshipId = selectedItem?.kind === "relationship" ? selectedItem.id : null;
  paintListSelection(elementList, "data-element-id", elementId);
  paintListSelection(relationshipList, "data-relationship-id", relationshipId);

  const svg = diagram.querySelector("svg");
  if (!svg) {
    return;
  }
  for (const marked of svg.querySelectorAll("[data-selected]")) {
    marked.removeAttribute("data-selected");
  }
  if (!selectedItem) {
    return;
  }
  if (selectedItem.kind === "element") {
    const node = findByAttr(svg, "data-node-id", selectedItem.id);
    const container = findByAttr(svg, "data-container-id", selectedItem.id);
    node?.setAttribute("data-selected", "true");
    container?.setAttribute("data-selected", "true");
    (node ?? container)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return;
  }
  const edge = findByAttr(svg, "data-edge-id", selectedItem.id);
  edge?.setAttribute("data-selected", "true");
  edge?.scrollIntoView({ block: "nearest", inline: "nearest" });
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

/** Direction, routing, and nesting stay in Options. Show a non-file preview on the button. */
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
      ? `Options. Direction, routing, and nesting. Current preview: ${summary}.`
      : "Options. Direction, routing, and nesting. File follows the open view.";
  layoutOptionsButton.setAttribute("aria-label", detail);
  layoutOptionsButton.title =
    summary.length > 0
      ? `Direction, routing, and nesting (${summary}). Local preview only.`
      : "Direction, routing, and nesting. Local preview only — not written back to the file.";
}

function forgetCanvasZoom(): void {
  canvasZoom = 1;
  canvasZoomView = null;
  zoomBasisWidth = 0;
  zoomBasisHeight = 0;
  canvasMarginLeft = 0;
  canvasMarginTop = 0;
  delete diagram.dataset.zoom;
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
    diagram.innerHTML = browsed.svg;
    lastLayout = browsed.layout;
    if (browsed.layout.auto === false) {
      diagram.dataset.manualLayout = "true";
    } else {
      delete diagram.dataset.manualLayout;
    }
    const svg = diagram.querySelector("svg");
    if (svg instanceof SVGSVGElement) {
      enhanceEdgeHits(svg);
      if (!applyCanvasZoom(svg)) {
        canvasZoom = 1;
        delete diagram.dataset.zoom;
      } else if (sameView) {
        diagram.scrollLeft = scrollLeft;
        diagram.scrollTop = scrollTop;
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

  if (!loaded) {
    workspace.classList.add("empty");
    emptyHint.hidden = false;
    fileLabel.textContent = "No file open";
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
    showError(loaded.error);
    viewList.replaceChildren();
    elementList.replaceChildren();
    relationshipList.replaceChildren();
    await renderDiagram(seq);
    return;
  }

  showError(null);
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
      item.addEventListener("click", () => {
        setSelection({ kind: "element", id: element.id });
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelection({ kind: "element", id: element.id });
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
      item.addEventListener("click", () => {
        setSelection({ kind: "relationship", id });
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelection({ kind: "relationship", id });
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
      selectedItem = retainSelection(selectedItem, filterModel(loaded.model, selectedView));
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
  autoLayoutOverride = "file";
  lastLayout = null;
  forgetCanvasZoom();
  loaded = loadPleinSource(source, file);
  selectedView = loaded.ok ? firstNamedView(loaded.model) : null;
  lastNamedView = selectedView;
  selectedItem = null;
  void render();
}

function applyReload(source: string, file: string): void {
  closeExportDialog(false);
  lastSource = source;
  const next = reloadPleinSource(source, file, selectedView);
  loaded = next.loaded;
  selectedView = next.selectedView;
  lastNamedView = loaded.ok ? viewAfterReload(loaded.model, lastNamedView) : lastNamedView;
  selectedItem = loaded.ok
    ? retainSelection(selectedItem, filterModel(loaded.model, selectedView))
    : null;
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
      openSource(opened.contents, opened.path);
    }
  } catch (error) {
    failOpen("Open…", error);
  }
}

async function openPath(path: string): Promise<void> {
  const api = tauri();
  if (!api) {
    return;
  }
  try {
    const opened = await api.core.invoke<OpenedFile>("read_plein_file", { path });
    openSource(opened.contents, opened.path);
  } catch (error) {
    failOpen(path, error);
  }
}

async function reloadOpen(): Promise<void> {
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
    openSource(await file.text(), file.name);
  } catch (error) {
    failOpen(file.name, error);
  }
  fileInput.value = "";
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
    if (selectedItem) {
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

function idsMovedWith(rootId: string): string[] {
  const nodes = lastLayout?.nodes ?? [];
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const parent = queue.shift();
    if (!parent) {
      break;
    }
    for (const node of nodes) {
      if (node.parentId === parent) {
        ids.push(node.id);
        queue.push(node.id);
      }
    }
  }
  return ids;
}

function dragShift(
  svg: SVGSVGElement,
  drag: NonNullable<typeof nodeDrag>,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const start = svgLocalPoint(svg, drag.startClientX, drag.startClientY);
  const now = svgLocalPoint(svg, clientX, clientY);
  if (!start || !now) {
    return null;
  }
  let shiftX = now.x - start.x;
  let shiftY = now.y - start.y;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const origin of drag.origins.values()) {
    minX = Math.min(minX, origin.x + shiftX);
    minY = Math.min(minY, origin.y + shiftY);
  }
  if (minX < 0) {
    shiftX -= minX;
  }
  if (minY < 0) {
    shiftY -= minY;
  }
  return { x: shiftX, y: shiftY };
}

diagram.addEventListener("pointerdown", (event) => {
  if (lastLayout?.auto !== false || event.button !== 0) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const nodeEl = target.closest("[data-node-id]");
  if (!nodeEl || !diagram.contains(nodeEl)) {
    return;
  }
  const id = nodeEl.getAttribute("data-node-id");
  if (!id || !lastLayout) {
    return;
  }
  const origins = new Map<string, { x: number; y: number }>();
  for (const movedId of idsMovedWith(id)) {
    const node = lastLayout.nodes.find((candidate) => candidate.id === movedId);
    if (node) {
      origins.set(movedId, { x: node.x, y: node.y });
    }
  }
  if (!origins.has(id)) {
    return;
  }
  nodeDrag = {
    id,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false,
    origins,
  };
  try {
    diagram.setPointerCapture(event.pointerId);
  } catch {
    // Capture is best-effort; move and up still reach the diagram.
  }
  event.preventDefault();
});

diagram.addEventListener("pointermove", (event) => {
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
  const shift = dragShift(svg, nodeDrag, event.clientX, event.clientY);
  if (!shift) {
    return;
  }
  for (const [movedId, origin] of nodeDrag.origins) {
    const group = findByAttr(svg, "data-node-id", movedId);
    group?.setAttribute(
      "transform",
      `translate(${Math.round(origin.x + shift.x)} ${Math.round(origin.y + shift.y)})`,
    );
  }
});

diagram.addEventListener("pointerup", (event) => {
  if (!nodeDrag || event.pointerId !== nodeDrag.pointerId) {
    return;
  }
  const drag = nodeDrag;
  nodeDrag = null;
  diagram.classList.remove("is-dragging");
  try {
    if (diagram.hasPointerCapture(event.pointerId)) {
      diagram.releasePointerCapture(event.pointerId);
    }
  } catch {
    // Pointer capture was not taken.
  }
  if (!drag.moved) {
    return;
  }
  suppressDiagramClick = true;
  const viewName = namedViewForDiagram();
  const svg = diagram.querySelector("svg");
  if (!viewName || !(svg instanceof SVGSVGElement) || !lastLayout) {
    return;
  }
  const shift = dragShift(svg, drag, event.clientX, event.clientY);
  if (!shift) {
    return;
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
  if (!nodeDrag || event.pointerId !== nodeDrag.pointerId) {
    return;
  }
  nodeDrag = null;
  diagram.classList.remove("is-dragging");
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
  if (nodeDrag) {
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
    if (target === diagram) {
      setSelection(null);
    }
    return;
  }
  setSelection(
    selectionFromDiagramHit({
      nodeId: target.closest("[data-node-id]")?.getAttribute("data-node-id"),
      edgeId: target.closest("[data-edge-id]")?.getAttribute("data-edge-id"),
      containerId: target.closest("[data-container-id]")?.getAttribute("data-container-id"),
    }),
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

/** Save-panel stem for Open Exchange. The `.plein` file name, not the view. */
function openExchangeSuggestedStem(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? "";
  const stem = base.replace(/\.plein$/i, "").replace(/^\.+/, "").trim();
  return stem.length > 0 ? stem : "model";
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
