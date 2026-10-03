import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Mac UI lists Elements and Relationships in the left sidebar, not a bottom strip", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const sidebarStart = html.indexOf('<aside class="sidebar"');
  const sidebarEnd = html.indexOf("</aside>");
  const diagramStart = html.indexOf('<section class="diagram-pane">');

  assert.notEqual(sidebarStart, -1, "left sidebar is present");
  assert.notEqual(sidebarEnd, -1);
  assert.notEqual(diagramStart, -1, "diagram pane is present");
  assert.ok(diagramStart > sidebarEnd, "diagram follows the sidebar (no lists below the canvas)");

  const sidebar = html.slice(sidebarStart, sidebarEnd);
  assert.match(sidebar, /id="view-list"/);
  assert.match(sidebar, /id="element-list"/);
  assert.match(sidebar, /id="relationship-list"/);
  assert.match(sidebar, /id="elements-heading"/);
  assert.match(sidebar, /id="relationship-heading"/);
  assert.match(sidebar, /data-panel="elements"/);
  assert.match(sidebar, /data-panel="relationships"/);
  assert.match(sidebar, /id="element-list"[^>]*role="listbox"/);
  assert.match(sidebar, /id="relationship-list"[^>]*role="listbox"/);
  assert.equal(html.includes('class="lists"'), false, "bottom list strip is gone");
});

test("Mac UI wires bidirectional diagram ↔ list selection", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  assert.match(ui, /selectionFromDiagramHit/);
  assert.match(ui, /retainSelections/);
  assert.match(ui, /nextSelectionFromClick/);
  assert.match(ui, /selectionFromMarquee/);
  assert.match(ui, /groupDragIds/);
  assert.match(ui, /data-element-id/);
  assert.match(ui, /data-relationship-id/);
  assert.match(ui, /setSelection\(null\)/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(ui, /event\.shiftKey/);
  assert.match(css, /\[data-selected="true"\]/);
  assert.match(css, /\.rows li\.selected/);
  assert.match(css, /data-selection-bounds/);
  assert.match(css, /selection-marquee/);
  assert.match(ui, /focusShade/);
  assert.match(ui, /paintCanvasFocus/);
  assert.match(ui, /classList\.remove\("is-focus"\)/);
  assert.match(css, /\.diagram\.is-focus \[data-node-id\]:not\(\[data-focus-lit="true"\]\)/);
  assert.match(css, /\.diagram\.is-focus \[data-edge-id\]:not\(\[data-focus-lit="true"\]\)/);
  assert.match(css, /opacity:\s*0\.22/);
  assert.match(html, /aria-multiselectable="true"/);
});

test("connector hit targets stay under element boxes", () => {
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  assert.match(ui, /g\.edge-hits/);
  assert.match(ui, /querySelector\(":scope > g\.nodes"\)/);
  assert.match(ui, /insertBefore\(hits, anchor\)/);
  assert.match(ui, /data-edge-hit-id/);
  assert.match(ui, /closest\("\[data-edge-hit-id\]"\)/);
  assert.match(css, /data-edge-hit-id/);
});

