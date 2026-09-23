import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ELEMENT_KEYWORDS, toKebabCaseKeyword } from "./keywords.js";
import {
  formatImportReport,
  importOpenExchange,
  ImportError,
  openExchangeElementTypes,
  openExchangeRelationshipTypes,
  OPEN_EXCHANGE_NS,
} from "./open-exchange.js";
import { checkPlein } from "./parser.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist", "cli.js");
const fixtureXml = join(repoRoot, "fixtures", "open-exchange", "booking.xml");
const fixturePlein = join(repoRoot, "fixtures", "open-exchange", "booking.plein");

const NS = `xmlns="${OPEN_EXCHANGE_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`;

function exchange(body: string, identifier = "id-model"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model ${NS} identifier="${identifier}">
${body}
</model>
`;
}

test("open exchange type lists cover the Plein catalogue and eleven relationships", () => {
  assert.deepEqual(
    openExchangeElementTypes(),
    ELEMENT_KEYWORDS.map((keyword) => keyword.charAt(0).toUpperCase() + keyword.slice(1)),
  );
  assert.equal(openExchangeRelationshipTypes().length, 11);
  assert.ok(openExchangeElementTypes().includes("Grouping"));
  assert.ok(openExchangeElementTypes().includes("Location"));
  assert.equal(openExchangeElementTypes().includes("AndJunction"), false);
});

test("every catalogue element type and all eleven relationships import", () => {
  const types = openExchangeElementTypes();
  const elements = types
    .map(
      (type, index) =>
        `    <element identifier="id-${index}" xsi:type="${type}"><name>${type}</name></element>`,
    )
    .join("\n");
  const relationships = openExchangeRelationshipTypes()
    .map(
      (type, index) =>
        `    <relationship identifier="rel-${index}" source="id-${index}" target="id-${index + 1}" xsi:type="${type}"/>`,
    )
    .join("\n");
  const imported = importOpenExchange(
    exchange(`  <elements>\n${elements}\n  </elements>\n  <relationships>\n${relationships}\n  </relationships>`),
  );
  const model = checkPlein(imported.source, "catalogue.plein");
  assert.equal(model.elements.length, types.length);
  assert.deepEqual(
    model.elements.map((element) => element.keyword),
    [...ELEMENT_KEYWORDS],
  );
  assert.equal(model.relationships.length, 11);
  assert.deepEqual(
    model.relationships.map((relationship) => relationship.type),
    [
      "composedOf",
      "aggregates",
      "assignedTo",
      "realizes",
      "serves",
      "accesses",
      "influences",
      "triggers",
      "flowsTo",
      "specializes",
      "associatedWith",
    ],
  );
  for (const element of model.elements) {
    assert.match(imported.source, new RegExp(`${toKebabCaseKeyword(element.keyword)} "`));
  }
});

