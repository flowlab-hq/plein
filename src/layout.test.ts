import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LAYOUT_ENGINE,
  NEST_HEADER_HEIGHT,
  ORGANIC_RANDOM_SEED,
  ORGANIC_NODE_SPACING,
  ORGANIC_PACK_RATIO,
  ORGANIC_PACK_GAP,
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
  NODE_HEIGHT,
  NODE_WIDTH,
  PADDING,
  CONNECTOR_SHAFT_GAP,
  CONNECTOR_TIP_CLEARANCE,
  CONNECTOR_TIP_GAP,
  EDGE_NODE_GAP,
  RANK_GAP,
  svgMembership,
  svgNodeStyles,
  type LayoutDirection,
  type LayoutNode,
  type ViewpointLayout,
} from "./layout.js";
import {
  LABEL_DESCENT,
  LABEL_PAD_X,
  MAX_NODE_WIDTH,
  TYPE_ICON_GAP,
  TYPE_ICON_INSET_X,
  fitLeafBox,
  labelTextWidth,
} from "./label-fit.js";
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
  plateau "Booking rollout" as rollout
  application-component "TMS" as tms
  business-actor "Shipper" as shipper
  node "Cloud" as cloud
  rollout -> tms: composition
  tms -> shipper: serving
  cloud -> tms: serving
}
views {
  view mixed {
    include rollout tms shipper cloud
    autoLayout layers
    nesting nested
  }
}
`;
  const result = loadPleinSource(source, "mixed-nest-bands.plein");
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "mixed");
  const rollout = layout.nodes.find((node) => node.id === "rollout");
  const tms = layout.nodes.find((node) => node.id === "tms");
  const shipper = layout.nodes.find((node) => node.id === "shipper");
  const cloud = layout.nodes.find((node) => node.id === "cloud");
  assert.ok(rollout && tms && shipper && cloud);
  assert.equal(tms.parentId, "rollout");
  assert.equal(isInside(tms, rollout), true, "application child stays inside the implementation container");
  assert.ok(shipper.y + shipper.height <= cloud.y, "Business stays above Technology");
  assert.ok(
    cloud.y + cloud.height <= rollout.y,
    "nested application child stays in the Implementation band",
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

function layoutArea(layout: ViewpointLayout): number {
  return layout.width * layout.height;
}

function rootOverlaps(layout: ViewpointLayout): number {
  const roots = layout.nodes.filter((node) => !node.parentId);
  let count = 0;
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (boxesOverlap(roots[left]!, roots[right]!)) {
        count += 1;
      }
    }
  }
  return count;
}

function minRootGap(layout: ViewpointLayout): number {
  const roots = layout.nodes.filter((node) => !node.parentId);
  let min = Infinity;
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      const a = roots[left]!;
      const b = roots[right]!;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      let gap: number;
      if (overlapX > 0 && overlapY > 0) {
        gap = -Math.min(overlapX, overlapY);
      } else {
        const gapX = overlapX > 0 ? 0 : -overlapX;
        const gapY = overlapY > 0 ? 0 : -overlapY;
        gap = Math.hypot(gapX, gapY);
      }
      min = Math.min(min, gap);
    }
  }
  return min;
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
  assert.equal(ORGANIC_NODE_SPACING, 80);
  assert.equal(ORGANIC_PACK_RATIO, 8);
  assert.equal(ORGANIC_PACK_GAP, 24);
});

/** Visible orthogonal clutter: stacked spans, edge crossings, and cuts through a foreign box. */
function associationClutter(
  layout: ViewpointLayout,
  svg: string,
): { stacks: number; crossings: number; boxCuts: number } {
  const drawn = layout.edges
    .filter((edge) => !edge.impliedByNest)
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      points: renderedPolyline(svg, edge.id),
    }));
  const segs = drawn.map((edge) => ({
    id: edge.id,
    parts: edge.points.slice(1).map((point, index) => {
      const previous = edge.points[index]!;
      return { a: previous, b: point, len: Math.hypot(point.x - previous.x, point.y - previous.y) };
    }).filter((part) => part.len >= 1),
  }));
  let stacks = 0;
  let crossings = 0;
  const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (let left = 0; left < segs.length; left += 1) {
    for (let right = left + 1; right < segs.length; right += 1) {
      for (const a of segs[left]!.parts) {
        for (const b of segs[right]!.parts) {
          const o1 = orient(a.a, a.b, b.a);
          const o2 = orient(a.a, a.b, b.b);
          const o3 = orient(b.a, b.b, a.a);
          const o4 = orient(b.a, b.b, a.b);
          if (!(Math.abs(o1) < 0.5 && Math.abs(o2) < 0.5) && o1 * o2 < -0.5 && o3 * o4 < -0.5) {
            crossings += 1;
          }
          const aH = Math.abs(a.a.y - a.b.y) <= 0.6;
          const bH = Math.abs(b.a.y - b.b.y) <= 0.6;
          const aV = Math.abs(a.a.x - a.b.x) <= 0.6;
          const bV = Math.abs(b.a.x - b.b.x) <= 0.6;
          const overlap = (p0: number, p1: number, q0: number, q1: number) =>
            Math.min(Math.max(p0, p1), Math.max(q0, q1)) - Math.max(Math.min(p0, p1), Math.min(q0, q1));
          if (aH && bH && overlap(a.a.x, a.b.x, b.a.x, b.b.x) >= 16 && Math.abs(a.a.y - b.a.y) < 3) {
            stacks += 1;
          }
          if (aV && bV && overlap(a.a.y, a.b.y, b.a.y, b.b.y) >= 16 && Math.abs(a.a.x - b.a.x) < 3) {
            stacks += 1;
          }
        }
      }
    }
  }
  let boxCuts = 0;
  for (const edge of drawn) {
    for (const node of layout.nodes) {
      if (node.id === edge.source || node.id === edge.target || node.container) {
        continue;
      }
      if (polylineCrossesBox(edge.points, node)) {
        boxCuts += 1;
        break;
      }
    }
  }
  return { stacks, crossings, boxCuts };
}

test("organic packing stays denser than layered and keeps associations readable", async () => {
  const source = `plein {
  model {
    business-actor "Customer" as customer
    business-actor "Ops desk" as ops
    business-actor "Auditor" as auditor
    business-service "Inquire" as inquire
    business-service "Quote freight" as quote
    business-service "Book shipment" as book
    business-service "Execute move" as execute
    business-service "Invoice customer" as invoice
    business-service "Settle" as settle
    business-process "Capture request" as capture
    business-process "Price lane" as price
    business-process "Confirm booking" as confirm
    business-process "Dispatch" as dispatch
    business-process "Bill shipment" as bill
    application-component "Customer portal" as portal
    application-component "Pricing" as pricing
    application-component "TMS" as tms
    application-component "Billing" as billing
    application-component "Settlement" as settlement
    node "NordFreight cloud" as cloud
    goal "On-time delivery" as onTime
    goal "Lane margin" as margin
    business-object "Waybill" as waybill
    customer -> inquire: serving
    inquire -> quote: flow
    quote -> book: flow
    book -> execute: flow
    execute -> invoice: flow
    invoice -> settle: flow
    capture -> inquire: realization
    price -> quote: realization
    confirm -> book: realization
    dispatch -> execute: realization
    bill -> invoice: realization
    portal -> capture: serving
    pricing -> price: serving
    tms -> confirm: serving
    tms -> dispatch: serving
    billing -> bill: serving
    settlement -> settle: serving
    cloud -> portal: serving
    cloud -> tms: serving
    cloud -> billing: serving
    execute -> onTime: realization
    quote -> margin: realization
    dispatch -> waybill: access
    ops -> dispatch: assignment
  }
  views {
    viewpoint line "Service line" {
      include customer ops auditor inquire quote book execute invoice settle capture price confirm dispatch bill portal pricing tms billing settlement cloud onTime margin waybill
      autoLayout organic
    }
  }
}
`;
  const result = loadPleinSource(source, "service-line.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const organic = await layoutViewpoint(result.model, "line");
  const again = await layoutViewpoint(result.model, "line");
  const layered = await layoutViewpoint(result.model, "line", { mode: "layered" });
  const layers = await layoutViewpoint(result.model, "line", { mode: "layers" });
  assert.equal(organic.mode, "organic");
  assert.equal(layered.mode, "layered");
  assert.equal(layers.mode, "layers");
  assert.equal(parseLayoutMode(undefined), "layered");
  const organicArea = layoutArea(organic);
  const layeredArea = layoutArea(layered);
  const layersArea = layoutArea(layers);
  assert.ok(organicArea < layeredArea * 1.45, `organic ${organicArea} vs layered ${layeredArea}`);
  assert.ok(organicArea < layersArea * 1.7, `organic ${organicArea} vs layers ${layersArea}`);
  assert.ok(organicArea > layeredArea * 0.7, `organic collapsed to ${organicArea} vs layered ${layeredArea}`);
  assert.ok(minRootGap(organic) >= 16, `organic gap ${minRootGap(organic)}`);
  assert.equal(rootOverlaps(organic), 0);
  assert.deepEqual(
    organic.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    again.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
  );
  assert.deepEqual(
    organic.edges.map((edge) => ({ id: edge.id, points: edge.points })),
    again.edges.map((edge) => ({ id: edge.id, points: edge.points })),
  );
  assert.equal(diagonalSegments(organic), 0);
  const polyline = await layoutViewpoint(result.model, "line", { routing: "polyline" });
  assert.deepEqual(
    polyline.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    organic.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    "edge routing does not move organic nodes",
  );
  const clutter = associationClutter(organic, renderViewpointSvg(organic));
  // v0.1.21 density pack drew this service line with the midpoint Z: 19 stacked
  // spans, 30 crossings, and 22 associations cutting through a foreign box.
  assert.ok(clutter.stacks <= 4, `organic stacks ${clutter.stacks}`);
  assert.ok(clutter.crossings <= 28, `organic crossings ${clutter.crossings}`);
  assert.ok(clutter.boxCuts <= 4, `organic box cuts ${clutter.boxCuts}`);
  assert.ok(
    clutter.stacks + clutter.boxCuts + clutter.crossings < 19 + 22 + 30,
    `organic clutter ${JSON.stringify(clutter)}`,
  );
});

test("layered and layers coordinates stay on the pinned fixtures", async () => {
  const golden = JSON.parse(
    readFileSync(join(repoRoot, "fixtures", "golden-layered-layers.json"), "utf8"),
  ) as {
    views: Array<{
      file: string;
      view: string;
      override?: "layered";
      width: number;
      height: number;
      direction: string;
      mode: string;
      nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
      edges: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
    }>;
  };
  for (const expected of golden.views) {
    const result = loadPleinSource(readFileSync(join(repoRoot, expected.file), "utf8"), expected.file);
    assert.equal(result.ok, true, expected.file);
    if (!result.ok) {
      continue;
    }
    const layout = await layoutViewpoint(
      result.model,
      expected.view,
      expected.override ? { mode: expected.override } : undefined,
    );
    assert.equal(layout.mode, expected.mode, `${expected.file} ${expected.view}`);
    assert.equal(layout.direction, expected.direction);
    assert.equal(layout.width, expected.width);
    assert.equal(layout.height, expected.height);
    assert.deepEqual(
      layout.nodes
        .map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          ...(node.parentId ? { parentId: node.parentId } : {}),
          ...(node.container ? { container: true } : {}),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      expected.nodes,
    );
    assert.deepEqual(
      layout.edges
        .map((edge) => ({ id: edge.id, points: edge.points ?? [] }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      expected.edges,
    );
  }
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

test("dragging past the previous outermost edge expands content bounds", async () => {
  const source = `model {
  business-actor "West" as west
  business-actor "East" as east
  business-actor "North" as north
  business-actor "South" as south
  west -> east: serving
}
views {
  view story {
    include west east north south
    autoLayout off
    position west 40 200
    position east 400 200
    position north 220 40
    position south 220 360
  }
}
`;
  const result = loadPleinSource(source, "drag-bounds.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const before = await layoutViewpoint(result.model, "story");
  assert.equal(before.auto, false);
  assert.equal(before.x, 0);
  assert.equal(before.y, 0);
  const expectedWidth = Math.max(
    PADDING * 2 + NODE_WIDTH,
    ...before.nodes.map((node) => node.x + node.width + PADDING),
  );
  const expectedHeight = Math.max(
    PADDING * 2 + NODE_HEIGHT,
    ...before.nodes.map((node) => node.y + node.height + PADDING),
  );
  assert.equal(before.width, expectedWidth);
  assert.equal(before.height, expectedHeight);
  const beforeSvg = renderViewpointSvg(before);
  assert.match(beforeSvg, new RegExp(`viewBox="0 0 ${before.width} ${before.height}"`));

  const previousMinX = Math.min(...before.nodes.map((node) => node.x));
  const previousMaxX = Math.max(...before.nodes.map((node) => node.x + node.width));
  const previousMinY = Math.min(...before.nodes.map((node) => node.y));
  const previousMaxY = Math.max(...before.nodes.map((node) => node.y + node.height));

  const west = await layoutWithShift(result.model, before, "west", -120, 0);
  const movedWest = nodeById(west.layout, "west");
  assert.ok(movedWest.x < previousMinX, "leftmost node moves further left");
  assert.ok(movedWest.x < 0, "the move leaves the previous content origin");
  assertFullyInside(west.layout, west.svg, "west");
  assert.equal(movedWest.x, (west.layout.x ?? 0) + PADDING);
  assert.ok((west.layout.x ?? 0) < 0);
  assert.equal(nodeById(west.layout, "east").x, nodeById(before, "east").x);
  assert.equal(nodeById(west.layout, "east").y, nodeById(before, "east").y);
  assert.equal(nodeById(west.layout, "north").x, nodeById(before, "north").x);

  const east = await layoutWithShift(result.model, before, "east", 150, 0);
  const movedEast = nodeById(east.layout, "east");
  assert.ok(movedEast.x + movedEast.width > previousMaxX, "rightmost node moves further right");
  assert.equal(east.layout.x, 0);
  assert.ok(east.layout.width > before.width);
  assertFullyInside(east.layout, east.svg, "east");
  assert.equal(nodeById(east.layout, "west").x, nodeById(before, "west").x);
  assert.equal(nodeById(east.layout, "west").y, nodeById(before, "west").y);

  const north = await layoutWithShift(result.model, before, "north", 0, -90);
  const movedNorth = nodeById(north.layout, "north");
  assert.ok(movedNorth.y < previousMinY, "topmost node moves further up");
  assert.ok(movedNorth.y < 0);
  assert.equal(movedNorth.y, (north.layout.y ?? 0) + PADDING);
  assertFullyInside(north.layout, north.svg, "north");
  assert.equal(nodeById(north.layout, "south").x, nodeById(before, "south").x);
  assert.equal(nodeById(north.layout, "south").y, nodeById(before, "south").y);

  const south = await layoutWithShift(result.model, before, "south", 0, 80);
  const movedSouth = nodeById(south.layout, "south");
  assert.ok(movedSouth.y + movedSouth.height > previousMaxY, "bottommost node moves further down");
  assert.equal(south.layout.y, 0);
  assert.ok(south.layout.height > before.height);
  assertFullyInside(south.layout, south.svg, "south");
  assert.equal(nodeById(south.layout, "north").y, nodeById(before, "north").y);

  const inward = await layoutWithShift(result.model, before, "west", 24, 16);
  assert.equal(inward.layout.x, 0);
  assert.equal(inward.layout.y, 0);
  assert.equal(nodeById(inward.layout, "west").x, nodeById(before, "west").x + 24);
  assert.equal(nodeById(inward.layout, "west").y, nodeById(before, "west").y + 16);
  assert.equal(nodeById(inward.layout, "east").x, nodeById(before, "east").x);
  assert.equal(nodeById(inward.layout, "south").y, nodeById(before, "south").y);
  assertFullyInside(inward.layout, inward.svg, "west");
});

async function layoutWithShift(
  model: Parameters<typeof layoutViewpoint>[0],
  before: ViewpointLayout,
  id: string,
  dx: number,
  dy: number,
): Promise<{ layout: ViewpointLayout; svg: string }> {
  const layout = await layoutViewpoint(model, "story", {
    autoLayout: "off",
    manualPositions: before.nodes.map((node) => ({
      id: node.id,
      x: node.id === id ? node.x + dx : node.x,
      y: node.id === id ? node.y + dy : node.y,
      width: node.width,
      height: node.height,
    })),
  });
  return { layout, svg: renderViewpointSvg(layout) };
}

function assertFullyInside(layout: ViewpointLayout, svg: string, id: string): void {
  const node = nodeById(layout, id);
  const originX = layout.x ?? 0;
  const originY = layout.y ?? 0;
  assert.ok(node.x >= originX, `${id} left edge is inside the content box`);
  assert.ok(node.y >= originY, `${id} top edge is inside the content box`);
  assert.ok(node.x + node.width <= originX + layout.width, `${id} right edge is inside the content box`);
  assert.ok(node.y + node.height <= originY + layout.height, `${id} bottom edge is inside the content box`);
  assert.match(svg, new RegExp(`data-node-id="${id}"`));
  assert.match(svg, new RegExp(`transform="translate\\(${node.x} ${node.y}\\)"`));
  assert.match(svg, new RegExp(`viewBox="${originX} ${originY} ${layout.width} ${layout.height}"`));
}

const LONG_BORROWED = "Customer Onboarding Capability (BORROWED)";

function nodeSlice(svg: string, id: string): string {
  const start = svg.indexOf(`data-node-id="${id}"`);
  assert.ok(start >= 0, id);
  const next = svg.indexOf("data-node-id=", start + 10);
  return svg.slice(start, next === -1 ? svg.length : next);
}

function visibleLines(chunk: string): string[] {
  const spans = [...chunk.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1]!);
  if (spans.length > 0) {
    return spans;
  }
  const text = chunk.match(/<text[^>]*>([^<]*)<\/text>/);
  assert.ok(text, chunk);
  return [text[1]!];
}

function assertLabelInsideBox(svg: string, node: LayoutNode): void {
  const chunk = nodeSlice(svg, node.id);
  const lines = visibleLines(chunk);
  const icon = chunk.match(/class="type-icon"[^>]*transform="translate\(([-\d.]+) ([\d.]+)\)"/);
  assert.ok(icon, `${node.id} type icon`);
  const iconX = Number(icon[1]);
  const iconY = Number(icon[2]);
  assert.equal(iconX, node.width - TYPE_ICON_INSET_X);
  assert.equal(iconY, 4);
  assert.match(chunk, new RegExp(`data-icon="[^"]+"`));
  const baselines = [...chunk.matchAll(/<tspan x="\d+" y="([\d.]+)">/g)].map((match) => Number(match[1]));
  const textY = baselines.length > 0 ? baselines : [Number(chunk.match(/<text x="\d+" y="([\d.]+)"/)?.[1])];
  const lastY = textY[textY.length - 1]!;
  assert.ok(lastY + LABEL_DESCENT <= node.height, `${node.id} label stays inside the box`);
  for (const line of lines) {
    assert.ok(
      LABEL_PAD_X + labelTextWidth(line) <= iconX - TYPE_ICON_GAP + 0.01,
      `${node.id} line "${line}" meets the type icon`,
    );
  }
}

