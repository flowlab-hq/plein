import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  layoutViewpoint,
  membershipOf,
  renderViewpointSvg,
  svgMembership,
  type LayoutNode,
} from "./layout.js";
import { filterModel, loadPleinSource } from "./list-model.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

type GoldenMembership = {
  file: string;
  view: string;
  direction: "tb" | "lr";
  nodes: string[];
  edges: string[];
  excludedEdges: string[];
};

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

function loadGolden(): GoldenMembership {
  return JSON.parse(
    readFileSync(join(repoRoot, "fixtures", "golden-applicationStructure.json"), "utf8"),
  ) as GoldenMembership;
}

test("golden applicationStructure layout membership matches include/exclude", () => {
  const golden = loadGolden();
  const result = loadPleinSource(readFixture("valid-views.plein"), golden.file);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = layoutViewpoint(result.model, golden.view);
  const membership = membershipOf(layout);
  const list = filterModel(result.model, golden.view);

  assert.equal(layout.viewName, "applicationStructure");
  assert.equal(layout.viewpoint, "applicationStructure");
  assert.equal(layout.title, "Application Structure");
  assert.equal(membership.direction, golden.direction);
  assert.deepEqual(membership.nodes, golden.nodes);
  assert.deepEqual(membership.edges, golden.edges);

  assert.deepEqual(
    list.elements.map((element) => element.id).slice().sort(),
    golden.nodes,
  );
  assert.deepEqual(
    list.relationships.map((rel) => `${rel.source}->${rel.target}:${rel.type}`).slice().sort(),
    golden.edges,
  );

  for (const excluded of golden.excludedEdges) {
    assert.equal(membership.edges.includes(excluded), false, `excluded edge still present: ${excluded}`);
  }
  assert.equal(
    membership.nodes.includes("legacyBatch"),
    true,
    "typed include keeps legacyBatch as a node; only * -> legacyBatch is excluded",
  );
});

test("golden applicationStructure SVG carries the same include/exclude membership", () => {
  const golden = loadGolden();
  const result = loadPleinSource(readFixture("valid-views.plein"), golden.file);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = layoutViewpoint(result.model, golden.view);
  const svg = renderViewpointSvg(layout);
  const fromSvg = svgMembership(svg);

  assert.match(svg, /data-view="applicationStructure"/);
  assert.match(svg, /data-layout="lr"/);
  assert.deepEqual(fromSvg.nodes, golden.nodes);
  assert.deepEqual(fromSvg.edges, golden.edges);
  for (const excluded of golden.excludedEdges) {
    assert.equal(fromSvg.edges.includes(excluded), false);
    assert.equal(svg.includes(excluded), false);
  }
});