test("booking fixture imports the documented subset", () => {
  const xml = readFileSync(fixtureXml, "utf8");
  const imported = importOpenExchange(xml, "fixtures/open-exchange/booking.xml");
  assert.equal(imported.source, readFileSync(fixturePlein, "utf8"));

  const model = checkPlein(imported.source, "fixtures/open-exchange/booking.plein");
  assert.equal(model.elements.length, 17);
  assert.equal(model.relationships.length, 15);
  assert.equal(model.views.length, 2);
  assert.equal(imported.report.skippedJunctions, 1);
  assert.equal(imported.report.skippedJunctionRelationships, 2);
  assert.equal(imported.report.skippedVisuals, 2);
  assert.equal(imported.report.synthesizedView, false);

  const shipper = model.elements.find((element) => element.id === "id-shipper");
  assert.ok(shipper);
  assert.equal(shipper.keyword, "businessActor");
  assert.equal(shipper.label, "Shipper & Co");
  assert.match(imported.source, /\/\/ name \(nl\): Verlader/);
  assert.match(imported.source, /\/\/ property Owner: NordFreight/);
  assert.match(imported.source, /\/\/ documentation: Stages from quote through cash collection\./);
  assert.match(imported.source, /\/\/ accessType: Write/);
  assert.match(imported.source, /\/\/ modifier: -/);
  assert.match(imported.source, /business-actor "Shipper & Co" as id-shipper/);

  const context = model.views[0];
  const quote = model.views[1];
  assert.ok(context && quote);
  assert.equal(context.name, "id-booking-context");
  assert.equal(context.title, "Booking context");
  assert.equal(context.nesting, undefined);
  assert.deepEqual(context.includes, ["id-shipper", "id-booking", "id-order", "id-rates"]);
  assert.equal(quote.name, "id-quote-flow");
  assert.equal(quote.nesting, "nested");
  assert.deepEqual(quote.includes, ["id-qtc", "id-book", "id-planning"]);
  assert.match(imported.source, /ArchiMate viewpoint: Application Cooperation/);
  assert.match(imported.source, /ArchiMate viewpoint: Strategy/);

  const spellings = [
    "composition",
    "aggregation",
    "assignment",
    "realization",
    "serving",
    "access",
    "influence",
    "triggering",
    "flow",
    "specialization",
    "association",
  ];
  for (const spelling of spellings) {
    assert.match(imported.source, new RegExp(`: ${spelling}\\b`));
  }

  assert.doesNotMatch(imported.source, /id-junction|AndJunction|Manual note|Visual group|fillColor|bendpoint|Business/);
  assert.doesNotMatch(imported.source, /value-stream-stage/);
  assert.equal(model.elements.some((element) => element.keyword === "valueStream"), true);

  const report = formatImportReport("fixtures/open-exchange/booking.xml", imported.report);
  assert.match(report, /17 elements, 15 relationships, 2 views/);
  assert.match(report, /diagram geometry, styles, and organization folders are not imported/);
  assert.match(report, /skipped 1 junction and 2 relationships that referenced it/);
  assert.match(report, /skipped 2 diagram-only nodes/);
});

test("import accepts a CRLF Open Exchange document", () => {
  const xml = exchange(
    `  <elements><element identifier="id-a" xsi:type="BusinessActor"><name>A</name></element></elements>`,
  ).replace(/\n/g, "\r\n");
  const imported = importOpenExchange(xml, "crlf.xml");
  const model = checkPlein(imported.source, "crlf.plein");
  assert.equal(model.elements[0]!.label, "A");
  assert.equal(model.elements[0]!.id, "id-a");
});

test("import keeps a prefixed Open Exchange document and QName xsi:type", () => {
  const imported = importOpenExchange(
    `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:archimate="${OPEN_EXCHANGE_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="id-m">
  <archimate:elements>
    <archimate:element identifier="node" xsi:type="archimate:BusinessActor">
      <archimate:name xml:lang="en">A "quoted" actor</archimate:name>
    </archimate:element>
  </archimate:elements>
</archimate:model>`,
  );
  const model = checkPlein(imported.source, "prefixed.plein");
  assert.equal(model.elements.length, 1);
  assert.equal(model.elements[0]!.keyword, "businessActor");
  assert.equal(model.elements[0]!.label, "A 'quoted' actor");
  assert.equal(model.elements[0]!.id, "xe-node");
  assert.match(imported.source, /\/\/ open-exchange identifier: node/);
  assert.equal(model.views.length, 1);
  assert.equal(model.views[0]!.name, "imported");
  assert.equal(imported.report.synthesizedView, true);
});

test("import rejects unknown types, ArchiMate 2, broken XML, and dangling relationships", () => {
  assert.throws(
    () =>
      importOpenExchange(
        exchange(`  <elements><element identifier="id-1" xsi:type="Widget"><name>X</name></element></elements>`),
        "broken.xml",
      ),
    (error: unknown) => {
      assert.ok(error instanceof ImportError);
      assert.match(error.message, /broken\.xml:\d+:\d+: unknown element type 'Widget'/);
      return true;
    },
  );
  assert.throws(
    () => importOpenExchange(`<model xmlns="http://www.opengroup.org/xsd/archimate"><name>Old</name></model>`),
    /ArchiMate 2 exchange is not supported/,
  );
  assert.throws(() => importOpenExchange(`<!DOCTYPE model><model/>`, "evil.xml"), /DOCTYPE is not allowed/);
  assert.throws(
    () =>
      importOpenExchange(
        exchange(`  <elements><element identifier="id-1" xsi:type="BusinessActor"><name>A</name></element></elements>
  <relationships><relationship identifier="id-r" source="id-1" target="id-missing" xsi:type="Serving"/></relationships>`),
      ),
    /unknown element 'id-missing'/,
  );
  assert.throws(
    () =>
      importOpenExchange(
        exchange(`  <elements><element identifier="id-1" xsi:type="BusinessActor"><name>A</name></element></elements>
  <relationships><relationship identifier="id-r" source="id-1" target="id-1" xsi:type="Association"/></relationships>`),
      ),
    /cannot target itself/,
  );
});

