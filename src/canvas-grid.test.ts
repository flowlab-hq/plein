import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadPleinSource } from "./list-model.js";
import { layoutViewpoint } from "./layout.js";
import {
  CANVAS_GRID_SIZES,
  DEFAULT_CANVAS_GRID_SIZE,
  DRAWN_CANVAS_GRID_PITCH,
  canvasGridLinePaths,
  canvasGridLines,
  layoutSitsOnSnapGrid,
  modelSpaceFrame,
  seatLayoutOnGrid,
  snapProposedOrigin,
  snapToGrid,
  gridSnapDragPosition,
  normalizeCanvasGridSize,
  type GridSeatEdge,
  type GridSeatNode,
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

test("drawn grid pitch is fixed and every snap size lands on it", () => {
  assert.equal(DRAWN_CANVAS_GRID_PITCH, 8);
  for (const size of CANVAS_GRID_SIZES) {
    assert.equal(size % DRAWN_CANVAS_GRID_PITCH, 0, `${size} is a multiple of the drawn pitch`);
    const snapped = snapToGrid(50, size);
    assert.equal(snapped % DRAWN_CANVAS_GRID_PITCH, 0);
    assert.equal(snapToGrid(snapped, size), snapped);
  }
});

test("grid lines fill model space from the top-left, not only under content", () => {
  const frame = modelSpaceFrame({ x: 0, y: 0, width: 472, height: 316 }, { width: 960, height: 640 });
  assert.equal(frame.x, 0);
  assert.equal(frame.y, 0);
  assert.ok(frame.width >= 960);
  assert.ok(frame.height >= 640);
  const lines = canvasGridLines(frame);
  assert.ok(lines.some((line) => line.x1 === 0 && line.x2 === 0 && line.y1 === 0));
  assert.ok(lines.some((line) => line.y1 === 0 && line.y2 === 0 && line.x1 === 0));
  assert.ok(lines.some((line) => line.x1 > 472), "lines continue past the content box");
  assert.ok(lines.some((line) => line.y1 > 316));
  const paths = canvasGridLinePaths(frame);
  assert.match(paths.major, /M 0 0 L 0 /);
  assert.match(paths.minor, /M 8 0 L 8 /);
  const outward = modelSpaceFrame({ x: -30, y: -10, width: 200, height: 120 }, { width: 50, height: 40 });
  assert.equal(outward.x, -30);
  assert.equal(outward.y, -10);
  assert.ok(canvasGridLines(outward).some((line) => line.x1 === 0 || line.y1 === 0));
});

test("boxes sit on snap cells and orthogonal relationships track those lines", () => {
  const nodes = [
    { id: "order", x: 40, y: 40, width: 168, height: 52 },
    { id: "booking", x: 280, y: 40, width: 168, height: 52 },
    { id: "shipper", x: 40, y: 240, width: 168, height: 52 },
  ];
  const edges = [
    { source: "order", target: "booking", x1: 0, y1: 0, x2: 0, y2: 0, points: [] as { x: number; y: number }[] },
    { source: "order", target: "shipper", x1: 0, y1: 0, x2: 0, y2: 0, points: [] as { x: number; y: number }[] },
  ];
  const seated = seatLayoutOnGrid(nodes, edges, 24, "orthogonal", "lr");
  for (const node of seated.nodes) {
    assert.equal(node.x % 24, 0, `${node.id} x`);
    assert.equal(node.y % 24, 0, `${node.id} y`);
    assert.equal((node.x + node.width) % 24, 0, `${node.id} right`);
    assert.equal((node.y + node.height) % 24, 0, `${node.id} bottom`);
    assert.equal(node.x % DRAWN_CANVAS_GRID_PITCH, 0);
  }
  const across = seated.edges[0]!;
  assert.ok(across.points && across.points.length >= 2);
  for (let index = 1; index < across.points.length; index += 1) {
    const previous = across.points[index - 1]!;
    const point = across.points[index]!;
    assert.ok(previous.x === point.x || previous.y === point.y, "segment is horizontal or vertical");
    for (const spot of [previous, point]) {
      assert.equal(spot.x % 24, 0);
      assert.equal(spot.y % 24, 0);
    }
  }
  const parent = { id: "parent", x: 30, y: 30, width: 420, height: 280 };
  const child = { id: "child", x: 50, y: 80, width: 168, height: 52, parentId: "parent" };
  const nested = seatLayoutOnGrid([parent, child], [], 24, "orthogonal", "tb");
  const seatedParent = nested.nodes.find((node) => node.id === "parent")!;
  const seatedChild = nested.nodes.find((node) => node.id === "child")!;
  assert.ok(seatedChild.x >= seatedParent.x);
  assert.ok(seatedChild.y >= seatedParent.y);
  assert.ok(seatedChild.x + seatedChild.width <= seatedParent.x + seatedParent.width);
  assert.ok(seatedChild.y + seatedChild.height <= seatedParent.y + seatedParent.height);
  const held = seatLayoutOnGrid(
    [{ id: "a", x: 50, y: 48, width: 168, height: 72 }],
    [],
    24,
    "orthogonal",
    "lr",
    new Set(["a"]),
  );
  assert.equal(held.nodes[0]!.x, 50);
  assert.equal(held.nodes[0]!.y, 48);
  assert.equal((held.nodes[0]!.x + held.nodes[0]!.width) % 24, 0);
});

function onLattice(value: number, size: number): boolean {
  const mod = Math.abs(value % size);
  return mod < 1e-6 || Math.abs(mod - size) < 1e-6;
}

function assertBoxesAndOrthogonalOnLattice(
  nodes: readonly GridSeatNode[],
  edges: readonly GridSeatEdge[],
  size: number,
): void {
  assert.ok(nodes.length > 0);
  for (const node of nodes) {
    assert.ok(onLattice(node.x, size), `${node.id} x`);
    assert.ok(onLattice(node.y, size), `${node.id} y`);
    assert.ok(onLattice(node.x + node.width, size), `${node.id} right`);
    assert.ok(onLattice(node.y + node.height, size), `${node.id} bottom`);
    assert.ok(onLattice(node.x, DRAWN_CANVAS_GRID_PITCH));
  }
  const orthogonal = edges.filter((edge) => !edge.impliedByNest && edge.points && edge.points.length >= 2);
  assert.ok(orthogonal.length > 0, "orthogonal routes are present");
  for (const edge of orthogonal) {
    const points = edge.points ?? [];
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!;
      const point = points[index]!;
      assert.ok(previous.x === point.x || previous.y === point.y, `${edge.source}->${edge.target} is orthogonal`);
      for (const spot of [previous, point]) {
        assert.ok(onLattice(spot.x, size));
        assert.ok(onLattice(spot.y, size));
      }
    }
  }
}

