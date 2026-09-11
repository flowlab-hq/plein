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

test("workspace CSS is a single-row sidebar + canvas (no bottom list row)", () => {
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const workspace = css.match(/\.workspace\s*\{[^}]+\}/);
  assert.ok(workspace, "workspace rule exists");
  assert.match(workspace[0]!, /grid-template-columns:\s*minmax\(240px,\s*280px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(workspace[0]!, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.equal(/grid-template-rows:\s*minmax\(240px/.test(css), false);
  assert.equal(/\.lists\s*\{/.test(css), false);
});