test("lr autoLayout places later ranks further to the right", () => {
  const result = loadPleinSource(
    readFixture("valid-views.plein"),
    "fixtures/valid-views.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = layoutViewpoint(result.model, "applicationStructure");
  const tms = layout.nodes.find((node) => node.id === "tms");
  const bookingApi = layout.nodes.find((node) => node.id === "bookingApi");
  const shipment = layout.nodes.find((node) => node.id === "shipment");
  assert.ok(tms && bookingApi && shipment);
  assert.equal(layout.direction, "lr");
  assert.ok(tms.x < bookingApi.x);
  assert.ok(bookingApi.x < shipment.x);
});

test("booking-context on valid-basic.plein layouts the include list", () => {
  const result = loadPleinSource(
    readFixture("valid-basic.plein"),
    "fixtures/valid-basic.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = layoutViewpoint(result.model, "booking-context");
  assert.deepEqual(membershipOf(layout).nodes, ["booking", "order", "rates", "shipper"]);
  assert.equal(layout.edges.length, 4);
  assert.equal(layout.direction, "tb");
});

test("exclude wins over include in the layout graph", () => {
  const source = `model {
  business-actor "Shipper" as shipper
  business-service "Booking service" as booking
  application-component "Rate engine" as rates
  shipper -> booking: serving
  booking -> rates: serving
}
views {
  view context {
    include shipper booking rates
    exclude rates
    autoLayout tb
  }
}
`;
  const result = loadPleinSource(source, "exclude-wins-layout.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = layoutViewpoint(result.model, "context");
  assert.deepEqual(membershipOf(layout), {
    view: "context",
    direction: "tb",
    nodes: ["booking", "shipper"],
    edges: ["shipper->booking:serves"],
  });
  assert.equal(
    layout.nodes.some((node) => node.id === "rates"),
    false,
  );
});

test("value stream stages layout as ordinary valueStream nodes", () => {
  const result = loadPleinSource(
    readFixture("valid-value-stream-stages.plein"),
    "fixtures/valid-value-stream-stages.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = layoutViewpoint(result.model, "order-to-cash");
  assert.deepEqual(
    layout.nodes.map((node) => node.id).slice().sort(),
    ["capture", "collect", "fulfill", "orderToCash"],
  );
  assert.ok(layout.nodes.every((node) => node.keyword === "valueStream"));
  assert.ok(layout.edges.some((edge) => edge.id === "capture->fulfill:flowsTo"));
  assert.ok(layout.edges.some((edge) => edge.id === "fulfill->collect:triggers"));
});

function isInside(child: LayoutNode, parent: LayoutNode): boolean {
  return (
    child.x >= parent.x &&
    child.y >= parent.y &&
    child.x + child.width <= parent.x + parent.width &&
    child.y + child.height <= parent.y + parent.height
  );
}

type GoldenNested = {
  file: string;
  view: string;
  direction: "tb" | "lr";
  nesting: "nested" | "beside";
  container: string;
  children: string[];
  nodes: string[];
  edges: string[];
  drawnEdges: string[];
};

function loadNestedGolden(): GoldenNested {
  return JSON.parse(
    readFileSync(join(repoRoot, "fixtures", "golden-nested-quote-to-cash.json"), "utf8"),
  ) as GoldenNested;
}

test("default nesting is beside so existing samples stay side-by-side", () => {
  const result = loadPleinSource(
    readFixture("valid-value-stream-stages.plein"),
    "fixtures/valid-value-stream-stages.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = layoutViewpoint(result.model, "order-to-cash");
  const parent = layout.nodes.find((node) => node.id === "orderToCash");
  const capture = layout.nodes.find((node) => node.id === "capture");
  assert.ok(parent && capture);
  assert.equal(layout.nesting, "beside");
  assert.equal(parent.container, undefined);
  assert.equal(capture.parentId, undefined);
  assert.equal(isInside(capture, parent), false);
  const svg = renderViewpointSvg(layout);
  assert.match(svg, /data-nesting="beside"/);
  assert.equal(svg.includes("data-container-id"), false);
});

test("quote-to-cash demo nests Quote, Book, Collect inside the parent", () => {
  const golden = loadNestedGolden();
  const result = loadPleinSource(readFixture("samples/value-stream-demo.plein"), golden.file);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = layoutViewpoint(result.model, golden.view);
  const membership = membershipOf(layout);
  const svg = renderViewpointSvg(layout);
  const fromSvg = svgMembership(svg);
  const parent = layout.nodes.find((node) => node.id === golden.container);
  assert.ok(parent);
  assert.equal(layout.nesting, "nested");
  assert.equal(layout.direction, golden.direction);
  assert.equal(parent.container, true);
  assert.deepEqual(membership.nodes, golden.nodes);
  assert.deepEqual(membership.edges, golden.edges);
  assert.deepEqual(fromSvg.nodes, golden.nodes);
  assert.deepEqual(fromSvg.edges, golden.drawnEdges);

  for (const childId of golden.children) {
    const child = layout.nodes.find((node) => node.id === childId);
    assert.ok(child, `missing child ${childId}`);
    assert.equal(child.parentId, golden.container);
    assert.equal(isInside(child, parent), true, `${childId} should sit inside ${golden.container}`);
  }

  const quote = layout.nodes.find((node) => node.id === "quote");
  const book = layout.nodes.find((node) => node.id === "book");
  const collect = layout.nodes.find((node) => node.id === "collect");
  assert.ok(quote && book && collect);
  assert.ok(quote.x < book.x);
  assert.ok(book.x < collect.x);

  assert.match(svg, /data-nesting="nested"/);
  assert.match(svg, /data-container-id="quoteToCash"/);
  assert.match(svg, /data-parent-id="quoteToCash"/);
  assert.match(svg, /data-edge-id="quote->book:flowsTo"/);
  assert.match(svg, /data-edge-id="book->collect:triggers"/);
  assert.equal(svg.includes("quoteToCash->quote:composedOf"), false);
});

test("tool override nests even when the file default is beside", () => {
  const result = loadPleinSource(
    readFixture("valid-value-stream-stages.plein"),
    "fixtures/valid-value-stream-stages.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const nested = layoutViewpoint(result.model, "order-to-cash", { nesting: "nested" });
  const parent = nested.nodes.find((node) => node.id === "orderToCash");
  const capture = nested.nodes.find((node) => node.id === "capture");
  const fulfill = nested.nodes.find((node) => node.id === "fulfill");
  const collect = nested.nodes.find((node) => node.id === "collect");
  assert.ok(parent && capture && fulfill && collect);
  assert.equal(nested.nesting, "nested");
  assert.equal(isInside(capture, parent), true);
  assert.equal(isInside(fulfill, parent), true);
  assert.equal(isInside(collect, parent), true);
});

test("tool override beside ignores a nested file default", () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const beside = layoutViewpoint(result.model, "strategy", { nesting: "beside" });
  const parent = beside.nodes.find((node) => node.id === "quoteToCash");
  const quote = beside.nodes.find((node) => node.id === "quote");
  assert.ok(parent && quote);
  assert.equal(beside.nesting, "beside");
  assert.equal(quote.parentId, undefined);
  assert.equal(isInside(quote, parent), false);
});

test("nested aggregation wraps children the same way as composition", () => {
  const source = `model {
  grouping "Platform" as platform
  application-component "TMS" as tms
  application-component "Rates" as rates
  platform -> tms: aggregation
  platform -> rates: aggregation
  tms -> rates: flow
}
views {
  view nest {
    include platform tms rates
    autoLayout lr
    nesting nested
  }
}
`;
  const result = loadPleinSource(source, "nested-aggregation.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = layoutViewpoint(result.model, "nest");
  const parent = layout.nodes.find((node) => node.id === "platform");
  const tms = layout.nodes.find((node) => node.id === "tms");
  const rates = layout.nodes.find((node) => node.id === "rates");
  assert.ok(parent && tms && rates);
  assert.equal(parent.container, true);
  assert.equal(isInside(tms, parent), true);
  assert.equal(isInside(rates, parent), true);
  assert.ok(layout.edges.some((edge) => edge.id === "tms->rates:flowsTo" && !edge.impliedByNest));
  assert.ok(layout.edges.every((edge) => edge.type !== "aggregates" || edge.impliedByNest));
});

test("unknown view name is an error", () => {
  const result = loadPleinSource(
    readFixture("valid-basic.plein"),
    "fixtures/valid-basic.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.throws(
    () => layoutViewpoint(result.model, "missing-view"),
    /unknown view 'missing-view'/,
  );
});
