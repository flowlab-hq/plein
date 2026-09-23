import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  exportNamedView,
  resolveNamedView,
  wrapViewpointHtml,
} from "./export.js";
import type { ViewpointLayout } from "./layout.js";
import { loadPleinSource } from "./list-model.js";
import type { PleinModel } from "./parser.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist", "cli.js");
const goldenHtml = join(repoRoot, "fixtures", "golden-booking-context.html");
const SVG_NS = "http://www.w3.org/2000/svg";

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

function runExport(args: string[]) {
  return spawnSync(process.execPath, [cli, "export", ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
}

/** Browser file: inline SVG namespace only, no scripts, stylesheets, or remote URLs. */
function assertSelfContained(artifact: string): void {
  assert.doesNotMatch(artifact, /<script/i);
  assert.doesNotMatch(artifact, /<link\b/i);
  assert.doesNotMatch(artifact, /@import/i);
  assert.doesNotMatch(artifact, /\ssrc\s*=/i);
  assert.doesNotMatch(artifact, /url\(\s*['"]?https?:/i);
  const urls = artifact.match(/https?:\/\/[^"'\s)]+/g) ?? [];
  for (const url of urls) {
    assert.equal(url, SVG_NS, url);
  }
}

test("resolveNamedView prefers a viewpoint name, then a unique title", () => {
  const model: PleinModel = {
    elements: [],
    relationships: [],
    views: [
      { name: "landscape", title: "Same", includes: [], excludes: [], line: 1 },
      { name: "access", title: "Same", includes: [], excludes: [], line: 2 },
      { name: "archive", title: "Archive", includes: [], excludes: [], line: 3 },
    ],
  };
  assert.equal(resolveNamedView(model).name, "landscape");
  assert.equal(resolveNamedView(model, "access").name, "access");
  assert.equal(resolveNamedView(model, "Archive").name, "archive");
  assert.throws(() => resolveNamedView(model, "Same"), /ambiguous view 'Same'/);
  assert.throws(() => resolveNamedView(model, "missing"), /unknown view 'missing'/);
  assert.throws(
    () => resolveNamedView({ elements: [], relationships: [], views: [] }),
    /file has no named view/,
  );
});

test("wrapViewpointHtml escapes text and inlines the SVG", () => {
  const layout: ViewpointLayout = {
    viewName: "a<b",
    title: `A & B "quoted"`,
    direction: "tb",
    mode: "layered",
    routing: "orthogonal",
    nesting: "beside",
    width: 10,
    height: 10,
    nodes: [],
    edges: [],
  };
  const svg = `<svg xmlns="${SVG_NS}" data-view="a&lt;b"></svg>\n`;
  const html = wrapViewpointHtml(layout, svg, "fixtures/a&b.plein");
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<title>A &amp; B &quot;quoted&quot; — Plein<\/title>/);
  assert.match(html, /<h1>A &amp; B &quot;quoted&quot;<\/h1>/);
  assert.match(html, /view a&lt;b · fixtures\/a&amp;b\.plein/);
  assert.ok(html.includes(svg));
  assertSelfContained(html);
});

test("golden booking-context HTML export matches the snapshot", async () => {
  const result = loadPleinSource(readFixture("valid-basic.plein"), "fixtures/valid-basic.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const exported = await exportNamedView(result.model, "booking-context", "fixtures/valid-basic.plein");
  assert.equal(exported.viewName, "booking-context");
  assert.equal(exported.title, "Booking context");
  assert.match(exported.svg, /data-view="booking-context"/);
  assert.match(exported.svg, /data-node-id="shipper"/);
  assert.match(exported.svg, /data-node-id="rates"/);
  assert.match(exported.svg, /data-edge-id="shipper-&gt;booking:serves"|data-edge-id="shipper->booking:serves"/);
  assert.ok(exported.html.includes(exported.svg));
  assert.match(exported.html, /^<!DOCTYPE html>/);
  assert.match(exported.html, /<h1>Booking context<\/h1>/);
  assertSelfContained(exported.html);
  assertSelfContained(exported.svg);

  const committed = readFileSync(goldenHtml, "utf8");
  assert.equal(
    exported.html,
    committed,
    "fixtures/golden-booking-context.html is stale; re-render with: npx plein export fixtures/valid-basic.plein --view booking-context --format html > fixtures/golden-booking-context.html",
  );
});

test("plein export writes the golden HTML to stdout", () => {
  const result = runExport([
    "fixtures/valid-basic.plein",
    "--view",
    "Booking context",
    "--format",
    "html",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, readFileSync(goldenHtml, "utf8"));
  assertSelfContained(result.stdout);
});

test("plein export --format svg is the SVG inlined in the golden HTML", () => {
  const result = runExport([
    "fixtures/valid-basic.plein",
    "--view",
    "booking-context",
    "--format",
    "svg",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(goldenHtml, "utf8");
  assert.ok(html.includes(result.stdout));
  assert.match(result.stdout, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(result.stdout, /data-view="booking-context"/);
  assertSelfContained(result.stdout);
});

test("plein export --format both writes html and svg files", () => {
  const dir = mkdtempSync(join(tmpdir(), "plein-export-"));
  try {
    const stem = join(dir, "nested", "booking");
    const result = runExport([
      "fixtures/valid-basic.plein",
      "--view",
      "booking-context",
      "--format",
      "both",
      "-o",
      stem,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`exported booking-context html ${stem}.html`));
    assert.ok(result.stdout.includes(`exported booking-context svg ${stem}.svg`));
    const html = readFileSync(`${stem}.html`, "utf8");
    const svg = readFileSync(`${stem}.svg`, "utf8");
    assert.equal(html, readFileSync(goldenHtml, "utf8"));
    assert.ok(html.includes(svg));
    assertSelfContained(html);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plein export -o directory writes <view>.svg", () => {
  const dir = mkdtempSync(join(tmpdir(), "plein-export-dir-"));
  try {
    const outDir = join(dir, "views");
    mkdirSync(outDir);
    const result = runExport([
      "fixtures/valid-basic.plein",
      "--format",
      "svg",
      "-o",
      `${outDir}/`,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const svg = readFileSync(join(outDir, "booking-context.svg"), "utf8");
    assert.match(svg, /data-view="booking-context"/);
    assert.match(result.stdout, /exported booking-context svg /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plein export selects a named research-data view by title", () => {
  const landscape = runExport([
    "fixtures/samples/research-data.plein",
    "--view",
    "Research data landscape",
    "--format",
    "html",
  ]);
  const access = runExport([
    "fixtures/samples/research-data.plein",
    "--view",
    "publishedResearchAccess",
    "--format",
    "svg",
  ]);
  const archive = runExport([
    "--format=svg",
    "--view=researchStorageArchive",
    "fixtures/samples/research-data.plein",
  ]);
  assert.equal(landscape.status, 0, landscape.stderr);
  assert.equal(access.status, 0, access.stderr);
  assert.equal(archive.status, 0, archive.stderr);

  assert.match(landscape.stdout, /^<!DOCTYPE html>/);
  assert.match(landscape.stdout, /<h1>Research data landscape<\/h1>/);
  assert.match(landscape.stdout, /data-view="researchDataLandscape"/);
  assert.match(landscape.stdout, /data-node-id="arkivum"/);
  assert.match(landscape.stdout, /data-node-id="generalPublic"/);
  assert.doesNotMatch(landscape.stdout, /data-view="publishedResearchAccess"/);
  assertSelfContained(landscape.stdout);

  assert.match(access.stdout, /data-view="publishedResearchAccess"/);
  assert.match(access.stdout, /data-node-id="eprints"/);
  assert.doesNotMatch(access.stdout, /data-node-id="arkivum"/);
  assertSelfContained(access.stdout);

  assert.match(archive.stdout, /data-view="researchStorageArchive"/);
  assert.match(archive.stdout, /data-node-id="arkivum"/);
  assert.doesNotMatch(archive.stdout, /data-node-id="generalPublic"/);
});

test("plein export defaults to the first named view", () => {
  const result = runExport(["fixtures/valid-views.plein", "--format", "svg"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /data-view="applicationStructure"/);
  assert.doesNotMatch(result.stdout, /data-view="applicationCooperation"/);
});

test("plein export rejects a broken model, a missing file, and a bad view", () => {
  const broken = runExport(["fixtures/broken-syntax.plein"]);
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /broken-syntax\.plein:\d+:\d+:/);

  const missing = runExport(["fixtures/no-such-file.plein"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /file not found: fixtures\/no-such-file\.plein/);

  const unknown = runExport(["fixtures/valid-basic.plein", "--view", "nope"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown view 'nope'/);
  assert.match(unknown.stderr, /booking-context/);

  const both = runExport(["fixtures/valid-basic.plein", "--format", "both"]);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /--format both requires -o/);

  const badFormat = runExport(["fixtures/valid-basic.plein", "--format", "pdf"]);
  assert.equal(badFormat.status, 2);
});
