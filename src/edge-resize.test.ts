import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIN_RESIZE_HEIGHT,
  MIN_RESIZE_WIDTH,
  boxAfterEdgeDrag,
  parseResizeEdge,
  resizeHandleRects,
  type ResizeBox,
} from "./edge-resize.js";

const origin: ResizeBox = { x: 48, y: 48, width: 168, height: 72 };

function onLattice(value: number, cell: number): boolean {
  return Math.abs(value / cell - Math.round(value / cell)) < 1e-6;
}

test("resize handles name the four edges and leave the corners free", () => {
  assert.equal(parseResizeEdge("left"), "left");
  assert.equal(parseResizeEdge("bottom"), "bottom");
  assert.equal(parseResizeEdge("corner"), null);
  assert.equal(parseResizeEdge(null), null);

  const handles = resizeHandleRects({ width: 168, height: 72 });
  assert.deepEqual(
    handles.map((handle) => handle.edge),
    ["left", "right", "top", "bottom"],
  );
  const left = handles[0]!;
  const top = handles[2]!;
  assert.ok(left.y >= top.y + top.height, "left strip starts below the top strip");
  assert.ok(top.x >= left.x + left.width, "top strip starts to the right of the left strip");
  assert.ok(left.x < 0, "left strip hangs outside the box");
  assert.ok(top.y < 0, "top strip hangs outside the box");
});

test("dragging the right or left edge changes width and snaps to the grid", () => {
  const wider = boxAfterEdgeDrag(origin, "right", { x: 30, y: 80 }, 24);
  assert.equal(wider.x, origin.x);
  assert.equal(wider.y, origin.y);
  assert.equal(wider.height, origin.height);
  assert.equal(wider.width, 192);
  assert.ok(onLattice(wider.x + wider.width, 24));

  const narrower = boxAfterEdgeDrag(origin, "left", { x: 30, y: -40 }, 24);
  assert.equal(narrower.x + narrower.width, origin.x + origin.width);
  assert.equal(narrower.y, origin.y);
  assert.equal(narrower.height, origin.height);
  assert.equal(narrower.x, 72);
  assert.equal(narrower.width, 144);
  assert.ok(onLattice(narrower.x, 24));
});

test("dragging the bottom or top edge changes height and snaps to the grid", () => {
  const taller = boxAfterEdgeDrag(origin, "bottom", { x: 100, y: 20 }, 24);
  assert.equal(taller.x, origin.x);
  assert.equal(taller.width, origin.width);
  assert.equal(taller.y, origin.y);
  assert.equal(taller.height, 96);
  assert.ok(onLattice(taller.y + taller.height, 24));

  const shorter = boxAfterEdgeDrag(origin, "top", { x: -20, y: 20 }, 24);
  assert.equal(shorter.y + shorter.height, origin.y + origin.height);
  assert.equal(shorter.x, origin.x);
  assert.equal(shorter.width, origin.width);
  assert.equal(shorter.y, 72);
  assert.equal(shorter.height, 48);
  assert.ok(onLattice(shorter.y, 24));
});

test("an edge cannot shrink the box below one lattice span of the minimum", () => {
  const shrunk = boxAfterEdgeDrag(origin, "right", { x: -1000, y: 0 }, 24);
  assert.equal(shrunk.width, MIN_RESIZE_WIDTH);
  assert.equal(shrunk.x, origin.x);
  assert.ok(onLattice(shrunk.x + shrunk.width, 24));

  const flat = boxAfterEdgeDrag(origin, "bottom", { x: 0, y: -1000 }, 24);
  assert.equal(flat.height, MIN_RESIZE_HEIGHT);
  assert.equal(flat.y, origin.y);

  const wideCell = boxAfterEdgeDrag({ x: 0, y: 0, width: 160, height: 64 }, "right", { x: -400, y: 0 }, 32);
  assert.equal(wideCell.width, 64);
  assert.ok(onLattice(wideCell.width, 32));

  const tallCell = boxAfterEdgeDrag({ x: 0, y: 0, width: 64, height: 64 }, "top", { x: 0, y: 400 }, 32);
  assert.equal(tallCell.height, 32);
  assert.equal(tallCell.y, 32);
  assert.ok(onLattice(tallCell.y, 32));
});

test("a zero delta leaves a grid-aligned box where it was", () => {
  assert.deepEqual(boxAfterEdgeDrag(origin, "right", { x: 0, y: 0 }, 24), origin);
  assert.deepEqual(boxAfterEdgeDrag(origin, "left", { x: Number.NaN, y: 0 }, 24), origin);
  assert.deepEqual(boxAfterEdgeDrag(origin, "bottom", { x: 0, y: 0 }, 24), origin);
  assert.deepEqual(boxAfterEdgeDrag(origin, "top", { x: 0, y: 0 }, 24), origin);
});