test("Mac UI keeps the current view name visible outside the scrollable canvas", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");

  const currentView = html.indexOf('id="current-view"');
  const heading = html.indexOf('id="diagram-heading"');
  const canvas = html.indexOf('id="diagram" class="diagram"');
  assert.notEqual(currentView, -1, "current-view chrome is present");
  assert.notEqual(heading, -1, "diagram heading holds the view name");
  assert.notEqual(canvas, -1);
  assert.ok(currentView < heading && heading < canvas, "view name sits above the canvas, not inside it");
  assert.match(html, /aria-live="polite"/);
  assert.equal(html.includes('class="diagram-toolbar"'), false, "wrapping toolbar no longer hides the name among tabs");
  assert.equal(html.includes('id="diagram-views"'), false, "top named-view tablist is gone");
  assert.equal(html.includes('class="view-switcher"'), false, "top view-switcher chrome is gone");
  assert.equal(html.includes('role="tablist"'), false, "no tablist switcher above the canvas");
  assert.match(html, /id="view-list"/);

  const chrome = css.match(/\.diagram-chrome\s*\{[^}]+\}/);
  assert.ok(chrome, "diagram-chrome rule exists");
  assert.match(chrome[0]!, /flex-shrink:\s*0/);
  const diagram = css.match(/\.diagram\s*\{[^}]+\}/);
  assert.ok(diagram, "diagram rule exists");
  assert.match(diagram[0]!, /overflow:\s*auto/);

  assert.match(ui, /setCurrentViewChrome/);
  assert.match(ui, /showingOnCanvas/);
  assert.match(ui, /Showing/);
  assert.match(ui, /currentViewCaption/);
  assert.match(ui, /label: viewSwitcherLabel\(view\)/);
  assert.equal(ui.includes("renderViewSwitcher"), false, "top tab renderer is gone");
  assert.equal(ui.includes("diagramViews"), false, "top tablist element is unused");
  assert.equal(/\.view-switcher\s*\{/.test(css), false, "top view-switcher CSS is gone");
});