test("long borrowed names wrap inside layers boxes and short names stay tidy", async () => {
  const source = `model {
  capability "${LONG_BORROWED}" as borrowed
  capability "Pricing" as pricing
  business-actor "Shipper" as shipper
  grouping "${LONG_BORROWED}" as bucket
  capability "Strategic Planning Capability (BORROWED)" as planning
  bucket -> planning: composition
  borrowed -> shipper: association
}
views {
  view layers {
    include borrowed, pricing, shipper, bucket, planning
    autoLayout layers
    nesting nested
  }
}
`;
  const result = loadPleinSource(source, "borrowed-layers.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  for (const mode of ["layered", "layers", "organic", "grid"] as const) {
    const layout = await layoutViewpoint(result.model, "layers", { mode, nesting: "nested" });
    const svg = renderViewpointSvg(layout);
    const borrowed = layout.nodes.find((node) => node.id === "borrowed");
    const pricing = layout.nodes.find((node) => node.id === "pricing");
    const shipper = layout.nodes.find((node) => node.id === "shipper");
    const bucket = layout.nodes.find((node) => node.id === "bucket");
    const planning = layout.nodes.find((node) => node.id === "planning");
    assert.ok(borrowed && pricing && shipper && bucket && planning, mode);

    const borrowedFit = fitLeafBox(LONG_BORROWED);
    assert.equal(borrowed.width, borrowedFit.width, mode);
    assert.equal(borrowed.height, borrowedFit.height, mode);
    assert.ok(borrowed.width <= MAX_NODE_WIDTH, mode);
    assert.ok(borrowed.height >= NODE_HEIGHT, mode);
    assert.equal(pricing.width, NODE_WIDTH, mode);
    assert.equal(pricing.height, NODE_HEIGHT, mode);
    assert.equal(shipper.width, NODE_WIDTH, mode);
    assert.equal(shipper.height, NODE_HEIGHT, mode);

    assertLabelInsideBox(svg, borrowed);
    assertLabelInsideBox(svg, pricing);
    assertLabelInsideBox(svg, shipper);
    assertLabelInsideBox(svg, bucket);
    assertLabelInsideBox(svg, planning);

    const pricingChunk = nodeSlice(svg, "pricing");
    assert.equal(pricingChunk.includes("<tspan"), false, mode);
    assert.match(pricingChunk, />Pricing</);
    const borrowedChunk = nodeSlice(svg, "borrowed");
    assert.match(borrowedChunk, /<tspan /);
    assert.ok(borrowedChunk.includes(`<title>`) && borrowedChunk.includes(LONG_BORROWED), mode);

    assert.equal(bucket.container, true, mode);
    assert.equal(planning.parentId, "bucket", mode);
    assert.ok(planning.x >= bucket.x, mode);
    assert.ok(planning.y > bucket.y, mode);
    assert.ok(planning.x + planning.width <= bucket.x + bucket.width, mode);
    assert.ok(planning.y + planning.height <= bucket.y + bucket.height, mode);
    const planningTop = planning.y - bucket.y;
    const bucketLines = visibleLines(nodeSlice(svg, "bucket"));
    const bucketLastY = bucketLines.length > 1
      ? Number([...nodeSlice(svg, "bucket").matchAll(/<tspan x="\d+" y="([\d.]+)">/g)].at(-1)?.[1])
      : Number(nodeSlice(svg, "bucket").match(/<text x="\d+" y="([\d.]+)"/)?.[1]);
    assert.ok(bucketLastY + LABEL_DESCENT <= planningTop, `${mode} container label clears the child`);
  }
});

