import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPOSITE_ELEMENT_KEYWORDS,
  ELEMENT_KEYWORDS,
  languageReferenceElementKeywords,
  resolveElementKeyword,
  toKebabCaseKeyword,
} from "./keywords.js";
import { checkPlein, ParseError } from "./parser.js";

/** Kebab-case catalogue copied from docs/plein-dsl-archimate-4.md Model elements. */
const LANG_REF_ELEMENT_KEYWORDS = [
  // Strategy
  "resource",
  "capability",
  "value-stream",
  "course-of-action",
  // Motivation
  "stakeholder",
  "driver",
  "assessment",
  "goal",
  "outcome",
  "principle",
  "requirement",
  "constraint",
  "meaning",
  "value",
  // Business
  "business-actor",
  "business-role",
  "business-collaboration",
  "business-interface",
  "business-process",
  "business-function",
  "business-interaction",
  "business-event",
  "business-service",
  "business-object",
  "contract",
  "representation",
  "product",
  // Application
  "application-component",
  "application-collaboration",
  "application-interface",
  "application-function",
  "application-interaction",
  "application-process",
  "application-event",
  "application-service",
  "data-object",
  // Technology and physical
  "node",
  "device",
  "system-software",
  "technology-collaboration",
  "technology-interface",
  "path",
  "communication-network",
  "technology-function",
  "technology-process",
  "technology-interaction",
  "technology-event",
  "technology-service",
  "artifact",
  "equipment",
  "facility",
  "distribution-network",
  "material",
  // Implementation and migration
  "work-package",
  "deliverable",
  "implementation-event",
  "plateau",
  "gap",
] as const;

function catalogueSource(spellings: readonly string[]): string {
  const lines = spellings.map(
    (spelling, index) => `    ${spelling} "${spelling}" as e${index}`,
  );
  return `model {\n${lines.join("\n")}\n}\n`;
}

test("language-reference element keywords match the parser catalogue", () => {
  assert.deepEqual(languageReferenceElementKeywords(), [...LANG_REF_ELEMENT_KEYWORDS]);
});

test("parser accepts every language-reference element keyword", () => {
  const model = checkPlein(catalogueSource(LANG_REF_ELEMENT_KEYWORDS), "catalogue.plein");
  assert.equal(model.elements.length, LANG_REF_ELEMENT_KEYWORDS.length);
  for (const [index, spelling] of LANG_REF_ELEMENT_KEYWORDS.entries()) {
    const element = model.elements[index]!;
    assert.equal(element.id, `e${index}`, spelling);
    const canonical = resolveElementKeyword(spelling);
    assert.ok(canonical, `unresolved language-reference keyword '${spelling}'`);
    assert.equal(element.keyword, canonical, spelling);
  }
});

test("parser accepts camelCase spellings of every canonical element keyword", () => {
  const model = checkPlein(catalogueSource(ELEMENT_KEYWORDS), "camel-catalogue.plein");
  assert.equal(model.elements.length, ELEMENT_KEYWORDS.length);
  for (const [index, keyword] of ELEMENT_KEYWORDS.entries()) {
    assert.equal(model.elements[index]!.keyword, keyword);
  }
});

test("layer-specific keywords stay distinct instead of collapsing", () => {
  const source = `model {
  business-process "Book freight" as bookFreight
  application-process "Quote rates" as quoteRates
  technology-process "Ship packet" as shipPacket
  business-interaction "Handoff" as handoff
  application-interaction "API choreography" as apiDance
  technology-interaction "Link failover" as failover
  constraint "Must encrypt" as encrypt
  contract "MSA" as msa
  representation "Bill of lading" as bol
  gap "No TMS" as noTms
}
`;
  const model = checkPlein(source, "distinct-types.plein");
  const byId = new Map(model.elements.map((element) => [element.id, element.keyword]));
  assert.equal(byId.get("bookFreight"), "businessProcess");
  assert.equal(byId.get("quoteRates"), "applicationProcess");
  assert.equal(byId.get("shipPacket"), "technologyProcess");
  assert.equal(byId.get("handoff"), "businessInteraction");
  assert.equal(byId.get("apiDance"), "applicationInteraction");
  assert.equal(byId.get("failover"), "technologyInteraction");
  assert.equal(byId.get("encrypt"), "constraint");
  assert.equal(byId.get("msa"), "contract");
  assert.equal(byId.get("bol"), "representation");
  assert.equal(byId.get("noTms"), "gap");
});

test("short aliases still resolve onto business-layer concrete types", () => {
  const source = `model {
  process "Book freight" as bookFreight
  function "Dispatch" as dispatch
  event "Order placed" as orderPlaced
  service "Booking" as booking
  role "Dispatcher" as dispatcher
  collaboration "Joint planning" as joint
}
`;
  const model = checkPlein(source, "short-aliases.plein");
  assert.deepEqual(
    model.elements.map((element) => element.keyword),
    [
      "businessProcess",
      "businessFunction",
      "businessEvent",
      "businessService",
      "businessRole",
      "businessCollaboration",
    ],
  );
});

test("composite grouping and location extras still parse", () => {
  const source = `model {
  grouping "Cluster" as cluster
  location "Rotterdam" as rotterdam
}
`;
  const model = checkPlein(source, "composite.plein");
  assert.deepEqual(
    model.elements.map((element) => element.keyword),
    [...COMPOSITE_ELEMENT_KEYWORDS],
  );
});

test("unknown element type is a file:line:column diagnostic", () => {
  const source = `model {
  business-actor "Shipper" as shipper
  legacyBatch "Legacy batch" as legacyBatch
}
`;
  assert.throws(
    () => checkPlein(source, "unknown-keyword.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.equal(error.file, "unknown-keyword.plein");
      assert.equal(error.line, 3);
      assert.ok(error.column >= 1);
      assert.match(
        error.message,
        /unknown-keyword\.plein:3:\d+: unknown keyword 'legacyBatch'/,
      );
      return true;
    },
  );
});

test("kebab-case helper matches language-reference spellings", () => {
  assert.equal(toKebabCaseKeyword("businessActor"), "business-actor");
  assert.equal(toKebabCaseKeyword("courseOfAction"), "course-of-action");
  assert.equal(toKebabCaseKeyword("implementationEvent"), "implementation-event");
  assert.equal(toKebabCaseKeyword("gap"), "gap");
});