test("Mac UI puts layout direction controls in the diagram chrome", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");

  const chrome = html.indexOf('class="diagram-chrome"');
  const controls = html.indexOf('class="layout-controls"');
  const layoutMenu = html.indexOf('<details id="layout-menu"');
  const layoutValue = html.indexOf('id="layout-menu-value"');
  const autoLayout = html.indexOf('id="auto-layout-switcher"');
  const mode = html.indexOf('id="mode-switcher"');
  const options = html.indexOf('id="layout-options"');
  const optionsPanel = html.indexOf('id="layout-options-panel"');
  const direction = html.indexOf('id="direction-switcher"');
  const routing = html.indexOf('id="routing-switcher"');
  const nesting = html.indexOf('id="nesting-switcher"');
  const viewMenu = html.indexOf('<details id="view-menu"');
  const viewValue = html.indexOf('id="view-menu-value"');
  const focus = html.indexOf('id="focus-switcher"');
  const gridMenu = html.indexOf('<details id="grid-menu"');
  const gridValue = html.indexOf('id="grid-menu-value"');
  const gridToggle = html.indexOf('id="canvas-grid-toggle"');
  const spacing = html.indexOf('id="canvas-grid-size"');
  const canvas = html.indexOf('id="diagram" class="diagram"');
  assert.notEqual(chrome, -1);
  assert.notEqual(layoutMenu, -1, "layout menu is present");
  assert.notEqual(autoLayout, -1, "auto-layout switcher is present");
  assert.notEqual(mode, -1, "mode switcher is present");
  assert.notEqual(options, -1, "layout options section is present");
  assert.notEqual(optionsPanel, -1, "layout options panel is present");
  assert.notEqual(direction, -1, "direction switcher is present");
  assert.notEqual(routing, -1, "routing switcher is present");
  assert.notEqual(nesting, -1, "nesting switcher remains");
  assert.notEqual(viewMenu, -1, "view menu is present");
  assert.notEqual(focus, -1, "focus mode switcher is present");
  assert.notEqual(gridMenu, -1, "grid menu is present");
  assert.ok(
    chrome < controls &&
      controls < layoutMenu &&
      layoutMenu < layoutValue &&
      layoutValue < autoLayout &&
      autoLayout < mode &&
      mode < options &&
      options < optionsPanel &&
      optionsPanel < direction &&
      direction < routing &&
      routing < nesting &&
      nesting < viewMenu &&
      viewMenu < viewValue &&
      viewValue < focus &&
      focus < gridMenu &&
      gridMenu < gridValue &&
      gridValue < gridToggle &&
      gridToggle < spacing &&
      spacing < canvas,
    "one chrome row is Layout, then View, then Grid menus",
  );
  const layoutGroup = html.slice(layoutMenu, viewMenu);
  assert.match(layoutGroup, /<summary>/);
  assert.match(layoutGroup, /class="chrome-menu-label">Layout</);
  assert.match(layoutGroup, /id="layout-menu-value"[^>]*>File · Default</);
  assert.match(layoutGroup, /id="auto-layout-switcher"/);
  assert.match(layoutGroup, /id="mode-switcher"/);
  assert.match(layoutGroup, /id="direction-switcher"/);
  assert.match(layoutGroup, /id="routing-switcher"/);
  assert.match(layoutGroup, /id="nesting-switcher"/);
  assert.match(layoutGroup, /class="chrome-menu-heading">Options</);
  assert.equal(layoutGroup.includes(" open"), false, "layout menu starts closed");
  const panel = html.slice(optionsPanel, viewMenu);
  assert.match(panel, /id="direction-switcher"/);
  assert.match(panel, /id="routing-switcher"/);
  assert.match(panel, /id="nesting-switcher"/);
  assert.equal(panel.includes('id="auto-layout-switcher"'), false, "auto layout is its own group in the Layout menu");
  assert.equal(panel.includes('id="mode-switcher"'), false, "mode is its own group in the Layout menu");
  assert.equal(panel.includes('id="focus-switcher"'), false, "focus stays in the View menu");
  assert.equal(panel.includes('id="canvas-grid-size"'), false, "snap spacing sits in Grid, not in Layout options");
  const viewGroup = html.slice(viewMenu, gridMenu);
  assert.match(viewGroup, /class="chrome-menu-label">View</);
  assert.match(viewGroup, /id="view-menu-value"[^>]*>Focus On</);
  assert.match(viewGroup, /id="focus-switcher"/);
  assert.equal(viewGroup.includes(" open"), false, "view menu starts closed");
  assert.equal(viewGroup.includes('id="canvas-grid-toggle"'), false, "grid visibility is not a View control");
  assert.equal(viewGroup.includes('id="canvas-grid-size"'), false, "spacing is not a View control");
  const gridGroup = html.slice(gridMenu, canvas);
  assert.match(gridGroup, /class="chrome-menu-label">Grid</);
  assert.match(gridGroup, /id="grid-menu-value"[^>]*>Lines · 24</);
  assert.match(gridGroup, /id="canvas-grid-toggle"/);
  assert.match(gridGroup, /id="canvas-grid-size"/);
  assert.equal(gridGroup.includes(" open"), false, "grid menu starts closed");
  assert.equal(html.includes('class="chrome-cluster"'), false, "layout and view are not a chip row");
  assert.equal(html.includes('aria-label="Viewing"'), false, "Viewing is not a chrome group");
  assert.equal(html.includes(">Viewing<"), false);
  const diagramChrome = html.slice(chrome, canvas);
  assert.equal((diagramChrome.match(/role="toolbar"/g) ?? []).length, 1, "one toolbar, not a ribbon");
  assert.equal(diagramChrome.includes('role="tab"'), false, "chrome has no ribbon tabs");
  assert.equal(diagramChrome.includes("current-view-kicker"), false, "view name does not reuse the View group label");
  assert.equal((diagramChrome.match(/<details id="(?:layout|view|grid)-menu"/g) ?? []).length, 3);
  const modeFn = ui.slice(ui.indexOf("function renderModeSwitcher"), ui.indexOf("function renderDirectionSwitcher"));
  assert.match(modeFn, /label:\s*"Default"/);
  assert.equal(/\blabel:\s*"File"/.test(modeFn), false, "Mode does not use File as a chrome label");
  assert.match(ui, /let focusMode: "off" \| "on" = "on"/);
  assert.match(ui, /focusMode !== "on"/);
  assert.match(ui, /renderFocusSwitcher/);
  assert.match(html, /chrome-optional">optional</);
  assert.match(html, /aria-label="Focus mode, optional"/);
  assert.match(html, /aria-label="Auto layout"/);
  assert.match(html, /aria-label="Layout mode"/);
  assert.match(html, /aria-label="Layout direction"/);
  assert.match(html, /aria-label="Edge routing"/);
  assert.match(html, /class="layout-controls"/);
  assert.equal(html.includes('aria-controls="layout-options-panel"'), false, "options live in the Layout menu");
  assert.equal(html.includes('class="view-switcher"'), false);

  assert.match(ui, /autoLayoutOverride/);
  assert.match(ui, /manualPositions/);
  assert.match(ui, /selectAutoLayout/);
  assert.match(ui, /modeOverride/);
  assert.match(ui, /directionOverride/);
  assert.match(ui, /routingOverride/);
  assert.match(ui, /LAYOUT_MODES/);
  assert.match(ui, /LAYOUT_DIRECTIONS/);
  assert.match(ui, /EDGE_ROUTINGS/);
  assert.match(ui, /renderAutoLayoutSwitcher/);
  assert.match(ui, /renderModeSwitcher/);
  assert.match(ui, /renderDirectionSwitcher/);
  assert.match(ui, /renderRoutingSwitcher/);
  assert.match(ui, /syncLayoutMenu/);
  assert.match(ui, /syncViewMenu/);
  assert.match(ui, /syncGridMenu/);
  assert.match(ui, /layoutMenuValue\.textContent|setMenuSummary\(layoutMenu, layoutMenuValue/);
  assert.match(ui, /closeChromeMenus/);
  assert.match(ui, /pointerdown/);
  assert.equal(ui.includes("placeLayoutOptionsPanel"), false, "the chrome row no longer scrolls a fixed options panel");
  assert.equal(ui.includes("syncLayoutOptionsButton"), false);
  assert.match(css, /data-manual-layout/);

  const openSource = ui.slice(ui.indexOf("function openSource"), ui.indexOf("function applyReload"));
  const applyReload = ui.slice(ui.indexOf("function applyReload"), ui.indexOf("async function openFromTauriDialog"));
  assert.match(openSource, /manualPositions\.clear\(\)/);
  assert.equal(
    applyReload.includes("manualPositions.clear"),
    false,
    "Reload keeps frozen positions",
  );
  assert.match(css, /\.layout-controls\s*\{/);
  assert.match(css, /\.layout-switcher\s*,/);
  assert.match(css, /\.chrome-menu\s*\{/);
  assert.match(css, /\.chrome-menu-panel\s*\{/);
  assert.match(css, /\.chrome-menu-value\s*\{/);
  const diagramChromeCss = css.match(/\.diagram-chrome\s*\{[^}]+\}/);
  assert.ok(diagramChromeCss, "diagram-chrome rule exists");
  assert.match(diagramChromeCss[0]!, /flex-wrap:\s*nowrap/);
  const layoutControlsCss = css.match(/\.layout-controls\s*\{[^}]+\}/);
  assert.ok(layoutControlsCss);
  assert.match(layoutControlsCss[0]!, /flex-wrap:\s*nowrap/);
  assert.match(layoutControlsCss[0]!, /overflow:\s*visible/);
  assert.equal(/overflow-x:\s*auto/.test(layoutControlsCss[0]!), false, "controls do not scroll horizontally");
  assert.equal(/scrollbar-width/.test(layoutControlsCss[0]!), false, "no scrollbar painted on the controls");
  const menuPanelCss = css.match(/\.chrome-menu-panel\s*\{[^}]+\}/);
  assert.ok(menuPanelCss);
  assert.match(menuPanelCss[0]!, /position:\s*absolute/);
  assert.equal(/position:\s*fixed/.test(menuPanelCss[0]!), false);
  assert.ok(controls < layoutMenu, "menus live in the single layout toolbar");
});

test("Mac UI switches named views from the left sidebar only", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");

  const sidebarStart = html.indexOf('<aside class="sidebar"');
  const sidebarEnd = html.indexOf("</aside>");
  const diagramStart = html.indexOf('<section class="diagram-pane">');
  const currentView = html.indexOf('id="current-view"');
  const sidebar = html.slice(sidebarStart, sidebarEnd);
  const pane = html.slice(diagramStart);

  assert.match(sidebar, /id="view-list"/, "left Views list remains the switcher");
  assert.equal(pane.includes('id="view-list"'), false);
  assert.ok(currentView > diagramStart, "current view name stays above the canvas");
  assert.match(pane, /id="current-view"/);
  assert.match(pane, /id="diagram-heading"/);
  assert.match(ui, /viewList\.replaceChildren/);
  assert.match(ui, /buttonForView/);
});

test("toolbar brand mark is the locked B2 monogram", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const svg = readFileSync(join(repoRoot, "app/ui/mark.svg"), "utf8");
  const brandStart = html.indexOf('<div class="brand">');
  const brand = html.slice(brandStart, html.indexOf("</div>", brandStart));

  assert.match(brand, /<img class="mark" src="\.\/mark\.svg"/);
  assert.match(brand, /width="18"/);
  assert.match(brand, /height="18"/);
  assert.equal(html.includes('class="mark" aria-hidden="true"></span>'), false);

  const mark = css.match(/\.mark\s*\{[^}]+\}/);
  assert.ok(mark, "mark rule exists");
  assert.match(mark[0]!, /width:\s*18px/);
  assert.match(mark[0]!, /height:\s*18px/);
  assert.equal(/linear-gradient/.test(mark[0]!), false, "old blue-green square is gone");

  assert.match(svg, /viewBox="0 0 524 524"/);
  assert.match(svg, /fill="#fbf9fa"/);
  assert.match(svg, /fill="#1170fe"/);
  assert.match(svg, /fill="#fe6f65"/);
  assert.match(svg, /<circle\b/);
});