test("manual layout keeps a short label tidy and grows a long one in place", async () => {
  const source = `model {
  capability "${LONG_BORROWED}" as borrowed
  capability "Pricing" as pricing
}
views {
  view story {
    include borrowed pricing
    autoLayout off
    position pricing 40 80
    position borrowed 40 160
  }
}
`;
  const result = loadPleinSource(source, "borrowed-manual.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = await layoutViewpoint(result.model, "story");
  const pricing = layout.nodes.find((node) => node.id === "pricing");
  const borrowed = layout.nodes.find((node) => node.id === "borrowed");
  assert.ok(pricing && borrowed);
  assert.equal(pricing.x, 40);
  assert.equal(pricing.y, 80);
  assert.equal(pricing.width, NODE_WIDTH);
  assert.equal(pricing.height, NODE_HEIGHT);
  assert.equal(borrowed.x, 40);
  assert.equal(borrowed.y, 160);
  const fitted = fitLeafBox(LONG_BORROWED);
  assert.equal(borrowed.width, fitted.width);
  assert.equal(borrowed.height, fitted.height);
  const svg = renderViewpointSvg(layout);
  assertLabelInsideBox(svg, pricing);
  assertLabelInsideBox(svg, borrowed);
});

/** Element stroke is centered on the box, so a gap must clear half of this width. */
const NODE_STROKE = 1.25;

test("marker tips clear the stroke and unmarked shafts stay on it", () => {
  assert.equal(CONNECTOR_SHAFT_GAP, NODE_STROKE / 2);
  assert.equal(CONNECTOR_TIP_GAP, CONNECTOR_SHAFT_GAP + CONNECTOR_TIP_CLEARANCE);
  assert.ok(CONNECTOR_TIP_CLEARANCE >= 2 && CONNECTOR_TIP_CLEARANCE <= 4);
  assert.ok(CONNECTOR_SHAFT_GAP < 2, "unmarked end is stroke clearance, not a shared inset");
  assert.ok(CONNECTOR_TIP_GAP < 6, "tip gap is smaller than the rejected 6px shared inset");

  const booking = gapBox("booking", 300, 200, "businessService");
  const shipper = gapBox("shipper", 300, 40, "businessActor");
  const planner = gapBox("planner", 40, 200, "businessRole");
  const tms = gapBox("tms", 560, 200, "applicationComponent");
  const vertical = gapLink(shipper, booking, "serves", [
    { x: 384, y: shipper.y + shipper.height },
    { x: 384, y: booking.y },
  ]);
  const fromLeft = gapLink(planner, booking, "triggers", [
    { x: planner.x + planner.width, y: 226 },
    { x: booking.x, y: 226 },
  ]);
  const fromRight = gapLink(tms, booking, "realizes", [
    { x: tms.x, y: 226 },
    { x: booking.x + booking.width, y: 226 },
  ]);
  const layout = gapScene([booking, shipper, planner, tms], [vertical, fromLeft, fromRight]);
  const edgesBefore = JSON.stringify(layout.edges);
  const nodesBefore = JSON.stringify(layout.nodes);
  const svg = renderViewpointSvg(layout);
  assert.equal(JSON.stringify(layout.edges), edgesBefore);
  assert.equal(JSON.stringify(layout.nodes), nodesBefore);
  assertSharedArrowMarker(svg);
  assert.match(svg, new RegExp(`width="${layout.width}" height="${layout.height}"`));

  for (const node of layout.nodes) {
    assertNodeChromeUnchanged(svg, node);
    assertLabelInsideBox(svg, node);
  }

  const intoBooking = [vertical, fromLeft, fromRight];
  const tips: number[] = [];
  for (const edge of intoBooking) {
    const measured = measureConnector(svg, layout, edge);
    assertStraightEndGaps(edge.id, measured);
    assertOverhangAccounted(edge.id, svg, measured);
    assertEndMarkerOnly(svg, edge.id);
    tips.push(measured.tipGap);
  }
  assert.ok(Math.max(...tips) - Math.min(...tips) <= 0.05, "fan-in tips share one clearance");

  const centerRouted = gapLink(shipper, booking, "flowsTo", [
    { x: 384, y: 66 },
    { x: 384, y: 146 },
    { x: 384, y: 146 },
    { x: 384, y: 226 },
  ]);
  const centerScene = gapScene([shipper, booking], [centerRouted]);
  const centerSvg = renderViewpointSvg(centerScene);
  const centerMeasured = measureConnector(centerSvg, centerScene, centerRouted);
  assertStraightEndGaps("center", centerMeasured);
  assertOverhangAccounted("center", centerSvg, centerMeasured);
  assertEndMarkerOnly(centerSvg, centerRouted.id);

  const diagonalSource = gapBox("quote", 40, 40, "businessProcess");
  const diagonalTarget = gapBox("order", 360, 180, "businessObject");
  const diagonal = gapLink(diagonalSource, diagonalTarget, "accesses", [
    { x: 183, y: diagonalSource.y + diagonalSource.height },
    { x: 385, y: diagonalTarget.y },
  ]);
  const diagonalScene = gapScene([diagonalSource, diagonalTarget], [diagonal]);
  const diagonalSvg = renderViewpointSvg(diagonalScene);
  assertStraightEndGaps("diagonal", measureConnector(diagonalSvg, diagonalScene, diagonal));
  assertEndMarkerOnly(diagonalSvg, diagonal.id);
});

test("short connectors keep tip clearance ahead of the shaft and do not reverse", () => {
  const source = gapBox("shipper", 40, 40, "businessActor");
  const target = gapBox("booking", 40, 112, "businessService");
  const edge = gapLink(source, target, "serves", [
    { x: 124, y: source.y + source.height },
    { x: 124, y: target.y },
  ]);
  const scene = gapScene([source, target], [edge]);
  const svg = renderViewpointSvg(scene);
  const points = renderedPolyline(svg, edge.id);
  assert.ok(points[points.length - 1]!.y > points[0]!.y);
  const measured = measureConnector(svg, scene, edge);
  assertStraightEndGaps(edge.id, measured);
  assertOverhangAccounted(edge.id, svg, measured);
  assertEndMarkerOnly(svg, edge.id);

  const closeTarget = gapBox("booking", 40, 100, "businessService");
  const close = gapLink(source, closeTarget, "serves", [
    { x: 124, y: 66 },
    { x: 124, y: 96 },
    { x: 124, y: 96 },
    { x: 124, y: 126 },
  ]);
  const closeScene = gapScene([source, closeTarget], [close]);
  const closeSvg = renderViewpointSvg(closeScene);
  const closePoints = renderedPolyline(closeSvg, close.id);
  for (const point of closePoints) {
    assert.equal(strictlyInside(point, source), false);
    assert.equal(strictlyInside(point, closeTarget), false);
  }
  assert.ok(closePoints[closePoints.length - 1]!.y > closePoints[0]!.y);
  const closeMeasured = measureConnector(closeSvg, closeScene, close);
  assertStraightEndGaps(close.id, closeMeasured);
  assertOverhangAccounted(close.id, closeSvg, closeMeasured);
  assertEndMarkerOnly(closeSvg, close.id);
  assertNodeChromeUnchanged(closeSvg, source);
  assertNodeChromeUnchanged(closeSvg, closeTarget);
});

test("orthogonal bend points and mid-spans do not get end markers", () => {
  const prototyping = { ...gapBox("prototyping", 40, 24, "businessProcess"), width: 320, height: 56 };
  const development = { ...gapBox("development", 400, 24, "businessProcess"), width: 320, height: 56 };
  const research = gapBox("research", 40, 280, "businessService");
  const design = gapBox("design", 400, 280, "businessService");
  const archive = gapBox("archive", 800, 120, "businessObject");
  const platform = {
    ...gapBox("platform", 200, 80, "grouping"),
    width: 400,
    height: 280,
    container: true,
  };
  const tms = { ...gapBox("tms", 280, 160, "applicationComponent"), parentId: "platform" };
  const shipper = gapBox("shipper", 40, 200, "businessActor");

  // Vertical rise onto a horizontal bus, then a final rise into the box.
  // The rise onto the bus is a mid vertex — an upward head there is the Mac failure.
  const intoProto = gapLink(research, prototyping, "triggers", [
    { x: 124, y: 280 },
    { x: 124, y: 150 },
    { x: 124, y: 150 },
    { x: 200, y: 150 },
    { x: 200, y: 50 },
  ]);
  // Extra jog: a vertical mid-span under the box, then a horizontal run, then up.
  const intoDev = gapLink(design, development, "flowsTo", [
    { x: 484, y: 280 },
    { x: 484, y: 210 },
    { x: 700, y: 210 },
    { x: 700, y: 150 },
    { x: 560, y: 150 },
    { x: 560, y: 50 },
  ]);
  // Final segment is horizontal. The vertical bend beside the box must not be a head.
  const intoSide = gapLink(archive, development, "accesses", [
    { x: 800, y: 146 },
    { x: 760, y: 146 },
    { x: 760, y: 52 },
    { x: 680, y: 52 },
  ]);
  // Bends inside a nested parent are not relationship ends. The head is on the child.
  const intoNested = gapLink(shipper, tms, "serves", [
    { x: 208, y: 226 },
    { x: 240, y: 226 },
    { x: 240, y: 300 },
    { x: 360, y: 300 },
    { x: 360, y: 186 },
  ]);

  const scene = gapScene(
    [prototyping, development, research, design, archive, platform, tms, shipper],
    [intoProto, intoDev, intoSide, intoNested],
  );
  const svg = renderViewpointSvg(scene);
  assert.equal(svg.includes('marker-mid="url('), false);
  assert.equal(svg.includes('marker-start="url('), false);
  assert.equal(svg.match(/marker-end="url\(/g)?.length, scene.edges.length);

  for (const edge of scene.edges) {
    assertEndMarkerOnly(svg, edge.id);
    const measured = measureConnector(svg, scene, edge);
    assertStraightEndGaps(edge.id, measured);
    assertOverhangAccounted(edge.id, svg, measured);
  }

  const protoPoints = renderedPolyline(svg, intoProto.id);
  assert.ok(protoPoints.length >= 4, "orthogonal route keeps its bend points");
  assert.ok(protoPoints.some((point) => point.x === 124 && point.y === 150));
  assert.ok(protoPoints.some((point) => point.x === 200 && point.y === 150));
  const protoMarker = endMarker(svg, intoProto.id);
  assert.equal(protoMarker.x1, protoMarker.x2);
  assert.ok(protoMarker.y2 < protoMarker.y1, "head points up into the box");
  assert.ok(protoMarker.y2 < 120, `head sits on the box edge, not the bus (${protoMarker.y2})`);
  assert.notEqual(protoMarker.y2, 150);
  assert.notEqual(protoMarker.x2, 124);

  const devPoints = renderedPolyline(svg, intoDev.id);
  assert.ok(devPoints.some((point) => point.x === 700 && point.y === 150));
  assert.ok(devPoints.some((point) => point.x === 700 && point.y === 210));
  const devMarker = endMarker(svg, intoDev.id);
  assert.equal(devMarker.x1, devMarker.x2);
  assert.equal(devMarker.x2, 560);
  assert.ok(devMarker.y2 < devMarker.y1);
  assert.ok(Math.abs(devMarker.y2 - 150) > 20);
  assert.ok(Math.abs(devMarker.y2 - 210) > 20);
  assert.notEqual(devMarker.x2, 700);

  const sideMarker = endMarker(svg, intoSide.id);
  assert.equal(sideMarker.y1, sideMarker.y2);
  assert.ok(sideMarker.x2 < sideMarker.x1, "head points along the final segment toward the box");
  assert.notEqual(sideMarker.x2, 760);
  assert.ok(Math.abs(sideMarker.y2 - 146) > 20, "vertical bend is not the marker position");

  const nestedPoints = renderedPolyline(svg, intoNested.id);
  assert.ok(nestedPoints.some((point) => point.x === 240 && point.y === 300));
  assert.ok(nestedPoints.some((point) => point.x === 360 && point.y === 300));
  const nestedMarker = endMarker(svg, intoNested.id);
  assert.equal(nestedMarker.x1, nestedMarker.x2);
  assert.equal(nestedMarker.x2, 360);
  assert.ok(nestedMarker.y2 < nestedMarker.y1);
  assert.ok(nestedMarker.y2 < 250, `nested head is on the child, not the interior bend (${nestedMarker.y2})`);
  assert.notEqual(nestedMarker.y2, 300);
});

test("orthogonal fan-in heads clear the stroke and stay on the final segment", () => {
  // The closest ELK slot is EDGE_NODE_GAP outside the border. That is the dense
  // fan-in stub: a horizontal bus, then a rise into the bottom (or a run into
  // the side) long enough for the readable head.
  const service = gapBox("service", 200, 40, "businessService");
  const bottom = service.y + service.height;
  const right = service.x + service.width;
  const legacy = gapBox("legacy", 40, 180, "businessProcess");
  const core = gapBox("core", 220, 180, "businessProcess");
  const platforms = gapBox("platforms", 400, 180, "applicationComponent");
  const side = gapBox("archive", 460, 40, "businessObject");
  const intoBottom = (source: LayoutNode, x: number, type: ViewpointLayout["edges"][number]["type"]) =>
    gapLink(source, service, type, [
      { x: source.x + source.width / 2, y: source.y },
      { x: source.x + source.width / 2, y: bottom + EDGE_NODE_GAP },
      { x, y: bottom + EDGE_NODE_GAP },
      { x, y: bottom },
    ]);
  const fromLegacy = intoBottom(legacy, 250, "realizes");
  const fromCore = intoBottom(core, 290, "realizes");
  const fromPlatforms = intoBottom(platforms, 330, "flowsTo");
  const fromSide = gapLink(side, service, "accesses", [
    { x: side.x, y: 66 },
    { x: right + EDGE_NODE_GAP, y: 66 },
    { x: right, y: 66 },
  ]);
  const scene = gapScene(
    [service, legacy, core, platforms, side],
    [fromLegacy, fromCore, fromPlatforms, fromSide],
  );
  const svg = renderViewpointSvg(scene);
  const tips: number[] = [];
  for (const edge of scene.edges) {
    const measured = measureConnector(svg, scene, edge);
    assertStraightEndGaps(edge.id, measured);
    assertOverhangAccounted(edge.id, svg, measured);
    assertEndMarkerOnly(svg, edge.id);
    assertHeadOnFinalSegment(edge.id, svg, edge.id);
    tips.push(measured.tipGap);
  }
  assert.ok(Math.max(...tips) - Math.min(...tips) <= 0.05, "bottom and side tips share one clearance");
  for (const edge of [fromLegacy, fromCore, fromPlatforms]) {
    const marker = endMarker(svg, edge.id);
    assert.equal(marker.x1, marker.x2, edge.id);
    assert.ok(marker.y2 < marker.y1, `${edge.id} points up into the bottom`);
    assert.ok(marker.y2 > bottom, `${edge.id} tip line stays outside the box`);
  }
  const sideMarker = endMarker(svg, fromSide.id);
  assert.equal(sideMarker.y1, sideMarker.y2);
  assert.ok(sideMarker.x2 < sideMarker.x1, "side head points into the box");
  assert.ok(sideMarker.x2 > right, "side tip line stays outside the box");
  for (const edge of scene.edges) {
    const drawn = finalStubPx(svg, edge.id);
    const tail = markerTailPx(svg);
    assert.ok(drawn - tail >= 0.75 && drawn - tail <= 8, `${edge.id} shaft past the head ${drawn - tail}`);
  }
});

test("dense upward fan-in uses a longer ELK stub for the readable head", async () => {
  const loaded = loadPleinSource(
    `model {
  business-service "Booking" as booking
  business-actor "Shipper" as shipper
  business-actor "Planner" as planner
  business-role "Clerk" as clerk
  business-process "Book" as book
  shipper -> booking: serving
  planner -> booking: serving
  clerk -> booking: serving
  book -> booking: triggering
}
views {
  view fan {
    include booking, shipper, planner, clerk, book
    autoLayout tb orthogonal
  }
}
`,
    "dense-fan-in.plein",
  );
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  const layout = await layoutViewpoint(loaded.model, "fan");
  const svg = renderViewpointSvg(layout);
  const booking = layout.nodes.find((node) => node.id === "booking");
  assert.ok(booking);
  const intoBooking = layout.edges.filter((edge) => edge.target === "booking");
  assert.equal(intoBooking.length, 4);
  assertSharedArrowMarker(svg);
  assert.equal(svg.includes('marker-mid="url('), false);
  assert.equal(svg.includes('marker-start="url('), false);

  const slots: number[] = [];
  for (const edge of intoBooking) {
    const measured = measureConnector(svg, layout, edge);
    assertStraightEndGaps(edge.id, measured);
    assertOverhangAccounted(edge.id, svg, measured);
    assertEndMarkerOnly(svg, edge.id);
    assertHeadOnFinalSegment(edge.id, svg, edge.id);
    const points = edge.points ?? [];
    assert.ok(points.length >= 2, edge.id);
    const end = points[points.length - 1]!;
    let from = points[points.length - 2]!;
    for (let index = points.length - 2; index >= 0; index -= 1) {
      if (points[index]!.x !== end.x || points[index]!.y !== end.y) {
        from = points[index]!;
        break;
      }
    }
    slots.push(rectDistance(from, booking));
    const marker = endMarker(svg, edge.id);
    assert.ok(marker.y2 < marker.y1, `${edge.id} points up into the bottom`);
    assert.ok(marker.y2 > booking.y + booking.height, `${edge.id} tip stays outside the box`);
  }
  const closest = Math.min(...slots);
  assert.ok(closest >= EDGE_NODE_GAP - 1, `closest fan-in slot ${closest}`);
  assert.ok(closest <= EDGE_NODE_GAP + 1, `closest fan-in slot ${closest} is the edge–node gap`);
  const tail = markerTailPx(svg);
  const height = markerHeightPx(svg);
  assert.ok(tail + markerOverhangPx(svg) >= 14, `head length ${tail}`);
  assert.ok(height >= 9, `head height ${height}`);
});

test("orthogonal connectors paint above element boxes they cross", () => {
  const parent: LayoutNode = {
    ...gapBox("parent", 0, 0, "grouping"),
    width: 420,
    height: 420,
    container: true,
  };
  const left = gapBox("left", 40, 24, "businessActor");
  const mid = gapBox("mid", 40, 160, "businessProcess");
  const right = gapBox("right", 40, 300, "applicationComponent");
  const through = gapLink(left, right, "flowsTo", [
    { x: 124, y: left.y + left.height / 2 },
    { x: 124, y: right.y + right.height / 2 },
  ]);
  const svg = renderViewpointSvg(gapScene([parent, left, mid, right], [through]));
  const containersAt = svg.indexOf('<g class="containers">');
  const nodesAt = svg.indexOf('<g class="nodes">');
  const edgesAt = svg.indexOf('<g class="edges">');
  assert.ok(containersAt !== -1 && containersAt < nodesAt && nodesAt < edgesAt);
  assert.ok(svg.indexOf('data-node-id="mid"') < svg.indexOf(`data-edge-id="${through.id}"`));
  assert.match(edgeGroup(svg, through.id), /pointer-events="none"/);
  const points = renderedPolyline(svg, through.id);
  assert.ok(points.length >= 2, "route is drawn end to end");
  assert.equal(polylineCrossesBox(points, mid), true, "the shaft still crosses the middle box");
  assert.equal(polylineCrossesBox(points, left), false);
  assert.equal(polylineCrossesBox(points, right), false);
});

test("layers orthogonal routes that cross boxes stay painted above them", async () => {
  const loaded = loadPleinSource(
    `plein {
  model {
    goal "Advantage" as advantage
    stakeholder "Gemba Advantage" as gemba
    business-actor "Sponsor" as sponsor
    business-process "Discover" as discover
    business-process "Shape" as shape
    business-process "Deliver" as deliver
    application-component "Portal" as portal
    application-component "Catalogue" as catalogue
    advantage -> gemba: association
    sponsor -> advantage: association
    sponsor -> gemba: association
    gemba -> discover: association
    discover -> shape: triggering
    shape -> deliver: triggering
    gemba -> deliver: association
    portal -> catalogue: flow
    catalogue -> gemba: association
    portal -> advantage: association
  }
  views {
    viewpoint lines "Service lines" {
      include advantage gemba sponsor discover shape deliver portal catalogue
      autoLayout layers
    }
  }
}
`,
    "service-lines.plein",
  );
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }

  for (const mode of ["layered", "layers"] as const) {
    const layout = await layoutViewpoint(loaded.model, "lines", { mode, routing: "orthogonal" });
    const svg = renderViewpointSvg(layout);
    const nodesAt = svg.indexOf('<g class="nodes">');
    const edgesAt = svg.indexOf('<g class="edges">');
    assert.ok(nodesAt !== -1 && nodesAt < edgesAt, mode);
    let crossings = 0;
    for (const edge of layout.edges) {
      if (edge.impliedByNest) {
        continue;
      }
      const points = renderedPolyline(svg, edge.id);
      assert.ok(points.length >= 2, `${mode} ${edge.id} is drawn end to end`);
      const edgeAt = svg.indexOf(`data-edge-id="${edge.id}"`);
      for (const node of layout.nodes) {
        if (node.container || node.id === edge.source || node.id === edge.target) {
          continue;
        }
        if (!polylineCrossesBox(points, node)) {
          continue;
        }
        crossings += 1;
        const nodeAt = svg.indexOf(`data-node-id="${node.id}"`);
        assert.ok(
          nodeAt !== -1 && nodeAt < edgeAt,
          `${mode} ${edge.id} is hidden behind ${node.id}`,
        );
      }
    }
    if (mode === "layers") {
      assert.ok(crossings > 0, "a long layers association should cross a foreign box");
    }
  }
});

test("connector gap holds for nested containers and auto-layout modes", async () => {
  const dense = loadPleinSource(
    `model {
  business-actor "Shipper" as shipper
  business-role "Planner" as planner
  business-process "Book" as book
  application-component "TMS" as tms
  business-service "Booking" as booking
  shipper -> booking: serving
  planner -> booking: serving
  book -> booking: triggering
  tms -> booking: realization
  booking -> tms: flow
}
views {
  view dense {
    include shipper, planner, book, tms, booking
    autoLayout tb
  }
}
`,
    "connector-gap-dense.plein",
  );
  assert.equal(dense.ok, true);
  if (!dense.ok) {
    return;
  }

  const modes = ["layered", "layers", "organic", "grid"] as const;
  for (const mode of modes) {
    const routings = mode === "layered" || mode === "organic" ? (["orthogonal", "polyline"] as const) : (["orthogonal"] as const);
    for (const routing of routings) {
      const layout = await layoutViewpoint(dense.model, "dense", { mode, routing });
      const edgesBefore = JSON.stringify(layout.edges);
      const nodesBefore = JSON.stringify(layout.nodes.map((node) => ({ ...node })));
      const svg = renderViewpointSvg(layout);
      assert.equal(JSON.stringify(layout.edges), edgesBefore, mode);
      assert.equal(JSON.stringify(layout.nodes.map((node) => ({ ...node }))), nodesBefore, mode);
      assertSharedArrowMarker(svg);
      assert.match(svg, new RegExp(`width="${layout.width}" height="${layout.height}"`));
      for (const node of layout.nodes) {
        assertNodeChromeUnchanged(svg, node);
      }
      const intoBooking = layout.edges.filter((edge) => edge.target === "booking" && !edge.impliedByNest);
      assert.ok(intoBooking.length >= 3, mode);
      const fanIn = new Set(intoBooking.map((edge) => edge.type));
      assert.ok(fanIn.has("serves") && fanIn.has("triggers") && fanIn.has("realizes"), mode);
      for (const edge of layout.edges) {
        if (edge.impliedByNest) {
          continue;
        }
        assertRenderedConnectorGap(svg, layout, edge);
      }
    }
  }

  const nested = loadPleinSource(
    `model {
  grouping "Platform" as platform
  application-component "TMS" as tms
  application-component "Billing" as billing
  business-actor "Shipper" as shipper
  platform -> tms: composition
  platform -> billing: composition
  tms -> billing: flow
  shipper -> tms: serving
}
views {
  view nested {
    include platform, tms, billing, shipper
    nesting nested
    autoLayout tb
  }
}
`,
    "connector-gap-nested.plein",
  );
  assert.equal(nested.ok, true);
  if (!nested.ok) {
    return;
  }
  for (const mode of modes) {
    const layout = await layoutViewpoint(nested.model, "nested", { mode, nesting: "nested" });
    const svg = renderViewpointSvg(layout);
    const platform = layout.nodes.find((node) => node.id === "platform");
    const tms = layout.nodes.find((node) => node.id === "tms");
    const billing = layout.nodes.find((node) => node.id === "billing");
    assert.ok(platform?.container, mode);
    assert.equal(tms?.parentId, "platform", mode);
    assert.equal(billing?.parentId, "platform", mode);
    assert.ok(tms && billing && isInside(tms, platform!), mode);
    for (const node of layout.nodes) {
      assertNodeChromeUnchanged(svg, node);
    }
    const drawn = layout.edges.filter((edge) => !edge.impliedByNest);
    assert.ok(drawn.length >= 2, mode);
    for (const edge of drawn) {
      assertRenderedConnectorGap(svg, layout, edge);
    }
  }

  const manual = loadPleinSource(
    `model {
  business-actor "Shipper" as shipper
  business-service "Booking" as booking
  application-component "TMS" as tms
  shipper -> booking: serving
  tms -> booking: realization
}
views {
  view placed {
    include shipper, booking, tms
    autoLayout off
    position shipper 40 40
    position booking 280 40
    position tms 40 200
  }
}
`,
    "connector-gap-manual.plein",
  );
  assert.equal(manual.ok, true);
  if (!manual.ok) {
    return;
  }
  const placed = await layoutViewpoint(manual.model, "placed");
  assert.equal(placed.auto, false);
  const placedSvg = renderViewpointSvg(placed);
  assert.match(placedSvg, /data-layout-engine="manual"/);
  const shipper = placed.nodes.find((node) => node.id === "shipper");
  assert.equal(shipper?.x, 40);
  assert.equal(shipper?.y, 40);
  for (const edge of placed.edges) {
    assertRenderedConnectorGap(placedSvg, placed, edge);
  }
  for (const node of placed.nodes) {
    assertNodeChromeUnchanged(placedSvg, node);
    assertLabelInsideBox(placedSvg, node);
  }
});

function gapBox(
  id: string,
  x: number,
  y: number,
  keyword: LayoutNode["keyword"],
): LayoutNode {
  return { id, label: id, keyword, x, y, width: NODE_WIDTH, height: NODE_HEIGHT };
}

function gapLink(
  source: LayoutNode,
  target: LayoutNode,
  type: ViewpointLayout["edges"][number]["type"],
  points: Array<{ x: number; y: number }>,
): ViewpointLayout["edges"][number] {
  const start = points[0]!;
  const end = points[points.length - 1]!;
  return {
    id: `${source.id}->${target.id}:${type}`,
    source: source.id,
    target: target.id,
    type,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    points,
  };
}

function gapScene(nodes: LayoutNode[], edges: ViewpointLayout["edges"]): ViewpointLayout {
  return {
    viewName: "gap",
    direction: "tb",
    mode: "layered",
    routing: "orthogonal",
    nesting: "beside",
    auto: false,
    width: 900,
    height: 520,
    nodes,
    edges,
  };
}

type MarkerLine = { x1: number; y1: number; x2: number; y2: number };

function edgeGroup(svg: string, edgeId: string): string {
  const escaped = edgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = svg.match(new RegExp(`<g data-edge-id="${escaped}">[\\s\\S]*?</g>`));
  assert.ok(match, edgeId);
  return match[0]!;
}

function endMarker(svg: string, edgeId: string): MarkerLine {
  const group = edgeGroup(svg, edgeId);
  const marked = [...group.matchAll(/<line\b([^>]*)\/>/g)].filter((line) => /marker-end="url\(/.test(line[1]!));
  assert.equal(marked.length, 1, `${edgeId} marker lines`);
  const attrs = marked[0]![1]!;
  const num = (name: string): number => {
    const found = new RegExp(`\\b${name}="([^"]+)"`).exec(attrs);
    assert.ok(found, `${edgeId} ${name}`);
    return Number(found[1]);
  };
  return { x1: num("x1"), y1: num("y1"), x2: num("x2"), y2: num("y2") };
}

/**
 * The head is a two-point line on the final segment. Bend points stay on the
 * unmarked shaft polyline, so they cannot receive marker-end or marker-mid.
 */
function assertEndMarkerOnly(svg: string, edgeId: string): void {
  const group = edgeGroup(svg, edgeId);
  const points = renderedPolyline(svg, edgeId);
  assert.equal(group.match(/marker-end="url\(/g)?.length ?? 0, 1, edgeId);
  assert.equal(group.match(/marker-mid="url\(/g)?.length ?? 0, 0, edgeId);
  assert.equal(group.match(/marker-start="url\(/g)?.length ?? 0, 0, edgeId);
  const shaft = /<polyline\b([^>]*)\/>/.exec(group);
  assert.ok(shaft, edgeId);
  assert.match(shaft[1]!, /marker-start="none"/);
  assert.match(shaft[1]!, /marker-mid="none"/);
  assert.match(shaft[1]!, /marker-end="none"/);
  assert.doesNotMatch(shaft[1]!, /marker-(?:start|mid|end)="url\(/);

  const marker = endMarker(svg, edgeId);
  assert.match(group, /<line\b[^>]*marker-start="none"/);
  assert.match(group, /<line\b[^>]*marker-mid="none"/);
  const end = points[points.length - 1]!;
  let fromIndex = points.length - 2;
  while (fromIndex > 0 && points[fromIndex]!.x === end.x && points[fromIndex]!.y === end.y) {
    fromIndex -= 1;
  }
  const from = points[fromIndex]!;
  assert.ok(from.x !== end.x || from.y !== end.y, `${edgeId} has no drawable final segment`);
  assert.deepEqual(marker, { x1: from.x, y1: from.y, x2: end.x, y2: end.y });
  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index]!;
    if (point.x === end.x && point.y === end.y) {
      continue;
    }
    assert.ok(
      point.x !== marker.x2 || point.y !== marker.y2,
      `${edgeId} mid vertex ${point.x},${point.y} carries the end marker`,
    );
  }
}

function renderedPolyline(svg: string, edgeId: string): Array<{ x: number; y: number }> {
  const escaped = edgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = svg.match(new RegExp(`data-edge-id="${escaped}"[\\s\\S]*?<polyline points="([^"]+)"`));
  assert.ok(match, edgeId);
  return match[1]!.trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",");
    return { x: Number(x), y: Number(y) };
  });
}

function markerTip(svg: string, points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const refX = Number(/<marker[^>]* refX="([^"]+)"/.exec(svg)?.[1]);
  const polygon = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? "";
  const tipX = Math.max(...polygon.split(",").map((part) => Number(part.trim().split(/\s+/)[0])));
  const stroke = Number(/<polyline[^>]* stroke-width="([^"]+)"/.exec(svg)?.[1]);
  const overhang = (tipX - refX) * stroke;
  const end = points[points.length - 1]!;
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const dx = end.x - points[index]!.x;
    const dy = end.y - points[index]!.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.01) {
      return { x: end.x + (dx / length) * overhang, y: end.y + (dy / length) * overhang };
    }
  }
  return end;
}

function rectDistance(point: { x: number; y: number }, node: LayoutNode): number {
  const right = node.x + node.width;
  const bottom = node.y + node.height;
  const dx = point.x < node.x ? node.x - point.x : point.x > right ? point.x - right : 0;
  const dy = point.y < node.y ? node.y - point.y : point.y > bottom ? point.y - bottom : 0;
  return Math.hypot(dx, dy);
}

function nodeSeparation(a: LayoutNode, b: LayoutNode): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.hypot(dx, dy);
}

