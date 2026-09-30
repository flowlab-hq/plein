import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ELEMENT_KEYWORDS,
  RELATIONSHIP_KEYWORDS,
  relationshipLanguageName,
  toKebabCaseKeyword,
  type RelationshipKeyword,
} from "./keywords.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRepo(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertQuoted(haystack: string, spelling: string, where: string): void {
  assert.ok(
    haystack.includes(`"${spelling}"`) || haystack.includes(`\`${spelling}\``),
    `${where} is missing ${spelling}`,
  );
}

test("grammar and mapping list every catalogue keyword and relationship spelling", () => {
  const ebnf = readRepo("docs/plein.ebnf");
  const grammar = readRepo("docs/grammar.md");
  const mapping = readRepo("docs/archimate-mapping.md");

  for (const keyword of ELEMENT_KEYWORDS) {
    const fileSpelling = toKebabCaseKeyword(keyword);
    const xsiType = keyword.charAt(0).toUpperCase() + keyword.slice(1);
    assertQuoted(ebnf, keyword, "plein.ebnf");
    assertQuoted(ebnf, fileSpelling, "plein.ebnf");
    assertQuoted(mapping, fileSpelling, "archimate-mapping.md");
    assertQuoted(mapping, keyword, "archimate-mapping.md");
    assertQuoted(mapping, xsiType, "archimate-mapping.md");
  }

  for (const alias of ["process", "function", "event", "service", "role", "collaboration"]) {
    assertQuoted(ebnf, alias, "plein.ebnf");
    assertQuoted(grammar, alias, "grammar.md");
    assertQuoted(mapping, alias, "archimate-mapping.md");
  }

  for (const stage of ["value-stream-stage", "valueStreamStage"]) {
    assertQuoted(ebnf, stage, "plein.ebnf");
    assertQuoted(mapping, stage, "archimate-mapping.md");
  }

  for (const keyword of RELATIONSHIP_KEYWORDS) {
    const fileSpelling = relationshipLanguageName(keyword as RelationshipKeyword);
    const xsiType = fileSpelling.charAt(0).toUpperCase() + fileSpelling.slice(1);
    assertQuoted(ebnf, keyword, "plein.ebnf");
    assertQuoted(ebnf, fileSpelling, "plein.ebnf");
    assertQuoted(grammar, keyword, "grammar.md");
    assertQuoted(grammar, fileSpelling, "grammar.md");
    assertQuoted(mapping, keyword, "archimate-mapping.md");
    assertQuoted(mapping, fileSpelling, "archimate-mapping.md");
    assertQuoted(mapping, xsiType, "archimate-mapping.md");
  }
});

test("vision and language-reference pages link the grammar and the mapping", () => {
  const readme = readRepo("README.md");
  const langRef = readRepo("docs/plein-dsl-archimate-4.md");
  const grammar = readRepo("docs/grammar.md");
  const mapping = readRepo("docs/archimate-mapping.md");

  assert.match(readme, /docs\/grammar\.md/);
  assert.match(readme, /docs\/archimate-mapping\.md/);
  assert.match(readme, /docs\/plein\.ebnf/);
  assert.match(langRef, /grammar\.md/);
  assert.match(langRef, /archimate-mapping\.md/);
  assert.match(langRef, /plein\.ebnf/);
  assert.match(grammar, /plein\.ebnf/);
  assert.match(grammar, /archimate-mapping\.md/);
  assert.match(grammar, /relationship-matrix\.md/);
  assert.match(mapping, /grammar\.md/);
  assert.match(mapping, /relationship-matrix\.md/);
  assert.match(mapping, /plein-dsl-archimate-4\.md/);
});
