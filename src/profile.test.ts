import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { elementStyle } from "./archimate-style.js";
import { filterModel } from "./list-model.js";
import { exportOpenExchange } from "./open-exchange.js";
import { checkPlein, ParseError } from "./parser.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("fixtures/valid-profile.plein declares two profiles and uses their hooks", () => {
  const model = checkPlein(
    readFileSync(join(repoRoot, "fixtures/valid-profile.plein"), "utf8"),
    "fixtures/valid-profile.plein",
  );
  assert.deepEqual(
    model.profiles.map((item) => item.name),
    ["nordfreight", "planning"],
  );
  assert.deepEqual(
    model.specializations.map((item) => ({
      name: item.name,
      parent: item.parent,
      keyword: item.keyword,
      profile: item.profile,
    })),
    [
      {
        name: "customer",
        parent: "business-actor",
        keyword: "businessActor",
        profile: "nordfreight",
      },
      {
        name: "express-order",
        parent: "business-object",
        keyword: "businessObject",
        profile: "nordfreight",
      },
      {
        name: "premium-customer",
        parent: "customer",
        keyword: "businessActor",
        profile: "nordfreight",
      },
      {
        name: "planner",
        parent: "business-role",
        keyword: "businessRole",
        profile: "planning",
      },
      {
        name: "local-carrier",
        parent: "business-actor",
        keyword: "businessActor",
        profile: undefined,
      },
    ],
  );
  assert.deepEqual(
    model.elements.map((element) => element.profile ?? element.specialization ?? element.keyword),
    [
      "nordfreight",
      "nordfreight",
      "nordfreight",
      "nordfreight",
      "planning",
      "local-carrier",
      "businessService",
    ],
  );
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  assert.equal(byId.get("acme")!.keyword, "businessActor");
  assert.equal(byId.get("acme")!.specialization, "customer");
  assert.equal(byId.get("acme")!.profile, "nordfreight");
  assert.equal(byId.get("desk")!.keyword, "businessActor");
  assert.equal(byId.get("desk")!.specialization, "customer");
  assert.equal(byId.get("desk")!.profile, "nordfreight");
  assert.equal(byId.get("lane")!.keyword, "businessRole");
  assert.equal(byId.get("lane")!.specialization, "planner");
  assert.equal(byId.get("lane")!.profile, "planning");
  assert.equal(byId.get("carrier")!.specialization, "local-carrier");
  assert.equal(byId.get("carrier")!.profile, undefined);
  assert.equal(byId.get("booking")!.specialization, undefined);
  assert.equal(byId.get("booking")!.profile, undefined);
  assert.equal(elementStyle(byId.get("desk")!.keyword).keyword, "businessActor");
  assert.equal(elementStyle(byId.get("lane")!.keyword).keyword, "businessRole");
  assert.deepEqual(
    filterModel(model, "customers").elements.map((element) => element.id),
    ["acme", "priority", "desk", "rush", "lane", "carrier", "booking"],
  );
});

test("a declared profile hook is accepted on the catalogue keyword and as an element keyword", () => {
  const model = checkPlein(
    `model {
  profile nordfreight {
    specialization customer specializes business-actor
  }
  customer "Acme Freight" as acme
  business-actor "Priority desk" as desk hook customer
}
`,
    "profile-hook.plein",
  );
  assert.equal(model.profiles.length, 1);
  assert.equal(model.elements[0]!.specialization, "customer");
  assert.equal(model.elements[0]!.profile, "nordfreight");
  assert.equal(model.elements[1]!.keyword, "businessActor");
  assert.equal(model.elements[1]!.specialization, "customer");
  assert.equal(model.elements[1]!.profile, "nordfreight");
});

test("include of a profile hook name selects keyword and hook forms", () => {
  const model = checkPlein(
    `plein {
  model {
    profile nordfreight {
      specialization customer specializes business-actor
    }
    customer "Acme" as acme
    business-actor "Desk" as desk hook customer
    business-actor "Carrier" as carrier
  }
  views {
    view customers {
      include customer
    }
  }
}
`,
    "profile-views.plein",
  );
  assert.deepEqual(
    filterModel(model, "customers").elements.map((element) => element.id),
    ["acme", "desk"],
  );
});

test("an undeclared profile hook is rejected with a line diagnostic", () => {
  const source = `model {
  profile nordfreight {
    specialization customer specializes business-actor
  }
  business-actor "Warehouse" as hub hook warehouse
}
`;
  assert.throws(
    () => checkPlein(source, "unknown-profile-hook.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.equal(error.file, "unknown-profile-hook.plein");
      assert.equal(error.line, 5);
      assert.match(
        error.message,
        /unknown-profile-hook\.plein:5:\d+: undeclared profile hook 'warehouse'/,
      );
      return true;
    },
  );
});

test("a model specialization is not a profile hook, and the hook must match the catalogue type", () => {
  assert.throws(
    () =>
      checkPlein(
        `model {
  specialization customer specializes business-actor
  business-actor "Acme" as acme hook customer
}
`,
        "not-a-hook.plein",
      ),
    /not-a-hook\.plein:\d+:\d+: specialization 'customer' is not a profile hook/,
  );
  assert.throws(
    () =>
      checkPlein(
        `model {
  profile nordfreight {
    specialization customer specializes business-actor
  }
  business-object "Order" as order hook customer
}
`,
        "hook-type.plein",
      ),
    /hook-type\.plein:\d+:\d+: profile hook 'customer' specializes 'business-actor', not 'business-object'/,
  );
  assert.throws(
    () =>
      checkPlein(
        `model {
  profile nordfreight {
    specialization customer specializes business-actor
  }
  customer "Acme" as acme hook customer
}
`,
        "hook-combined.plein",
      ),
    /hook-combined\.plein:\d+:\d+: hook cannot be combined with specialization keyword 'customer'/,
  );
});

