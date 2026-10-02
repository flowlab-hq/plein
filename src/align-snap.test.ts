import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALIGN_SNAP_RELEASE_SCREEN_PX,
  ALIGN_SNAP_SCREEN_PX,
  alignDraggedBox,
  userSnapDistance,
  type AlignLock,
  type AlignRect,
  type GridSnapFn,
} from "./align-snap.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("user snap distance follows zoom and ignores a broken scale", () => {
  assert.equal(userSnapDistance(8, 1), 8);
  assert.equal(userSnapDistance(8, 2), 4);
  assert.equal(userSnapDistance(ALIGN_SNAP_SCREEN_PX, 0), ALIGN_SNAP_SCREEN_PX);
  assert.equal(userSnapDistance(ALIGN_SNAP_RELEASE_SCREEN_PX, Number.NaN), ALIGN_SNAP_RELEASE_SCREEN_PX);
});

test("edges and centres snap on each axis while the pointer is inside the threshold", () => {
  const wide = { id: "other", x: 100, y: 40, width: 400, height: 100 };

  const left = alignDraggedBox({
    moving: { id: "drag", x: 104, y: 400, width: 50, height: 20 },
    others: [wide],
    threshold: 8,
    release: 0,
  });
  assert.equal(left.x, 100);
  assert.equal(left.y, 400);
  assert.equal(left.guides.length, 1);
  assert.equal(left.guides[0]?.axis, "x");
  assert.equal(left.guides[0]?.kind, "edge");
  assert.equal(left.guides[0]?.position, 100);

  const right = alignDraggedBox({
    moving: { id: "drag", x: 168, y: 400, width: 30, height: 20 },
    others: [{ id: "other", x: 0, y: 40, width: 200, height: 100 }],
    threshold: 8,
    release: 0,
  });
  assert.equal(right.x, 170);
  assert.equal(right.guides[0]?.position, 200);
  assert.equal(right.guides[0]?.kind, "edge");

  const abut = alignDraggedBox({
    moving: { id: "drag", x: 204, y: 400, width: 40, height: 20 },
    others: [{ id: "other", x: 0, y: 40, width: 200, height: 100 }],
    threshold: 8,
    release: 0,
  });
  assert.equal(abut.x, 200);
  assert.equal(abut.guides[0]?.position, 200);
  assert.equal(abut.guides[0]?.kind, "edge");

  const center = alignDraggedBox({
    moving: { id: "drag", x: 26, y: 400, width: 40, height: 20 },
    others: [{ id: "other", x: 0, y: 40, width: 100, height: 100 }],
    threshold: 8,
    release: 0,
  });
  assert.equal(center.x, 30);
  assert.equal(center.guides[0]?.kind, "center");
  assert.equal(center.guides[0]?.position, 50);

  const top = alignDraggedBox({
    moving: { id: "drag", x: 800, y: 43, width: 40, height: 16 },
    others: [wide],
    threshold: 8,
    release: 0,
  });
  assert.equal(top.y, 40);
  assert.equal(top.x, 800);
  assert.equal(top.guides[0]?.axis, "y");
  assert.equal(top.guides[0]?.kind, "edge");
  assert.equal(top.guides[0]?.position, 40);

  const bottom = alignDraggedBox({
    moving: { id: "drag", x: 800, y: 48, width: 40, height: 20 },
    others: [{ id: "other", x: 100, y: 0, width: 400, height: 70 }],
    threshold: 8,
    release: 0,
  });
  assert.equal(bottom.y, 50);
  assert.equal(bottom.guides[0]?.position, 70);
  assert.equal(bottom.guides[0]?.kind, "edge");

  const middle = alignDraggedBox({
    moving: { id: "drag", x: 800, y: 36, width: 40, height: 20 },
    others: [{ id: "other", x: 100, y: 0, width: 400, height: 100 }],
    threshold: 8,
    release: 0,
  });
  assert.equal(middle.y, 40);
  assert.equal(middle.guides[0]?.kind, "center");
  assert.equal(middle.guides[0]?.position, 50);
});

