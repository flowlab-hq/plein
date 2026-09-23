import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LAYOUT_ENGINE,
  NEST_HEADER_HEIGHT,
  ORGANIC_RANDOM_SEED,
  layerBandOf,
  layoutEngineFor,
  layoutViewpoint,
  membershipOf,
  parseLayoutDirection,
  parseLayoutMode,
  parseGridOrder,
  parseEdgeRouting,
  isLayoutDirectionToken,
  isLayoutModeToken,
  isGridOrderToken,
  isEdgeRoutingToken,
  renderViewpointSvg,
  resolveLayoutDirection,
  resolveLayoutMode,
  resolveEdgeRouting,
  isAutoLayoutEnabled,
  resolveAutoLayout,
  MANUAL_LAYOUT_ENGINE,
  NODE_WIDTH,
  RANK_GAP,
  svgMembership,
  svgNodeStyles,
  type LayoutDirection,
  type LayoutNode,
  type ViewpointLayout,
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
  assert.match(svg, /data-layout-mode="layered"/);
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

/** Diagonal segments on drawn edges (nest-implied lines are not rendered). */
function diagonalSegments(layout: ViewpointLayout): number {
  let count = 0;
  for (const edge of layout.edges) {
    if (edge.impliedByNest) {
      continue;
    }
    const points =
      edge.points && edge.points.length >= 2
        ? edge.points
        : [
            { x: edge.x1, y: edge.y1 },
            { x: edge.x2, y: edge.y2 },
          ];
    for (let index = 1; index < points.length; index += 1) {
      const dx = points[index]!.x - points[index - 1]!.x;
      const dy = points[index]!.y - points[index - 1]!.y;
      if (dx !== 0 && dy !== 0) {
        count += 1;
      }
    }
  }
  return count;
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
  assert.equal(parseLayoutDirection("layers"), "tb");
  assert.equal(parseLayoutDirection("layers lr"), "lr");
  assert.equal(parseLayoutDirection("lr layers"), "lr");
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
  assert.match(svg, /data-layout-mode="layered"/);
  assert.match(svg, /<polyline /);
});

test("parseLayoutMode reads layers from autoLayout clauses", () => {
  assert.equal(parseLayoutMode(undefined), "layered");
  assert.equal(parseLayoutMode("tb"), "layered");
  assert.equal(parseLayoutMode("layered"), "layered");
  assert.equal(parseLayoutMode("layers"), "layers");
  assert.equal(parseLayoutMode("layer"), "layers");
  assert.equal(parseLayoutMode("layers lr"), "layers");
  assert.equal(parseLayoutMode("lr layers"), "layers");
  assert.equal(parseLayoutMode("organic"), "organic");
  assert.equal(parseLayoutMode("organic lr"), "organic");
  assert.equal(parseLayoutMode("grid"), "grid");
  assert.equal(parseLayoutMode("grid name"), "grid");
  assert.equal(parseLayoutMode("name grid lr"), "grid");
  assert.equal(parseGridOrder("grid"), "kind");
  assert.equal(parseGridOrder("grid name"), "name");
  assert.equal(parseGridOrder("kind grid"), "kind");
  assert.equal(parseGridOrder(undefined), "kind");
  assert.equal(isLayoutModeToken("layers"), true);
  assert.equal(isLayoutModeToken("layered"), true);
  assert.equal(isLayoutModeToken("organic"), true);
  assert.equal(isLayoutModeToken("grid"), true);
  assert.equal(isLayoutModeToken("tb"), false);
  assert.equal(isLayoutModeToken("kind"), false);
  assert.equal(isGridOrderToken("kind"), true);
  assert.equal(isGridOrderToken("name"), true);
  assert.equal(isGridOrderToken("grid"), false);
  assert.equal(layerBandOf("business-actor"), "business");
  assert.equal(layerBandOf("applicationComponent"), "application");
  assert.equal(layerBandOf("node"), "technology-physical");
  assert.equal(layerBandOf("facility"), "technology-physical");
  assert.equal(layerBandOf("capability"), "motivation-strategy");
  assert.equal(layerBandOf("goal"), "motivation-strategy");
  assert.equal(layerBandOf("work-package"), "implementation");
  assert.equal(layerBandOf("grouping"), "other");
});