test("profile names are rejected when they collide, duplicate, or are reserved", () => {
  assert.throws(
    () => checkPlein(`model {\n  profile business-actor {\n  }\n}\n`, "profile-collide.plein"),
    /profile-collide\.plein:\d+:\d+: profile 'business-actor' collides with catalogue keyword 'business-actor'/,
  );
  assert.throws(
    () => checkPlein(`model {\n  profile include {\n  }\n}\n`, "profile-reserved.plein"),
    /profile-reserved\.plein:\d+:\d+: profile name 'include' is reserved/,
  );
  assert.throws(
    () =>
      checkPlein(
        `model {
  profile nordfreight {
    specialization customer specializes business-actor
  }
  profile nordfreight {
    specialization desk specializes business-actor
  }
}
`,
        "profile-duplicate.plein",
      ),
    /profile-duplicate\.plein:\d+:\d+: duplicate profile 'nordfreight'/,
  );
  assert.throws(
    () =>
      checkPlein(
        `model {
  specialization customer specializes business-actor
  profile customer {
    specialization desk specializes business-role
  }
}
`,
        "profile-spec.plein",
      ),
    /profile-spec\.plein:\d+:\d+: profile 'customer' collides with specialization 'customer'/,
  );
  assert.throws(
    () =>
      checkPlein(
        `model {
  profile customer {
    specialization customer specializes business-actor
  }
}
`,
        "spec-profile.plein",
      ),
    /spec-profile\.plein:\d+:\d+: specialization 'customer' collides with profile 'customer'/,
  );
});

test("a profile may only declare specializations, and not inside a value stream", () => {
  assert.throws(
    () =>
      checkPlein(
        `model {
  profile nordfreight {
    business-actor "Acme" as acme
  }
}
`,
        "profile-element.plein",
      ),
    /profile-element\.plein:\d+:\d+: profile 'nordfreight' may only declare specializations/,
  );
  assert.throws(
    () =>
      checkPlein(
        `model {
  value-stream "Order to cash" as order {
    profile nordfreight {
      specialization journey specializes value-stream
    }
  }
}
`,
        "profile-nested.plein",
      ),
    /profile-nested\.plein:\d+:\d+: profile declarations belong in the model, not inside a valueStream/,
  );
  assert.throws(
    () => checkPlein(`model {\n  profile nordfreight specializes business-actor\n}\n`, "profile-brace.plein"),
    /profile-brace\.plein:\d+:\d+: expected '\{' after profile name/,
  );
});

test("organization is an alias of profile, and a profile hook can nest value-stream stages", () => {
  const model = checkPlein(
    `model {
  organization planning {
    specialization journey specializes value-stream
  }
  value-stream "Order to cash" as order hook journey {
    value-stream-stage "Capture" as capture
  }
  journey "Quote to cash" as quote
}
`,
    "organization.plein",
  );
  assert.deepEqual(
    model.profiles.map((item) => item.name),
    ["planning"],
  );
  assert.equal(model.specializations[0]!.profile, "planning");
  assert.equal(model.elements[0]!.keyword, "valueStream");
  assert.equal(model.elements[0]!.specialization, "journey");
  assert.equal(model.elements[0]!.profile, "planning");
  assert.equal(model.elements[1]!.keyword, "valueStream");
  assert.equal(model.elements[1]!.specialization, undefined);
  assert.equal(model.elements[2]!.keyword, "valueStream");
  assert.equal(model.elements[2]!.profile, "planning");
  assert.equal(model.relationships[0]!.type, "composedOf");
});

test("an identifier named profile can still be a relationship source", () => {
  const model = checkPlein(
    `model {
  business-actor "Profile" as profile
  business-role "Role" as role
  profile -> role: assignment
  profile serves role
}
`,
    "id-profile.plein",
  );
  assert.equal(model.profiles.length, 0);
  assert.equal(model.specializations.length, 0);
  assert.deepEqual(
    model.relationships.map((rel) => rel.type),
    ["assignedTo", "serves"],
  );
});

test("a profile hook used before it is declared is rejected", () => {
  assert.throws(
    () =>
      checkPlein(
        `model {
  business-actor "Acme" as acme hook customer
  profile nordfreight {
    specialization customer specializes business-actor
  }
}
`,
        "hook-order.plein",
      ),
    /hook-order\.plein:\d+:\d+: undeclared profile hook 'customer'/,
  );
});

test("C1a specializations stay free of profiles, and export still omits a profile", () => {
  const core = checkPlein(
    readFileSync(join(repoRoot, "fixtures/valid-specialization.plein"), "utf8"),
    "fixtures/valid-specialization.plein",
  );
  assert.deepEqual(core.profiles, []);
  assert.ok(core.elements.every((element) => element.profile === undefined));

  const model = checkPlein(
    readFileSync(join(repoRoot, "fixtures/valid-profile.plein"), "utf8"),
    "fixtures/valid-profile.plein",
  );
  const xml = exportOpenExchange(model, { file: "valid-profile.plein" }).xml;
  assert.match(xml, /xsi:type="BusinessActor"/);
  assert.match(xml, /xsi:type="BusinessObject"/);
  assert.match(xml, /xsi:type="BusinessRole"/);
  assert.doesNotMatch(xml, /<profile/i);
  assert.doesNotMatch(xml, /xsi:type="customer"/);
  assert.doesNotMatch(xml, /xsi:type="Customer"/);
});