test("a centre and an edge can snap together, and a far box does not", () => {
  const both = alignDraggedBox({
    moving: { id: "drag", x: 26, y: 43, width: 40, height: 16 },
    others: [{ id: "other", x: 0, y: 40, width: 100, height: 100 }],
    threshold: 8,
    release: 0,
  });
  assert.equal(both.x, 30);
  assert.equal(both.y, 40);
  assert.deepEqual(
    both.guides.map((guide) => guide.axis),
    ["x", "y"],
  );
  assert.equal(both.guides[0]?.kind, "center");
  assert.equal(both.guides[1]?.kind, "edge");
  assert.ok(both.guides[0]!.from < 40);
  assert.ok(both.guides[0]!.to > 140);

  const far = alignDraggedBox({
    moving: { id: "drag", x: 200, y: 200, width: 40, height: 20 },
    others: [{ id: "other", x: 100, y: 40, width: 80, height: 30 }],
    threshold: 8,
    release: 0,
  });
  assert.equal(far.x, 200);
  assert.equal(far.y, 200);
  assert.deepEqual(far.guides, []);
  assert.deepEqual(far.lock, { x: null, y: null });
});

test("the closest candidate wins, and an equal distance prefers a centre then a stable id", () => {
  const closest = alignDraggedBox({
    moving: { id: "drag", x: 16, y: 0, width: 10, height: 10 },
    others: [
      { id: "far", x: 80, y: 0, width: 400, height: 10 },
      { id: "near", x: 10, y: 30, width: 400, height: 10 },
    ],
    threshold: 8,
    release: 0,
  });
  assert.equal(closest.x, 10);

  const moving: AlignRect = { id: "drag", x: 0, y: 0, width: 10, height: 10 };
  const edge: AlignRect = { id: "e", x: -2, y: 0, width: 1000, height: 10 };
  const center: AlignRect = { id: "c", x: -493, y: 40, width: 1000, height: 10 };
  const forward = alignDraggedBox({ moving, others: [edge, center], threshold: 8, release: 0 });
  const reverse = alignDraggedBox({ moving, others: [center, edge], threshold: 8, release: 0 });
  assert.equal(forward.x, 2);
  assert.equal(forward.guides[0]?.kind, "center");
  assert.equal(reverse.x, forward.x);
  assert.equal(reverse.guides[0]?.kind, "center");

  const low = alignDraggedBox({
    moving: { id: "drag", x: 0, y: 0, width: 100, height: 10 },
    others: [
      { id: "b", x: 5, y: 0, width: 1000, height: 10 },
      { id: "a", x: -5, y: 20, width: 1000, height: 10 },
    ],
    threshold: 8,
    release: 0,
  });
  const flipped = alignDraggedBox({
    moving: { id: "drag", x: 0, y: 0, width: 100, height: 10 },
    others: [
      { id: "a", x: -5, y: 20, width: 1000, height: 10 },
      { id: "b", x: 5, y: 0, width: 1000, height: 10 },
    ],
    threshold: 8,
    release: 0,
  });
  assert.equal(low.x, -5);
  assert.equal(flipped.x, -5);
});

test("nearby candidates stick instead of alternating as the pointer jitters", () => {
  const others = [
    { id: "a", x: 0, y: 0, width: 500, height: 10 },
    { id: "b", x: 10, y: 40, width: 500, height: 10 },
  ];
  let lock: AlignLock | null = null;
  const snapped: number[] = [];
  for (const x of [1, 3, 6, 7, 8, 7, 6, 9, 1]) {
    const result = alignDraggedBox({
      moving: { id: "drag", x, y: 80, width: 40, height: 10 },
      others,
      threshold: 8,
      release: 4,
      lock,
    });
    lock = result.lock;
    snapped.push(result.x);
  }
  assert.deepEqual(snapped, [0, 0, 0, 0, 10, 10, 10, 10, 0]);

  lock = null;
  const jitter: number[] = [];
  for (const x of [4, 5, 4, 6, 5, 4]) {
    const result = alignDraggedBox({
      moving: { id: "drag", x, y: 80, width: 40, height: 10 },
      others,
      threshold: 8,
      release: 4,
      lock,
    });
    lock = result.lock;
    jitter.push(result.x);
  }
  assert.deepEqual(jitter, [0, 0, 0, 0, 0, 0]);
});

test("a lock releases only after the pointer leaves the threshold plus the release margin", () => {
  const others = [{ id: "a", x: 0, y: 0, width: 500, height: 10 }];
  const held = alignDraggedBox({
    moving: { id: "drag", x: 10, y: 100, width: 20, height: 10 },
    others,
    threshold: 8,
    release: 4,
    lock: { x: { guide: 0, offset: 0, kind: "edge" }, y: null },
  });
  assert.equal(held.x, 0);
  assert.equal(held.y, 100);
  assert.equal(held.lock.x?.guide, 0);

  const released = alignDraggedBox({
    moving: { id: "drag", x: 13, y: 100, width: 20, height: 10 },
    others,
    threshold: 8,
    release: 4,
    lock: { x: { guide: 0, offset: 0, kind: "edge" }, y: null },
  });
  assert.equal(released.x, 13);
  assert.equal(released.lock.x, null);

  const defaultRelease = alignDraggedBox({
    moving: { id: "drag", x: 11, y: 100, width: 20, height: 10 },
    others,
    threshold: 8,
    lock: { x: { guide: 0, offset: 0, kind: "edge" }, y: null },
  });
  assert.equal(defaultRelease.x, 0);
});

