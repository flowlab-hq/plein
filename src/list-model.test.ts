import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  filterModel,
  firstNamedView,
  formatLoadError,
  loadPleinSource,
  viewAfterReload,
} from "./list-model.js";
import { ParseError } from "./parser.js";

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
  assert.equal(viewAfterReload(result.model, "booking-context"), "booking-context");
  assert.equal(viewAfterReload(result.model, null), null);
  assert.equal(viewAfterReload(result.model, "removed-view"), "booking-context");
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
  assert.deepEqual(
    list.views.map((view) => view.name),
    ["applicationStructure", "applicationCooperation"],
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

test("loadPleinSource succeeds on fixtures/samples/value-stream-demo.plein", () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) {
    return;
  }
  assert.equal(firstNamedView(result.model), "strategy");
  assert.equal(result.model.elements.length, 8);
  assert.equal(result.model.relationships.length, 9);
  const keywords = new Map(result.model.elements.map((element) => [element.id, element.keyword]));
  assert.equal(keywords.get("quoteToCash"), "valueStream");
  assert.equal(keywords.get("quote"), "valueStream");
  assert.equal(keywords.get("book"), "valueStream");
  assert.equal(keywords.get("rateQuote"), "capability");
  assert.equal(keywords.get("orderExecution"), "capability");
  assert.equal(keywords.get("rateEngine"), "applicationComponent");
  assert.equal(keywords.get("tms"), "applicationComponent");
  const edges = new Set(
    result.model.relationships.map((rel) => `${rel.source}->${rel.target}:${rel.type}`),
  );
  assert.ok(edges.has("quote->book:flowsTo"));
  assert.ok(edges.has("book->collect:triggers"));
  assert.ok(edges.has("rateEngine->rateQuote:realizes"));
  assert.ok(edges.has("tms->orderExecution:realizes"));
  assert.ok(edges.has("rateQuote->quote:serves"));
  assert.ok(edges.has("orderExecution->book:serves"));
});

test("loadPleinSource succeeds on fixtures/samples/research-data.plein", () => {
  const result = loadPleinSource(
    readFixture("samples/research-data.plein"),
    "fixtures/samples/research-data.plein",
  );
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) {
    return;
  }
  assert.equal(firstNamedView(result.model), "researchDataLandscape");
  assert.equal(result.model.elements.length, 12);
  assert.equal(result.model.relationships.length, 11);
  assert.equal(result.model.views.length, 3);
  const keywords = new Map(result.model.elements.map((element) => [element.id, element.keyword]));
  assert.equal(keywords.get("generalPublic"), "businessActor");
  assert.equal(keywords.get("findPublishedResearch"), "businessProcess");
  assert.equal(keywords.get("requestAccess"), "businessProcess");
  assert.equal(keywords.get("researchProject"), "applicationComponent");
  assert.equal(keywords.get("researchPaper"), "dataObject");
  assert.equal(keywords.get("researchDataConcept"), "dataObject");
  assert.equal(keywords.get("eprints"), "applicationComponent");
  assert.equal(keywords.get("researchDataArtifact"), "artifact");
  assert.equal(keywords.get("fileStorage"), "technologyService");
  assert.equal(keywords.get("archive"), "technologyService");
  assert.equal(keywords.get("researchStoragePlatform"), "node");
  assert.equal(keywords.get("arkivum"), "systemSoftware");
  const edges = new Set(
    result.model.relationships.map((rel) => `${rel.source}->${rel.target}:${rel.type}`),
  );
  assert.ok(edges.has("generalPublic->findPublishedResearch:triggers"));
  assert.ok(edges.has("findPublishedResearch->requestAccess:triggers"));
  assert.ok(edges.has("researchProject->researchPaper:aggregates"));
  assert.ok(edges.has("researchProject->researchDataConcept:aggregates"));
  assert.ok(edges.has("eprints->researchPaper:associatedWith"));
  assert.ok(edges.has("researchDataArtifact->researchDataConcept:realizes"));
  assert.ok(edges.has("requestAccess->researchDataArtifact:associatedWith"));
  assert.ok(edges.has("arkivum->archive:realizes"));
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

test("formatLoadError keeps ParseError text and stringifies Open/read failures", () => {
  const parse = new ParseError("expected '}' to close plein", "fixtures/broken-syntax.plein", 21, 1);
  assert.equal(
    formatLoadError(parse),
    "fixtures/broken-syntax.plein:21:1: expected '}' to close plein",
  );
  assert.equal(formatLoadError("No such file or directory"), "No such file or directory");
});

test("Mac Open broken fixtures surface the same file:line:column class as plein check", () => {
  const fixtures = [
    { name: "unknown-keyword.plein", message: /unknown keyword/i },
    { name: "invalid-value-stream-nesting.plein", message: /valueStreamStage must be nested/ },
    { name: "unknown-value-stream-step.plein", message: /unknown step keyword/i },
  ];
  for (const fixture of fixtures) {
    const file = `fixtures/${fixture.name}`;
    const result = loadPleinSource(readFixture(fixture.name), file);
    assert.equal(result.ok, false, file);
    if (result.ok) {
      continue;
    }
    assert.match(result.error, new RegExp(`${file.replaceAll(".", "\\.")}:\\d+:\\d+:`));
    assert.match(result.error, fixture.message);
  }
});