test("autoLayout layers ranks Business above Application above Technology", async () => {
  const result = loadPleinSource(
    readFixture("valid-layer-bands.plein"),
    "fixtures/valid-layer-bands.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, "layerBands");
  const svg = renderViewpointSvg(layout);
  const onTime = layout.nodes.find((node) => node.id === "onTime");
  const planning = layout.nodes.find((node) => node.id === "planning");
  const shipper = layout.nodes.find((node) => node.id === "shipper");
  const booking = layout.nodes.find((node) => node.id === "booking");
  const platform = layout.nodes.find((node) => node.id === "platform");
  const tms = layout.nodes.find((node) => node.id === "tms");
  const rates = layout.nodes.find((node) => node.id === "rates");
  const cloud = layout.nodes.find((node) => node.id === "cloud");
  const orderApi = layout.nodes.find((node) => node.id === "orderApi");
  const rollout = layout.nodes.find((node) => node.id === "rollout");
  assert.ok(onTime && planning && shipper && booking && platform && tms && rates && cloud && orderApi && rollout);

  assert.equal(layout.mode, "layers");
  assert.equal(layout.direction, "tb");
  assert.equal(layout.nesting, "nested");
  assert.match(svg, /data-layout-mode="layers"/);
  assert.match(svg, /data-layout-engine="elk-layered"/);

  const motivationBottom = Math.max(onTime.y + onTime.height, planning.y + planning.height);
  const businessTop = Math.min(shipper.y, booking.y);
  const businessBottom = Math.max(shipper.y + shipper.height, booking.y + booking.height);
  const applicationTop = platform.y;
  const applicationBottom = platform.y + platform.height;
  const technologyTop = Math.min(cloud.y, orderApi.y);
  const technologyBottom = Math.max(cloud.y + cloud.height, orderApi.y + orderApi.height);

  assert.ok(motivationBottom <= businessTop, "Motivation/Strategy band sits above Business");
  assert.ok(businessBottom <= applicationTop, "Business band sits above Application");
  assert.ok(applicationBottom <= technologyTop, "Application band sits above Technology");
  assert.ok(technologyBottom <= rollout.y, "Technology band sits above Implementation");

  assert.equal(platform.container, true);
  assert.equal(tms.parentId, "platform");
  assert.equal(rates.parentId, "platform");
  assert.equal(isInside(tms, platform), true);
  assert.equal(isInside(rates, platform), true);
  assert.ok(tms.y < rollout.y, "nested application child does not jump to Implementation");
  assert.ok(cloud.y > platform.y, "nested container stays in Application, not Technology");
});

test("autoLayout layers lr places Business left of Application left of Technology", async () => {
  const result = loadPleinSource(
    readFixture("valid-layer-bands.plein"),
    "fixtures/valid-layer-bands.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, "layerBands", { direction: "lr" });
  const shipper = layout.nodes.find((node) => node.id === "shipper");
  const platform = layout.nodes.find((node) => node.id === "platform");
  const cloud = layout.nodes.find((node) => node.id === "cloud");
  assert.ok(shipper && platform && cloud);
  assert.equal(layout.mode, "layers");
  assert.equal(layout.direction, "lr");
  assert.ok(shipper.x + shipper.width <= platform.x, "Business left of Application");
  assert.ok(platform.x + platform.width <= cloud.x, "Application left of Technology");
});

test("layers mode keeps a mixed-aspect child inside its nested parent", async () => {
  const source = `model {
  business-collaboration "Booking team" as team
  application-component "TMS" as tms
  business-actor "Shipper" as shipper
  node "Cloud" as cloud
  team -> tms: composition
  tms -> shipper: serving
  cloud -> tms: serving
}
views {
  view mixed {
    include team tms shipper cloud
    autoLayout layers
    nesting nested
  }
}
`;
  const result = loadPleinSource(source, "mixed-nest-bands.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "mixed");
  const team = layout.nodes.find((node) => node.id === "team");
  const tms = layout.nodes.find((node) => node.id === "tms");
  const shipper = layout.nodes.find((node) => node.id === "shipper");
  const cloud = layout.nodes.find((node) => node.id === "cloud");
  assert.ok(team && tms && shipper && cloud);
  assert.equal(tms.parentId, "team");
  assert.equal(isInside(tms, team), true, "application child stays inside the business container");
  assert.ok(
    Math.max(team.y + team.height, shipper.y + shipper.height) <= cloud.y,
    "Business container + sibling stay above Technology",
  );
});

test("layers file default is unchanged by a layered tool override", async () => {
  const result = loadPleinSource(
    readFixture("valid-layer-bands.plein"),
    "fixtures/valid-layer-bands.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const fileDefault = await layoutViewpoint(result.model, "layerBands");
  const preview = await layoutViewpoint(result.model, "layerBands", { mode: "layered" });
  assert.equal(fileDefault.mode, "layers");
  assert.equal(preview.mode, "layered");
  assert.equal(result.model.views[0]!.autoLayout, "layers");
  assert.equal(resolveLayoutMode(result.model.views[0]!), "layers");
  assert.equal(resolveLayoutMode(result.model.views[0]!, { mode: "layered" }), "layered");
  assert.ok(
    (preview.nodes.find((node) => node.id === "rollout")?.y ?? 0) <
      (preview.nodes.find((node) => node.id === "planning")?.y ?? 0),
    "plain layered still follows realization/serving ranks, not aspect bands",
  );
});

test("layers keeps Business above Application above Technology when every edge points the other way", async () => {
  const source = `model {
  work-package "Cutover" as cutover
  node "Cloud" as cloud
  application-component "TMS" as tms
  business-actor "Shipper" as shipper
  goal "On-time" as onTime
  tms -> shipper: serving
  cloud -> tms: serving
  cutover -> onTime: realization
}
views {
  view against {
    include onTime shipper tms cloud cutover
    autoLayout layers
  }
}
`;
  const result = loadPleinSource(source, "against-band-edges.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "against");
  const onTime = layout.nodes.find((node) => node.id === "onTime");
  const shipper = layout.nodes.find((node) => node.id === "shipper");
  const tms = layout.nodes.find((node) => node.id === "tms");
  const cloud = layout.nodes.find((node) => node.id === "cloud");
  const cutover = layout.nodes.find((node) => node.id === "cutover");
  assert.ok(onTime && shipper && tms && cloud && cutover);
  assert.ok(onTime.y + onTime.height <= shipper.y, "Motivation above Business");
  assert.ok(shipper.y + shipper.height <= tms.y, "Business above Application");
  assert.ok(tms.y + tms.height <= cloud.y, "Application above Technology");
  assert.ok(cloud.y + cloud.height <= cutover.y, "Technology above Implementation");
  assert.ok(layout.edges.some((edge) => edge.id === "tms->shipper:serves"));
});

test("research-data landscape in layers mode is Business then Application then Technology", async () => {
  const result = loadPleinSource(
    readFixture("samples/research-data.plein"),
    "fixtures/samples/research-data.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, "researchDataLandscape", { mode: "layers" });
  assert.equal(layout.mode, "layers");
  const business = layout.nodes.filter((node) =>
    ["generalPublic", "findPublishedResearch", "requestAccess"].includes(node.id),
  );
  const application = layout.nodes.filter((node) =>
    ["researchProject", "researchPaper", "researchDataConcept", "eprints"].includes(node.id),
  );
  const technology = layout.nodes.filter((node) =>
    ["researchDataArtifact", "fileStorage", "archive", "researchStoragePlatform", "arkivum"].includes(
      node.id,
    ),
  );
  assert.equal(business.length, 3);
  assert.equal(application.length, 4);
  assert.equal(technology.length, 5);
  const businessBottom = Math.max(...business.map((node) => node.y + node.height));
  const applicationTop = Math.min(...application.map((node) => node.y));
  const applicationBottom = Math.max(...application.map((node) => node.y + node.height));
  const technologyTop = Math.min(...technology.map((node) => node.y));
  assert.ok(businessBottom <= applicationTop, "Business band sits above Application");
  assert.ok(applicationBottom <= technologyTop, "Application band sits above Technology");
});

test("layers kind order keeps same-type roots together inside a band", async () => {
  const source = `model {
  business-process "Fulfill" as fulfill
  business-actor "Carrier" as carrier
  business-process "Book" as book
  business-actor "Shipper" as shipper
  application-component "TMS" as tms
}
views {
  view kinds {
    include shipper carrier book fulfill tms
    autoLayout layers
  }
}
`;
  const result = loadPleinSource(source, "kind-rows.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "kinds");
  const shipper = layout.nodes.find((node) => node.id === "shipper");
  const carrier = layout.nodes.find((node) => node.id === "carrier");
  const book = layout.nodes.find((node) => node.id === "book");
  const fulfill = layout.nodes.find((node) => node.id === "fulfill");
  const tms = layout.nodes.find((node) => node.id === "tms");
  assert.ok(shipper && carrier && book && fulfill && tms);
  const actorsBottom = Math.max(shipper.y + shipper.height, carrier.y + carrier.height);
  const processesTop = Math.min(book.y, fulfill.y);
  assert.ok(
    actorsBottom <= processesTop ||
      Math.max(shipper.x + shipper.width, carrier.x + carrier.width) <= Math.min(book.x, fulfill.x),
    "actors form a kind row separate from processes, or sit in an earlier model-order lane",
  );
  assert.ok(
    Math.max(actorsBottom, book.y + book.height, fulfill.y + fulfill.height) <= tms.y,
    "Business kinds stay above Application",
  );
});

test("parseEdgeRouting defaults to orthogonal and reads polyline", () => {
  assert.equal(parseEdgeRouting(undefined), "orthogonal");
  assert.equal(parseEdgeRouting("lr"), "orthogonal");
  assert.equal(parseEdgeRouting("layers tb"), "orthogonal");
  assert.equal(parseEdgeRouting("orthogonal"), "orthogonal");
  assert.equal(parseEdgeRouting("right-angle"), "orthogonal");
  assert.equal(parseEdgeRouting("ortho"), "orthogonal");
  assert.equal(parseEdgeRouting("polyline"), "polyline");
  assert.equal(parseEdgeRouting("poly-line"), "polyline");
  assert.equal(parseEdgeRouting("layers lr polyline"), "polyline");
  assert.equal(parseEdgeRouting("POLYLINE layers"), "polyline");
  assert.equal(isEdgeRoutingToken("orthogonal"), true);
  assert.equal(isEdgeRoutingToken("polyline"), true);
  assert.equal(isEdgeRoutingToken("tb"), false);
  assert.equal(isEdgeRoutingToken("layers"), false);
  assert.equal(parseLayoutDirection("lr orthogonal"), "lr");
  assert.equal(parseLayoutMode("layers polyline"), "layers");
  assert.equal(parseLayoutMode("orthogonal"), "layered");
});

const COOPERATION_SOURCE = `model {
  business-actor "Shipper" as shipper
  business-process "Booking" as booking
  application-component "Rates" as rates
  application-component "TMS" as tms
  application-component "Gateway" as gateway
  shipper -> booking: serving
  shipper -> rates: serving
  booking -> tms: serving
  rates -> tms: serving
  booking -> rates: flow
  gateway -> tms: serving
  rates -> gateway: flow
}
views {
  view cooperation {
    include shipper booking rates tms gateway
    autoLayout lr orthogonal
  }
}
`;

test("orthogonal routing keeps layered placement and drops diagonal segments", async () => {
  const result = loadPleinSource(COOPERATION_SOURCE, "cooperation-routing.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const orthogonal = await layoutViewpoint(result.model, "cooperation");
  const polyline = await layoutViewpoint(result.model, "cooperation", { routing: "polyline" });
  assert.equal(orthogonal.routing, "orthogonal");
  assert.equal(orthogonal.direction, "lr");
  assert.equal(orthogonal.mode, "layered");
  assert.equal(polyline.routing, "polyline");
  assert.equal(polyline.direction, "lr");
  assert.equal(polyline.mode, "layered");
  assert.equal(resolveEdgeRouting(result.model.views[0]!), "orthogonal");
  assert.equal(resolveEdgeRouting(result.model.views[0]!, { routing: "polyline" }), "polyline");
  assert.equal(result.model.views[0]!.autoLayout, "lr orthogonal");

  const shipper = orthogonal.nodes.find((node) => node.id === "shipper");
  const booking = orthogonal.nodes.find((node) => node.id === "booking");
  const tms = orthogonal.nodes.find((node) => node.id === "tms");
  const shipperPoly = polyline.nodes.find((node) => node.id === "shipper");
  const tmsPoly = polyline.nodes.find((node) => node.id === "tms");
  assert.ok(shipper && booking && tms && shipperPoly && tmsPoly);
  assert.ok(shipper.x < booking.x && booking.x < tms.x, "orthogonal keeps left-to-right ranks");
  assert.ok(shipperPoly.x < tmsPoly.x, "polyline keeps left-to-right ranks");
  assert.equal(diagonalSegments(orthogonal), 0);
  assert.ok(diagonalSegments(polyline) > 0, "polyline routing still draws diagonal segments");
  assert.match(renderViewpointSvg(orthogonal), /data-layout-routing="orthogonal"/);
  assert.match(renderViewpointSvg(polyline), /data-layout-routing="polyline"/);
  assert.match(renderViewpointSvg(polyline), /data-layout="lr"/);
});

test("routing does not change layer-band order or direction", async () => {
  const result = loadPleinSource(
    readFixture("valid-layer-bands.plein"),
    "fixtures/valid-layer-bands.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const orthogonal = await layoutViewpoint(result.model, "layerBands", { routing: "orthogonal" });
  const polyline = await layoutViewpoint(result.model, "layerBands", {
    routing: "polyline",
    direction: "lr",
  });
  const shipper = polyline.nodes.find((node) => node.id === "shipper");
  const platform = polyline.nodes.find((node) => node.id === "platform");
  const cloud = polyline.nodes.find((node) => node.id === "cloud");
  assert.ok(shipper && platform && cloud);
  assert.equal(orthogonal.mode, "layers");
  assert.equal(orthogonal.direction, "tb");
  assert.equal(orthogonal.routing, "orthogonal");
  assert.equal(diagonalSegments(orthogonal), 0);
  assert.equal(polyline.mode, "layers");
  assert.equal(polyline.direction, "lr");
  assert.equal(polyline.routing, "polyline");
  assert.ok(shipper.x + shipper.width <= platform.x, "polyline routing still stacks bands left-to-right");
  assert.ok(platform.x + platform.width <= cloud.x, "Application stays left of Technology");
});

test("default routing on an existing sample stays orthogonal", async () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "strategy");
  assert.equal(layout.routing, "orthogonal");
  assert.equal(layout.direction, "lr");
  assert.equal(layout.nesting, "nested");
  assert.equal(diagonalSegments(layout), 0);
  assert.match(renderViewpointSvg(layout), /data-layout-routing="orthogonal"/);
  assert.match(renderViewpointSvg(layout), /data-layout="lr"/);
});

function nodeById(layout: ViewpointLayout, id: string): LayoutNode {
  const node = layout.nodes.find((candidate) => candidate.id === id);
  assert.ok(node, id);
  return node!;
}

function boxesOverlap(a: LayoutNode, b: LayoutNode): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test("organic is seeded force-directed and does not replace the layered default", async () => {
  const result = loadPleinSource(
    readFixture("valid-organic-grid.plein"),
    "fixtures/valid-organic-grid.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const ranked = await layoutViewpoint(result.model, "ranked");
  assert.equal(ranked.mode, "layered");
  assert.equal(ranked.direction, "tb");
  assert.equal(layoutEngineFor(ranked.mode), "elk-layered");
  assert.match(renderViewpointSvg(ranked), /data-layout-mode="layered"/);
  assert.match(renderViewpointSvg(ranked), /data-layout-engine="elk-layered"/);

  const first = await layoutViewpoint(result.model, "landscape");
  const second = await layoutViewpoint(result.model, "landscape");
  assert.equal(first.mode, "organic");
  assert.equal(first.direction, "tb");
  assert.equal(ORGANIC_RANDOM_SEED, "1");
  assert.equal(layoutEngineFor("organic"), "elk-force");
  const svg = renderViewpointSvg(first);
  assert.match(svg, /data-layout-mode="organic"/);
  assert.match(svg, /data-layout-engine="elk-force"/);
  assert.equal(svg.includes("data-grid-order"), false);
  assert.deepEqual(
    first.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height })),
    second.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height })),
  );
  assert.deepEqual(
    first.edges.map((edge) => ({ id: edge.id, points: edge.points })),
    second.edges.map((edge) => ({ id: edge.id, points: edge.points })),
  );

  const roots = first.nodes.filter((node) => !node.parentId);
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      assert.equal(
        boxesOverlap(roots[left]!, roots[right]!),
        false,
        `${roots[left]!.id} overlaps ${roots[right]!.id}`,
      );
    }
  }
  assert.equal(diagonalSegments(first), 0);
  const polyline = await layoutViewpoint(result.model, "landscape", { routing: "polyline" });
  assert.equal(polyline.mode, "organic");
  assert.ok(diagonalSegments(polyline) > 0, "organic polyline connectors may be diagonal");
  assert.deepEqual(
    polyline.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    first.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    "routing does not move organic nodes",
  );

  const golden = JSON.parse(
    readFileSync(join(repoRoot, "fixtures", "golden-organic-grid.json"), "utf8"),
  ) as {
    organic: { nodes: Array<{ id: string; x: number; y: number }> };
  };
  assert.deepEqual(
    first.nodes
      .map((node) => ({ id: node.id, x: node.x, y: node.y }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    golden.organic.nodes,
  );
});

test("organic layout is stable when element declaration order changes", async () => {
  const forward = loadPleinSource(
    `model {
  business-actor "Shipper" as shipper
  business-process "Book" as book
  application-component "Rates" as rates
  node "Cloud" as cloud
  shipper -> book: serving
  book -> rates: serving
  rates -> cloud: serving
}
views {
  view landscape {
    include shipper book rates cloud
    autoLayout organic
  }
}
`,
    "organic-order-a.plein",
  );
  const reversed = loadPleinSource(
    `model {
  node "Cloud" as cloud
  application-component "Rates" as rates
  business-process "Book" as book
  business-actor "Shipper" as shipper
  shipper -> book: serving
  book -> rates: serving
  rates -> cloud: serving
}
views {
  view landscape {
    include shipper book rates cloud
    autoLayout organic
  }
}
`,
    "organic-order-b.plein",
  );
  assert.equal(forward.ok, true);
  assert.equal(reversed.ok, true);
  if (!forward.ok || !reversed.ok) {
    return;
  }
  const a = await layoutViewpoint(forward.model, "landscape");
  const b = await layoutViewpoint(reversed.model, "landscape");
  assert.deepEqual(
    a.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })).sort((left, right) => left.id.localeCompare(right.id)),
    b.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })).sort((left, right) => left.id.localeCompare(right.id)),
  );
});

