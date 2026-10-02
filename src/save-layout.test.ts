import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkPlein } from "./parser.js";
import { isAutoLayoutEnabled, layoutViewpoint } from "./layout.js";
import {
  formatCoordinate,
  manualPositionsAreDirty,
  SaveLayoutError,
  sameCoordinate,
  writeManualPositions,
} from "./save-layout.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("formatCoordinate matches plein format numbers", () => {
  assert.equal(formatCoordinate(40), "40");
  assert.equal(formatCoordinate(10.5), "10.5");
  assert.equal(formatCoordinate(10.5), "10.5");
  assert.equal(formatCoordinate(10.5554), "10.555");
  assert.equal(formatCoordinate(-12), "-12");
  assert.equal(formatCoordinate(-0), "0");
  assert.equal(sameCoordinate(40, 40.0004), true);
  assert.equal(sameCoordinate(40, 41), false);
  assert.throws(() => formatCoordinate(Number.NaN), SaveLayoutError);
});

test("manual positions are dirty when they would not reload from the file", () => {
  const file = [
    { id: "shipper", x: 40, y: 240 },
    { id: "booking", x: 280, y: 40 },
  ];
  assert.equal(manualPositionsAreDirty("off", file, new Map()), false);
  assert.equal(manualPositionsAreDirty("off", file, null), false);
  assert.equal(
    manualPositionsAreDirty(
      "off",
      file,
      new Map([
        ["shipper", { x: 40, y: 240 }],
        ["booking", { x: 280, y: 40 }],
      ]),
    ),
    false,
  );
  assert.equal(
    manualPositionsAreDirty("off", file, new Map([["shipper", { x: 64, y: 240 }]])),
    true,
    "a moved box is unsaved",
  );
  assert.equal(
    manualPositionsAreDirty(
      "off",
      file,
      new Map([
        ["shipper", { x: 64, y: 240 }],
        ["booking", { x: 304, y: 40 }],
      ]),
    ),
    true,
    "a group move is unsaved",
  );
  assert.equal(
    manualPositionsAreDirty("off", file, new Map([["order", { x: 16, y: 16 }]])),
    true,
    "a box with no position clause is unsaved",
  );
  assert.equal(
    manualPositionsAreDirty("lr", file, new Map([["shipper", { x: 40, y: 240 }]])),
    true,
    "an automatic view ignores saved positions",
  );
  assert.equal(
    manualPositionsAreDirty(
      "manual",
      [{ id: "shipper", x: 1, y: 2 }],
      new Map([["shipper", { x: 1, y: 2 }]]),
    ),
    false,
    "manual is an alias of off",
  );
});

test("writeManualPositions sets autoLayout off and replaces position clauses", () => {
  const source = readFileSync(join(repoRoot, "fixtures/valid-views.plein"), "utf8");
  const saved = writeManualPositions(source, [
    {
      view: "applicationStructure",
      positions: [
        { id: "tms", x: 48, y: 72 },
        { id: "customsGateway", x: 192, y: 72 },
        { id: "bookingApi", x: 48, y: 240 },
        { id: "shipment", x: 192, y: 240 },
      ],
    },
  ]);
  assert.equal(saved.includes('application-component "TMS" as tms'), true);
  assert.match(saved, /viewpoint applicationCooperation "Application Cooperation" \{\n      include tms bookingApi\n      autoLayout lr\n    \}/);
  const model = checkPlein(saved, "valid-views.plein");
  const view = model.views.find((item) => item.name === "applicationStructure");
  assert.ok(view);
  assert.equal(isAutoLayoutEnabled(view.autoLayout), false);
  assert.deepEqual(
    view.positions?.map((position) => [position.id, position.x, position.y]),
    [
      ["tms", 48, 72],
      ["customsGateway", 192, 72],
      ["bookingApi", 48, 240],
      ["shipment", 192, 240],
    ],
  );
  assert.deepEqual(view.includes, [
    "applicationComponent",
    "applicationInterface",
    "dataObject",
    "tms",
    "customsGateway",
  ]);
  assert.deepEqual(view.excludes, ["* -> legacyBatch"]);
  const again = writeManualPositions(saved, [
    {
      view: "applicationStructure",
      positions: [
        { id: "tms", x: 48, y: 72 },
        { id: "customsGateway", x: 192, y: 72 },
        { id: "bookingApi", x: 48, y: 240 },
        { id: "shipment", x: 192, y: 240 },
      ],
    },
  ]);
  assert.equal(again, saved);
});