function strictlyInside(point: { x: number; y: number }, node: LayoutNode): boolean {
  return (
    point.x > node.x &&
    point.x < node.x + node.width &&
    point.y > node.y &&
    point.y < node.y + node.height
  );
}

function measureConnector(
  svg: string,
  layout: ViewpointLayout,
  edge: ViewpointLayout["edges"][number],
): { startGap: number; tipGap: number; pathEndGap: number } {
  const points = renderedPolyline(svg, edge.id);
  const source = layout.nodes.find((node) => node.id === edge.source);
  const target = layout.nodes.find((node) => node.id === edge.target);
  assert.ok(source && target, edge.id);
  return {
    startGap: rectDistance(points[0]!, source),
    tipGap: rectDistance(markerTip(svg, points), target),
    pathEndGap: rectDistance(points[points.length - 1]!, target),
  };
}

/** Shaft on the stroke, tip one clearance past it. The path ends behind the tip. */
function assertStraightEndGaps(where: string, measured: { startGap: number; tipGap: number; pathEndGap: number }): void {
  assert.ok(Math.abs(measured.startGap - CONNECTOR_SHAFT_GAP) <= 0.08, `${where} shaft ${measured.startGap}`);
  assert.ok(Math.abs(measured.tipGap - CONNECTOR_TIP_GAP) <= 0.08, `${where} tip ${measured.tipGap}`);
  assert.ok(measured.tipGap > measured.startGap + CONNECTOR_TIP_CLEARANCE - 0.2, `${where} tip vs shaft`);
  assert.ok(
    measured.pathEndGap > measured.tipGap + 0.4,
    `${where} path end ${measured.pathEndGap} should sit behind the overhanging tip ${measured.tipGap}`,
  );
  assert.ok(measured.startGap < 2, `${where} shaft must not float`);
}