test("browser preview serves the B2 icon as favicon.ico", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const headEnd = html.indexOf("</head>");
  const head = html.slice(0, headEnd);
  const favicon = readFileSync(join(repoRoot, "app/ui/favicon.ico"));
  const appIcon = readFileSync(join(repoRoot, "app/src-tauri/icons/icon.ico"));

  assert.match(head, /<link rel="icon" href="\.\/favicon\.ico" type="image\/x-icon"\s*\/>/);
  assert.equal(favicon.readUInt16LE(0), 0, "ICO reserved field");
  assert.equal(favicon.readUInt16LE(2), 1, "ICO type is icon");
  assert.ok(favicon.readUInt16LE(4) >= 1, "ICO contains at least one image");
  assert.deepEqual(favicon, appIcon, "preview favicon is the existing product icon");
});

test("workspace CSS is a single-row sidebar + canvas (no bottom list row)", () => {
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const workspace = css.match(/\.workspace\s*\{[^}]+\}/);
  assert.ok(workspace, "workspace rule exists");
  assert.match(
    workspace[0]!,
    /grid-template-columns:\s*minmax\(240px,\s*280px\)\s+minmax\(0,\s*1fr\)\s+minmax\(240px,\s*300px\)/,
  );
  assert.match(css, /\.workspace\.inspector-collapsed\s*\{[^}]*44px/);
  assert.match(workspace[0]!, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.equal(/grid-template-rows:\s*minmax\(240px/.test(css), false);
  assert.equal(/\.lists\s*\{/.test(css), false);
});

test("Open, Save, Import, and Export live in the File menu, not the toolbar chrome", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const rust = readFileSync(join(repoRoot, "app/src-tauri/src/lib.rs"), "utf8");

  const menuStart = html.indexOf('<details id="file-menu"');
  const menuEnd = html.indexOf("</details>", menuStart);
  assert.ok(menuStart !== -1 && menuEnd > menuStart, "in-app File menu exists for browser preview");
  const fileMenu = html.slice(menuStart, menuEnd);
  assert.match(fileMenu, /\shidden\b/, "in-app File menu stays hidden when the native menu bar is present");
  assert.match(fileMenu, /id="open-button"/);
  assert.match(fileMenu, /id="save-button"/);
  assert.match(fileMenu, /id="import-button"/);
  assert.match(fileMenu, /Import Open Exchange XML…/);
  assert.match(fileMenu, /id="export-button"/);
  assert.match(fileMenu, /id="reload-button"/);
  assert.ok(
    fileMenu.indexOf('id="open-button"') < fileMenu.indexOf('id="save-button"') &&
      fileMenu.indexOf('id="save-button"') < fileMenu.indexOf('id="import-button"') &&
      fileMenu.indexOf('id="import-button"') < fileMenu.indexOf('id="export-button"') &&
      fileMenu.indexOf('id="export-button"') < fileMenu.indexOf('id="reload-button"'),
    "File menu order matches the native menu",
  );

  const toolbar = html.slice(html.indexOf('<header class="toolbar">'), html.indexOf("</header>"));
  const chrome = toolbar.replace(fileMenu, "");
  for (const id of ["open-button", "save-button", "import-button", "export-button", "reload-button"]) {
    assert.equal(chrome.includes(`id="${id}"`), false, `${id} is not a toolbar button`);
  }

  assert.match(ui, /function useInAppFileMenu/);
  assert.match(ui, /if \(!tauri\(\)\) \{\s*fileMenu\.hidden = false;\s*\}/);
  assert.match(ui, /key === "o"/);
  assert.match(ui, /key === "s"/);
  assert.match(ui, /event\.key\.toLowerCase\(\) === "i"/);
  assert.match(ui, /event\.key\.toLowerCase\(\) === "e"/);
  assert.match(ui, /listen\("open-dialog"/);
  assert.match(ui, /listen\("save-positions"/);
  assert.match(ui, /listen\("import-open-exchange"/);
  assert.match(ui, /listen\("export-view"/);
  assert.match(ui, /listen\("reload-file"/);

  assert.match(rust, /"open", "Open…"/);
  assert.match(rust, /CmdOrCtrl\+O/);
  assert.match(rust, /"save", "Save"/);
  assert.match(rust, /CmdOrCtrl\+S/);
  assert.match(rust, /"import-open-exchange",\s*"Import Open Exchange XML…"/);
  assert.match(rust, /CmdOrCtrl\+Shift\+I/);
  assert.match(rust, /"export", "Export…"/);
  assert.match(rust, /CmdOrCtrl\+Shift\+E/);
  assert.match(rust, /"reload", "Reload"/);
  assert.match(rust, /CmdOrCtrl\+R/);
  assert.match(rust, /Submenu::with_items\(\s*app,\s*"File"/);
});

test("title bar shows a short name and a dirty dot, not the path or Unsaved label", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");

  const menuStart = html.indexOf('<details id="file-menu"');
  const fileMenu = html.slice(menuStart, html.indexOf("</details>", menuStart));
  const toolbar = html.slice(html.indexOf('<header class="toolbar">'), html.indexOf("</header>"));
  const chrome = toolbar.replace(fileMenu, "");
  assert.match(chrome, /id="file-label"/);
  assert.match(chrome, /id="unsaved-dot"/);
  assert.match(chrome, /aria-label="Unsaved"/);
  assert.equal(chrome.includes("Unsaved —"), false);
  assert.equal(fileMenu.includes('id="reload-button"'), true);

  const sync = ui.slice(ui.indexOf("function syncSaveChrome"), ui.indexOf("function documentName"));
  assert.match(sync, /documentName\(loaded\.file\)/);
  assert.match(sync, /fileLabel\.title = loaded\.file/);
  assert.match(sync, /unsavedDot\.hidden = !dirty/);
  assert.equal(sync.includes("Unsaved —"), false);
  assert.equal(sync.includes("fileLabel.textContent = loaded.file"), false);
  assert.match(ui, /function documentName\(file: string\)/);
  assert.match(ui, /file\.split\(\/\[\/\\\\\]\/\)/);

  assert.match(css, /\.unsaved-dot\s*\{/);
  assert.match(css, /border-radius:\s*50%/);
  assert.match(css, /\.unsaved-dot\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.equal(
    /file-label\[data-dirty="true"\]\s*\{[^}]*font-weight:\s*600/.test(css),
    false,
    "dirty state is not a heavy header label",
  );
});

test("Mac UI saves manual positions from the File menu", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const rust = readFileSync(join(repoRoot, "app/src-tauri/src/lib.rs"), "utf8");

  const menuStart = html.indexOf('<details id="file-menu"');
  const fileMenu = html.slice(menuStart, html.indexOf("</details>", menuStart));
  assert.match(fileMenu, /id="save-button"/);
  const toolbar = html.slice(html.indexOf('<header class="toolbar">'), html.indexOf("</header>"));
  assert.equal(toolbar.replace(fileMenu, "").includes('id="save-button"'), false);
  assert.match(ui, /writeManualPositions/);
  assert.match(ui, /manualPositionsAreDirty/);
  assert.match(ui, /syncSaveChrome/);
  assert.match(ui, /data-dirty/);
  assert.match(ui, /save-positions/);
  assert.match(ui, /key === "s"/);
  assert.match(ui, /groupDragIds/);
  assert.match(ui, /resizeEdgeAtPoint/);
  assert.match(ui, /resizeBoxByEdge/);
  assert.match(css, /ew-resize/);
  assert.match(css, /ns-resize/);
  assert.match(css, /file-label\[data-dirty="true"\]/);
  assert.match(rust, /"save", "Save"/);
  assert.match(rust, /CmdOrCtrl\+S/);
  assert.match(rust, /save-positions/);
});

test("Mac UI has a collapsible right inspector for element name and notes", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");

  const diagramPane = html.indexOf('<section class="diagram-pane">');
  const diagramEnd = html.indexOf("</section>", diagramPane);
  const inspectorStart = html.indexOf('<aside id="inspector"');
  const inspectorEnd = html.indexOf("</aside>", inspectorStart);
  assert.notEqual(inspectorStart, -1, "right inspector is present");
  assert.ok(inspectorStart > diagramEnd, "inspector follows the canvas");
  const panel = html.slice(inspectorStart, inspectorEnd);
  assert.match(panel, /id="inspector-toggle"/);
  assert.match(panel, /aria-controls="inspector-body"/);
  assert.match(panel, /id="inspector-toggle-label">Hide</);
  assert.match(panel, /id="inspector-toggle-icon"/);
  assert.match(panel, /aria-hidden="true"/);
  assert.match(panel, /id="inspector-name"/);
  assert.match(panel, /id="inspector-notes"/);
  assert.match(panel, /id="inspector-notes-empty"/);
  assert.match(panel, /No notes yet/);
  assert.match(panel, /Select an element to see its name and notes/);

  const toggle = ui.slice(
    ui.indexOf("inspectorToggle.addEventListener"),
    ui.indexOf("inspectorNotes.addEventListener"),
  );
  assert.match(toggle, /toggleInspectorCollapsed/);
  assert.equal(toggle.includes("setSelection"), false, "collapse does not change the selection");
  assert.equal(toggle.includes("selectedItems"), false, "collapse does not rewrite the selection");
  assert.match(ui, /writeElementNotes/);
  assert.match(ui, /persistInspectorNotes/);
  assert.match(ui, /inspectorDetail/);
  assert.match(ui, /syncInspector/);
  assert.match(ui, /inspectorToggleLabel\.hidden = inspectorCollapsed/);
  assert.match(ui, /inspectorToggleIcon\.hidden = !inspectorCollapsed/);
  assert.match(ui, /setAttribute\("aria-label", toggleName\)/);
  assert.match(ui, /Show inspector/);
  assert.equal(
    /inspectorToggleLabel\.textContent = inspectorCollapsed \? "Show"/.test(ui),
    false,
    "collapsed expand control is an icon, not a Show label",
  );
  assert.match(css, /\.inspector\.is-collapsed/);
  assert.match(css, /\.inspector-body\[hidden\]\s*\{[^}]*display:\s*none/);
  const collapsedToggle = css.match(/\.inspector\.is-collapsed \.inspector-toggle\s*\{[^}]+\}/);
  assert.ok(collapsedToggle, "collapsed toggle rule exists");
  assert.match(collapsedToggle[0]!, /width:\s*28px/);
  assert.match(collapsedToggle[0]!, /height:\s*28px/);
  assert.equal(/width:\s*100%/.test(collapsedToggle[0]!), false, "collapsed toggle does not stretch");
  const toggleIcon = css.match(/\.inspector-toggle-icon\s*\{[^}]+\}/);
  assert.ok(toggleIcon, "toggle icon rule exists");
  assert.match(toggleIcon[0]!, /width:\s*16px/);
  assert.match(toggleIcon[0]!, /height:\s*16px/);
});
