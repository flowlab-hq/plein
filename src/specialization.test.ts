import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { elementStyle } from "./archimate-style.js";
import { exportOpenExchange } from "./open-exchange.js";
import { filterModel } from "./list-model.js";
import { checkPlein, ParseError } from "./parser.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("fixtures/valid-specialization.plein declares and uses three specializations", () => {
  const model = checkPlein(
    readFileSync(join(repoRoot, "fixtures/valid-specialization.plein"), "utf8"),
    "fixtures/valid-specialization.plein",
  );
  assert.deepEqual(
    model.specializations.map((item) => item.name),
    ["customer", "express-order", "premium-customer"],
  );
  assert.deepEqual(
    model.elements.map((element) => element.specialization ?? element.keyword),
    ["customer", "premium-customer", "businessActor", "express-order", "businessService"],
  );
  assert.equal(model.views[0]!.name, "customers");
});

const declared = `plein {
  model {
    specialization customer specializes business-actor
    specialization express-order specialization business-object
    specialization premium-customer specializes customer

    customer "Acme Freight" as acme
    premium-customer "Acme Priority" as priority
    business-actor "Carrier" as carrier
    express-order "Rush booking" as rush

    acme -> rush: access
    priority -> acme: specialization
  }
}
`;

test("declared specializations are accepted and keep the catalogue type", () => {
  const model = checkPlein(declared, "valid-specialization.plein");
  assert.deepEqual(
    model.specializations.map((item) => ({
      name: item.name,
      parent: item.parent,
      keyword: item.keyword,
    })),
    [
      { name: "customer", parent: "business-actor", keyword: "businessActor" },
      { name: "express-order", parent: "business-object", keyword: "businessObject" },
      { name: "premium-customer", parent: "customer", keyword: "businessActor" },
    ],
  );
  assert.deepEqual(model.profiles, []);
  assert.ok(model.specializations.every((item) => item.profile === undefined));

  const byId = new Map(model.elements.map((element) => [element.id, element]));
  assert.equal(byId.get("acme")!.keyword, "businessActor");
  assert.equal(byId.get("acme")!.specialization, "customer");
  assert.equal(byId.get("acme")!.profile, undefined);
  assert.equal(byId.get("priority")!.keyword, "businessActor");
  assert.equal(byId.get("priority")!.specialization, "premium-customer");
  assert.equal(byId.get("carrier")!.keyword, "businessActor");
  assert.equal(byId.get("carrier")!.specialization, undefined);
  assert.equal(byId.get("rush")!.keyword, "businessObject");
  assert.equal(byId.get("rush")!.specialization, "express-order");
  assert.equal(elementStyle(byId.get("acme")!.keyword).keyword, "businessActor");

  const specialization = model.relationships.find((rel) => rel.type === "specializes");
  assert.deepEqual(
    specialization && { source: specialization.source, target: specialization.target },
    { source: "priority", target: "acme" },
  );
});

test("a specialization name in a view selects those elements and the catalogue type still matches", () => {
  const model = checkPlein(
    `plein {
  model {
    specialization customer specializes business-actor
    customer "Acme" as acme
    business-actor "Carrier" as carrier
  }
  views {
    view customers {
      include customer
    }
    view actors {
      include business-actor
    }
  }
}
`,
    "specialization-views.plein",
  );
  assert.deepEqual(
    filterModel(model, "customers").elements.map((element) => element.id),
    ["acme"],
  );
  assert.deepEqual(
    filterModel(model, "actors").elements.map((element) => element.id).sort(),
    ["acme", "carrier"],
  );
});

test("undeclared specialization is rejected with a line diagnostic", () => {
  const source = `model {
  customer "Acme Freight" as acme
}
`;
  assert.throws(
    () => checkPlein(source, "unknown-specialization.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.equal(error.file, "unknown-specialization.plein");
      assert.equal(error.line, 2);
      assert.match(
        error.message,
        /unknown-specialization\.plein:2:\d+: unknown keyword 'customer' \(undeclared specialization\)/,
      );
      return true;
    },
  );
});

test("specializing an unknown type is rejected", () => {
  assert.throws(
    () =>
      checkPlein(
        `model {\n  specialization customer specializes widget\n}\n`,
        "bad-parent.plein",
      ),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(
        error.message,
        /bad-parent\.plein:\d+:\d+: specialization 'customer' specializes unknown keyword 'widget'/,
      );
      return true;
    },
  );
});