/** Axis-aligned runs: the whole overhang is perpendicular, so the path end is exactly one overhang behind the tip. */
function assertOverhangAccounted(
  where: string,
  svg: string,
  measured: { tipGap: number; pathEndGap: number },
): void {
  const overhang = markerOverhangPx(svg);
  assert.ok(overhang > 1, `${where} overhang ${overhang}`);
  assert.ok(
    Math.abs(measured.pathEndGap - measured.tipGap - overhang) <= 0.08,
    `${where} path ${measured.pathEndGap} tip ${measured.tipGap} overhang ${overhang}`,
  );
}

/** Distance from the path end back to the arrow base. The head occupies this, so the shaft is not left floating. */
function markerTailPx(svg: string): number {
  const refX = Number(/<marker[^>]* refX="([^"]+)"/.exec(svg)?.[1]);
  const polygon = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? "";
  const baseX = Math.min(...polygon.split(",").map((part) => Number(part.trim().split(/\s+/)[0])));
  const stroke = Number(/<polyline[^>]* stroke-width="([^"]+)"/.exec(svg)?.[1]);
  return (refX - baseX) * stroke;
}

/**
 * The triangle must lie on the final segment. If the tail reaches the previous
 * bend, that span cuts through the head and the tip looks flattened on the border.
 */
