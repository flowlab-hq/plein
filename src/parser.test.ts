import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { formatPleinSource } from "./format.js";
import { languageReferenceElementKeywords, resolveElementKeyword } from "./keywords.js";
import { ACCESS_TYPES, checkPlein, INFLUENCE_MODIFIERS, ParseError, parsePlein } from "./parser.js";

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

test("autoLayout off and manual keep position clauses", () => {
  const source = `model {
  business-actor "Shipper" as shipper
  business-service "Booking" as booking
}
views {
  view story {
    include shipper booking
    autoLayout off
    position shipper 40 240
    position booking 280.5 40
  }
  view alias {
    include shipper
    autoLayout manual
    position shipper 12 18
  }
}
`;
  const model = checkPlein(source, "manual-layout.plein");
  assert.equal(model.views[0]!.autoLayout, "off");
  assert.deepEqual(
    model.views[0]!.positions?.map((position) => [position.id, position.x, position.y]),
    [
      ["shipper", 40, 240],
      ["booking", 280.5, 40],
    ],
  );
  assert.equal(model.views[1]!.autoLayout, "manual");
  assert.equal(model.views[1]!.positions?.[0]?.x, 12);
});

test("autoLayout off cannot be combined, and positions must be known", () => {
  const combined = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout off lr
  }
}
`;
  assert.throws(
    () => checkPlein(combined, "off-combined.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /autoLayout off cannot be combined with 'lr'/);
      return true;
    },
  );

  const duplicate = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout off
    position shipper 1 2
    position shipper 3 4
  }
}
`;
  assert.throws(
    () => checkPlein(duplicate, "duplicate-position.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /duplicate position for 'shipper'/);
      return true;
    },
  );

  const unknown = `model {
  business-actor "Shipper" as shipper
}
views {
  view context {
    include shipper
    autoLayout off
    position missing 10 20
  }
}
`;
  assert.throws(
    () => checkPlein(unknown, "unknown-position.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /unknown-position\.plein:\d+:\d+: unknown identifier 'missing'/);
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

test("size clauses store width and height and reject a bad id or span", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view story {
    include shipper
    autoLayout off
    position shipper 48 72
    // wider than the label
    size shipper 216 80
  }
}
`;
  const model = checkPlein(source, "sized.plein");
  assert.deepEqual(
    model.views[0]!.sizes?.map((size) => [size.id, size.width, size.height]),
    [["shipper", 216, 80]],
  );
  assert.equal(model.views[0]!.sizes?.[0]?.leadingComments?.[0], "wider than the label");

  const duplicate = source.replace("size shipper 216 80", "size shipper 216 80\n    size shipper 100 40");
  assert.throws(
    () => checkPlein(duplicate, "duplicate-size.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /duplicate size for 'shipper'/);
      return true;
    },
  );

  const unknown = source.replace("size shipper 216 80", "size missing 100 40");
  assert.throws(
    () => checkPlein(unknown, "unknown-size.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /unknown identifier 'missing'/);
      return true;
    },
  );

  const flat = source.replace("size shipper 216 80", "size shipper 0 40");
  assert.throws(
    () => checkPlein(flat, "flat-size.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /size width and height must be positive/);
      return true;
    },
  );

  assert.throws(
    () =>
      checkPlein(
        `model {\n  specialization size specializes business-actor\n}\n`,
        "reserved-size.plein",
      ),
    /specialization name 'size' is reserved/,
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

const MODIFIER_MODEL = `model {
  business-service "Booking service" as booking
  business-object "Freight order" as order
  business-object "Contract" as contract
  business-object "Representation" as representation
  data-object "Rate card" as card
  assessment "Late risk" as risk
  goal "On-time delivery" as onTime
  goal "Strong effect" as strong
  goal "Scored" as scored
  business-actor "Modifier" as modifier
`;

test("plein check accepts every access type and influence strength", () => {
  const lines = [
    `booking -> order: access accessType Write`,
    `booking -> contract: access accessType Read`,
    `booking -> representation: access accessType ReadWrite`,
    `booking -> card: access accessType Access`,
  ];
  for (const modifier of INFLUENCE_MODIFIERS) {
    const target = modifier === "-" ? "onTime" : modifier === "++" ? "strong" : "scored";
    if (modifier !== "-" && modifier !== "++" && modifier !== "10") {
      continue;
    }
    lines.push(`risk -> ${target}: influence modifier "${modifier}"`);
  }
  const model = checkPlein(`${MODIFIER_MODEL}\n  ${lines.join("\n  ")}\n}\n`, "modifiers.plein");
  assert.deepEqual(
    model.relationships.filter((relationship) => relationship.type === "accesses").map((relationship) => relationship.accessType),
    ["Write", "Read", "ReadWrite", "Access"],
  );
  assert.deepEqual(
    ACCESS_TYPES.map((accessType) => accessType),
    ["Access", "Read", "Write", "ReadWrite"],
  );
  for (const modifier of INFLUENCE_MODIFIERS) {
    const source = `${MODIFIER_MODEL}
  risk -> onTime: influence modifier "${modifier}"
}
`;
    const checked = checkPlein(source, "strength.plein");
    assert.equal(checked.relationships[0]?.modifier, modifier);
  }
});

test("unquoted influence strengths parse and format to a quoted modifier", () => {
  const source = `${MODIFIER_MODEL}
  risk -> onTime: influence modifier -
  risk -> strong: influence modifier ++
  risk -> scored: influence modifier 10
  booking -> order: access accessType Write
}
`;
  const model = checkPlein(source, "unquoted.plein");
  assert.equal(model.relationships[0]?.modifier, "-");
  assert.equal(model.relationships[1]?.modifier, "++");
  assert.equal(model.relationships[2]?.modifier, "10");
  const formatted = formatPleinSource(source, "unquoted.plein");
  assert.match(formatted, /risk -> onTime: influence modifier "-"/);
  assert.match(formatted, /risk -> strong: influence modifier "\+\+"/);
  assert.match(formatted, /risk -> scored: influence modifier "10"/);
  assert.match(formatted, /booking -> order: access accessType Write/);
  assert.equal(formatPleinSource(formatted, "unquoted.plein"), formatted);
});

test("plein check rejects an unknown access type and an unknown influence modifier", () => {
  assert.throws(
    () =>
      checkPlein(
        `${MODIFIER_MODEL}\n  booking -> order: access accessType Delete\n}\n`,
        "bad-access.plein",
      ),
    /bad-access\.plein:\d+:\d+: unknown access type 'Delete' \(expected Access, Read, Write, or ReadWrite\)/,
  );
  assert.throws(
    () =>
      checkPlein(
        `${MODIFIER_MODEL}\n  risk -> onTime: influence modifier "high"\n}\n`,
        "bad-influence.plein",
      ),
    /bad-influence\.plein:\d+:\d+: unknown influence modifier 'high' \(expected \+, \+\+, -, --, or 0 through 10\)/,
  );
  assert.throws(
    () =>
      checkPlein(
        `${MODIFIER_MODEL}\n  booking -> order: serving accessType Write\n}\n`,
        "serving-access.plein",
      ),
    /accessType is only valid on an access relationship/,
  );
  assert.throws(
    () =>
      checkPlein(
        `${MODIFIER_MODEL}\n  booking -> order: access modifier "-"\n}\n`,
        "access-modifier.plein",
      ),
    /modifier is only valid on an influence relationship/,
  );
});

test("accessType and modifier stay relationship sources when they are not clauses", () => {
  const source = `${MODIFIER_MODEL}
  booking -> order: access
  modifier -> booking: association
  accessType -> booking: serving
}
`;
  const model = checkPlein(
    source.replace(
      "business-actor \"Modifier\" as modifier",
      "business-actor \"Modifier\" as modifier\n  business-actor \"Access type\" as accessType",
    ),
    "sources.plein",
  );
  const access = model.relationships.find((relationship) => relationship.source === "booking");
  assert.equal(access?.accessType, undefined);
  assert.equal(access?.modifier, undefined);
  assert.equal(
    model.relationships.some((relationship) => relationship.source === "modifier" && relationship.type === "associatedWith"),
    true,
  );
  assert.equal(
    model.relationships.some((relationship) => relationship.source === "accessType" && relationship.type === "serves"),
    true,
  );
});

const MULTIPLICITY_MODEL = `model {
  business-actor "Shipper" as shipper
  business-role "Booking clerk" as clerk
  business-object "Freight order" as order
  business-service "Booking service" as booking
`;

test("a relationship multiplicity is optional and formats to a quoted clause", () => {
  const source = `${MULTIPLICITY_MODEL}
  shipper -> clerk: association multiplicity "1..*"
  shipper -> order: association
  shipper association clerk multiplicity 0..1
  shipper -> booking: serving multiplicity *
  shipper -> order: access multiplicity 1
}
`;
  const model = checkPlein(source, "multiplicity.plein");
  assert.equal(model.relationships[0]?.multiplicity, "1..*");
  assert.equal(model.relationships[1]?.multiplicity, undefined);
  assert.equal(model.relationships[2]?.multiplicity, "0..1");
  assert.equal(model.relationships[3]?.multiplicity, "*");
  assert.equal(model.relationships[4]?.multiplicity, "1");
  assert.equal(model.relationships[1]?.type, "associatedWith");

  const formatted = formatPleinSource(source, "multiplicity.plein");
  assert.match(formatted, /shipper -> clerk: association multiplicity "1\.\.\*"/);
  assert.match(formatted, /shipper -> order: association\n/);
  assert.match(formatted, /shipper -> clerk: association multiplicity "0\.\.1"/);
  assert.match(formatted, /shipper -> booking: serving multiplicity "\*"/);
  assert.match(formatted, /shipper -> order: access multiplicity "1"/);
  assert.doesNotMatch(formatted, /multiplicity 1\b|multiplicity \*|multiplicity 0\.\.1/);

  const plain = checkPlein(readFixture("valid-basic.plein"), "fixtures/valid-basic.plein");
  assert.equal(plain.relationships.every((relationship) => relationship.multiplicity === undefined), true);
});

test("plein check rejects a multiplicity that is not a bound or a range", () => {
  assert.throws(
    () =>
      checkPlein(
        `${MULTIPLICITY_MODEL}\n  shipper -> clerk: association multiplicity "many"\n}\n`,
        "bad-multiplicity.plein",
      ),
    /bad-multiplicity\.plein:\d+:\d+: unknown multiplicity 'many' \(expected \*, a whole number, or a range such as 0\.\.1 or 1\.\.\*\)/,
  );
  assert.throws(
    () =>
      checkPlein(
        `${MULTIPLICITY_MODEL}\n  shipper -> clerk: association multiplicity 2..1\n}\n`,
        "reversed-multiplicity.plein",
      ),
    /unknown multiplicity '2\.\.1'/,
  );
  assert.throws(
    () =>
      checkPlein(
        `${MULTIPLICITY_MODEL}\n  shipper -> clerk: association multiplicity "01"\n}\n`,
        "leading-zero.plein",
      ),
    /unknown multiplicity '01'/,
  );
  assert.throws(
    () =>
      checkPlein(
        `${MULTIPLICITY_MODEL}\n  shipper -> clerk: association multiplicity "1" multiplicity "*"\n}\n`,
        "duplicate-multiplicity.plein",
      ),
    /duplicate multiplicity clause/,
  );
  assert.throws(
    () =>
      checkPlein(
        `${MULTIPLICITY_MODEL}\n  shipper -> clerk: association multiplicity\n}\n`,
        "bare-multiplicity.plein",
      ),
    /expected a multiplicity after 'multiplicity'/,
  );
});

test("multiplicity stays a relationship source or an element keyword when it is not a clause", () => {
  const source = `${MULTIPLICITY_MODEL}
  multiplicity -> clerk: association
  shipper -> clerk: association
}
`;
  const model = checkPlein(
    source.replace(
      "business-actor \"Shipper\" as shipper",
      "business-actor \"Shipper\" as shipper\n  business-actor \"Multiplicity\" as multiplicity",
    ),
    "multiplicity-source.plein",
  );
  const typed = model.relationships.find((relationship) => relationship.source === "shipper");
  assert.equal(typed?.multiplicity, undefined);
  assert.equal(
    model.relationships.some(
      (relationship) => relationship.source === "multiplicity" && relationship.type === "associatedWith",
    ),
    true,
  );
  assert.throws(
    () =>
      checkPlein(
        `${MULTIPLICITY_MODEL}\n  shipper -> clerk: association\n  multiplicity "Desk" as desk\n}\n`,
        "multiplicity-element.plein",
      ),
    /unknown keyword 'multiplicity' \(undeclared specialization\)/,
  );
});
