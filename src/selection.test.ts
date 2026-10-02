import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { browseNamedView, switchNamedView } from "./browser.js";
import { edgeId } from "./layout.js";
import { filterModel, loadPleinSource, type FilteredList } from "./list-model.js";
import {
  diagramTargetsForSelection,
  elementSelection,
  isSameSelection,
  listRowForSelection,
  nextSelectionFromClick,
  normalizeMarquee,
  relationshipId,
  relationshipSelection,
  retainSelection,
  focusSeedId,
  focusShade,
  retainSelections,
  selectedElementIds,
  selectionFromDiagramHit,
  selectionFromMarquee,
  shadedByFocus,
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

test("nested container background selects the parent; child node selects the child", async () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const browsed = await browseNamedView(result.model, "strategy");
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

test("multi-view: keep selection when the item stays in the list, drop it otherwise", async () => {
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

  const structureView = await browseNamedView(result.model, "applicationStructure");
  const cooperationView = await switchNamedView(result.model, "applicationCooperation");
  assert.equal(svgHasSelectionTarget(structureView.svg, shipment), true);
  assert.equal(svgHasSelectionTarget(cooperationView.svg, shipment), false);
  assert.equal(svgHasSelectionTarget(cooperationView.svg, tms), true);
  assert.equal(svgHasSelectionTarget(cooperationView.svg, serving), true);

  assert.equal(retainSelection(null, structure), null);
  assert.equal(isSameSelection(null, tms), false);
  assert.equal(isSameSelection(null, null), true);
});

test("shift-click toggles an item; a plain click replaces the set", () => {
  const tms = elementSelection("tms");
  const shipment = elementSelection("shipment");
  const serving = relationshipSelection("tms", "bookingApi", "serves");

  assert.deepEqual(nextSelectionFromClick([], tms, false), [tms]);
  assert.deepEqual(nextSelectionFromClick([tms], shipment, false), [shipment]);
  assert.deepEqual(nextSelectionFromClick([tms, shipment], null, false), []);

  assert.deepEqual(nextSelectionFromClick([tms], shipment, true), [tms, shipment]);
  assert.deepEqual(nextSelectionFromClick([tms, shipment], serving, true), [tms, shipment, serving]);
  assert.deepEqual(nextSelectionFromClick([tms, shipment, serving], shipment, true), [tms, serving]);
  assert.deepEqual(nextSelectionFromClick([tms, shipment], null, true), [tms, shipment]);
  assert.deepEqual(selectedElementIds([tms, serving, shipment]), ["tms", "shipment"]);
});

test("marquee selects intersecting element boxes and can extend the set", () => {
  const nodes = [
    { id: "west", x: 0, y: 0, width: 40, height: 20 },
    { id: "east", x: 100, y: 0, width: 40, height: 20 },
    { id: "south", x: 0, y: 80, width: 40, height: 20 },
  ];
  const marquee = normalizeMarquee({ x: 90, y: -10 }, { x: 20, y: 30 });
  assert.equal(marquee.x, 20);
  assert.equal(marquee.y, -10);
  assert.equal(marquee.width, 70);
  assert.equal(marquee.height, 40);

  assert.deepEqual(selectionFromMarquee(nodes, marquee), [elementSelection("west")]);
  assert.deepEqual(
    selectionFromMarquee(nodes, { x: 0, y: 0, width: 200, height: 100 }),
    [elementSelection("west"), elementSelection("east"), elementSelection("south")],
  );
  assert.deepEqual(selectionFromMarquee(nodes, { x: 50, y: 40, width: 10, height: 10 }), []);

  const kept = relationshipSelection("west", "east", "flowsTo");
  assert.deepEqual(
    selectionFromMarquee(nodes, { x: 100, y: 0, width: 10, height: 10 }, [kept, elementSelection("south")], true),
    [kept, elementSelection("south"), elementSelection("east")],
  );
  assert.deepEqual(
    selectionFromMarquee(nodes, { x: 100, y: 0, width: 10, height: 10 }, [kept], false),
    [elementSelection("east")],
  );
});

test("retainSelections keeps every item still listed, in order", async () => {
  const result = loadPleinSource(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const cooperation = filterModel(result.model, "applicationCooperation");
  const shipment = elementSelection("shipment");
  const tms = elementSelection("tms");
  const serving = relationshipSelection("tms", "bookingApi", "serves");
  assert.deepEqual(retainSelections([shipment, tms, serving], cooperation), [tms, serving]);
  assert.deepEqual(retainSelections([], cooperation), []);
});

function canvasOf(list: FilteredList) {
  return {
    elements: list.elements.map((element) => element.id),
    relationships: list.relationships.map((rel) => relationshipId(rel)),
  };
}

test("one selected element lights itself, outgoing relationships, and their destinations", () => {
  const result = loadPleinSource(readFixture("valid-basic.plein"), "fixtures/valid-basic.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const source = readFixture("valid-basic.plein");
  const list = filterModel(result.model, "booking-context");
  const canvas = canvasOf(list);
  const booking = elementSelection("booking");
  const selection = [booking];

  const shade = focusShade(selection, list.relationships);
  assert.equal(focusSeedId(selection), "booking");
  assert.equal(shade.active, true);
  assert.deepEqual(selection, [booking]);
  assert.equal(readFixture("valid-basic.plein"), source);

  assert.equal(shade.litElementIds.has("booking"), true);
  assert.equal(shade.litElementIds.has("order"), true);
  assert.equal(shade.litElementIds.has("rates"), true);
  assert.equal(shade.litElementIds.has("shipper"), false, "incoming-only neighbour stays out");
  assert.equal(shade.litRelationshipIds.has(relationshipId({ source: "booking", target: "order", type: "accesses" })), true);
  assert.equal(shade.litRelationshipIds.has(relationshipId({ source: "booking", target: "rates", type: "serves" })), true);
  assert.equal(
    shade.litRelationshipIds.has(relationshipId({ source: "shipper", target: "booking", type: "serves" })),
    false,
  );
  assert.equal(
    shade.litRelationshipIds.has(relationshipId({ source: "rates", target: "order", type: "accesses" })),
    false,
    "a relationship between two lit elements stays shaded unless it starts from the selection",
  );

  const shaded = shadedByFocus(shade, canvas);
  assert.deepEqual(shaded.elements, ["shipper"]);
  assert.deepEqual(shaded.relationships, [
    relationshipId({ source: "shipper", target: "booking", type: "serves" }),
    relationshipId({ source: "rates", target: "order", type: "accesses" }),
  ]);
  assert.equal(canvas.elements.includes("shipper"), true, "shaded elements stay on the canvas");
  assert.equal(canvas.relationships.length, list.relationships.length);
});

test("focus stops at one hop and ignores incoming-only neighbours", () => {
  const result = loadPleinSource(readFixture("valid-basic.plein"), "fixtures/valid-basic.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const list = filterModel(result.model, "booking-context");
  const canvas = canvasOf(list);

  const fromShipper = focusShade([elementSelection("shipper")], list.relationships);
  assert.equal(fromShipper.litElementIds.has("shipper"), true);
  assert.equal(fromShipper.litElementIds.has("booking"), true);
  assert.equal(fromShipper.litElementIds.has("order"), false, "order is two hops out");
  assert.equal(fromShipper.litElementIds.has("rates"), false);
  assert.equal(
    fromShipper.litRelationshipIds.has(relationshipId({ source: "shipper", target: "booking", type: "serves" })),
    true,
  );
  assert.equal(fromShipper.litRelationshipIds.size, 1);

  const orderOnly = focusShade([elementSelection("order")], list.relationships);
  assert.deepEqual([...orderOnly.litElementIds], ["order"]);
  assert.equal(orderOnly.litRelationshipIds.size, 0);
  const shaded = shadedByFocus(orderOnly, canvas);
  assert.deepEqual(shaded.elements, ["shipper", "booking", "rates"]);
  assert.equal(shaded.relationships.length, list.relationships.length);
});

test("clearing the selection, multi-select, and a relationship seed restore an unshaded canvas", () => {
  const result = loadPleinSource(readFixture("valid-basic.plein"), "fixtures/valid-basic.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const list = filterModel(result.model, "booking-context");
  const canvas = canvasOf(list);
  const booking = elementSelection("booking");
  const focused = focusShade([booking], list.relationships);
  assert.equal(shadedByFocus(focused, canvas).elements.length > 0, true);

  const cleared = focusShade([], list.relationships);
  assert.equal(cleared.active, false);
  assert.equal(focusSeedId([]), null);
  assert.deepEqual(shadedByFocus(cleared, canvas), { elements: [], relationships: [] });

  const several = [booking, elementSelection("order")];
  assert.equal(focusSeedId(several), null);
  assert.deepEqual(shadedByFocus(focusShade(several, list.relationships), canvas), {
    elements: [],
    relationships: [],
  });

  const edge = [relationshipSelection("booking", "order", "access")];
  assert.equal(focusSeedId(edge), null);
  assert.deepEqual(shadedByFocus(focusShade(edge, list.relationships), canvas), {
    elements: [],
    relationships: [],
  });

  assert.deepEqual(nextSelectionFromClick([booking], null, false), []);
});

test("a relationship excluded from the view does not light its destination", () => {
  const result = loadPleinSource(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const structure = filterModel(result.model, "applicationStructure");
  const canvas = canvasOf(structure);
  assert.equal(
    structure.relationships.some((rel) => rel.source === "tms" && rel.target === "legacyBatch"),
    false,
  );
  assert.equal(canvas.elements.includes("legacyBatch"), true);

  const shade = focusShade([elementSelection("tms")], structure.relationships);
  assert.equal(shade.litElementIds.has("tms"), true);
  assert.equal(shade.litElementIds.has("bookingApi"), true);
  assert.equal(shade.litElementIds.has("legacyBatch"), false);
  assert.equal(shade.litElementIds.has("shipment"), false, "shipment is a second hop through bookingApi");
  const shaded = shadedByFocus(shade, canvas);
  assert.equal(shaded.elements.includes("legacyBatch"), true);
  assert.equal(shaded.elements.includes("tms"), false);
  assert.equal(shaded.elements.includes("bookingApi"), false);
});

test("nested composedOf stays in the one-hop set even when the edge is not drawn", async () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const source = readFixture("samples/value-stream-demo.plein");
  const browsed = await browseNamedView(result.model, "strategy");
  const positions = browsed.layout.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));
  const selection = [elementSelection("quoteToCash")];
  const shade = focusShade(selection, browsed.layout.edges);
  assert.equal(shade.litElementIds.has("quoteToCash"), true);
  assert.equal(shade.litElementIds.has("quote"), true);
  assert.equal(shade.litElementIds.has("book"), true);
  assert.equal(shade.litElementIds.has("collect"), true);
  assert.equal(shade.litElementIds.has("rateQuote"), false);
  assert.equal(
    shade.litRelationshipIds.has(relationshipId({ source: "quote", target: "book", type: "flowsTo" })),
    false,
    "a relationship that starts on a child is a second hop",
  );
  assert.equal(svgHasSelectionTarget(browsed.svg, elementSelection("quote")), true);
  assert.equal(
    svgHasSelectionTarget(browsed.svg, relationshipSelection("quoteToCash", "quote", "composedOf")),
    false,
  );

  const quote = focusShade([elementSelection("quote")], browsed.layout.edges);
  assert.equal(quote.litElementIds.has("quote"), true);
  assert.equal(quote.litElementIds.has("book"), true);
  assert.equal(quote.litElementIds.has("collect"), false);
  assert.equal(quote.litElementIds.has("quoteToCash"), false, "the parent only points at quote, not from it");
  assert.equal(quote.litRelationshipIds.has(relationshipId({ source: "quote", target: "book", type: "flowsTo" })), true);

  assert.deepEqual(
    browsed.layout.nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    })),
    positions,
  );
  assert.deepEqual(selection, [elementSelection("quoteToCash")]);
  assert.equal(readFixture("samples/value-stream-demo.plein"), source);
});
