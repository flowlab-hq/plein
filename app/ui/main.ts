import { filterModel, loadPleinSource, type LoadResult } from "../../src/list-model.ts";

type TauriBridge = {
  core: {
    invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
  event: {
    listen: (event: string, handler: (event: { payload: string }) => void) => Promise<unknown>;
  };
};

type OpenedFile = {
  path: string;
  contents: string;
};

const openButton = document.querySelector("#open-button") as HTMLButtonElement;
const fileInput = document.querySelector("#file-input") as HTMLInputElement;
const fileLabel = document.querySelector("#file-label") as HTMLElement;
const errorBox = document.querySelector("#error") as HTMLElement;
const workspace = document.querySelector("#workspace") as HTMLElement;
const emptyHint = document.querySelector("#empty-hint") as HTMLElement;
const viewList = document.querySelector("#view-list") as HTMLElement;
const elementList = document.querySelector("#element-list") as HTMLElement;
const relationshipList = document.querySelector("#relationship-list") as HTMLElement;
const elementsHeading = document.querySelector("#elements-heading") as HTMLElement;
const relationshipHeading = document.querySelector("#relationship-heading") as HTMLElement;

let loaded: LoadResult | null = null;
let selectedView: string | null = null;

function tauri(): TauriBridge | undefined {
  return (window as Window & { __TAURI__?: TauriBridge }).__TAURI__;
}

function showError(message: string | null): void {
  if (!message) {
    errorBox.hidden = true;
    errorBox.textContent = "";
    return;
  }
  errorBox.hidden = false;
  errorBox.textContent = message;
}

function render(): void {
  if (!loaded) {
    workspace.classList.add("empty");
    emptyHint.hidden = false;
    fileLabel.textContent = "No file open";
    showError(null);
    viewList.replaceChildren();
    elementList.replaceChildren();
    relationshipList.replaceChildren();
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
      item.innerHTML = `<span class="kw">${escapeHtml(element.keyword)}</span><code>${escapeHtml(element.id)}</code><span>${escapeHtml(element.label)}</span>`;
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
  selectedView = null;
  loaded = loadPleinSource(source, file);
  render();
}

async function openFromTauriDialog(): Promise<void> {
  const api = tauri();
  if (!api) {
    fileInput.click();
    return;
  }
  const opened = await api.core.invoke<OpenedFile | null>("open_plein_dialog");
  if (opened) {
    openSource(opened.contents, opened.path);
  }
}

async function openPath(path: string): Promise<void> {
  const api = tauri();
  if (!api) {
    return;
  }
  const opened = await api.core.invoke<OpenedFile>("read_plein_file", { path });
  openSource(opened.contents, opened.path);
}

openButton.addEventListener("click", () => {
  void openFromTauriDialog();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }
  openSource(await file.text(), file.name);
  fileInput.value = "";
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
  const file = event.dataTransfer?.files[0];
  if (!file) {
    return;
  }
  openSource(await file.text(), file.name);
});

async function boot(): Promise<void> {
  const api = tauri();
  if (api) {
    const startup = await api.core.invoke<string | null>("take_startup_path");
    if (startup) {
      await openPath(startup);
    }
    await api.event.listen("open-file", (event) => {
      void openPath(event.payload);
    });
  }
  render();
}

void boot();