function assertHeadOnFinalSegment(where: string, svg: string, edgeId: string): void {
  const points = renderedPolyline(svg, edgeId);
  const end = points[points.length - 1]!;
  let from = points[points.length - 2]!;
  for (let index = points.length - 2; index >= 0; index -= 1) {
    if (points[index]!.x !== end.x || points[index]!.y !== end.y) {
      from = points[index]!;
      break;
    }
  }
  const stub = Math.hypot(end.x - from.x, end.y - from.y);
  const tail = markerTailPx(svg);
  assert.ok(tail >= 12, `${where} tail ${tail} should be a readable head, not a 4.5px stub`);
  assert.ok(stub - tail >= 0.75, `${where} head crosses the bend: stub ${stub} tail ${tail}`);
}

function finalStubPx(svg: string, edgeId: string): number {
  const points = renderedPolyline(svg, edgeId);
  const end = points[points.length - 1]!;
  let from = points[points.length - 2]!;
  for (let index = points.length - 2; index >= 0; index -= 1) {
    if (points[index]!.x !== end.x || points[index]!.y !== end.y) {
      from = points[index]!;
      break;
    }
  }
  return Math.hypot(end.x - from.x, end.y - from.y);
}

function markerHeightPx(svg: string): number {
  const polygon = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? "";
  const ys = polygon.split(",").map((part) => Number(part.trim().split(/\s+/)[1]));
  const stroke = Number(/<polyline[^>]* stroke-width="([^"]+)"/.exec(svg)?.[1]);
  return (Math.max(...ys) - Math.min(...ys)) * stroke;
}