test("grid packs by kind then name and packs disconnected leftovers", async () => {
  const result = loadPleinSource(
    readFixture("valid-organic-grid.plein"),
    "fixtures/valid-organic-grid.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, "catalogue");
  assert.equal(layout.mode, "grid");
  assert.equal(layout.gridOrder, "kind");
  assert.equal(layout.direction, "tb");
  assert.equal(layoutEngineFor("grid"), "grid-pack");
  const svg = renderViewpointSvg(layout);
  assert.match(svg, /data-layout-mode="grid"/);
  assert.match(svg, /data-layout-engine="grid-pack"/);
  assert.match(svg, /data-grid-order="kind"/);
  assert.equal(result.model.views.find((view) => view.name === "catalogue")!.autoLayout, "grid");

  const rates = nodeById(layout, "rates");
  const tms = nodeById(layout, "tms");
  const shipper = nodeById(layout, "shipper");
  const book = nodeById(layout, "book");
  const fulfill = nodeById(layout, "fulfill");
  const onTime = nodeById(layout, "onTime");
  const cloud = nodeById(layout, "cloud");
  const carrier = nodeById(layout, "carrier");
  const invoice = nodeById(layout, "invoice");

  assert.equal(rates.y, tms.y);
  assert.ok(rates.x < tms.x, "Rates before TMS by name inside application-component");
  assert.equal(book.y, fulfill.y);
  assert.ok(book.x < fulfill.x, "Book before Fulfill by name inside business-process");
  assert.ok(rates.y < shipper.y, "application-component row above business-actor");
  assert.ok(shipper.y < book.y, "business-actor row above business-process");
  assert.ok(book.y < onTime.y && onTime.y < cloud.y, "goal then node follow business");
  assert.ok(cloud.y + cloud.height < carrier.y, "disconnected leftovers pack after the catalogue");
  assert.ok(carrier.y < invoice.y, "leftover business-actor before business-object");
  assert.equal(carrier.x, invoice.x);

  const roots = layout.nodes;
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      assert.equal(boxesOverlap(roots[left]!, roots[right]!), false);
    }
  }
  assert.equal(diagonalSegments(layout), 0);

  const sideways = await layoutViewpoint(result.model, "catalogue", { direction: "lr" });
  assert.equal(sideways.mode, "grid");
  assert.equal(sideways.direction, "lr");
  const ratesLr = nodeById(sideways, "rates");
  const tmsLr = nodeById(sideways, "tms");
  const shipperLr = nodeById(sideways, "shipper");
  assert.equal(ratesLr.x, tmsLr.x);
  assert.ok(ratesLr.y < tmsLr.y, "kind column orders names top to bottom");
  assert.ok(ratesLr.x + ratesLr.width < shipperLr.x, "application column left of business-actor");

  const upward = await layoutViewpoint(result.model, "catalogue", { direction: "bt" });
  assert.ok(
    nodeById(upward, "carrier").y < nodeById(upward, "rates").y,
    "bt packs the leftover block above the catalogue",
  );
});

