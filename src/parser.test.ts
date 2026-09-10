import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

function readGoldenValueStreamStages(): GoldenValueStreamStages {
  return JSON.parse(readFixture("golden-value-stream-stages.json")) as GoldenValueStreamStages;
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