function markerOverhangPx(svg: string): number {
  const refX = Number(/<marker[^>]* refX="([^"]+)"/.exec(svg)?.[1]);
  const polygon = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? "";
  const tipX = Math.max(...polygon.split(",").map((part) => Number(part.trim().split(/\s+/)[0])));
  const stroke = Number(/<polyline[^>]* stroke-width="([^"]+)"/.exec(svg)?.[1]);
  return (tipX - refX) * stroke;
}

function assertRenderedConnectorGap(
  svg: string,
  layout: ViewpointLayout,
  edge: ViewpointLayout["edges"][number],
): void {
  const points = renderedPolyline(svg, edge.id);
  assert.ok(points.length >= 2, edge.id);
  const source = layout.nodes.find((node) => node.id === edge.source);
  const target = layout.nodes.find((node) => node.id === edge.target);
  assert.ok(source && target, edge.id);
  const { startGap, tipGap, pathEndGap } = measureConnector(svg, layout, edge);
  const where = `${layout.mode}/${layout.routing} ${edge.id}`;
  assert.ok(startGap <= CONNECTOR_SHAFT_GAP * Math.SQRT2 + 0.45, `${where} shaft ${startGap}`);
  assert.ok(tipGap <= CONNECTOR_TIP_GAP * Math.SQRT2 + 0.45, `${where} tip ${tipGap}`);
  assert.ok(tipGap + 0.05 > NODE_STROKE / 2, `${where} tip ${tipGap}`);
  assert.ok(pathEndGap + 0.05 >= tipGap, `${where} path ${pathEndGap} vs tip ${tipGap}`);
  if (nodeSeparation(source, target) >= 32) {
    assert.ok(startGap >= CONNECTOR_SHAFT_GAP - 0.15, `${where} start ${startGap}`);
    assert.ok(startGap <= CONNECTOR_SHAFT_GAP * Math.SQRT2 + 0.35, `${where} start ${startGap}`);
    assert.ok(tipGap >= CONNECTOR_TIP_GAP - 0.25, `${where} tip ${tipGap}`);
    assert.ok(tipGap <= CONNECTOR_TIP_GAP * Math.SQRT2 + 0.35, `${where} tip ${tipGap}`);
    assert.ok(tipGap > startGap + 1.5, `${where} ${startGap} vs ${tipGap}`);
  }
  for (const point of points) {
    assert.equal(strictlyInside(point, source), false, where);
    assert.equal(strictlyInside(point, target), false, where);
  }
  assertEndMarkerOnly(svg, edge.id);
  assertHeadOnFinalSegment(where, svg, edge.id);
}

