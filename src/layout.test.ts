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
