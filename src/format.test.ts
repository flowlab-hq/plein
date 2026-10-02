import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalAutoLayout, canonicalStyleBody, formatPleinSource } from "./format.js";
import { resolveElementKeyword, toKebabCaseKeyword } from "./keywords.js";
import { parseNestingMode } from "./layout.js";
import { checkPlein, ParseError, type PleinModel } from "./parser.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist", "cli.js");
const messyPath = join(repoRoot, "fixtures", "format-messy.plein");
const goldenPath = join(repoRoot, "fixtures", "golden-format-messy.plein");

function runFormat(args: string[]) {
  return spawnSync(process.execPath, [cli, "format", ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
}

function canonicalParent(parent: string): string {
  const keyword = resolveElementKeyword(parent);
  return keyword ? toKebabCaseKeyword(keyword) : parent;
}

function canonicalSelector(selector: string, specNames: ReadonlySet<string>): string {
  if (selector.includes("*") || selector.includes("->") || selector.startsWith("tag:")) {
    return selector;
  }
  if (!specNames.has(selector)) {
    const keyword = resolveElementKeyword(selector);
    if (keyword) {
      return toKebabCaseKeyword(keyword);
    }
  }
  return selector;
}

/** Layout-relevant shape. Spellings that format canonicalizes are compared in that form. */
function project(model: PleinModel) {
  const specNames = new Set(model.specializations.map((spec) => spec.name));
  return {
    elements: model.elements.map((element) => ({
      keyword: element.keyword,
      label: element.label,
      id: element.id,
      specialization: element.specialization ?? null,
      profile: element.profile ?? null,
      viaHook: element.viaHook ?? false,
      container: element.container ?? null,
      linksView: element.linksView ?? null,
    })),
    relationships: model.relationships
      .map((relationship) => ({
        type: relationship.type,
        source: relationship.source,
        target: relationship.target,
        container: relationship.container ?? null,
        synthetic: relationship.synthetic ?? false,
      }))
      .sort((a, b) =>
        `${a.synthetic}:${a.container}:${a.source}:${a.target}:${a.type}`.localeCompare(
          `${b.synthetic}:${b.container}:${b.source}:${b.target}:${b.type}`,
        ),
      ),
    specializations: model.specializations.map((spec) => ({
      name: spec.name,
      parent: canonicalParent(spec.parent),
      keyword: spec.keyword,
      profile: spec.profile ?? null,
    })),
    profiles: model.profiles.map((profile) => profile.name),
    views: model.views.map((view) => ({
      name: view.name,
      title: view.title ?? null,
      includes: view.includes.map((selector) => canonicalSelector(selector, specNames)),
      excludes: view.excludes.map((selector) => canonicalSelector(selector, specNames)),
      autoLayout: view.autoLayout === undefined ? null : canonicalAutoLayout(view.autoLayout),
      nesting: parseNestingMode(view.nesting),
      positions: (view.positions ?? []).map((position) => ({
        id: position.id,
        x: position.x,
        y: position.y,
      })),
      sizes: (view.sizes ?? []).map((size) => ({
        id: size.id,
        width: size.width,
        height: size.height,
      })),
    })),
    styles: (model.styles ?? []).map((block) => canonicalStyleBody(block.body)),
  };
}

function collectComments(model: PleinModel): string[] {
  const comments: string[] = [];
  const push = (list?: string[]) => {
    if (list) {
      comments.push(...list);
    }
  };
  push(model.headerComments);
  push(model.footerComments);
  push(model.trailingComments);
  push(model.modelComments);
  push(model.modelTrailingComments);
  push(model.viewsComments);
  push(model.viewsTrailingComments);
  for (const block of model.styles ?? []) {
    push(block.leadingComments);
  }
  for (const profile of model.profiles) {
    push(profile.leadingComments);
    push(profile.trailingComments);
  }
  for (const spec of model.specializations) {
    push(spec.leadingComments);
  }
  for (const element of model.elements) {
    push(element.leadingComments);
    push(element.trailingComments);
  }
  for (const relationship of model.relationships) {
    push(relationship.leadingComments);
  }
  for (const view of model.views) {
    push(view.leadingComments);
    push(view.titleComments);
    push(view.includeComments);
    push(view.excludeComments);
    push(view.autoLayoutComments);
    push(view.nestingComments);
    push(view.trailingComments);
    for (const position of view.positions ?? []) {
      push(position.leadingComments);
    }
    for (const size of view.sizes ?? []) {
      push(size.leadingComments);
    }
  }
  return comments;
}

function validPleinFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".plein")) {
        continue;
      }
      if (/^(broken|malformed|unknown|invalid)-/.test(entry.name)) {
        continue;
      }
      files.push(path);
    }
  };
  walk(join(repoRoot, "fixtures"));
  return files.sort();
}

test("formatPleinSource matches the messy before/after golden", () => {
  const messy = readFileSync(messyPath, "utf8");
  const golden = readFileSync(goldenPath, "utf8");
  const formatted = formatPleinSource(messy, "fixtures/format-messy.plein");
  assert.equal(
    formatted,
    golden,
    "fixtures/golden-format-messy.plein is stale; refresh with: npx plein format fixtures/format-messy.plein > fixtures/golden-format-messy.plein",
  );
  assert.equal(formatPleinSource(formatted, "fixtures/golden-format-messy.plein"), formatted);
  assert.equal(formatPleinSource(golden, "fixtures/golden-format-messy.plein"), golden);
});