test("import skips OrJunction relationships and non-diagram views", () => {
  const imported = importOpenExchange(
    exchange(`  <elements>
    <element identifier="id-a" xsi:type="BusinessActor"><name>A</name></element>
    <element identifier="id-b" xsi:type="BusinessRole"><name>B</name></element>
    <element identifier="id-j" xsi:type="OrJunction"><name>or</name></element>
  </elements>
  <relationships>
    <relationship identifier="id-r" source="id-a" target="id-j" xsi:type="Association"/>
  </relationships>
  <views>
    <diagrams>
      <view identifier="id-sketch" xsi:type="Sketch"><name>Sketch</name></view>
      <view identifier="id-real" xsi:type="Diagram"><name>Real</name>
        <node elementRef="id-a" xsi:type="Element" x="1" y="2" w="3" h="4"/>
        <node elementRef="id-b" xsi:type="Element"/>
      </view>
    </diagrams>
  </views>`),
  );
  const model = checkPlein(imported.source, "junction.plein");
  assert.deepEqual(model.elements.map((element) => element.id), ["id-a", "id-b"]);
  assert.equal(model.relationships.length, 0);
  assert.equal(model.views.length, 1);
  assert.equal(model.views[0]!.name, "id-real");
  assert.equal(imported.report.skippedJunctions, 1);
  assert.equal(imported.report.skippedJunctionRelationships, 1);
  assert.equal(imported.report.skippedViews, 1);
  assert.doesNotMatch(imported.source, /x="1"|y="2"/);
});

test("plein import writes the booking fixture and prints the gap note", () => {
  const dir = mkdtempSync(join(tmpdir(), "plein-import-"));
  try {
    const stdoutResult = spawnSync(process.execPath, [cli, "import", "fixtures/open-exchange/booking.xml"], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    assert.equal(stdoutResult.status, 0, stdoutResult.stderr);
    assert.equal(stdoutResult.stdout, readFileSync(fixturePlein, "utf8"));
    assert.match(stdoutResult.stderr, /17 elements, 15 relationships, 2 views/);
    assert.match(stdoutResult.stderr, /diagram geometry, styles, and organization folders are not imported/);

    const out = join(dir, "booking.plein");
    const fileResult = spawnSync(
      process.execPath,
      [cli, "import", "fixtures/open-exchange/booking.xml", "-o", out],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(fileResult.status, 0, fileResult.stderr);
    assert.equal(readFileSync(out, "utf8"), readFileSync(fixturePlein, "utf8"));
    assert.match(fileResult.stdout, new RegExp(`imported fixtures/open-exchange/booking.xml -> ${out}`));
    assert.match(fileResult.stdout, /skipped 1 junction/);

    const dirOut = join(dir, "out");
    mkdirSync(dirOut);
    const dirResult = spawnSync(
      process.execPath,
      [cli, "import", "fixtures/open-exchange/booking.xml", "-o", `${dirOut}/`],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(dirResult.status, 0, dirResult.stderr);
    assert.equal(readFileSync(join(dirOut, "booking.plein"), "utf8"), readFileSync(fixturePlein, "utf8"));

    const missing = spawnSync(process.execPath, [cli, "import", "fixtures/open-exchange/missing.xml"], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /file not found: fixtures\/open-exchange\/missing\.xml/);

    const usage = spawnSync(process.execPath, [cli, "import"], { encoding: "utf8", cwd: repoRoot });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /plein import <file\.xml>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
