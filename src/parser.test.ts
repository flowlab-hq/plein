import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { languageReferenceElementKeywords, resolveElementKeyword } from "./keywords.js";
import { checkPlein, ParseError, parsePlein } from "./parser.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

test("checkPlein loads view name, title, and include list from valid-basic.plein", () => {
  const model = checkPlein(readFixture("valid-basic.plein"), "fixtures/valid-basic.plein");
  assert.equal(model.views.length, 1);
  const view = model.views[0]!;
  assert.equal(view.name, "booking-context");
  assert.equal(view.title, "Booking context");
  assert.equal(view.viewpoint, undefined);
  assert.deepEqual(view.includes, ["shipper", "booking", "order", "rates"]);
  assert.deepEqual(view.excludes, []);
});

test("checkPlein loads viewpoint include/exclude from valid-views.plein", () => {
  const model = checkPlein(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(model.views.length, 2);
  const view = model.views[0]!;
  assert.equal(view.name, "applicationStructure");
  assert.equal(view.viewpoint, "applicationStructure");
  assert.equal(view.title, "Application Structure");
  assert.deepEqual(view.includes, [
    "applicationComponent",
    "applicationInterface",
    "dataObject",
    "tms",
    "customsGateway",
  ]);
  assert.deepEqual(view.excludes, ["* -> legacyBatch"]);
  assert.equal(view.autoLayout, "lr");
  const cooperation = model.views[1]!;
  assert.equal(cooperation.name, "applicationCooperation");
  assert.equal(cooperation.viewpoint, "applicationCooperation");
  assert.equal(cooperation.title, "Application Cooperation");
  assert.deepEqual(cooperation.includes, ["tms", "bookingApi"]);
  assert.equal(cooperation.autoLayout, "lr");
  assert.equal(view.nesting, undefined);
  assert.equal(cooperation.nesting, undefined);
});

test("value-stream-demo opts into nested composition via the view directive", () => {
  const model = checkPlein(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(model.views[0]!.nesting, "nested");
  assert.equal(model.views[0]!.autoLayout, "lr");
});

test("autoLayout accepts tb, bt, lr, rl and existing shorthand", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view topDown {
    include shipper
    autoLayout tb
  }
  view bottomUp {
    include shipper
    autoLayout bt
  }
  view leftRight {
    include shipper
    autoLayout left-right
  }
  view rightLeft {
    include shipper
    autoLayout rl
  }
}
`;
  const model = checkPlein(source, "directions.plein");
  assert.deepEqual(
    model.views.map((view) => view.autoLayout),
    ["tb", "bt", "left-right", "rl"],
  );
});

test("unknown autoLayout direction is a line diagnostic", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout sideways
  }
}
`;
  assert.throws(
    () => checkPlein(source, "bad-direction.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /bad-direction\.plein:\d+:\d+: unknown autoLayout token 'sideways'/);
      return true;
    },
  );
});

test("bare autoLayout clause means tb", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout
  }
}
`;
  const model = checkPlein(source, "bare-autolayout.plein");
  assert.equal(model.views[0]!.autoLayout, "tb");
});

test("autoLayout layers accepts an optional direction in either order", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view bands {
    include shipper
    autoLayout layers
  }
  view bandsRight {
    include shipper
    autoLayout layers lr
  }
  view rightBands {
    include shipper
    autoLayout left-right layers
  }
  view explicit {
    include shipper
    autoLayout layered tb
  }
}
`;
  const model = checkPlein(source, "layer-bands.plein");
  assert.deepEqual(
    model.views.map((view) => view.autoLayout),
    ["layers", "layers lr", "left-right layers", "layered tb"],
  );
});

test("autoLayout organic and grid accept direction, routing, and grid order", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view landscape {
    include shipper
    autoLayout organic
  }
  view landscapeRight {
    include shipper
    autoLayout organic lr polyline
  }
  view catalogue {
    include shipper
    autoLayout grid
  }
  view catalogueByName {
    include shipper
    autoLayout name grid lr
  }
  view catalogueExplicit {
    include shipper
    autoLayout grid kind orthogonal
  }
  view stillLayered {
    include shipper
    autoLayout tb
  }
}
`;
  const model = checkPlein(source, "organic-grid.plein");
  assert.deepEqual(
    model.views.map((view) => view.autoLayout),
    ["organic", "organic lr polyline", "grid", "name grid lr", "grid kind orthogonal", "tb"],
  );
});

test("grid order without grid, and a second mode, are line diagnostics", () => {
  const orderOnly = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout name
  }
}
`;
  assert.throws(
    () => checkPlein(orderOnly, "grid-order.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /grid order 'name' requires autoLayout grid/);
      return true;
    },
  );

  const duplicate = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout organic layers
  }
}
`;
  assert.throws(
    () => checkPlein(duplicate, "duplicate-mode.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /duplicate autoLayout mode 'layers'/);
      return true;
    },
  );
});

test("autoLayout accepts orthogonal and polyline with direction and layers", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view rightAngle {
    include shipper
    autoLayout lr orthogonal
  }
  view bandsPolyline {
    include shipper
    autoLayout layers polyline
  }
  view polyFirst {
    include shipper
    autoLayout poly-line bt layers
  }
  view alias {
    include shipper
    autoLayout right-angle
  }
}
`;
  const model = checkPlein(source, "edge-routing.plein");
  assert.deepEqual(
    model.views.map((view) => view.autoLayout),
    ["lr orthogonal", "layers polyline", "poly-line bt layers", "right-angle"],
  );
});

