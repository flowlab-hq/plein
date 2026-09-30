import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { NODE_HEIGHT, NODE_WIDTH, PADDING, contentBounds } from "./layout.js";
import { fitCanvasScroll, manualDragShift, nodeBoxesAfterDrag, slackMargin } from "./manual-drag.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const minWidth = PADDING * 2 + NODE_WIDTH;
const minHeight = PADDING * 2 + NODE_HEIGHT;

test("manual drag shift follows the pointer and is not clamped", () => {
  assert.deepEqual(manualDragShift(-80, 0, 1, 1), { x: -80, y: 0 });
  assert.deepEqual(manualDragShift(0, -48, 1, 1), { x: 0, y: -48 });
  assert.deepEqual(manualDragShift(150, 80, 1, 1), { x: 150, y: 80 });
  assert.deepEqual(manualDragShift(-80, 40, 2, 2), { x: -40, y: 20 });
  assert.deepEqual(manualDragShift(Number.NaN, 10, 0, 1), { x: 0, y: 10 });
});

test("dragging past the previous outermost node expands bounds on every side", () => {
  const nodes = [
    { id: "west", x: 40, y: 200, width: NODE_WIDTH, height: NODE_HEIGHT },
    { id: "east", x: 400, y: 200, width: NODE_WIDTH, height: NODE_HEIGHT },
    { id: "north", x: 220, y: 40, width: NODE_WIDTH, height: NODE_HEIGHT },
    { id: "south", x: 220, y: 360, width: NODE_WIDTH, height: NODE_HEIGHT },
  ];
  const before = contentBounds(nodes, PADDING, minWidth, minHeight);
  assert.equal(before.x, 0);
  assert.equal(before.y, 0);
  const previousMinX = Math.min(...nodes.map((node) => node.x));
  const previousMaxX = Math.max(...nodes.map((node) => node.x + node.width));
  const previousMinY = Math.min(...nodes.map((node) => node.y));
  const previousMaxY = Math.max(...nodes.map((node) => node.y + node.height));

  const westOrigins = new Map([["west", { x: 40, y: 200 }]]);
  const westBoxes = nodeBoxesAfterDrag(nodes, westOrigins, { x: -100, y: 0 });
  const west = westBoxes.find((node) => node.id === "west");
  assert.ok(west);
  assert.ok(west.x < previousMinX);
  assert.equal(westBoxes.find((node) => node.id === "east")?.x, 400);
  const westBounds = contentBounds(westBoxes, PADDING, minWidth, minHeight);
  assert.ok(westBounds.x < before.x);
  assert.equal(west.x, westBounds.x + PADDING);
  assert.ok(west.x + west.width <= westBounds.x + westBounds.width);
  assert.ok(west.y + west.height <= westBounds.y + westBounds.height);

  const eastBoxes = nodeBoxesAfterDrag(nodes, new Map([["east", { x: 400, y: 200 }]]), { x: 150, y: 0 });
  const east = eastBoxes.find((node) => node.id === "east");
  assert.ok(east);
  assert.ok(east.x + east.width > previousMaxX);
  assert.equal(eastBoxes.find((node) => node.id === "west")?.x, 40);
  const eastBounds = contentBounds(eastBoxes, PADDING, minWidth, minHeight);
  assert.equal(eastBounds.x, 0);
  assert.ok(eastBounds.width > before.width);
  assert.ok(east.x + east.width + PADDING <= eastBounds.x + eastBounds.width);

  const northBoxes = nodeBoxesAfterDrag(nodes, new Map([["north", { x: 220, y: 40 }]]), { x: 0, y: -80 });
  const north = northBoxes.find((node) => node.id === "north");
  assert.ok(north);
  assert.ok(north.y < previousMinY);
  const northBounds = contentBounds(northBoxes, PADDING, minWidth, minHeight);
  assert.ok(northBounds.y < 0);
  assert.equal(north.y, northBounds.y + PADDING);
  assert.equal(northBoxes.find((node) => node.id === "south")?.y, 360);

  const southBoxes = nodeBoxesAfterDrag(nodes, new Map([["south", { x: 220, y: 360 }]]), { x: 0, y: 70 });
  const south = southBoxes.find((node) => node.id === "south");
  assert.ok(south);
  assert.ok(south.y + south.height > previousMaxY);
  const southBounds = contentBounds(southBoxes, PADDING, minWidth, minHeight);
  assert.equal(southBounds.y, 0);
  assert.ok(southBounds.height > before.height);
  assert.ok(south.y + south.height + PADDING <= southBounds.y + southBounds.height);
});

test("a node still inside the positive quadrant does not shift the content origin", () => {
  const boxes = [
    { x: 12, y: 18, width: NODE_WIDTH, height: NODE_HEIGHT },
    { x: 40, y: 40, width: NODE_WIDTH, height: NODE_HEIGHT },
  ];
  const bounds = contentBounds(boxes, PADDING, minWidth, minHeight);
  assert.equal(bounds.x, 0);
  assert.equal(bounds.y, 0);
  assert.equal(
    bounds.width,
    Math.max(minWidth, ...boxes.map((box) => box.x + box.width + PADDING)),
  );
  assert.equal(
    bounds.height,
    Math.max(minHeight, ...boxes.map((box) => box.y + box.height + PADDING)),
  );
});

test("scroll slack appears only when the expanded canvas must scroll past the pane", () => {
  assert.equal(slackMargin(1000, 400, 0), 0);
  assert.equal(slackMargin(500, 800, 64), 0);
  assert.equal(slackMargin(1000, 464, 64), 600);
  assert.equal(slackMargin(500, 800, 400), 100);
  assert.equal(slackMargin(0, 400, 10), 0);

  const fitted = fitCanvasScroll({
    clientWidth: 1000,
    clientHeight: 700,
    contentWidth: 464,
    contentHeight: 800,
    scrollLeft: 64,
    scrollTop: 20,
  });
  assert.equal(fitted.marginRight, 600);
  assert.equal(fitted.marginBottom, 0);
});

test("Mac canvas drag uses the unclamped shift and expands content bounds", () => {
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  assert.match(ui, /manualDragShift/);
  assert.match(ui, /contentBounds/);
  assert.match(ui, /growCanvasForDrag/);
  assert.equal(ui.includes("minX < 0"), false);
  assert.equal(ui.includes("minY < 0"), false);
  assert.match(ui, /wheelGestureIsZoom/);
  assert.match(ui, /pointerdown/);
});
