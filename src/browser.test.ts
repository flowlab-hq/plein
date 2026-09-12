import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  browseNamedView,
  currentViewCaption,
  namedViewNames,
  namedViews,
  switchNamedView,
  viewSwitcherLabel,
} from "./browser.js";
import { loadPleinSource, reloadPleinSource } from "./list-model.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

test("current view caption stays the human name while switching ≥2 views", () => {
  const result = loadPleinSource(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.model.views.length >= 2, true);
  assert.equal(currentViewCaption(result.model, "applicationStructure"), "Application Structure");
  assert.equal(
    currentViewCaption(result.model, "applicationCooperation"),
    "Application Cooperation",
  );
  assert.equal(currentViewCaption(result.model, null), "No named view");
  assert.equal(currentViewCaption(result.model, "missing"), "No named view");

  const cooperation = switchNamedView(result.model, "applicationCooperation");
  assert.equal(cooperation.model, result.model);
  assert.equal(currentViewCaption(cooperation.model, cooperation.viewName), cooperation.title);
});

test("valid-views.plein exposes two named viewpoints for the switcher", () => {
  const result = loadPleinSource(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(namedViewNames(result.model), [
    "applicationStructure",
    "applicationCooperation",
  ]);
  assert.deepEqual(
    namedViews(result.model).map((view) => viewSwitcherLabel(view)),
    ["Application Structure", "Application Cooperation"],
  );
});

test("switching named views reuses the same loaded model", () => {
  const result = loadPleinSource(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const structure = browseNamedView(result.model, "applicationStructure");
  const cooperation = switchNamedView(result.model, "applicationCooperation");

  assert.equal(structure.model, result.model);
  assert.equal(cooperation.model, result.model);
  assert.equal(structure.model, cooperation.model);
  assert.equal(structure.views, result.model.views);
  assert.equal(cooperation.views, result.model.views);

  assert.equal(structure.viewName, "applicationStructure");
  assert.equal(structure.title, "Application Structure");
  assert.ok(structure.membership.nodes.includes("shipment"));
  assert.ok(structure.membership.nodes.includes("legacyBatch"));
  assert.equal(structure.membership.nodes.includes("tms"), true);
  assert.equal(
    structure.membership.edges.includes("tms->legacyBatch:flowsTo"),
    false,
  );
  assert.match(structure.svg, /data-view="applicationStructure"/);

  assert.equal(cooperation.viewName, "applicationCooperation");
  assert.equal(cooperation.title, "Application Cooperation");
  assert.deepEqual(cooperation.membership.nodes, ["bookingApi", "tms"]);
  assert.deepEqual(cooperation.membership.edges, ["tms->bookingApi:serves"]);
  assert.equal(cooperation.membership.nodes.includes("shipment"), false);
  assert.match(cooperation.svg, /data-view="applicationCooperation"/);
  assert.notEqual(structure.svg, cooperation.svg);
});

test("new view added in markup appears after reload without a code change", () => {
  const file = "fixtures/valid-views.plein";
  const original = readFixture("valid-views.plein");
  const opened = loadPleinSource(original, file);
  assert.equal(opened.ok, true);
  if (!opened.ok) {
    return;
  }
  assert.equal(namedViewNames(opened.model).includes("legacy-flow"), false);

  const edited = original.replace(
    `    viewpoint applicationCooperation "Application Cooperation" {
      include tms bookingApi
      autoLayout lr
    }`,
    `    viewpoint applicationCooperation "Application Cooperation" {
      include tms bookingApi
      autoLayout lr
    }
    view legacy-flow {
      title "Legacy flow"
      include tms legacyBatch
    }`,
  );
  assert.notEqual(edited, original);

  const reloaded = reloadPleinSource(edited, file, "applicationCooperation");
  assert.equal(reloaded.loaded.ok, true);
  if (!reloaded.loaded.ok) {
    return;
  }
  assert.equal(reloaded.selectedView, "applicationCooperation");
  assert.deepEqual(namedViewNames(reloaded.loaded.model), [
    "applicationStructure",
    "applicationCooperation",
    "legacy-flow",
  ]);

  const added = switchNamedView(reloaded.loaded.model, "legacy-flow");
  assert.equal(added.model, reloaded.loaded.model);
  assert.equal(added.title, "Legacy flow");
  assert.deepEqual(added.membership.nodes, ["legacyBatch", "tms"]);
  assert.deepEqual(added.membership.edges, ["tms->legacyBatch:flowsTo"]);
  assert.match(added.svg, /data-view="legacy-flow"/);
});

test("browseNamedView tool override nests without changing the file", () => {
  const result = loadPleinSource(
    readFixture("valid-value-stream-stages.plein"),
    "fixtures/valid-value-stream-stages.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const fileDefault = browseNamedView(result.model, "order-to-cash");
  const preview = browseNamedView(result.model, "order-to-cash", { nesting: "nested" });
  assert.equal(fileDefault.layout.nesting, "beside");
  assert.equal(preview.layout.nesting, "nested");
  assert.equal(preview.model, result.model);
  assert.match(preview.svg, /data-nesting="nested"/);
  assert.match(preview.svg, /data-container-id="orderToCash"/);
  assert.equal(fileDefault.model.views[0]!.nesting, undefined);
});

test("reload keeps the current named view selected when it still exists", () => {
  const file = "fixtures/valid-views.plein";
  const original = readFixture("valid-views.plein");
  const reloaded = reloadPleinSource(original, file, "applicationCooperation");
  assert.equal(reloaded.loaded.ok, true);
  if (!reloaded.loaded.ok) {
    return;
  }
  assert.equal(reloaded.selectedView, "applicationCooperation");
  const browsed = browseNamedView(reloaded.loaded.model, reloaded.selectedView!);
  assert.equal(browsed.viewName, "applicationCooperation");
});
