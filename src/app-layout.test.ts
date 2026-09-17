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
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  assert.match(ui, /selectionFromDiagramHit/);
  assert.match(ui, /retainSelection/);
  assert.match(ui, /data-element-id/);
  assert.match(ui, /data-relationship-id/);
  assert.match(ui, /setSelection\(null\)/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(css, /\[data-selected="true"\]/);
  assert.match(css, /\.rows li\.selected/);
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
  const direction = html.indexOf('id="direction-switcher"');
  const nesting = html.indexOf('id="nesting-switcher"');
  const canvas = html.indexOf('id="diagram" class="diagram"');
  assert.notEqual(chrome, -1);
  assert.notEqual(direction, -1, "direction switcher is present");
  assert.notEqual(nesting, -1, "nesting switcher remains");
  assert.ok(
    chrome < direction && direction < nesting && nesting < canvas,
    "direction + nesting sit in the chrome above the canvas",
  );
  assert.match(html, /aria-label="Layout direction"/);
  assert.match(html, /class="layout-controls"/);
  assert.equal(html.includes('class="view-switcher"'), false);

  assert.match(ui, /directionOverride/);
  assert.match(ui, /LAYOUT_DIRECTIONS/);
  assert.match(ui, /renderDirectionSwitcher/);
  assert.match(css, /\.layout-controls\s*\{/);
  assert.match(css, /\.layout-switcher\s*,/);
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

test("workspace CSS is a single-row sidebar + canvas (no bottom list row)", () => {
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const workspace = css.match(/\.workspace\s*\{[^}]+\}/);
  assert.ok(workspace, "workspace rule exists");
  assert.match(workspace[0]!, /grid-template-columns:\s*minmax\(240px,\s*280px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(workspace[0]!, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.equal(/grid-template-rows:\s*minmax\(240px/.test(css), false);
  assert.equal(/\.lists\s*\{/.test(css), false);
});
