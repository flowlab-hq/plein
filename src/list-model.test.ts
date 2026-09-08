import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { filterModel, firstNamedView, loadPleinSource } from "./list-model.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

test("load→list valid-basic.plein lists elements, relationships, and views", () => {
  const result = loadPleinSource(readFixture("valid-basic.plein"), "fixtures/valid-basic.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(
    result.list.elements.map((element) => element.id),
    ["shipper", "booking", "order", "rates"],
  );
  assert.deepEqual(
    result.list.relationships.map((rel) => `${rel.source}->${rel.target}:${rel.type}`),
    [
      "shipper->booking:serves",
      "booking->order:accesses",
      "booking->rates:serves",
      "rates->order:realizes",
    ],
  );
  assert.deepEqual(
    result.list.views.map((view) => view.name),
    ["booking-context"],
  );
  assert.equal(result.list.viewName, null);
  assert.equal(firstNamedView(result.model), "booking-context");
});

test("selecting booking-context keeps the include set from valid-basic.plein", () => {
  const result = loadPleinSource(readFixture("valid-basic.plein"), "fixtures/valid-basic.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const list = filterModel(result.model, "booking-context");
  assert.equal(list.viewName, "booking-context");
  assert.deepEqual(
    list.elements.map((element) => element.id),
    ["shipper", "booking", "order", "rates"],
  );
  assert.equal(list.relationships.length, 4);
  assert.equal(list.views.length, 1);
});

test("selecting applicationStructure applies type includes and relationship exclude", () => {
  const result = loadPleinSource(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(
    result.list.elements.map((element) => element.id),
    ["tms", "bookingApi", "shipment", "customsGateway", "legacyBatch"],
  );

  const list = filterModel(result.model, "applicationStructure");
  assert.equal(list.viewName, "applicationStructure");
  assert.deepEqual(
    list.elements.map((element) => element.id),
    ["tms", "bookingApi", "shipment", "customsGateway", "legacyBatch"],
  );
  assert.deepEqual(
    list.relationships.map((rel) => `${rel.source}->${rel.target}:${rel.type}`),
    [
      "tms->bookingApi:serves",
      "bookingApi->shipment:accesses",
      "customsGateway->shipment:accesses",
    ],
  );
  assert.equal(
    list.relationships.some((rel) => rel.target === "legacyBatch"),
    false,
  );
});

test("selecting booking-context on basic.plein filters elements and implied relationships", () => {
  const result = loadPleinSource(readFixture("basic.plein"), "fixtures/basic.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const all = result.list;
  assert.equal(all.elements.length, 15);
  assert.equal(all.relationships.length, 16);

  const list = filterModel(result.model, "booking-context");
  assert.deepEqual(
    list.elements.map((element) => element.id),
    ["shipper", "booking", "order", "rates", "cloud"],
  );
  assert.deepEqual(
    list.relationships.map((rel) => `${rel.source}->${rel.target}:${rel.type}`),
    [
      "shipper->booking:serves",
      "booking->order:accesses",
      "rates->booking:realizes",
      "cloud->rates:aggregates",
    ],
  );
});

test("exclude wins over include for membership", () => {
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
  }
}
`;
  const result = loadPleinSource(source, "exclude-wins.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const list = filterModel(result.model, "context");
  assert.deepEqual(
    list.elements.map((element) => element.id),
    ["shipper", "booking"],
  );
  assert.deepEqual(
    list.relationships.map((rel) => `${rel.source}->${rel.target}`),
    ["shipper->booking"],
  );
});

test("malformed-views.plein surfaces the same class of diagnostic as plein check", () => {
  const result = loadPleinSource(
    readFixture("malformed-views.plein"),
    "fixtures/malformed-views.plein",
  );
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.match(result.error, /fixtures\/malformed-views\.plein:\d+:\d+:/);
  assert.match(result.error, /viewpoint keyword/i);
});

test("broken-syntax.plein surfaces a line-oriented ParseError", () => {
  const result = loadPleinSource(
    readFixture("broken-syntax.plein"),
    "fixtures/broken-syntax.plein",
  );
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.match(result.error, /fixtures\/broken-syntax\.plein:\d+:\d+:/);
});
