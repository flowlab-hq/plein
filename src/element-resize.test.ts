import assert from "node:assert/strict";
import { test } from "node:test";
import { seatLayoutOnGrid, snapToGrid } from "./canvas-grid.js";
import { resizeBoxByEdge, resizeCursorAxis, resizeEdgeAtPoint } from "./element-resize.js";

const box = { x: 48, y: 72, width: 168, height: 52 };

test("edge hit is one axis, and a corner or the interior is not a resize", () => {
  assert.equal(resizeEdgeAtPoint(box, 48, 98, 8), "left");
  assert.equal(resizeEdgeAtPoint(box, 216, 98, 8), "right");
  assert.equal(resizeEdgeAtPoint(box, 120, 72, 8), "top");
  assert.equal(resizeEdgeAtPoint(box, 120, 124, 8), "bottom");
  assert.equal(resizeEdgeAtPoint(box, 120, 98, 8), null, "interior stays a move");
  assert.equal(resizeEdgeAtPoint(box, 50, 74, 8), null, "corner stays a move");
  assert.equal(resizeEdgeAtPoint(box, 10, 98, 8), null, "outside the band is not an edge");
  assert.equal(resizeCursorAxis("left"), "ew");
  assert.equal(resizeCursorAxis("bottom"), "ns");
});

test("dragging an edge changes only that dimension and keeps the opposite edge", () => {
  const wider = resizeBoxByEdge({
    box,
    edge: "right",
    deltaX: 40,
    deltaY: 12,
    minWidth: 48,
    minHeight: 32,
  });
  assert.deepEqual(wider, { x: 48, y: 72, width: 208, height: 52 });

  const narrower = resizeBoxByEdge({
    box,
    edge: "left",
    deltaX: 24,
    deltaY: 0,
    minWidth: 48,
    minHeight: 32,
  });
  assert.equal(narrower.x, 72);
  assert.equal(narrower.x + narrower.width, box.x + box.width);
  assert.equal(narrower.height, box.height);

  const taller = resizeBoxByEdge({
    box,
    edge: "bottom",
    deltaX: -10,
    deltaY: 20,
    minWidth: 48,
    minHeight: 32,
  });
  assert.deepEqual(taller, { x: 48, y: 72, width: 168, height: 72 });

  const shorter = resizeBoxByEdge({
    box,
    edge: "top",
    deltaX: 0,
    deltaY: 16,
    minWidth: 48,
    minHeight: 32,
  });
  assert.equal(shorter.y, 88);
  assert.equal(shorter.y + shorter.height, box.y + box.height);
  assert.equal(shorter.width, box.width);
});

test("minimum size wins over the pointer and over grid snap", () => {
  const collapsed = resizeBoxByEdge({
    box,
    edge: "right",
    deltaX: -400,
    deltaY: 0,
    minWidth: 48,
    minHeight: 32,
    snapEdge: (value) => snapToGrid(value, 24),
  });
  assert.equal(collapsed.x, box.x);
  assert.equal(collapsed.width, 48);
  assert.equal(collapsed.height, box.height);

  const flat = resizeBoxByEdge({
    box,
    edge: "top",
    deltaX: 0,
    deltaY: 400,
    minWidth: 48,
    minHeight: 32,
  });
  assert.equal(flat.height, 32);
  assert.equal(flat.y + flat.height, box.y + box.height);
});

test("the dragged edge snaps to the grid and still sits on that lattice after seating", () => {
  const onGrid = { x: 48, y: 72, width: 168, height: 48 };
  const resized = resizeBoxByEdge({
    box: onGrid,
    edge: "right",
    deltaX: 30,
    deltaY: 0,
    minWidth: 48,
    minHeight: 32,
    snapEdge: (value) => snapToGrid(value, 24),
  });
  assert.equal(resized.x, 48);
  assert.equal(resized.width, 192);
  assert.equal(resized.x + resized.width, 240);

  const seated = seatLayoutOnGrid(
    [{ id: "shipper", ...resized }],
    [],
    24,
    "orthogonal",
    "tb",
  );
  assert.equal(seated.nodes[0]!.x, resized.x);
  assert.equal(seated.nodes[0]!.y, resized.y);
  assert.equal(seated.nodes[0]!.width, resized.width);
  assert.equal(seated.nodes[0]!.height, resized.height);

  const fromLeft = resizeBoxByEdge({
    box: onGrid,
    edge: "left",
    deltaX: -30,
    deltaY: 0,
    minWidth: 48,
    minHeight: 32,
    snapEdge: (value) => snapToGrid(value, 24),
  });
  assert.equal(fromLeft.x, 24);
  assert.equal(fromLeft.x + fromLeft.width, box.x + box.width);
});
