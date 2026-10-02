import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { formatInspect, inspectModel, type InspectDump } from "./inspect.js";
import { checkPlein } from "./parser.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist", "cli.js");
const goldenPath = join(repoRoot, "fixtures", "golden-inspect-valid-basic.json");

const DUMP_KEYS = ["file", "elements", "relationships", "views"];
const ELEMENT_KEYS = ["keyword", "label", "id", "line"];
const RELATIONSHIP_KEYS = ["type", "source", "target", "line"];
const VIEW_KEYS = [
  "name",
  "viewpoint",
  "title",
  "includes",
  "excludes",
  "autoLayout",
  "positions",
  "sizes",
  "nesting",
  "line",
];
const POSITION_KEYS = ["id", "x", "y", "line"];
const SIZE_KEYS = ["id", "width", "height", "line"];

function runInspect(args: string[]) {
  return spawnSync(process.execPath, [cli, "inspect", ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
}

function parseDump(stdout: string): InspectDump {
  return JSON.parse(stdout) as InspectDump;
}

function assertDumpShape(dump: InspectDump): void {
  assert.deepEqual(Object.keys(dump), DUMP_KEYS);
  for (const element of dump.elements) {
    assert.deepEqual(Object.keys(element), ELEMENT_KEYS);
  }
  for (const relationship of dump.relationships) {
    assert.deepEqual(Object.keys(relationship), RELATIONSHIP_KEYS);
  }
  for (const view of dump.views) {
    assert.deepEqual(Object.keys(view), VIEW_KEYS);
    assert.ok(Array.isArray(view.includes));
    assert.ok(Array.isArray(view.excludes));
    assert.ok(Array.isArray(view.positions));
    assert.ok(Array.isArray(view.sizes));
    for (const position of view.positions) {
      assert.deepEqual(Object.keys(position), POSITION_KEYS);
    }
    for (const size of view.sizes) {
      assert.deepEqual(Object.keys(size), SIZE_KEYS);
    }
  }
}

test("formatInspect matches the valid-basic inspect golden", () => {
  const file = "fixtures/valid-basic.plein";
  const model = checkPlein(readFileSync(join(repoRoot, file), "utf8"), file);
  const formatted = formatInspect(inspectModel(model, file));
  assert.equal(
    formatted,
    readFileSync(goldenPath, "utf8"),
    "fixtures/golden-inspect-valid-basic.json is stale; refresh with: npx plein inspect fixtures/valid-basic.plein > fixtures/golden-inspect-valid-basic.json",
  );
  assertDumpShape(JSON.parse(formatted) as InspectDump);
});

test("plein inspect exits 0 and matches the valid-basic golden", () => {
  const result = runInspect(["fixtures/valid-basic.plein"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, readFileSync(goldenPath, "utf8"));
  const dump = parseDump(result.stdout);
  assert.equal(dump.file, "fixtures/valid-basic.plein");
  assert.equal(dump.elements.length, 4);
  assert.equal(dump.relationships.length, 4);
  assert.equal(dump.views.length, 1);
  assert.equal(dump.relationships[0]!.type, "serves");
  assert.equal(dump.views[0]!.name, "booking-context");
  assert.equal(dump.views[0]!.viewpoint, null);
  assert.deepEqual(dump.views[0]!.positions, []);
  assertDumpShape(dump);
});

test("plein inspect keeps positions when auto-layout is off and when it is on", () => {
  const result = runInspect(["fixtures/valid-manual-layout.plein"]);
  assert.equal(result.status, 0, result.stderr);
  const dump = parseDump(result.stdout);
  assertDumpShape(dump);
  const story = dump.views.find((view) => view.name === "story");
  const storyAuto = dump.views.find((view) => view.name === "storyAuto");
  assert.ok(story);
  assert.ok(storyAuto);
  assert.equal(story.viewpoint, "story");
  assert.equal(story.autoLayout, "off");
  assert.equal(story.nesting, null);
  assert.deepEqual(story.positions, [
    { id: "shipper", x: 40, y: 240, line: 17 },
    { id: "booking", x: 280, y: 40, line: 18 },
    { id: "order", x: 40, y: 40, line: 19 },
    { id: "rates", x: 280, y: 240, line: 20 },
  ]);
  assert.equal(storyAuto.autoLayout, "tb");
  assert.equal(storyAuto.positions.length, 4);
  assert.equal(storyAuto.positions[0]!.id, "shipper");
});

test("plein inspect dumps value-stream composition and the stage chain", () => {
  const result = runInspect(["fixtures/valid-value-stream-stages.plein"]);
  assert.equal(result.status, 0, result.stderr);
  const dump = parseDump(result.stdout);
  assertDumpShape(dump);
  assert.deepEqual(
    dump.elements.map((element) => `${element.keyword}:${element.id}`),
    ["valueStream:orderToCash", "valueStream:capture", "valueStream:fulfill", "valueStream:collect"],
  );
  assert.deepEqual(
    dump.relationships.map((relationship) => `${relationship.source}->${relationship.target}:${relationship.type}`),
    [
      "orderToCash->capture:composedOf",
      "orderToCash->fulfill:composedOf",
      "orderToCash->collect:composedOf",
      "capture->fulfill:flowsTo",
      "fulfill->collect:triggers",
    ],
  );
  assert.equal(dump.views[0]!.name, "order-to-cash");
  assert.deepEqual(dump.views[0]!.includes, ["orderToCash", "capture", "fulfill", "collect"]);
});

test("plein inspect dumps viewpoint include, exclude, and nesting", () => {
  const views = runInspect(["fixtures/valid-views.plein"]);
  assert.equal(views.status, 0, views.stderr);
  const viewDump = parseDump(views.stdout);
  assertDumpShape(viewDump);
  const structure = viewDump.views[0]!;
  assert.equal(structure.name, "applicationStructure");
  assert.equal(structure.viewpoint, "applicationStructure");
  assert.equal(structure.autoLayout, "lr");
  assert.deepEqual(structure.excludes, ["* -> legacyBatch"]);
  assert.equal(structure.nesting, null);

  const nested = runInspect(["fixtures/samples/value-stream-demo.plein"]);
  assert.equal(nested.status, 0, nested.stderr);
  const nestedDump = parseDump(nested.stdout);
  assertDumpShape(nestedDump);
  assert.equal(nestedDump.views[0]!.name, "strategy");
  assert.equal(nestedDump.views[0]!.nesting, "nested");
});

test("plein inspect exits non-zero on fixtures/broken-syntax.plein with a line diagnostic", () => {
  const result = runInspect(["fixtures/broken-syntax.plein"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /broken-syntax\.plein:\d+:\d+:/);
  assert.match(result.stderr, /expected '}' to close plein/);
});

test("plein inspect exits non-zero on fixtures/unknown-keyword.plein", () => {
  const result = runInspect(["fixtures/unknown-keyword.plein"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unknown-keyword\.plein:\d+:\d+: unknown keyword 'legacyBatch'/);
});

test("plein inspect exits non-zero on fixtures/malformed-views.plein", () => {
  const result = runInspect(["fixtures/malformed-views.plein"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /malformed-views\.plein:\d+:\d+:/);
});

test("plein inspect reports a missing file on stderr", () => {
  const result = runInspect(["fixtures/does-not-exist.plein"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^file not found: fixtures\/does-not-exist\.plein\n?$/);
});

test("plein inspect without a file prints usage and exits 2", () => {
  const result = runInspect([]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /plein inspect <file\.plein>/);
});

test("plein inspect rejects extra arguments", () => {
  const result = runInspect(["fixtures/valid-basic.plein", "--format", "json"]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Usage:/);
});