test("a specialization name cannot collide with a catalogue keyword or be duplicated", () => {
  assert.throws(
    () =>
      checkPlein(
        `model {\n  specialization business-actor specializes business-role\n}\n`,
        "collide.plein",
      ),
    /collide\.plein:\d+:\d+: specialization 'business-actor' collides with catalogue keyword 'business-actor'/,
  );
  assert.throws(
    () =>
      checkPlein(
        `model {\n  specialization process specializes business-role\n}\n`,
        "alias.plein",
      ),
    /alias\.plein:\d+:\d+: specialization 'process' collides with catalogue keyword 'process'/,
  );
  assert.throws(
    () =>
      checkPlein(
        `model {
  specialization customer specializes business-actor
  specialization customer specializes business-role
}
`,
        "duplicate.plein",
      ),
    /duplicate\.plein:\d+:\d+: duplicate specialization 'customer'/,
  );
});

test("a reserved specialization name and a bad verb are rejected", () => {
  assert.throws(
    () => checkPlein(`model {\n  specialization include specializes business-actor\n}\n`, "reserved.plein"),
    /reserved\.plein:\d+:\d+: specialization name 'include' is reserved/,
  );
  assert.throws(
    () => checkPlein(`model {\n  specialization customer of business-actor\n}\n`, "verb.plein"),
    /verb\.plein:\d+:\d+: expected 'specializes' after specialization name \(got 'of'\)/,
  );
});

test("a specialization used before it is declared is rejected", () => {
  assert.throws(
    () =>
      checkPlein(
        `model {
  customer "Acme" as acme
  specialization customer specializes business-actor
}
`,
        "order.plein",
      ),
    /order\.plein:\d+:\d+: unknown keyword 'customer' \(undeclared specialization\)/,
  );
});

test("specialization declarations are not accepted inside a value stream", () => {
  assert.throws(
    () =>
      checkPlein(
        `model {
  value-stream "Order to cash" as orderToCash {
    specialization stage specializes value-stream
  }
}
`,
        "nested-decl.plein",
      ),
    /nested-decl\.plein:\d+:\d+: specialization declarations belong in the model, not inside a valueStream/,
  );
});

test("a specialization of value-stream still nests value-stream stages", () => {
  const model = checkPlein(
    `model {
  specialization journey specializes value-stream
  journey "Order to cash" as orderToCash {
    value-stream-stage "Capture" as capture
  }
}
`,
    "journey.plein",
  );
  assert.equal(model.elements.length, 2);
  assert.equal(model.elements[0]!.keyword, "valueStream");
  assert.equal(model.elements[0]!.specialization, "journey");
  assert.equal(model.elements[1]!.keyword, "valueStream");
  assert.equal(model.elements[1]!.specialization, undefined);
  assert.equal(model.relationships[0]!.type, "composedOf");
});

test("an identifier named specialization can still be a relationship source", () => {
  const model = checkPlein(
    `model {
  business-actor "Specialization" as specialization
  business-role "Role" as role
  specialization -> role: assignment
  specialization serves role
}
`,
    "id-specialization.plein",
  );
  assert.equal(model.specializations.length, 0);
  assert.equal(model.relationships.length, 2);
  assert.deepEqual(
    model.relationships.map((rel) => rel.type),
    ["assignedTo", "serves"],
  );
});

test("models without specializations keep an empty list and the core catalogue path", () => {
  const model = checkPlein(
    `model {
  business-actor "Shipper" as shipper
  business-role "Dispatcher" as dispatcher
  shipper -> dispatcher: assignment
}
`,
    "core.plein",
  );
  assert.deepEqual(model.specializations, []);
  assert.deepEqual(model.profiles, []);
  assert.equal(model.elements[0]!.specialization, undefined);
  assert.equal(model.elements[0]!.profile, undefined);
  assert.equal(model.elements[0]!.keyword, "businessActor");
  assert.equal(model.relationships[0]!.type, "assignedTo");
});

test("Open Exchange export writes the catalogue type and does not emit a profile", () => {
  const model = checkPlein(declared, "valid-specialization.plein");
  const xml = exportOpenExchange(model, { file: "valid-specialization.plein" }).xml;
  assert.match(xml, /xsi:type="BusinessActor"/);
  assert.match(xml, /xsi:type="BusinessObject"/);
  assert.doesNotMatch(xml, /<profile/i);
  assert.doesNotMatch(xml, /xsi:type="customer"/);
  assert.doesNotMatch(xml, /xsi:type="Customer"/);
});