test("auto layout and the default file path sit on the snap lattice", async () => {
  assert.equal(layoutSitsOnSnapGrid({ auto: false, mode: "layered" }), true);
  assert.equal(layoutSitsOnSnapGrid({ auto: false, mode: "grid" }), true);
  assert.equal(layoutSitsOnSnapGrid({ auto: true, mode: "layered" }), true);
  assert.equal(layoutSitsOnSnapGrid({ auto: true, mode: "layers" }), true);
  assert.equal(layoutSitsOnSnapGrid({ auto: true, mode: "organic" }), true);
  assert.equal(layoutSitsOnSnapGrid({ auto: true, mode: "grid" }), false);
  assert.equal(layoutSitsOnSnapGrid({ mode: "grid" }), false);
  assert.equal(layoutSitsOnSnapGrid({ mode: "layered" }), true);

  const basic = loadPleinSource(
    readFileSync(join(repoRoot, "fixtures/valid-basic.plein"), "utf8"),
    "fixtures/valid-basic.plein",
  );
  assert.equal(basic.ok, true);
  if (!basic.ok) {
    return;
  }
  const opened = await layoutViewpoint(basic.model, "booking-context");
  assert.equal(opened.auto, true, "default file-open path is automatic");
  assert.equal(opened.mode, "layered");
  assert.equal(opened.routing, "orthogonal");
  assert.equal(layoutSitsOnSnapGrid(opened), true);
  assert.ok(
    opened.nodes.some(
      (node) =>
        !onLattice(node.x, DEFAULT_CANVAS_GRID_SIZE) ||
        !onLattice(node.y, DEFAULT_CANVAS_GRID_SIZE) ||
        !onLattice(node.x + node.width, DEFAULT_CANVAS_GRID_SIZE) ||
        !onLattice(node.y + node.height, DEFAULT_CANVAS_GRID_SIZE),
    ),
    "ELK placement is not already on the snap lattice",
  );
  const seatedOpen = seatLayoutOnGrid(
    opened.nodes,
    opened.edges,
    DEFAULT_CANVAS_GRID_SIZE,
    opened.routing,
    opened.direction,
  );
  assertBoxesAndOrthogonalOnLattice(seatedOpen.nodes, seatedOpen.edges, DEFAULT_CANVAS_GRID_SIZE);

  const manual = loadPleinSource(
    readFileSync(join(repoRoot, "fixtures/valid-manual-layout.plein"), "utf8"),
    "fixtures/valid-manual-layout.plein",
  );
  assert.equal(manual.ok, true);
  if (!manual.ok) {
    return;
  }
  const turnedOn = await layoutViewpoint(manual.model, "story", { autoLayout: "auto" });
  assert.equal(turnedOn.auto, true);
  assert.equal(layoutSitsOnSnapGrid(turnedOn), true);
  const seatedOn = seatLayoutOnGrid(
    turnedOn.nodes,
    turnedOn.edges,
    DEFAULT_CANVAS_GRID_SIZE,
    turnedOn.routing,
    turnedOn.direction,
  );
  assertBoxesAndOrthogonalOnLattice(seatedOn.nodes, seatedOn.edges, DEFAULT_CANVAS_GRID_SIZE);

  const bands = loadPleinSource(
    readFileSync(join(repoRoot, "fixtures/valid-layer-bands.plein"), "utf8"),
    "fixtures/valid-layer-bands.plein",
  );
  assert.equal(bands.ok, true);
  if (!bands.ok) {
    return;
  }
  const layers = await layoutViewpoint(bands.model, "layerBands");
  assert.equal(layers.auto, true);
  assert.equal(layers.mode, "layers");
  assert.equal(layoutSitsOnSnapGrid(layers), true);
  const seatedLayers = seatLayoutOnGrid(
    layers.nodes,
    layers.edges,
    DEFAULT_CANVAS_GRID_SIZE,
    layers.routing,
    layers.direction,
  );
  assertBoxesAndOrthogonalOnLattice(seatedLayers.nodes, seatedLayers.edges, DEFAULT_CANVAS_GRID_SIZE);
  const parent = seatedLayers.nodes.find((node) => node.id === "platform");
  const child = seatedLayers.nodes.find((node) => node.id === "tms");
  assert.ok(parent && child && child.parentId === "platform");
  assert.ok(child.x >= parent.x && child.y >= parent.y);
  assert.ok(child.x + child.width <= parent.x + parent.width);
  assert.ok(child.y + child.height <= parent.y + parent.height);

  const organicFile = loadPleinSource(
    readFileSync(join(repoRoot, "fixtures/valid-organic-grid.plein"), "utf8"),
    "fixtures/valid-organic-grid.plein",
  );
  assert.equal(organicFile.ok, true);
  if (!organicFile.ok) {
    return;
  }
  const catalogue = await layoutViewpoint(organicFile.model, "catalogue");
  assert.equal(catalogue.auto, true);
  assert.equal(catalogue.mode, "grid");
  assert.equal(layoutSitsOnSnapGrid(catalogue), false);
  const movedIfSeated = seatLayoutOnGrid(
    catalogue.nodes,
    catalogue.edges,
    DEFAULT_CANVAS_GRID_SIZE,
    catalogue.routing,
    catalogue.direction,
  );
  assert.ok(
    movedIfSeated.nodes.some((node, index) => {
      const raw = catalogue.nodes[index]!;
      return node.x !== raw.x || node.y !== raw.y || node.width !== raw.width || node.height !== raw.height;
    }),
    "catalogue packing is not already the snap lattice",
  );
  const landscape = await layoutViewpoint(organicFile.model, "landscape");
  assert.equal(landscape.mode, "organic");
  assert.equal(layoutSitsOnSnapGrid(landscape), true);
  const seatedOrganic = seatLayoutOnGrid(
    landscape.nodes,
    landscape.edges,
    DEFAULT_CANVAS_GRID_SIZE,
    landscape.routing,
    landscape.direction,
  );
  assertBoxesAndOrthogonalOnLattice(seatedOrganic.nodes, seatedOrganic.edges, DEFAULT_CANVAS_GRID_SIZE);
});

