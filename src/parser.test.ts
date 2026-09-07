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
  assert.equal(model.views.length, 1);
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