test("grid snap runs first and neighbour align applies only inside the align threshold", () => {
  const nearest16: GridSnapFn = (box) => ({
    x: Math.round(box.x / 16) * 16,
    y: box.y,
  });
  const others = [{ id: "other", x: 100, y: 200, width: 400, height: 40 }];

  let seenX = Number.NaN;
  const stillNear = alignDraggedBox({
    moving: { id: "drag", x: 103, y: 7, width: 40, height: 20 },
    others,
    threshold: 8,
    release: 0,
    gridSnap: (box) => {
      seenX = box.x;
      return nearest16(box);
    },
  });
  assert.equal(seenX, 103);
  assert.equal(stillNear.x, 100);
  assert.equal(stillNear.y, 7);
  assert.equal(stillNear.guides.some((guide) => guide.axis === "x"), true);

  const pastThreshold = alignDraggedBox({
    moving: { id: "drag", x: 108, y: 7, width: 40, height: 20 },
    others,
    threshold: 8,
    release: 0,
    gridSnap: nearest16,
  });
  assert.equal(pastThreshold.x, 112);
  assert.equal(pastThreshold.y, 7);
  assert.equal(pastThreshold.guides.some((guide) => guide.axis === "x"), false);

  const withoutGrid = alignDraggedBox({
    moving: { id: "drag", x: 108, y: 7, width: 40, height: 20 },
    others,
    threshold: 8,
    release: 0,
  });
  assert.equal(withoutGrid.x, 100);

  const broken = alignDraggedBox({
    moving: { id: "drag", x: 104, y: 40, width: 40, height: 20 },
    others,
    threshold: 8,
    release: 0,
    gridSnap: () => ({ x: Number.NaN, y: Number.POSITIVE_INFINITY }),
  });
  assert.equal(broken.x, 100);
  assert.equal(broken.y, 40);
});

test("the dragged id, empty neighbours, and a non-finite box do not invent a snap", () => {
  const self = alignDraggedBox({
    moving: { id: "drag", x: 12, y: 8, width: 40, height: 20 },
    others: [{ id: "drag", x: 10, y: 8, width: 40, height: 20 }],
    threshold: 8,
    release: 0,
  });
  assert.equal(self.x, 12);
  assert.deepEqual(self.guides, []);

  const alone = alignDraggedBox({
    moving: { id: "drag", x: 12, y: 8, width: 40, height: 20 },
    others: [],
    threshold: 8,
  });
  assert.equal(alone.x, 12);
  assert.equal(alone.y, 8);

  const broken = alignDraggedBox({
    moving: { id: "drag", x: Number.NaN, y: 8, width: 40, height: 20 },
    others: [{ id: "other", x: 100, y: 40, width: 80, height: 30 }],
    threshold: 8,
    gridSnap: () => {
      throw new Error("grid snap must not run for a non-finite box");
    },
  });
  assert.equal(Number.isNaN(broken.x), true);
  assert.deepEqual(broken.guides, []);
});

test("Mac canvas drag paints alignment guides from the shared snap helper", () => {
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");

  assert.match(ui, /alignDraggedBox/);
  assert.match(ui, /gridSnapForDrag/);
  assert.match(ui, /grid snap runs first/);
  assert.match(ui, /data-align-guides/);
  assert.match(css, /\.align-guide/);

  const down = ui.slice(
    ui.indexOf('diagram.addEventListener("pointerdown"'),
    ui.indexOf('diagram.addEventListener("pointermove"'),
  );
  assert.match(down, /auto === false/);
  assert.equal(down.includes("alignDraggedBox"), false);

  const placement = ui.slice(ui.indexOf("function dragPlacement"), ui.indexOf('diagram.addEventListener("pointerdown"'));
  assert.match(placement, /alignDraggedBox/);
  assert.match(placement, /gridSnapForDrag\(\)/);
  assert.match(placement, /!drag\.origins\.has\(node\.id\)/);
});
