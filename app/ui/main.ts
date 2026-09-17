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
  LAYOUT_DIRECTIONS,
  LAYOUT_MODES,
  layoutDirectionTitle,
  layoutModeTitle,
  type LayoutDirection,
  type LayoutMode,
  type LayoutOptions,
  type NestingMode,
} from "../../src/layout.ts";
import {
  retainSelection,
  selectionFromDiagramHit,
  type DiagramSelection,
} from "../../src/selection.ts";

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
const fileInput = document.querySelector("#file-input") as HTMLInputElement;
const fileLabel = document.querySelector("#file-label") as HTMLElement;
const errorBox = document.querySelector("#error") as HTMLElement;
const errorDetail = document.querySelector("#error-detail") as HTMLElement;
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
const modeSwitcher = document.querySelector("#mode-switcher") as HTMLElement;
const directionSwitcher = document.querySelector("#direction-switcher") as HTMLElement;
const nestingSwitcher = document.querySelector("#nesting-switcher") as HTMLElement;

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
/** `file` follows the view’s `autoLayout`; layered/layers is local preview only. */
let modeOverride: "file" | LayoutMode = "file";
/** Drop stale ELK results when the user switches views mid-layout. */
let renderSeq = 0;

function tauri(): TauriBridge | undefined {
  return (window as Window & { __TAURI__?: TauriBridge }).__TAURI__;
}

function isFilesystemPath(file: string): boolean {
  return file.includes("/") || file.includes("\\");
}

function showError(message: string | null): void {
  if (!message) {
    errorBox.hidden = true;
    errorDetail.textContent = "";
    return;
  }
  errorBox.hidden = false;
  errorDetail.textContent = message;
}

/** Open/read failures use the same banner as `checkPlein` / `plein check`. */
function failOpen(file: string, error: unknown): void {
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
    const stroke = group.querySelector("polyline, line, path");
    if (!stroke || group.querySelector(".edge-hit")) {
      continue;
    }
    const hit = stroke.cloneNode() as SVGElement;
    hit.removeAttribute("marker-end");
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

function previewLayoutOptions(): LayoutOptions | undefined {
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
  return options.nesting || options.direction || options.mode ? options : undefined;
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

function renderModeSwitcher(): void {
  const choices: Array<{ id: "file" | LayoutMode; label: string; title: string }> = [
    { id: "file", label: "File", title: "Use autoLayout from the open view" },
    ...LAYOUT_MODES.map((mode) => ({
      id: mode,
      label: mode === "layers" ? "Layers" : "Layered",
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
  renderModeSwitcher();
  renderDirectionSwitcher();
  renderNestingSwitcher();
  if (!loaded?.ok) {
    setCurrentViewChrome("Viewpoint", null);
    diagram.replaceChildren();
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
    return;
  }

  try {
    const browsed = await browseNamedView(loaded.model, viewName, previewLayoutOptions());
    if (seq !== renderSeq) {
      return;
    }
    setCurrentViewChrome(browsed.title, browsed.viewName);
    diagram.innerHTML = browsed.svg;
    const svg = diagram.querySelector("svg");
    if (svg) {
      enhanceEdgeHits(svg);
    }
  } catch (error) {
    if (seq !== renderSeq) {
      return;
    }
    const hint = document.createElement("p");
    hint.className = "diagram-empty";
    hint.textContent = error instanceof Error ? error.message : String(error);
    diagram.replaceChildren(hint);
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
  lastSource = source;
  loaded = loadPleinSource(source, file);
  selectedView = loaded.ok ? firstNamedView(loaded.model) : null;
  lastNamedView = selectedView;
  selectedItem = null;
  void render();
}

function applyReload(source: string, file: string): void {
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

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (selectedItem) {
      event.preventDefault();
      setSelection(null);
    }
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

diagram.addEventListener("click", (event) => {
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
  }
  void render();
}

void boot();
