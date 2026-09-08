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

test("plein check exits non-zero on fixtures/unknown-keyword.plein mentioning unknown keyword", () => {
  const result = runCheck("fixtures/unknown-keyword.plein");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown keyword/i);
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
