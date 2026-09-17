import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LAYOUT_ENGINE,
  NEST_HEADER_HEIGHT,
  layoutViewpoint,
  membershipOf,
  parseLayoutDirection,
  isLayoutDirectionToken,
  renderViewpointSvg,
  resolveLayoutDirection,
  svgMembership,
  svgNodeStyles,
  type LayoutDirection,
  type LayoutNode,
} from "./layout.js";
import { filterModel, loadPleinSource } from "./list-model.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

type GoldenMembership = {
  file: string;
  view: string;
  direction: "tb" | "bt" | "lr" | "rl";
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

test("golden applicationStructure layout membership matches include/exclude", async () => {
  const golden = loadGolden();
  const result = loadPleinSource(readFixture("valid-views.plein"), golden.file);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, golden.view);
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

test("golden applicationStructure SVG carries the same include/exclude membership", async () => {
  const golden = loadGolden();
  const result = loadPleinSource(readFixture("valid-views.plein"), golden.file);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, golden.view);
  const svg = renderViewpointSvg(layout);
  const fromSvg = svgMembership(svg);

  assert.match(svg, /data-view="applicationStructure"/);
  assert.match(svg, /data-layout="lr"/);
  assert.match(svg, /data-layout-engine="elk-layered"/);
  assert.deepEqual(fromSvg.nodes, golden.nodes);
  assert.deepEqual(fromSvg.edges, golden.edges);
  for (const excluded of golden.excludedEdges) {
    assert.equal(fromSvg.edges.includes(excluded), false);
    assert.equal(svg.includes(excluded), false);
  }
});

test("lr autoLayout places later ranks further to the right", async () => {
  const result = loadPleinSource(
    readFixture("valid-views.plein"),
    "fixtures/valid-views.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, "applicationStructure");
  const tms = layout.nodes.find((node) => node.id === "tms");
  const bookingApi = layout.nodes.find((node) => node.id === "bookingApi");
  const shipment = layout.nodes.find((node) => node.id === "shipment");
  assert.ok(tms && bookingApi && shipment);
  assert.equal(layout.direction, "lr");
  assert.ok(tms.x < bookingApi.x);
  assert.ok(bookingApi.x < shipment.x);
});

test("booking-context on valid-basic.plein layouts the include list", async () => {
  const result = loadPleinSource(
    readFixture("valid-basic.plein"),
    "fixtures/valid-basic.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, "booking-context");
  assert.deepEqual(membershipOf(layout).nodes, ["booking", "order", "rates", "shipper"]);
  assert.equal(layout.edges.length, 4);
  assert.equal(layout.direction, "tb");
});

test("exclude wins over include in the layout graph", async () => {
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

  const layout = await layoutViewpoint(result.model, "context");
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

test("value stream stages layout as ordinary valueStream nodes", async () => {
  const result = loadPleinSource(
    readFixture("valid-value-stream-stages.plein"),
    "fixtures/valid-value-stream-stages.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, "order-to-cash");
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
  direction: "tb" | "bt" | "lr" | "rl";
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

test("default nesting is beside so existing samples stay side-by-side", async () => {
  const result = loadPleinSource(
    readFixture("valid-value-stream-stages.plein"),
    "fixtures/valid-value-stream-stages.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, "order-to-cash");
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

test("quote-to-cash demo nests Quote, Book, Collect inside the parent", async () => {
  const golden = loadNestedGolden();
  const result = loadPleinSource(readFixture("samples/value-stream-demo.plein"), golden.file);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, golden.view);
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

  assert.equal(
    (svg.match(/data-node-id="quoteToCash"/g) ?? []).length,
    1,
    "nested parent is one node group, not a header band plus a body",
  );
  assert.equal(
    (svg.match(/data-container-id="quoteToCash"/g) ?? []).length,
    1,
    "nested parent chrome id appears once",
  );
  assert.match(
    svg,
    new RegExp(
      `data-node-id="quoteToCash"[^>]*data-container="true"[^>]*data-container-id="quoteToCash"[\\s\\S]*?<rect width="${parent.width}" height="${parent.height}"`,
    ),
    "single chrome uses the full container box, not a title-band height",
  );
  assert.ok(parent.height > NEST_HEADER_HEIGHT);
  assert.doesNotMatch(
    svg,
    new RegExp(`data-node-id="quoteToCash"[\\s\\S]*?<rect[^>]*height="${NEST_HEADER_HEIGHT}"`),
  );
  assert.match(svg, /data-node-id="quoteToCash"[\s\S]*?data-icon="value-stream"[\s\S]*?Quote to cash/);

  const parentStyle = svgNodeStyles(svg).find((node) => node.id === "quoteToCash");
  assert.ok(parentStyle);
  assert.equal(parentStyle.icon, "value-stream");
  assert.equal(parentStyle.layer, "strategy");
  assert.equal(parentStyle.fill, "#F5DEAA");
});

test("tool override nests even when the file default is beside", async () => {
  const result = loadPleinSource(
    readFixture("valid-value-stream-stages.plein"),
    "fixtures/valid-value-stream-stages.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const nested = await layoutViewpoint(result.model, "order-to-cash", { nesting: "nested" });
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

test("tool override beside ignores a nested file default", async () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const beside = await layoutViewpoint(result.model, "strategy", { nesting: "beside" });
  const parent = beside.nodes.find((node) => node.id === "quoteToCash");
  const quote = beside.nodes.find((node) => node.id === "quote");
  assert.ok(parent && quote);
  assert.equal(beside.nesting, "beside");
  assert.equal(quote.parentId, undefined);
  assert.equal(isInside(quote, parent), false);
});

test("nested aggregation wraps children the same way as composition", async () => {
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
  const layout = await layoutViewpoint(result.model, "nest");
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

test("unknown view name is an error", async () => {
  const result = loadPleinSource(
    readFixture("valid-basic.plein"),
    "fixtures/valid-basic.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  await assert.rejects(
    () => layoutViewpoint(result.model, "missing-view"),
    /unknown view 'missing-view'/,
  );
});

test("parseLayoutDirection honours tb|bt|lr|rl and existing shorthand", () => {
  assert.equal(parseLayoutDirection(undefined), "tb");
  assert.equal(parseLayoutDirection("tb"), "tb");
  assert.equal(parseLayoutDirection("bt"), "bt");
  assert.equal(parseLayoutDirection("lr"), "lr");
  assert.equal(parseLayoutDirection("rl"), "rl");
  assert.equal(parseLayoutDirection("left-right"), "lr");
  assert.equal(parseLayoutDirection("horizontal"), "lr");
  assert.equal(parseLayoutDirection("top-bottom"), "tb");
  assert.equal(parseLayoutDirection("vertical"), "tb");
  assert.equal(parseLayoutDirection("bottom-top"), "bt");
  assert.equal(parseLayoutDirection("right-left"), "rl");
  assert.equal(parseLayoutDirection("LEFT-RIGHT"), "lr");
  assert.equal(isLayoutDirectionToken("bt"), true);
  assert.equal(isLayoutDirectionToken("left-right"), true);
  assert.equal(isLayoutDirectionToken("sideways"), false);
});

test("autoLayout tb|bt|lr|rl places the target along the declared axis", async () => {
  const source = `model {
  application-component "TMS" as tms
  application-interface "Booking API" as bookingApi
  tms -> bookingApi: serving
}
views {
  view flow {
    include tms bookingApi
    autoLayout tb
  }
}
`;
  const result = loadPleinSource(source, "direction-axis.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const expected: Record<LayoutDirection, (dx: number, dy: number) => boolean> = {
    tb: (_dx, dy) => dy > 0,
    bt: (_dx, dy) => dy < 0,
    lr: (dx, _dy) => dx > 0,
    rl: (dx, _dy) => dx < 0,
  };

  for (const direction of ["tb", "bt", "lr", "rl"] as const) {
    const layout = await layoutViewpoint(result.model, "flow", { direction });
    const tms = layout.nodes.find((node) => node.id === "tms");
    const bookingApi = layout.nodes.find((node) => node.id === "bookingApi");
    assert.ok(tms && bookingApi, direction);
    assert.equal(layout.direction, direction);
    assert.equal(resolveLayoutDirection(result.model.views[0]!, { direction }), direction);
    const dx = bookingApi.x - tms.x;
    const dy = bookingApi.y - tms.y;
    assert.equal(expected[direction](dx, dy), true, `${direction} dx=${dx} dy=${dy}`);
  }
});

test("ELK layered layout is deterministic for the same model and view", async () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const first = await layoutViewpoint(result.model, "strategy");
  const second = await layoutViewpoint(result.model, "strategy");
  const snapshot = (layout: typeof first) => ({
    direction: layout.direction,
    width: layout.width,
    height: layout.height,
    nodes: layout.nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      parentId: node.parentId,
      container: node.container,
    })),
    edges: layout.edges.map((edge) => ({
      id: edge.id,
      x1: edge.x1,
      y1: edge.y1,
      x2: edge.x2,
      y2: edge.y2,
      points: edge.points,
    })),
  });
  assert.deepEqual(snapshot(first), snapshot(second));
  const svg = renderViewpointSvg(first);
  assert.match(svg, new RegExp(`data-layout-engine="${LAYOUT_ENGINE}"`));
  assert.match(svg, /<polyline /);
});
