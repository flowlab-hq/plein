import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  clampCanvasZoom,
  horizontalPanFromVerticalWheel,
  nextCanvasZoom,
  placeZoomAnchor,
  scrollToKeepPoint,
  wheelGestureIsZoom,
} from "./canvas-zoom.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("canvas zoom stays inside a usable range", () => {
  assert.equal(clampCanvasZoom(1), 1);
  assert.equal(clampCanvasZoom(0), MIN_CANVAS_ZOOM);
  assert.equal(clampCanvasZoom(100), MAX_CANVAS_ZOOM);
  assert.equal(clampCanvasZoom(Number.NaN), 1);
  assert.equal(clampCanvasZoom(Number.POSITIVE_INFINITY), 1);
  assert.equal(MIN_CANVAS_ZOOM, 0.25);
  assert.equal(MAX_CANVAS_ZOOM, 4);

  assert.equal(nextCanvasZoom(MAX_CANVAS_ZOOM, -10_000, 0), MAX_CANVAS_ZOOM);
  assert.equal(nextCanvasZoom(MIN_CANVAS_ZOOM, 10_000, 0), MIN_CANVAS_ZOOM);
  assert.equal(nextCanvasZoom(0.1, 0, 0), MIN_CANVAS_ZOOM);
});

test("wheel down zooms out and wheel up zooms in, including line mode and horizontal wheels", () => {
  const zoomIn = nextCanvasZoom(1, -480, 0);
  const zoomOut = nextCanvasZoom(1, 480, 0);
  assert.ok(Math.abs(zoomIn - 2) < 1e-9, `expected 2, got ${zoomIn}`);
  assert.ok(Math.abs(zoomOut - 0.5) < 1e-9, `expected 0.5, got ${zoomOut}`);

  const fromLines = nextCanvasZoom(1, -12, 1);
  assert.ok(Math.abs(fromLines - 2) < 1e-9, "deltaMode line (Firefox) is normalised");

  const fromX = nextCanvasZoom(1, 0, 0, -480);
  assert.ok(Math.abs(fromX - 2) < 1e-9, "horizontal wheel still zooms when deltaY is 0");

  assert.equal(nextCanvasZoom(1, Number.NaN, 0), 1);
});

test("zoom keeps the content point under the pointer", () => {
  const pointerX = 80;
  const pointerY = 36;
  const before = { scrollLeft: 120, scrollTop: 48 };
  const scale = 2;
  const after = scrollToKeepPoint({ ...before, pointerX, pointerY, scale });
  assert.equal(after.scrollLeft + pointerX, (before.scrollLeft + pointerX) * scale);
  assert.equal(after.scrollTop + pointerY, (before.scrollTop + pointerY) * scale);

  const same = scrollToKeepPoint({ ...before, pointerX, pointerY, scale: 1 });
  assert.equal(same.scrollLeft, before.scrollLeft);
  assert.equal(same.scrollTop, before.scrollTop);

  const zoomOut = scrollToKeepPoint({ ...before, pointerX, pointerY, scale: 0.5 });
  assert.equal(zoomOut.scrollLeft + pointerX, (before.scrollLeft + pointerX) * 0.5);
  assert.equal(zoomOut.scrollTop + pointerY, (before.scrollTop + pointerY) * 0.5);
});

test("zoom-out at the top-left uses margin so the pointer can stay put", () => {
  const placed = placeZoomAnchor({
    localX: 40,
    localY: 30,
    pointerX: 200,
    pointerY: 160,
    scale: 0.5,
  });
  assert.equal(placed.scrollLeft, 0);
  assert.equal(placed.scrollTop, 0);
  assert.equal(placed.marginLeft + 40 * 0.5, placed.scrollLeft + 200);
  assert.equal(placed.marginTop + 30 * 0.5, placed.scrollTop + 160);

  const zoomIn = placeZoomAnchor({
    localX: 100,
    localY: 80,
    pointerX: 100,
    pointerY: 80,
    scale: 2,
  });
  assert.equal(zoomIn.marginLeft, 0);
  assert.equal(zoomIn.marginTop, 0);
  assert.equal(zoomIn.scrollLeft + 100, 100 * 2);
  assert.equal(zoomIn.scrollTop + 80, 80 * 2);
});

test("a vertical wheel pans sideways when the canvas is only wider than the pane", () => {
  const wide = {
    deltaX: 0,
    deltaY: 120,
    deltaMode: 0,
    shiftKey: false,
    clientWidth: 486,
    clientHeight: 395,
    scrollWidth: 840,
    scrollHeight: 395,
  };
  assert.equal(horizontalPanFromVerticalWheel(wide), 120);
  assert.equal(horizontalPanFromVerticalWheel({ ...wide, deltaMode: 1, deltaY: 3 }), 120);
  assert.equal(horizontalPanFromVerticalWheel({ ...wide, deltaX: 4, deltaY: 80 }), 80);
  assert.equal(horizontalPanFromVerticalWheel({ ...wide, deltaX: 90, deltaY: 10 }), null);
  assert.equal(horizontalPanFromVerticalWheel({ ...wide, shiftKey: true }), null);
  assert.equal(horizontalPanFromVerticalWheel({ ...wide, deltaY: 0 }), null);
  assert.equal(
    horizontalPanFromVerticalWheel({ ...wide, scrollHeight: 700 }),
    null,
    "a pane that also overflows vertically keeps native vertical pan",
  );
  assert.equal(
    horizontalPanFromVerticalWheel({ ...wide, scrollWidth: 486 }),
    null,
    "a canvas that already fits does not steal the wheel",
  );
});

test("plain scroll is not a zoom gesture; command or ctrl scroll is", () => {
  assert.equal(wheelGestureIsZoom({ metaKey: false, ctrlKey: false, altKey: false }), false);
  assert.equal(wheelGestureIsZoom({ metaKey: true, ctrlKey: false, altKey: false }), true);
  assert.equal(wheelGestureIsZoom({ metaKey: false, ctrlKey: true, altKey: false }), true);
  assert.equal(wheelGestureIsZoom({ metaKey: true, ctrlKey: true, altKey: true }), false);
});

test("Mac canvas wires modifier-zoom without taking over pan, selection, or drag", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const readme = readFileSync(join(repoRoot, "app/README.md"), "utf8");

  const diagram = html.match(/id="diagram"[^>]*>/);
  assert.ok(diagram, "diagram canvas is present");
  assert.match(diagram[0]!, /Scroll to pan/);
  assert.match(diagram[0]!, /zoom toward the pointer/);
  assert.match(diagram[0]!, /25%/);
  assert.match(diagram[0]!, /400%/);

  const pane = css.match(/\.diagram\s*\{[^}]+\}/);
  assert.ok(pane);
  assert.match(pane[0]!, /overflow:\s*auto/, "plain scroll still pans");
  assert.match(css, /\.diagram\[data-zoom\] svg/);

  assert.match(ui, /wheelGestureIsZoom/);
  assert.match(ui, /horizontalPanFromVerticalWheel/);
  assert.match(ui, /nextCanvasZoom/);
  assert.match(ui, /placeZoomAnchor/);
  assert.match(ui, /addEventListener\("wheel"/);
  assert.match(ui, /passive:\s*false/);
  assert.match(ui, /pointerdown/);
  assert.match(ui, /selectionFromDiagramHit/);
  assert.equal(ui.includes("preventDefault()") && ui.includes("wheelGestureIsZoom"), true);

  assert.match(readme, /⌘\/Ctrl \+ scroll zooms/);
  assert.match(readme, /Scroll\*\* \(mouse wheel or trackpad\) \*\*pans/);
});