function assertSharedArrowMarker(svg: string): void {
  assert.equal(svg.match(/<marker /g)?.length, 1);
  assert.match(
    svg,
    /<marker [^>]*markerUnits="strokeWidth" markerWidth="12" markerHeight="9" refX="10" refY="4.5" orient="auto" viewBox="0 0 12 9" overflow="visible">/,
  );
  assert.match(svg, /<polygon points="1 1, 11 4.5, 1 8" fill="#6e6e73" \/>/);
  const refX = Number(/<marker[^>]* refX="([^"]+)"/.exec(svg)?.[1]);
  const polygon = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? "";
  const tipX = Math.max(...polygon.split(",").map((part) => Number(part.trim().split(/\s+/)[0])));
  assert.ok(tipX > refX, "tip overhangs the shaft endpoint");
  const tail = markerTailPx(svg);
  const overhang = markerOverhangPx(svg);
  assert.ok(tail + overhang >= 14, `head length ${tail + overhang}`);
  assert.ok(markerHeightPx(svg) >= 9, `head height ${markerHeightPx(svg)}`);
  assert.ok(
    EDGE_NODE_GAP >= CONNECTOR_TIP_GAP + overhang + tail + 2,
    "edge–node gap holds the head without a long empty shaft",
  );
}

/** True when an axis-aligned run passes through the interior of a box. */
function polylineCrossesBox(points: Array<{ x: number; y: number }>, node: LayoutNode): boolean {
  const left = node.x + 1;
  const right = node.x + node.width - 1;
  const top = node.y + 1;
  const bottom = node.y + node.height - 1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.6) {
      continue;
    }
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
      const y = (a.y + b.y) / 2;
      if (y <= top || y >= bottom) {
        continue;
      }
      const overlap = Math.min(Math.max(a.x, b.x), right) - Math.max(Math.min(a.x, b.x), left);
      if (overlap > 2) {
        return true;
      }
    } else {
      const x = (a.x + b.x) / 2;
      if (x <= left || x >= right) {
        continue;
      }
      const overlap = Math.min(Math.max(a.y, b.y), bottom) - Math.max(Math.min(a.y, b.y), top);
      if (overlap > 2) {
        return true;
      }
    }
  }
  return false;
}

function assertNodeChromeUnchanged(svg: string, node: LayoutNode): void {
  assert.match(
    svg,
    new RegExp(
      `data-node-id="${node.id}"[^>]*transform="translate\\(${node.x} ${node.y}\\)"[\\s\\S]*?<rect width="${node.width}" height="${node.height}" rx="\\d+" fill="[^"]+" stroke="[^"]+" stroke-width="1.25"`,
    ),
    node.id,
  );
  assert.match(
    svg,
    new RegExp(
      `data-node-id="${node.id}"[\\s\\S]*?class="type-icon"[^>]*transform="translate\\(${node.width - TYPE_ICON_INSET_X} 4\\)"`,
    ),
    node.id,
  );
}
