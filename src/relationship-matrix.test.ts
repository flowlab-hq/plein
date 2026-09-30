import assert from "node:assert/strict";
import { test } from "node:test";

import { ELEMENT_KEYWORDS, type ElementKeyword, type RelationshipKeyword } from "./keywords.js";
import { checkPlein, ParseError } from "./parser.js";
import {
  invalidRelationshipMessage,
  isRelationshipAllowed,
  RELATIONSHIP_MATRIX,
} from "./relationship-matrix.js";

const VALID_PAIRS: Array<[ElementKeyword, RelationshipKeyword, ElementKeyword, string]> = [
  ["capability", "serves", "valueStream", "strategy"],
  ["applicationComponent", "realizes", "capability", "application to strategy"],
  ["valueStream", "flowsTo", "valueStream", "strategy"],
  ["businessActor", "assignedTo", "businessProcess", "business"],
  ["businessService", "accesses", "businessObject", "business"],
  ["node", "serves", "applicationComponent", "technology to application"],
  ["assessment", "influences", "goal", "motivation"],
  ["workPackage", "realizes", "capability", "implementation to strategy"],
];

const INVALID_PAIRS: Array<[ElementKeyword, RelationshipKeyword, ElementKeyword, string]> = [
  ["applicationComponent", "realizes", "businessObject", "application to business"],
  ["businessActor", "composedOf", "applicationComponent", "business to application"],
  ["goal", "flowsTo", "businessObject", "motivation to business"],
  ["node", "assignedTo", "businessObject", "technology to business"],
  ["artifact", "serves", "applicationComponent", "technology to application"],
  ["capability", "realizes", "businessProcess", "strategy to business"],
  ["valueStream", "composedOf", "businessProcess", "strategy to business"],
];

test("the matrix has a cell for every catalogue pair", () => {
  assert.equal(Object.keys(RELATIONSHIP_MATRIX).length, ELEMENT_KEYWORDS.length);
  for (const source of ELEMENT_KEYWORDS) {
    const row = RELATIONSHIP_MATRIX[source];
    assert.ok(row, source);
    assert.equal(Object.keys(row).length, ELEMENT_KEYWORDS.length, source);
    for (const target of ELEMENT_KEYWORDS) {
      assert.ok(row[target] && row[target].length > 0, `${source} -> ${target}`);
    }
  }
});

test("allowed matrix pairs across layers pass", () => {
  const layers = new Set(VALID_PAIRS.map((pair) => pair[3]));
  assert.ok(layers.size >= 5, [...layers].join(", "));
  assert.ok(VALID_PAIRS.length >= 5);
  for (const [source, relationship, target] of VALID_PAIRS) {
    assert.equal(
      isRelationshipAllowed(source, relationship, target),
      true,
      invalidRelationshipMessage(source, relationship, target),
    );
  }
});

test("disallowed matrix pairs across layers fail", () => {
  const layers = new Set(INVALID_PAIRS.map((pair) => pair[3]));
  assert.ok(layers.size >= 5, [...layers].join(", "));
  assert.ok(INVALID_PAIRS.length >= 5);
  for (const [source, relationship, target] of INVALID_PAIRS) {
    assert.equal(isRelationshipAllowed(source, relationship, target), false, `${source} ${relationship} ${target}`);
  }
});

test("capability serves a value-stream stage, an application realizes a capability, and stages flow", () => {
  const model = checkPlein(
    `model {
  capability "Rate and quote" as rateQuote
  value-stream "Quote to cash" as quoteToCash {
    value-stream-stage "Quote" as quote
    value-stream-stage "Book" as book
    quote -> book: flow
  }
  application-component "Rate engine" as rateEngine
  rateQuote -> quote: serving
  rateEngine -> rateQuote: realization
}
`,
    "matrix-samples.plein",
  );
  assert.equal(
    model.relationships.some(
      (rel) => rel.source === "rateQuote" && rel.target === "quote" && rel.type === "serves",
    ),
    true,
  );
  assert.equal(
    model.relationships.some(
      (rel) => rel.source === "rateEngine" && rel.target === "rateQuote" && rel.type === "realizes",
    ),
    true,
  );
  assert.equal(
    model.relationships.some(
      (rel) => rel.source === "quote" && rel.target === "book" && rel.type === "flowsTo",
    ),
    true,
  );
});

test("an invalid pair fails check with a line and the source, relationship, and target", () => {
  assert.throws(
    () =>
      checkPlein(
        `model {
  application-component "Rate engine" as rates
  business-object "Freight order" as order
  rates -> order: realization
}
`,
        "invalid-pair.plein",
      ),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.equal(
        error.message,
        "invalid-pair.plein:4:3: invalid relationship 'realization' from 'application-component' to 'business-object'",
      );
      return true;
    },
  );
});

test("a specialization is checked as its catalogue type", () => {
  const model = checkPlein(
    `model {
  specialization customer specializes business-actor
  customer "Acme" as acme
  business-process "Book freight" as book
  acme -> book: assignment
}
`,
    "spec-allowed.plein",
  );
  assert.equal(model.relationships[0]!.type, "assignedTo");

  assert.throws(
    () =>
      checkPlein(
        `model {
  specialization customer specializes business-actor
  customer "Acme" as acme
  application-component "TMS" as tms
  acme -> tms: composition
}
`,
        "spec-invalid.plein",
      ),
    /invalid relationship 'composition' from 'business-actor' to 'application-component'/,
  );
});

test("a profile hook is checked as its catalogue type", () => {
  const model = checkPlein(
    `model {
  profile nordfreight {
    specialization customer specializes business-actor
  }
  business-actor "Desk" as desk hook customer
  business-role "Clerk" as clerk
  desk -> clerk: assignment
}
`,
    "hook-allowed.plein",
  );
  assert.equal(model.elements[0]!.profile, "nordfreight");
  assert.equal(model.relationships[0]!.type, "assignedTo");
});