test("duplicate or extra autoLayout routing is a line diagnostic", () => {
  const duplicate = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout orthogonal polyline
  }
}
`;
  assert.throws(
    () => checkPlein(duplicate, "duplicate-routing.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /duplicate autoLayout routing 'polyline'/);
      return true;
    },
  );

  const extra = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout layers lr orthogonal kind extra
  }
}
`;
  assert.throws(
    () => checkPlein(extra, "extra-routing.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /too many autoLayout tokens 'extra'/);
      return true;
    },
  );
});

test("unknown nesting mode is a line diagnostic", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    nesting sideways
  }
}
`;
  assert.throws(
    () => checkPlein(source, "bad-nesting.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /bad-nesting\.plein:\d+:\d+: unknown nesting mode 'sideways'/);
      return true;
    },
  );
});

test("bare nesting clause means nested", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    nesting
  }
}
`;
  const model = checkPlein(source, "bare-nesting.plein");
  assert.equal(model.views[0]!.nesting, "nested");
});

test("checkPlein still loads views from fixtures/basic.plein", () => {
  const model = checkPlein(readFixture("basic.plein"), "fixtures/basic.plein");
  assert.equal(model.elements.length, 15);
  assert.equal(model.relationships.length, 16);
  assert.equal(model.views.length, 1);
  assert.equal(model.views[0]!.name, "booking-context");
  assert.deepEqual(model.views[0]!.includes, ["shipper", "booking", "order", "rates", "cloud"]);
});

test("malformed viewpoint is a line/column ParseError", () => {
  assert.throws(
    () => checkPlein(readFixture("malformed-views.plein"), "fixtures/malformed-views.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /fixtures\/malformed-views\.plein:\d+:\d+: expected viewpoint keyword/);
      assert.ok(error.line >= 1);
      assert.ok(error.column >= 1);
      return true;
    },
  );
});

test("include without selectors is a diagnostic", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view empty-include {
    include
  }
}
`;
  assert.throws(
    () => checkPlein(source, "empty-include.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /empty-include\.plein:\d+:\d+: expected selector after include/);
      return true;
    },
  );
});

test("unknown include identifier is a diagnostic", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view booking-context {
    include shipper missingActor
  }
}
`;
  assert.throws(
    () => checkPlein(source, "unknown-include.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /unknown identifier 'missingActor' in view 'booking-context'/);
      return true;
    },
  );
});

