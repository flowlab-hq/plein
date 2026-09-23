import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist", "cli.js");

function runCheck(fixture: string) {
  return spawnSync(process.execPath, [cli, "check", fixture], {
    encoding: "utf8",
    cwd: repoRoot,
  });
}

test("plein check exits 0 on fixtures/valid-basic.plein", () => {
  const result = runCheck("fixtures/valid-basic.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/valid-basic\.plein/);
});

test("plein check exits non-zero on fixtures/broken-syntax.plein with line diagnostic", () => {
  const result = runCheck("fixtures/broken-syntax.plein");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /broken-syntax\.plein:\d+:\d+:/);
});

test("plein check exits 0 on fixtures/valid-catalogue-layers.plein", () => {
  const result = runCheck("fixtures/valid-catalogue-layers.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/valid-catalogue-layers\.plein/);
  assert.match(result.stdout, /7 elements/);
});

test("plein check exits 0 on fixtures/valid-layer-bands.plein", () => {
  const result = runCheck("fixtures/valid-layer-bands.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/valid-layer-bands\.plein/);
  assert.match(result.stdout, /10 elements/);
});

test("plein check exits 0 on fixtures/valid-organic-grid.plein", () => {
  const result = runCheck("fixtures/valid-organic-grid.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/valid-organic-grid\.plein/);
  assert.match(result.stdout, /9 elements/);
  assert.match(result.stdout, /4 views/);
});

test("plein check exits 0 on fixtures/valid-capability-value-stream.plein", () => {
  const result = runCheck("fixtures/valid-capability-value-stream.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/valid-capability-value-stream\.plein/);
  assert.match(result.stdout, /2 elements/);
});

test("plein check exits non-zero on fixtures/unknown-keyword.plein mentioning unknown keyword", () => {
  const result = runCheck("fixtures/unknown-keyword.plein");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown-keyword\.plein:\d+:\d+: unknown keyword 'legacyBatch'/);
});

test("plein check exits 0 on fixtures/valid-views.plein and reports a view count", () => {
  const result = runCheck("fixtures/valid-views.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/valid-views\.plein/);
  assert.match(result.stdout, /2 views/);
});

test("plein check exits non-zero on fixtures/malformed-views.plein with line diagnostic", () => {
  const result = runCheck("fixtures/malformed-views.plein");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /malformed-views\.plein:\d+:\d+:/);
  assert.match(result.stderr, /viewpoint keyword/i);
});

test("plein check exits 0 on fixtures/samples/value-stream-demo.plein", () => {
  const result = runCheck("fixtures/samples/value-stream-demo.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/samples\/value-stream-demo\.plein/);
});

test("plein check exits 0 on fixtures/samples/research-data.plein with ≥2 views", () => {
  const result = runCheck("fixtures/samples/research-data.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/samples\/research-data\.plein/);
  assert.match(result.stdout, /12 elements/);
  assert.match(result.stdout, /11 relationships/);
  assert.match(result.stdout, /3 views/);
});

test("plein check exits 0 on fixtures/valid-value-stream-stages.plein", () => {
  const result = runCheck("fixtures/valid-value-stream-stages.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/valid-value-stream-stages\.plein/);
  assert.match(result.stdout, /4 elements/);
  assert.match(result.stdout, /5 relationships/);
});

test("plein check exits 0 on fixtures/open-exchange/booking.plein", () => {
  const result = runCheck("fixtures/open-exchange/booking.plein");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok fixtures\/open-exchange\/booking\.plein/);
  assert.match(result.stdout, /17 elements/);
  assert.match(result.stdout, /15 relationships/);
  assert.match(result.stdout, /2 views/);
});

test("plein check exits non-zero on invalid value stream nesting with line diagnostic", () => {
  const result = runCheck("fixtures/invalid-value-stream-nesting.plein");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid-value-stream-nesting\.plein:\d+:\d+:/);
  assert.match(result.stderr, /valueStreamStage must be nested inside a valueStream/);
});

test("plein check exits non-zero on unknown value stream step keyword with line diagnostic", () => {
  const result = runCheck("fixtures/unknown-value-stream-step.plein");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown-value-stream-step\.plein:\d+:\d+:/);
  assert.match(result.stderr, /unknown step keyword/i);
});
