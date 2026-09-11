import {
  filterModel,
  firstNamedView,
  formatLoadError,
  loadPleinSource,
  reloadPleinSource,
  viewAfterReload,
  type LoadResult,
} from "../../src/list-model.ts";
import { browseNamedView, namedViews, viewSwitcherLabel } from "../../src/browser.ts";
import { elementStyle } from "../../src/archimate-style.ts";

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
const diagramHeading = document.querySelector("#diagram-heading") as HTMLElement;
const diagram = document.querySelector("#diagram") as HTMLElement;
const diagramViews = document.querySelector("#diagram-views") as HTMLElement;

let loaded: LoadResult | null = null;
let selectedView: string | null = null;
let lastNamedView: string | null = null;
let lastSource: string | null = null;

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
  render();
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

function selectNamedView(name: string): void {
  selectedView = name;
  lastNamedView = name;
  render();
}

function renderViewSwitcher(): void {
  if (!loaded?.ok) {
    diagramViews.replaceChildren();
    return;
  }
  const current = namedViewForDiagram();
  diagramViews.replaceChildren(
    ...namedViews(loaded.model).map((view) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.textContent = viewSwitcherLabel(view);
      tab.title = view.name;
      tab.setAttribute("aria-selected", view.name === current ? "true" : "false");
      tab.addEventListener("click", () => {
        selectNamedView(view.name);
      });
      return tab;
    }),
  );
}

function renderDiagram(): void {
  renderViewSwitcher();
  if (!loaded?.ok) {
    diagramHeading.textContent = "Viewpoint";
    diagram.replaceChildren();
    return;
  }

  const viewName = namedViewForDiagram();
  const exists = viewName !== null && loaded.model.views.some((view) => view.name === viewName);
  if (!viewName || !exists) {
    diagramHeading.textContent = "Viewpoint";
    const hint = document.createElement("p");
    hint.className = "diagram-empty";
    hint.textContent = "This file has no named viewpoint in the views block.";
    diagram.replaceChildren(hint);
    return;
  }

  const browsed = browseNamedView(loaded.model, viewName);
  diagramHeading.textContent = browsed.title;
  diagram.innerHTML = browsed.svg;
}

function render(): void {
  reloadButton.disabled = loaded === null;

  if (!loaded) {
    workspace.classList.add("empty");
    emptyHint.hidden = false;
    fileLabel.textContent = "No file open";
    showError(null);
    viewList.replaceChildren();
    elementList.replaceChildren();
    relationshipList.replaceChildren();
    renderDiagram();
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
    renderDiagram();
    return;
  }

  showError(null);
  workspace.classList.remove("empty");
  const list = filterModel(loaded.model, selectedView);

  const views = [
    buttonForView(null, selectedView === null, "All"),
    ...list.views.map((view) => {
      const label = view.title ? `${view.name} — ${view.title}` : view.name;
      return buttonForView(view.name, selectedView === view.name, label);
    }),
  ];
  viewList.replaceChildren(...views);

  elementsHeading.textContent = `Elements (${list.elements.length})`;
  elementList.replaceChildren(
    ...list.elements.map((element) => {
      const item = document.createElement("li");
      const style = elementStyle(element.keyword);
      item.innerHTML = `<span class="swatch" style="background:${escapeHtml(style.fill)}" title="${escapeHtml(style.layer)}"></span><span class="kw">${escapeHtml(element.keyword)}</span><code>${escapeHtml(element.id)}</code><span>${escapeHtml(element.label)}</span>`;
      return item;
    }),
  );

  relationshipHeading.textContent = `Relationships (${list.relationships.length})`;
  relationshipList.replaceChildren(
    ...list.relationships.map((rel) => {
      const item = document.createElement("li");
      item.className = "rel";
      item.innerHTML = `<code>${escapeHtml(rel.source)}</code><span class="meta">→</span><code>${escapeHtml(rel.target)}</code><span class="meta">:</span><span class="kw">${escapeHtml(rel.type)}</span>`;
      return item;
    }),
  );

  renderDiagram();
}

function buttonForView(name: string | null, current: boolean, label: string): HTMLLIElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (current) {
    button.setAttribute("aria-current", "true");
  }
  button.addEventListener("click", () => {
    selectedView = name;
    if (name !== null) {
      lastNamedView = name;
    }
    render();
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
  render();
}

function applyReload(source: string, file: string): void {
  lastSource = source;
  const next = reloadPleinSource(source, file, selectedView);
  loaded = next.loaded;
  selectedView = next.selectedView;
  lastNamedView = loaded.ok ? viewAfterReload(loaded.model, lastNamedView) : lastNamedView;
  render();
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
  render();
}

void boot();