test("writeManualPositions keeps a position comment and a trailing comment", () => {
  const source = `plein {
  model {
    business-actor "Shipper" as shipper
    business-actor "Dock" as dock
  }

  views {
    viewpoint story "Story" {
      include shipper dock
      autoLayout
        lr
      nesting nested
      // dock note
      position dock 3 4
      position shipper 1 2
      // trailing
    }
  }
}
`;
  const saved = writeManualPositions(source, [
    {
      view: "story",
      positions: [
        { id: "shipper", x: 16, y: -8.5 },
        { id: "dock", x: 80, y: 24 },
      ],
    },
  ]);
  assert.match(saved, /include shipper dock/);
  assert.match(saved, /nesting nested/);
  assert.match(saved, /autoLayout off/);
  assert.doesNotMatch(saved, /autoLayout\s+lr/);
  assert.match(saved, /position shipper 16 -8.5\n\s+\/\/ dock note\n\s+position dock 80 24\n\s+\/\/ trailing/);
  const twice = writeManualPositions(saved, [
    {
      view: "story",
      positions: [
        { id: "shipper", x: 16, y: -8.5 },
        { id: "dock", x: 80, y: 24 },
      ],
    },
  ]);
  assert.equal(twice, saved);
  const model = checkPlein(saved);
  assert.equal(model.views[0]!.positions?.[1]?.leadingComments?.[0], "dock note");
  assert.deepEqual(model.views[0]!.trailingComments, ["trailing"]);
});

test("writeManualPositions can update two views and leave an automatic view's positions unused until off", async () => {
  const source = readFileSync(join(repoRoot, "fixtures/valid-manual-layout.plein"), "utf8");
  const saved = writeManualPositions(source, [
    {
      view: "story",
      positions: [
        { id: "shipper", x: 8, y: 8 },
        { id: "booking", x: 32, y: 8 },
        { id: "order", x: 8, y: 32 },
        { id: "rates", x: 32, y: 32 },
      ],
    },
    {
      view: "storyAuto",
      positions: [
        { id: "shipper", x: 8, y: 80 },
        { id: "booking", x: 80, y: 80 },
        { id: "order", x: 8, y: 120 },
        { id: "rates", x: 80, y: 120 },
      ],
    },
  ]);
  assert.match(saved, /business-service "Booking" as booking/);
  const model = checkPlein(saved);
  const story = model.views.find((view) => view.name === "story")!;
  const storyAuto = model.views.find((view) => view.name === "storyAuto")!;
  assert.equal(isAutoLayoutEnabled(story.autoLayout), false);
  assert.equal(isAutoLayoutEnabled(storyAuto.autoLayout), false);
  const laid = await layoutViewpoint(model, "story");
  assert.equal(laid.auto, false);
  assert.equal(laid.nodes.find((node) => node.id === "shipper")?.x, 8);
  assert.equal(laid.nodes.find((node) => node.id === "rates")?.y, 32);
  const reopened = writeManualPositions(saved, [
    {
      view: "story",
      positions: story.positions!.map((position) => ({ id: position.id, x: position.x, y: position.y })),
    },
  ]);
  assert.equal(checkPlein(reopened).views.find((view) => view.name === "storyAuto")!.positions?.[0]?.y, 80);
});

test("writeManualPositions rejects a view or id the file cannot store", () => {
  const source = readFileSync(join(repoRoot, "fixtures/valid-manual-layout.plein"), "utf8");
  assert.throws(() => writeManualPositions(source, [{ view: "missing", positions: [] }]), /unknown view 'missing'/);
  assert.throws(
    () => writeManualPositions(source, [{ view: "story", positions: [{ id: "nope", x: 1, y: 2 }] }]),
    SaveLayoutError,
  );
  assert.throws(
    () =>
      writeManualPositions(source, [
        {
          view: "story",
          positions: [
            { id: "shipper", x: 1, y: 2 },
            { id: "shipper", x: 3, y: 4 },
          ],
        },
      ]),
    /duplicate position/,
  );
});
