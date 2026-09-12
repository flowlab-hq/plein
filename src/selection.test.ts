import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { browseNamedView, switchNamedView } from "./browser.js";
import { edgeId } from "./layout.js";
import { filterModel, loadPleinSource } from "./list-model.js";
import {
  diagramTargetsForSelection,
  elementSelection,
  isSameSelection,
  listRowForSelection,
  relationshipId,
  relationshipSelection,
  retainSelection,
  selectionFromDiagramHit,
  svgHasSelectionTarget,
} from "./selection.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

test("diagram element hit highlights the Elements list row", () => {
  const selection = selectionFromDiagramHit({ nodeId: "tms" });
  assert.deepEqual(selection, elementSelection("tms"));
  assert.deepEqual(listRowForSelection(selection!), { list: "elements", id: "tms" });
  assert.deepEqual(diagramTargetsForSelection(selection!), {
    nodeId: "tms",
    containerId: "tms",
  });
});

test("diagram relationship hit highlights the Relationships list row", () => {
  const selection = selectionFromDiagramHit({
    edgeId: edgeId("tms", "bookingApi", "serves"),
  });
  assert.deepEqual(selection, relationshipSelection("tms", "bookingApi", "serves"));
  assert.deepEqual(listRowForSelection(selection!), {
    list: "relationships",
    id: "tms->bookingApi:serves",
  });
  assert.deepEqual(diagramTargetsForSelection(selection!), {
    edgeId: "tms->bookingApi:serves",
  });
});

test("empty canvas hit clears selection", () => {
  assert.equal(selectionFromDiagramHit({}), null);
  assert.equal(selectionFromDiagramHit({ nodeId: null, edgeId: null, containerId: null }), null);
})

test("list row selection maps back to the same diagram item", () => {
  const fromList = relationshipSelection("booking", "rates", "serves");
  const fromDiagram = selectionFromDiagramHit({ edgeId: fromList.id });
  assert.equal(isSameSelection(fromList, fromDiagram), true);
  assert.equal(relationshipId({ source: "booking", target: "rates", type: "serves" }), fromList.id);
});

test("nested container background selects the parent; child node selects the child", () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const browsed = browseNamedView(result.model, "strategy");
  assert.match(browsed.svg, /data-node-id="quote"[^>]*data-parent-id="quoteToCash"/);
  assert.match(browsed.svg, /data-container-id="quoteToCash"/);
  assert.match(browsed.svg, /data-node-id="quoteToCash"[^>]*data-container="true"/);
  assert.equal(
    (browsed.svg.match(/data-node-id="quoteToCash"/g) ?? []).length,
    1,
    "selecting the parent has one diagram target, not header + body",
  );
  assert.deepEqual(diagramTargetsForSelection(elementSelection("quoteToCash")), {
    nodeId: "quoteToCash",
    containerId: "quoteToCash",
  });

  const child = selectionFromDiagramHit({ nodeId: "quote" });
  const parentFromHeader = selectionFromDiagramHit({ nodeId: "quoteToCash" });
  const parentFromBackground = selectionFromDiagramHit({ containerId: "quoteToCash" });

  assert.deepEqual(child, elementSelection("quote"));
  assert.deepEqual(parentFromHeader, elementSelection("quoteToCash"));
  assert.deepEqual(parentFromBackground, elementSelection("quoteToCash"));
  assert.equal(isSameSelection(parentFromHeader, parentFromBackground), true);
  assert.equal(isSameSelection(child, parentFromHeader), false);

  assert.equal(svgHasSelectionTarget(browsed.svg, child!), true);
  assert.equal(svgHasSelectionTarget(browsed.svg, parentFromHeader!), true);
  assert.equal(svgHasSelectionTarget(browsed.svg, relationshipSelection("quote", "book", "flowsTo")), true);

  const nestRel = relationshipSelection("quoteToCash", "quote", "composedOf");
  assert.ok(result.model.relationships.some((rel) => relationshipId(rel) === nestRel.id));
  assert.equal(
    svgHasSelectionTarget(browsed.svg, nestRel),
    false,
    "implied-by-nest composedOf has no SVG edge; list highlight still applies",
  );
});

test("node hit wins over edge or container when several attrs are present", () => {
  assert.deepEqual(
    selectionFromDiagramHit({
      nodeId: "quote",
      edgeId: "quote->book:flowsTo",
      containerId: "quoteToCash",
    }),
    elementSelection("quote"),
  );
  assert.deepEqual(
    selectionFromDiagramHit({
      edgeId: "quote->book:flowsTo",
      containerId: "quoteToCash",
    }),
    relationshipSelection("quote", "book", "flowsTo"),
  );
});

test("multi-view: keep selection when the item stays in the list, drop it otherwise", () => {
  const result = loadPleinSource(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const structure = filterModel(result.model, "applicationStructure");
  const cooperation = filterModel(result.model, "applicationCooperation");
  const all = filterModel(result.model, null);

  const shipment = elementSelection("shipment");
  const tms = elementSelection("tms");
  const serving = relationshipSelection("tms", "bookingApi", "serves");
  const excluded = relationshipSelection("tms", "legacyBatch", "flowsTo");

  assert.deepEqual(retainSelection(shipment, structure), shipment);
  assert.equal(retainSelection(shipment, cooperation), null);
  assert.deepEqual(retainSelection(shipment, all), shipment);

  assert.deepEqual(retainSelection(tms, structure), tms);
  assert.deepEqual(retainSelection(tms, cooperation), tms);

  assert.deepEqual(retainSelection(serving, cooperation), serving);
  assert.deepEqual(retainSelection(serving, structure), serving);
  assert.equal(retainSelection(excluded, structure), null);
  assert.deepEqual(retainSelection(excluded, all), excluded);

  const structureView = browseNamedView(result.model, "applicationStructure");
  const cooperationView = switchNamedView(result.model, "applicationCooperation");
  assert.equal(svgHasSelectionTarget(structureView.svg, shipment), true);
  assert.equal(svgHasSelectionTarget(cooperationView.svg, shipment), false);
  assert.equal(svgHasSelectionTarget(cooperationView.svg, tms), true);
  assert.equal(svgHasSelectionTarget(cooperationView.svg, serving), true);

  assert.equal(retainSelection(null, structure), null);
  assert.equal(isSameSelection(null, tms), false);
  assert.equal(isSameSelection(null, null), true);
});