test("duplicate view names are a diagnostic", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view booking-context {
    include shipper
  }
  view booking-context {
    include shipper
  }
}
`;
  assert.throws(
    () => checkPlein(source, "dup-view.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /duplicate view name 'booking-context'/);
      return true;
    },
  );
});

test("parsePlein keeps styles skipped and views structured", () => {
  const model = parsePlein(readFixture("basic.plein"), "fixtures/basic.plein");
  assert.equal(model.views[0]!.title, "NordFreight booking context");
});

type GoldenValueStreamStages = {
  file: string;
  valueStream: string;
  stages: string[];
  edges: string[];
};

type GoldenCatalogueLayer = {
  layer: string;
  id: string;
  keyword: string;
  spelling: string;
};

type GoldenCatalogueLayers = {
  file: string;
  choice: string;
  layers: GoldenCatalogueLayer[];
};

function readGoldenValueStreamStages(): GoldenValueStreamStages {
  return JSON.parse(readFixture("golden-value-stream-stages.json")) as GoldenValueStreamStages;
}

function readGoldenCatalogueLayers(): GoldenCatalogueLayers {
  return JSON.parse(readFixture("golden-catalogue-layers.json")) as GoldenCatalogueLayers;
}

function relationshipKey(rel: { source: string; target: string; type: string }): string {
  return `${rel.source}->${rel.target}:${rel.type}`;
}

test("golden fixture parses one value stream with chained stages", () => {
  const golden = readGoldenValueStreamStages();
  const model = checkPlein(readFixture("valid-value-stream-stages.plein"), golden.file);
  const parent = model.elements.find((element) => element.id === golden.valueStream);
  assert.ok(parent);
  assert.equal(parent.keyword, "valueStream");
  assert.deepEqual(
    model.elements.filter((element) => element.id !== golden.valueStream).map((element) => element.id),
    golden.stages,
  );
  assert.ok(model.elements.every((element) => element.keyword === "valueStream"));
  assert.deepEqual(model.relationships.map(relationshipKey), golden.edges);
  assert.equal(model.views[0]!.name, "order-to-cash");
});

test("valueStream body accepts camelCase stages linked with flowsTo and triggers", () => {
  const source = `model {
  valueStream "Quote to cash" as qtc {
    valueStreamStage "Quote" as quote
    valueStreamStage "Book" as book
    valueStreamStage "Invoice" as invoice
    quote flowsTo book
    book triggers invoice
  }
}
`;
  const model = checkPlein(source, "camel-stages.plein");
  assert.deepEqual(
    model.elements.map((element) => `${element.keyword}:${element.id}`),
    ["valueStream:qtc", "valueStream:quote", "valueStream:book", "valueStream:invoice"],
  );
  assert.deepEqual(model.relationships.map(relationshipKey), [
    "qtc->quote:composedOf",
    "qtc->book:composedOf",
    "qtc->invoice:composedOf",
    "quote->book:flowsTo",
    "book->invoice:triggers",
  ]);
});

test("valueStream without a body still parses as a strategy element", () => {
  const source = `model {
  value-stream "Network planning" as planning
}
`;
  const model = checkPlein(source, "bare-value-stream.plein");
  assert.equal(model.elements.length, 1);
  assert.equal(model.elements[0]!.keyword, "valueStream");
  assert.equal(model.relationships.length, 0);
});

test("top-level valueStreamStage is invalid nesting with a line diagnostic", () => {
  assert.throws(
    () => checkPlein(readFixture("invalid-value-stream-nesting.plein"), "fixtures/invalid-value-stream-nesting.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(
        error.message,
        /fixtures\/invalid-value-stream-nesting\.plein:\d+:\d+: valueStreamStage must be nested inside a valueStream/,
      );
      assert.ok(error.line >= 1);
      assert.ok(error.column >= 1);
      return true;
    },
  );
});

test("nested body on a valueStreamStage is invalid nesting with a line diagnostic", () => {
  const source = `model {
  valueStream "Order to cash" as orderToCash {
    valueStreamStage "Capture demand" as capture {
      valueStreamStage "Nested" as nested
    }
  }
}
`;
  assert.throws(
    () => checkPlein(source, "nested-stage.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /nested-stage\.plein:\d+:\d+: valueStreamStage cannot nest a body/);
      assert.ok(error.line >= 1);
      return true;
    },
  );
});

test("unknown step keyword inside valueStream is a line diagnostic", () => {
  assert.throws(
    () => checkPlein(readFixture("unknown-value-stream-step.plein"), "fixtures/unknown-value-stream-step.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(
        error.message,
        /fixtures\/unknown-value-stream-step\.plein:\d+:\d+: unknown step keyword 'process'/,
      );
      assert.ok(error.line >= 1);
      return true;
    },
  );
});

test("golden fixture covers one language-reference element per ArchiMate layer", () => {
  const golden = readGoldenCatalogueLayers();
  const langRef = new Set(languageReferenceElementKeywords());
  const model = checkPlein(readFixture("valid-catalogue-layers.plein"), golden.file);

  assert.match(golden.choice, /per-layer sample/i);
  assert.deepEqual(
    golden.layers.map((entry) => entry.layer),
    [
      "Strategy",
      "Motivation",
      "Business",
      "Application",
      "Technology",
      "Physical",
      "Implementation and migration",
    ],
  );
  assert.equal(model.elements.length, golden.layers.length);
  assert.equal(model.views[0]!.name, "catalogue-layers");

  const byId = new Map(model.elements.map((element) => [element.id, element]));
  for (const entry of golden.layers) {
    const element = byId.get(entry.id);
    assert.ok(element, `missing element '${entry.id}' for ${entry.layer}`);
    assert.equal(element.keyword, entry.keyword, entry.layer);
    assert.equal(resolveElementKeyword(entry.spelling), entry.keyword, entry.spelling);
    assert.ok(langRef.has(entry.spelling), `golden spelling '${entry.spelling}' is not in the language-reference catalogue`);
  }
});

test("unknown element type is a line diagnostic", () => {
  assert.throws(
    () => checkPlein(readFixture("unknown-keyword.plein"), "fixtures/unknown-keyword.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(
        error.message,
        /fixtures\/unknown-keyword\.plein:\d+:\d+: unknown keyword 'legacyBatch'/,
      );
      assert.ok(error.line >= 1);
      assert.ok(error.column >= 1);
      return true;
    },
  );
});

test("non-flow relationship inside a valueStream body is a diagnostic", () => {
  const source = `model {
  valueStream "Order to cash" as orderToCash {
    valueStreamStage "Capture" as capture
    valueStreamStage "Fulfill" as fulfill
    capture serves fulfill
  }
}
`;
  assert.throws(
    () => checkPlein(source, "stage-serves.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(
        error.message,
        /stage-serves\.plein:\d+:\d+: value stream stages may only use flowsTo or triggers \(got 'serves'\)/,
      );
      return true;
    },
  );
});
