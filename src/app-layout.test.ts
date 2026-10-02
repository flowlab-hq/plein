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
  const autoLayout = html.indexOf('id="auto-layout-switcher"');
  const mode = html.indexOf('id="mode-switcher"');
  const options = html.indexOf('id="layout-options"');
  const optionsPanel = html.indexOf('id="layout-options-panel"');
  const direction = html.indexOf('id="direction-switcher"');
  const routing = html.indexOf('id="routing-switcher"');
  const nesting = html.indexOf('id="nesting-switcher"');
  const canvas = html.indexOf('id="diagram" class="diagram"');
  assert.notEqual(chrome, -1);
  assert.notEqual(autoLayout, -1, "auto-layout switcher is present");
  assert.notEqual(mode, -1, "mode switcher is present");
  assert.notEqual(options, -1, "layout options disclosure is present");
  assert.notEqual(optionsPanel, -1, "layout options panel is present");
  assert.notEqual(direction, -1, "direction switcher is present");
  assert.notEqual(routing, -1, "routing switcher is present");
  assert.notEqual(nesting, -1, "nesting switcher remains");
  assert.ok(
    chrome < autoLayout &&
      autoLayout < mode &&
      mode < options &&
      options < optionsPanel &&
      optionsPanel < direction &&
      direction < routing &&
      routing < nesting &&
      nesting < canvas,
    "auto layout and mode stay on the chrome; direction, routing, and nesting sit in Options above the canvas",
  );
  const panel = html.slice(optionsPanel, canvas);
  assert.match(panel, /id="direction-switcher"/);
  assert.match(panel, /id="routing-switcher"/);
  assert.match(panel, /id="nesting-switcher"/);
  assert.equal(panel.includes('id="auto-layout-switcher"'), false, "auto layout stays one click away");
  assert.equal(panel.includes('id="mode-switcher"'), false, "mode stays one click away");
  assert.match(html, /class="layout-primary"/);
  assert.match(html, /aria-label="Auto layout"/);
  assert.match(html, /aria-label="Layout mode"/);
  assert.match(html, /aria-label="Layout direction"/);
  assert.match(html, /aria-label="Edge routing"/);
  assert.match(html, /aria-controls="layout-options-panel"/);
  assert.match(html, /class="layout-controls"/);
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
  assert.match(ui, /syncLayoutOptionsButton/);
  assert.match(ui, /setLayoutOptionsOpen/);
  assert.match(ui, /pointerdown/);
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
  assert.match(css, /\.layout-options-panel\s*\{/);
  assert.match(css, /\.layout-options-panel\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.layout-primary\s*\{/);
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

test("workspace CSS is a single-row sidebar + canvas (no bottom list row)", () => {
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const workspace = css.match(/\.workspace\s*\{[^}]+\}/);
  assert.ok(workspace, "workspace rule exists");
  assert.match(workspace[0]!, /grid-template-columns:\s*minmax\(240px,\s*280px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(workspace[0]!, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.equal(/grid-template-rows:\s*minmax\(240px/.test(css), false);
  assert.equal(/\.lists\s*\{/.test(css), false);
});

test("Mac UI saves manual positions from the toolbar and the File menu", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const rust = readFileSync(join(repoRoot, "app/src-tauri/src/lib.rs"), "utf8");

  const toolbar = html.slice(html.indexOf('<header class="toolbar">'), html.indexOf("</header>"));
  assert.match(toolbar, /id="save-button"/);
  assert.ok(toolbar.indexOf('id="reload-button"') < toolbar.indexOf('id="save-button"'));
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