test("Mac canvas toggles grid visibility without turning snap off", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const readme = readFileSync(join(repoRoot, "app/README.md"), "utf8");

  const toggle = html.indexOf('id="canvas-grid-toggle"');
  const options = html.indexOf('id="layout-options"');
  const nesting = html.indexOf('id="nesting-switcher"');
  const viewing = html.indexOf('class="chrome-cluster" role="group" aria-label="Viewing"');
  const focus = html.indexOf('id="focus-switcher"');
  const size = html.indexOf('id="canvas-grid-size"');
  const canvas = html.indexOf('id="diagram" class="diagram"');
  assert.notEqual(toggle, -1, "grid visibility toggle is present");
  assert.notEqual(viewing, -1, "viewing grouping is present");
  assert.ok(options < toggle, "grid toggle stays on the chrome, in Viewing after Layout");
  assert.ok(
    viewing < focus && focus < toggle && toggle < size && size < canvas,
    "focus, grid, and snap spacing sit together under Viewing above the canvas",
  );
  assert.ok(nesting < viewing, "nesting stays in the layout menu, before Viewing");
  const viewingGroup = html.slice(viewing, canvas);
  assert.match(viewingGroup, /id="focus-switcher"/);
  assert.match(viewingGroup, /id="canvas-grid-toggle"/);
  assert.match(viewingGroup, /id="canvas-grid-size"/);
  assert.match(html, /id="canvas-grid-toggle"[^>]*aria-pressed="true"/);
  assert.match(html, /does not turn snap off/);
  assert.match(html, /aria-label="Snap spacing"/);
  assert.match(html, /Snap step: How far boxes jump on snap/);
  assert.match(html, /How far boxes jump on snap/);
  assert.match(html, /does not change how large the drawn squares look/);
  assert.match(html, /stays tied to zoom/);

  assert.match(css, /\.canvas-grid-toggle\[aria-pressed="true"\]/);
  assert.match(css, /\.diagram \.canvas-grid\s*\{[^}]*pointer-events:\s*none/);

  assert.match(ui, /snapProposedOrigin/);
  assert.match(ui, /alignDraggedBox/);
  assert.match(ui, /gridSnapForDrag/);
  assert.match(ui, /canvasGridLinePaths/);
  assert.match(ui, /DRAWN_CANVAS_GRID_PITCH/);
  assert.match(ui, /fitModelSpace/);
  assert.match(ui, /seatLayoutOnGrid/);
  assert.match(ui, /layoutSitsOnSnapGrid/);
  assert.match(ui, /modelSpaceFrame/);
  assert.match(ui, /paintCanvasGrid/);
  assert.match(ui, /Snap step: How far boxes jump on snap/);
  assert.match(ui, /How far boxes jump on snap/);
  assert.match(ui, /does not change how large the drawn squares look/);
  assert.match(ui, /stays tied to zoom/);
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

  const renderFrom = ui.indexOf("async function renderDiagram");
  const renderTo = ui.indexOf("async function render():", renderFrom);
  assert.ok(renderFrom !== -1 && renderTo > renderFrom);
  const render = ui.slice(renderFrom, renderTo);
  assert.match(render, /layoutSitsOnSnapGrid\(layout\)/);
  assert.match(render, /layout\.auto === false \? alignHold/);
  assert.equal(render.includes("if (layout.auto === false)"), false, "seating is not limited to Auto Off");

  assert.match(readme, /Snap spacing/);
  assert.match(readme, /How far boxes jump on snap/);
  assert.match(readme, /does not turn snap off/);
  assert.match(readme, /neighbour-align/);
  assert.match(readme, /not `autoLayout grid`/);
  assert.match(readme, /Auto layout\*\* \*\*On/);
  assert.match(readme, /default file-open path/);
  assert.match(readme, /catalogue packing is not reseated/);
});