test("grid name packs alphabetically and still packs leftovers", async () => {
  const result = loadPleinSource(
    readFixture("valid-organic-grid.plein"),
    "fixtures/valid-organic-grid.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "catalogueByName");
  assert.equal(layout.mode, "grid");
  assert.equal(layout.gridOrder, "name");
  assert.match(renderViewpointSvg(layout), /data-grid-order="name"/);
  const book = nodeById(layout, "book");
  const cloud = nodeById(layout, "cloud");
  const fulfill = nodeById(layout, "fulfill");
  const onTime = nodeById(layout, "onTime");
  const tms = nodeById(layout, "tms");
  const carrier = nodeById(layout, "carrier");
  const invoice = nodeById(layout, "invoice");
  assert.equal(book.y, cloud.y);
  assert.equal(cloud.y, fulfill.y);
  assert.ok(book.x < cloud.x && cloud.x < fulfill.x, "Book, Cloud, Fulfill share the first name row");
  assert.ok(book.y < onTime.y && onTime.y < tms.y, "name rows continue downward");
  assert.ok(tms.y + tms.height < carrier.y, "name-sorted leftovers pack after the catalogue");
  assert.equal(carrier.y, invoice.y);
  assert.ok(carrier.x < invoice.x, "Carrier before Invoice by name");
});

test("a relationship-free grid is one catalogue of leftovers", async () => {
  const source = `model {
  business-actor "Shipper" as shipper
  business-actor "Carrier" as carrier
  business-object "Invoice" as invoice
}
views {
  view inventory {
    include shipper carrier invoice
    autoLayout grid
  }
}
`;
  const result = loadPleinSource(source, "inventory-grid.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "inventory");
  const carrier = nodeById(layout, "carrier");
  const shipper = nodeById(layout, "shipper");
  const invoice = nodeById(layout, "invoice");
  assert.equal(carrier.y, shipper.y, "actors share one kind row");
  assert.ok(carrier.x < shipper.x, "Carrier before Shipper by name");
  assert.ok(shipper.y + shipper.height < invoice.y, "business-object follows business-actor");
  assert.ok(invoice.y - (shipper.y + shipper.height) < 80, "no extra leftover gap when every node is disconnected");
});

test("organic and grid keep nested children inside the parent", async () => {
  const source = `model {
  grouping "Platform" as platform
  application-component "TMS" as tms
  application-component "Rates" as rates
  business-actor "Shipper" as shipper
  platform -> tms: composition
  platform -> rates: composition
  shipper -> tms: serving
}
views {
  view nestedOrganic {
    include platform tms rates shipper
    autoLayout organic
    nesting nested
  }
  view nestedGrid {
    include platform tms rates shipper
    autoLayout grid
    nesting nested
  }
}
`;
  const result = loadPleinSource(source, "nested-organic-grid.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  for (const viewName of ["nestedOrganic", "nestedGrid"] as const) {
    const layout = await layoutViewpoint(result.model, viewName);
    const platform = nodeById(layout, "platform");
    const tms = nodeById(layout, "tms");
    const rates = nodeById(layout, "rates");
    assert.equal(platform.container, true);
    assert.equal(tms.parentId, "platform");
    assert.equal(rates.parentId, "platform");
    assert.equal(isInside(tms, platform), true, `${viewName} tms inside platform`);
    assert.equal(isInside(rates, platform), true, `${viewName} rates inside platform`);
  }
  const grid = await layoutViewpoint(result.model, "nestedGrid");
  const rates = nodeById(grid, "rates");
  const tms = nodeById(grid, "tms");
  assert.equal(rates.y, tms.y);
  assert.ok(rates.x < tms.x, "nested grid still orders Rates before TMS by name");
});

test("toolbar mode override selects organic or grid without changing the file", async () => {
  const result = loadPleinSource(
    readFixture("valid-organic-grid.plein"),
    "fixtures/valid-organic-grid.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const ranked = result.model.views.find((view) => view.name === "ranked")!;
  assert.equal(ranked.autoLayout, "tb");
  const organic = await layoutViewpoint(result.model, "ranked", { mode: "organic" });
  const grid = await layoutViewpoint(result.model, "ranked", { mode: "grid" });
  assert.equal(organic.mode, "organic");
  assert.equal(grid.mode, "grid");
  assert.equal(grid.gridOrder, "kind");
  assert.equal(ranked.autoLayout, "tb");
  assert.equal(resolveLayoutMode(ranked), "layered");
  assert.equal(resolveLayoutMode(ranked, { mode: "organic" }), "organic");
  assert.equal(resolveLayoutMode(ranked, { mode: "grid" }), "grid");
});

type GoldenManual = {
  file: string;
  view: string;
  auto: boolean;
  nodes: Array<{ id: string; x: number; y: number }>;
};

function placed(layout: ViewpointLayout): Array<{ id: string; x: number; y: number }> {
  return layout.nodes
    .map((node) => ({ id: node.id, x: node.x, y: node.y }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

test("autoLayout stays on unless the clause is off or manual", () => {
  assert.equal(isAutoLayoutEnabled(undefined), true);
  assert.equal(isAutoLayoutEnabled("tb"), true);
  assert.equal(isAutoLayoutEnabled("lr orthogonal"), true);
  assert.equal(isAutoLayoutEnabled("layers"), true);
  assert.equal(isAutoLayoutEnabled("organic"), true);
  assert.equal(isAutoLayoutEnabled("grid name"), true);
  assert.equal(isAutoLayoutEnabled("off"), false);
  assert.equal(isAutoLayoutEnabled("manual"), false);
  assert.equal(resolveAutoLayout({ name: "v", includes: [], excludes: [], line: 1 }), true);
  assert.equal(
    resolveAutoLayout({ name: "v", includes: [], excludes: [], autoLayout: "off", line: 1 }, { autoLayout: "auto" }),
    true,
  );
  assert.equal(
    resolveAutoLayout({ name: "v", includes: [], excludes: [], autoLayout: "lr", line: 1 }, { autoLayout: "off" }),
    false,
  );
});

test("golden manual layout restores position clauses and ignores them when auto is on", async () => {
  const golden = JSON.parse(
    readFileSync(join(repoRoot, "fixtures", "golden-manual-layout.json"), "utf8"),
  ) as GoldenManual;
  const result = loadPleinSource(readFixture("valid-manual-layout.plein"), golden.file);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const manual = await layoutViewpoint(result.model, golden.view);
  assert.equal(manual.auto, false);
  assert.deepEqual(placed(manual), golden.nodes);
  const manualSvg = renderViewpointSvg(manual);
  assert.match(manualSvg, new RegExp(`data-layout-engine="${MANUAL_LAYOUT_ENGINE}"`));
  assert.match(manualSvg, /data-layout-auto="off"/);

  const declaredAuto = await layoutViewpoint(result.model, "storyAuto");
  assert.equal(declaredAuto.auto, true);
  assert.equal(declaredAuto.direction, "tb");
  assert.notDeepEqual(placed(declaredAuto), golden.nodes);
  const autoSvg = renderViewpointSvg(declaredAuto);
  assert.match(autoSvg, new RegExp(`data-layout-engine="${LAYOUT_ENGINE}"`));
  assert.doesNotMatch(autoSvg, /data-layout-auto/);

  const recomputed = await layoutViewpoint(result.model, golden.view, { autoLayout: "auto" });
  assert.equal(recomputed.auto, true);
  assert.notDeepEqual(placed(recomputed), placed(manual));

  const shifted = await layoutViewpoint(result.model, golden.view, {
    autoLayout: "off",
    manualPositions: [{ id: "shipper", x: 12, y: 18 }],
  });
  assert.deepEqual(
    placed(shifted).find((node) => node.id === "shipper"),
    { id: "shipper", x: 12, y: 18 },
  );
  assert.deepEqual(
    placed(shifted).find((node) => node.id === "order"),
    { id: "order", x: 40, y: 40 },
  );
});

test("elements without a position keep their siblings where they were declared", async () => {
  const source = `model {
  business-actor "Shipper" as shipper
  business-service "Booking" as booking
  shipper -> booking: serving
}
views {
  view story {
    include shipper booking
    autoLayout off
    position shipper 40 80
  }
}
`;
  const result = loadPleinSource(source, "partial-position.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "story");
  const shipper = layout.nodes.find((node) => node.id === "shipper");
  const booking = layout.nodes.find((node) => node.id === "booking");
  assert.ok(shipper && booking);
  assert.equal(shipper.x, 40);
  assert.equal(shipper.y, 80);
  assert.equal(booking.x, 40 + NODE_WIDTH + RANK_GAP);
  assert.equal(booking.y, 24);
});

test("nested manual positions stay put and the parent still covers the child", async () => {
  const source = `model {
  business-actor "Parent" as parent
  business-actor "Child" as child
  parent -> child: composedOf
}
views {
  view nest {
    include parent child
    autoLayout manual
    nesting nested
    position parent 20 20
    position child 40 80
  }
}
`;
  const result = loadPleinSource(source, "nested-manual.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "nest");
  const parent = layout.nodes.find((node) => node.id === "parent");
  const child = layout.nodes.find((node) => node.id === "child");
  assert.ok(parent && child);
  assert.equal(parent.x, 20);
  assert.equal(parent.y, 20);
  assert.equal(child.x, 40);
  assert.equal(child.y, 80);
  assert.equal(parent.container, true);
  assert.equal(child.parentId, "parent");
  assert.ok(parent.x + parent.width >= child.x + child.width);
  assert.ok(parent.y + parent.height >= child.y + child.height);
});