test("formatting the messy fixture keeps the checked model", () => {
  const messy = readFileSync(messyPath, "utf8");
  const before = checkPlein(messy, "fixtures/format-messy.plein");
  const formatted = formatPleinSource(messy, "fixtures/format-messy.plein");
  const after = checkPlein(formatted, "fixtures/golden-format-messy.plein");
  assert.deepEqual(project(after), project(before));
  assert.deepEqual(collectComments(after).sort(), collectComments(before).sort());
  assert.match(formatted, /profile nordfreight \{/);
  assert.match(formatted, /value-stream-stage "Quote" as quote/);
  assert.match(formatted, /quote -> book: flow/);
  assert.match(formatted, /autoLayout grid name lr polyline/);
  assert.match(formatted, /nesting nested/);
  assert.doesNotMatch(formatted, /organization /);
  assert.doesNotMatch(formatted, /side-by-side/);
  assert.doesNotMatch(formatted, /autoLayout manual/);
});

test("plein format is idempotent and meaning-preserving on every valid fixture", () => {
  const files = validPleinFiles();
  assert.ok(files.length >= 10);
  for (const path of files) {
    const relative = path.slice(repoRoot.length + 1);
    const source = readFileSync(path, "utf8");
    const before = checkPlein(source, relative);
    const once = formatPleinSource(source, relative);
    const twice = formatPleinSource(once, relative);
    assert.equal(twice, once, relative);
    const after = checkPlein(once, relative);
    assert.deepEqual(project(after), project(before), relative);
    assert.deepEqual(collectComments(after).sort(), collectComments(before).sort(), relative);
  }
});

test("CRLF input formats to LF and a second format is a no-op", () => {
  const source = "model {\r\n  businessActor \"Shipper\" as shipper\r\n}\r\n";
  const once = formatPleinSource(source, "crlf.plein");
  assert.equal(once.includes("\r"), false);
  assert.equal(once, formatPleinSource(once, "crlf.plein"));
  assert.match(once, /business-actor "Shipper" as shipper/);
});

test("plein format prints the golden and leaves a canonical file unchanged", () => {
  const golden = readFileSync(goldenPath, "utf8");
  const formatted = runFormat(["fixtures/format-messy.plein"]);
  assert.equal(formatted.status, 0, formatted.stderr);
  assert.equal(formatted.stderr, "");
  assert.equal(formatted.stdout, golden);

  const check = runFormat(["--check", "fixtures/golden-format-messy.plein"]);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stdout, "ok fixtures/golden-format-messy.plein\n");

  const dirty = runFormat(["fixtures/format-messy.plein", "--check"]);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /^would reformat fixtures\/format-messy\.plein\n$/);
  assert.equal(dirty.stdout, "");
});

test("plein format --write and -o rewrite bytes without printing the source", () => {
  const dir = mkdtempSync(join(tmpdir(), "plein-format-"));
  try {
    const target = join(dir, "messy.plein");
    writeFileSync(target, readFileSync(messyPath, "utf8"));
    const written = runFormat(["--write", target]);
    assert.equal(written.status, 0, written.stderr);
    assert.equal(written.stdout, `formatted ${target}\n`);
    assert.equal(readFileSync(target, "utf8"), readFileSync(goldenPath, "utf8"));
    const again = runFormat([target, "--check"]);
    assert.equal(again.status, 0, again.stderr);

    const out = join(dir, "out.plein");
    const toFile = runFormat(["fixtures/valid-basic.plein", "-o", out]);
    assert.equal(toFile.status, 0, toFile.stderr);
    assert.equal(toFile.stdout, `formatted ${out}\n`);
    const body = readFileSync(out, "utf8");
    assert.equal(formatPleinSource(body, out), body);
    assert.match(body, /viewpoint booking-context "Booking context"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plein format rejects a missing file, a syntax error, and conflicting flags", () => {
  const missing = runFormat(["fixtures/no-such-file.plein"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /file not found: fixtures\/no-such-file\.plein/);

  const broken = runFormat(["fixtures/broken-syntax.plein"]);
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /broken-syntax\.plein:\d+:\d+:/);

  const usage = runFormat([]);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /plein format <file\.plein>/);

  const both = runFormat(["--check", "--write", "fixtures/valid-basic.plein"]);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /--check does not write/);

  const outputs = runFormat(["--write", "-o", "out.plein", "fixtures/valid-basic.plein"]);
  assert.equal(outputs.status, 2);
  assert.match(outputs.stderr, /either --write or -o/);
});

test("format writes size after position and keeps the size comment", () => {
  const source = `model {
  business-actor "Shipper" as shipper
}
views {
  view story {
    size shipper 200 64
    // placed
    position shipper 10 20
    include shipper
    autoLayout off
  }
}
`;
  const formatted = formatPleinSource(source, "sized.plein");
  assert.match(
    formatted,
    /include shipper\n\s+autoLayout off\n\s+\/\/ placed\n\s+position shipper 10 20\n\s+size shipper 200 64\n/,
  );
  assert.equal(formatPleinSource(formatted, "sized.plein"), formatted);
  const model = checkPlein(formatted, "sized.plein");
  assert.equal(model.views[0]!.sizes?.[0]?.width, 200);
  assert.equal(model.views[0]!.positions?.[0]?.leadingComments?.[0], "placed");
});

test("formatPleinSource throws ParseError on an unknown keyword", () => {
  assert.throws(
    () => formatPleinSource(readFileSync(join(repoRoot, "fixtures/unknown-keyword.plein"), "utf8"), "unknown.plein"),
    ParseError,
  );
});
