import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CANVAS_GRID_SIZES,
  DEFAULT_CANVAS_GRID_SIZE,
  canvasGridPatternSpec,
  gridSnapDragPosition,
  normalizeCanvasGridSize,
  snapProposedOrigin,
  snapToGrid,
} from "./canvas-grid.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("canvas grid ships a default cell size and a small set of choices", () => {
  assert.equal(DEFAULT_CANVAS_GRID_SIZE, 24);
  assert.ok(CANVAS_GRID_SIZES.includes(DEFAULT_CANVAS_GRID_SIZE));
  assert.deepEqual(normalizeCanvasGridSize(Number.NaN), DEFAULT_CANVAS_GRID_SIZE);
  assert.deepEqual(normalizeCanvasGridSize(0), DEFAULT_CANVAS_GRID_SIZE);
  assert.deepEqual(normalizeCanvasGridSize(-8), DEFAULT_CANVAS_GRID_SIZE);
  assert.equal(normalizeCanvasGridSize(32), 32);
});

test("snap lands on cell lines from the canvas origin, including past the content box", () => {
  assert.equal(snapToGrid(0, 24), 0);
  assert.equal(snapToGrid(12, 24), 24);
  assert.equal(snapToGrid(11, 24), 0);
  assert.equal(snapToGrid(-12, 24), -24);
  assert.equal(snapToGrid(-11, 24), 0);
  assert.equal(snapToGrid(Number.NaN, 24), 0);

  assert.deepEqual(gridSnapDragPosition({ x: 30, y: 50 }, { x: 5, y: -3 }, 24), { x: 24, y: 48 });
  assert.deepEqual(gridSnapDragPosition({ x: 400, y: 200 }, { x: 150, y: 0 }, 24), { x: 552, y: 192 });
  const outward = gridSnapDragPosition({ x: 24, y: 24 }, { x: -100, y: -80 }, 24);
  assert.deepEqual(outward, { x: -72, y: -48 });
  assert.ok(outward.x < 0);
  assert.ok(outward.y < 0);
});

test("a dragged parent snaps once and children keep their offset", () => {
  const root = { x: 30, y: 50 };
  const shift = { x: 18, y: 9 };
  const placed = gridSnapDragPosition(root, shift, 24);
  const applied = { x: placed.x - root.x, y: placed.y - root.y };
  const child = { x: root.x + 40, y: root.y + 28 };
  assert.equal(child.x + applied.x - placed.x, 40);
  assert.equal(child.y + applied.y - placed.y, 28);
  assert.equal(placed.x % 24, 0);
  assert.equal(placed.y % 24, 0);
});

test("snapProposedOrigin is the gridSnap hook for alignDraggedBox", () => {
  const proposed = { x: 30 + 18, y: 50 + 9 };
  assert.deepEqual(snapProposedOrigin(proposed, 24), gridSnapDragPosition({ x: 30, y: 50 }, { x: 18, y: 9 }, 24));
  assert.deepEqual(snapProposedOrigin({ x: Number.NaN, y: 20 }, 24), { x: 0, y: 24 });
});

test("grid lines tile from user-space zero, not from the content origin", () => {
  const spec = canvasGridPatternSpec(24);
  assert.equal(spec.originX, 0);
  assert.equal(spec.originY, 0);
  assert.equal(spec.size, 24);
  assert.equal(spec.tile, 96);
  assert.match(spec.majorPath, /M 0 0 H 96/);
  assert.match(spec.minorPath, /M 24 0 V 96/);
  assert.equal(canvasGridPatternSpec(Number.NaN).size, DEFAULT_CANVAS_GRID_SIZE);
});

test("Mac canvas toggles grid visibility without turning snap off", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const readme = readFileSync(join(repoRoot, "app/README.md"), "utf8");

  const toggle = html.indexOf('id="canvas-grid-toggle"');
  const options = html.indexOf('id="layout-options"');
  const nesting = html.indexOf('id="nesting-switcher"');
  const size = html.indexOf('id="canvas-grid-size"');
  const canvas = html.indexOf('id="diagram" class="diagram"');
  assert.notEqual(toggle, -1, "grid visibility toggle is present");
  assert.ok(toggle < options, "grid toggle sits on the chrome, beside Options");
  assert.ok(nesting < size && size < canvas, "grid size stays in Options above the canvas");
  assert.match(html, /id="canvas-grid-toggle"[^>]*aria-pressed="true"/);
  assert.match(html, /does not turn snap off/);
  assert.match(html, /aria-label="Canvas grid size"/);

  assert.match(css, /\.canvas-grid-toggle\[aria-pressed="true"\]/);
  assert.match(css, /\.diagram \.canvas-grid\s*\{[^}]*pointer-events:\s*none/);

  assert.match(ui, /snapProposedOrigin/);
  assert.match(ui, /alignDraggedBox/);
  assert.match(ui, /gridSnapForDrag/);
  assert.match(ui, /canvasGridPatternSpec/);
  assert.match(ui, /paintCanvasGrid/);
  assert.match(ui, /canvasGridVisible/);
  assert.match(ui, /grid snap runs first/);
  assert.equal(ui.includes("autoLayout grid"), false);

  const hookFrom = ui.indexOf("function gridSnapForDrag");
  const hookTo = ui.indexOf("function dragPlacement", hookFrom);
  assert.ok(hookFrom !== -1 && hookTo > hookFrom);
  const hook = ui.slice(hookFrom, hookTo);
  assert.match(hook, /snapProposedOrigin/);
  assert.equal(hook.includes("canvasGridVisible"), false, "hiding the lines does not turn grid snap off");
  assert.equal(hook.includes("return undefined"), false);

  const moveFrom = ui.indexOf('diagram.addEventListener("pointermove"');
  const moveTo = ui.indexOf('diagram.addEventListener("pointerup"', moveFrom);
  const upTo = ui.indexOf('diagram.addEventListener("pointercancel"', moveTo);
  assert.ok(moveFrom !== -1 && moveTo > moveFrom && upTo > moveTo);
  const move = ui.slice(moveFrom, moveTo);
  const up = ui.slice(moveTo, upTo);
  assert.match(move, /dragPlacement/);
  assert.match(up, /dragPlacement/);
  assert.equal(move.includes("canvasGridVisible"), false, "hiding the grid does not skip snap on move");
  assert.equal(up.includes("canvasGridVisible"), false, "hiding the grid does not skip snap on drop");

  const placement = ui.slice(ui.indexOf("function dragPlacement"), ui.indexOf('diagram.addEventListener("pointerdown"'));
  assert.match(placement, /alignDraggedBox/);
  assert.match(placement, /gridSnapForDrag\(\)/);

  assert.match(readme, /Grid size/);
  assert.match(readme, /does not turn snap off/);
  assert.match(readme, /neighbour-align/);
  assert.match(readme, /not `autoLayout grid`/);
});
