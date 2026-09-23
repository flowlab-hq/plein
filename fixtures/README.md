# Fixtures

Checked-in `.plein` sources for this repo. Layout, how to add files, and how PRs review them: [docs/repo-layout.md](../docs/repo-layout.md).

These compact fixtures exercise `plein check`, `npm test`, and Mac smoke. They are intentionally small so parser and validator behavior is easy to inspect in review.

CI (`.github/workflows/check-fixtures.yml`) builds the CLI and runs `npm run check:fixtures` against this catalogue: golden files must exit 0; expected-fail files must exit non-zero. Keep those lists in `scripts/check-fixtures.sh` aligned with the bullets below.

## Golden (expect exit 0)

- `valid-basic.plein` — minimal NordFreight-style model with typed relationships and a `view`; expected to pass with exit code 0. Canonical golden for `plein check`. Also the **static export** golden: `plein export` of viewpoint `booking-context` is snapshotted as `golden-booking-context.html` (`src/export.test.ts`).
- `golden-booking-context.html` — self-contained HTML page for that viewpoint (inline SVG, no scripts or remote assets). Re-render with `npx plein export fixtures/valid-basic.plein --view booking-context --format html > fixtures/golden-booking-context.html`. Open the file in a browser; the Mac app is not required.
- `valid-views.plein` — two viewpoints (`applicationStructure`, `applicationCooperation`) over one model, with include/exclude and `autoLayout`; expected to pass with exit code 0. Also the **golden viewpoint layout** fixture: `applicationStructure` membership is asserted by `src/layout.test.ts` against `golden-applicationStructure.json`. Switching those views (and a new view after reload) is `src/browser.test.ts`.
- `golden-applicationStructure.json` — expected node/edge ids for that viewpoint (include types keep `legacyBatch`; `exclude "* -> legacyBatch"` drops the flow edge).
- `valid-catalogue-layers.plein` — **catalogue accept** golden: one representative element per ArchiMate layer (Strategy, Motivation, Business, Application, Technology, Physical, Implementation and migration). Compact sample by choice — the full 58-keyword language-reference catalogue is generated and asserted in `src/keywords.test.ts`, not duplicated here. Expected to pass with exit code 0. Golden parse membership is `golden-catalogue-layers.json`. Also the **golden ArchiMate colour/icon** fixture: `catalogue-layers` SVG fills and glyphs are asserted by `src/archimate-style.test.ts` against `golden-archimate-style.json` and `golden-catalogue-layers.svg`.
- `golden-catalogue-layers.json` — expected id, canonical keyword, language-reference spelling, and layer for that per-layer sample.
- `golden-archimate-style.json` — expected layer fill and decorator icon for that per-layer sample (Mac SVG render path).
- `golden-catalogue-layers.svg` — visual pin of that viewpoint (open in a browser). Re-render with `./scripts/render-viewpoint-svg.sh fixtures/valid-catalogue-layers.plein catalogue-layers`.
- `valid-manual-layout.plein` — **manual layout** golden: `autoLayout off` plus `position` clauses for a story view, and a second view that declares the same positions under `autoLayout tb` (those positions must be ignored). Expected to pass with exit code 0. Coordinates are asserted by `src/layout.test.ts` against `golden-manual-layout.json`. Reload persistence is `src/reload.test.ts`.
- `golden-manual-layout.json` — expected top-lefts for viewpoint `story` when auto-layout is off.
- `valid-layer-bands.plein` — **layer-band layout** golden: Motivation/Strategy, Business, nested Application grouping, Technology, and Implementation with `autoLayout layers` + `nesting nested`. Elements are declared bottom-up (implementation first) so band order cannot be an artifact of source order. Expected to pass with exit code 0. Asserted by `src/layout.test.ts` (band order + nested container).
- `valid-organic-grid.plein` — **organic + grid layout** golden: `landscape` is `autoLayout organic` (seeded force-directed), `catalogue` is `autoLayout grid` (kind, then name), `catalogueByName` is `autoLayout grid name`, and `ranked` is direction-only so it stays layered. Carrier and Invoice have no relationships (disconnected leftovers). Expected to pass with exit code 0. Asserted by `src/layout.test.ts`. Coordinate pin: `golden-organic-grid.json`.
- `valid-capability-value-stream.plein` — **glyph pair** golden: one `capability` and one `value-stream` so the staircase vs notched-chevron decorators can be compared. Expected to pass with exit code 0. Style pin: `golden-capability-value-stream.json` / `golden-capability-value-stream.svg` (`src/archimate-style.test.ts`).
- `golden-capability-value-stream.json` — expected fill and decorator icon for that pair (capability ≠ value-stream).
- `golden-capability-value-stream.svg` — visual pin of that viewpoint. Re-render with `./scripts/render-viewpoint-svg.sh fixtures/valid-capability-value-stream.plein capability-and-value-stream`.
- `valid-value-stream-stages.plein` — one `value-stream` with three nested `value-stream-stage` steps chained by `flow` then `triggering`; expected to pass with exit code 0. Golden parse membership is `golden-value-stream-stages.json`.
- `golden-value-stream-stages.json` — expected parent id, stage ids, and relationship edges (composition plus the stage chain) for that fixture.
- `samples/value-stream-demo.plein` — Mac / README demo and **Arran Open smoke (success)**: one `value-stream` with three nested stages, two capabilities that `serves` stages, and two application components that `realizes` those capabilities. The viewpoint sets `nesting nested` so Quote, Book, and Collect render **inside** Quote to cash. Expected to pass with exit code 0.
- `samples/research-data.plein` — Mac / README demo of the **research-data / ePrints / Arkivum** ArchiMate view: business actor and find/request-access processes, application project / paper / research-data concept / Sussex Research Online – ePrints, technology artifact / file storage / archive / Research Storage Platform / Arkivum. Relationships: aggregation, realization, triggering, serving, association (including the Manual Process link). Three named views so Arran can exercise S4 view-jump. Expected to pass with exit code 0.
- `golden-nested-quote-to-cash.json` — expected membership plus nested children for that sample (`src/layout.test.ts`). Default (omit `nesting`) remains side-by-side; see `valid-value-stream-stages.plein`.
- `basic.plein` — larger NordFreight-style model still loaded by parser / list tests; expected to parse. Prefer `valid-basic.plein` for new `plein check` coverage.
- `open-exchange/booking.xml` — representative **Open Exchange** model for `plein import` (elements across layers, all eleven relationship types, two diagrams, plus junction / geometry / style / folder gaps). Mapping and gaps: [docs/open-exchange-import.md](../docs/open-exchange-import.md).
- `open-exchange/booking.plein` — pinned `plein import` of that XML. Expected to pass `plein check` with exit code 0 (17 elements, 15 relationships, 2 views). `src/open-exchange.test.ts` asserts the import matches this file.
- `open-exchange/booking.export.xml` — pinned `plein export-open-exchange` of `booking.plein` (same subset; no junctions, geometry, styles, or comment breadcrumbs).
- `open-exchange/booking.roundtrip.plein` — pinned `plein import` of that export. Same elements, relationships, and views as `booking.plein`; comments and the original model name are gone. Expected to pass `plein check` with exit code 0.

## Expected-fail (expect non-zero + `file:line:column`)

- `broken-syntax.plein` — same model shape as `valid-basic.plein` with an unclosed outer block; expected to fail with line-oriented syntax diagnostics. Canonical fail pair for `plein check` and Arran Open smoke.
- `malformed-views.plein` — viewpoint missing its keyword; expected to fail with a line-oriented views diagnostic.
- `unknown-keyword.plein` — valid structure containing the unsupported `legacyBatch` element keyword; expected to fail with an unknown-keyword diagnostic. **Catalogue reject** half: `plein check` exits non-zero with `file:line:column`.
- `invalid-value-stream-nesting.plein` — `value-stream-stage` at model top level; expected to fail with a line-oriented nesting diagnostic.
- `unknown-value-stream-step.plein` — a `process` declared inside a `value-stream` body; expected to fail with an unknown-step-keyword diagnostic.

Pair `samples/value-stream-demo.plein` with `broken-syntax.plein`, `malformed-views.plein`, or `invalid-value-stream-nesting.plein` for the error half of the Mac Open checklist.

## Adding a fixture

1. Drop a compact `.plein` here (or under `samples/` for a demo).
2. Name `valid-*` / `samples/` for golden, or `broken-*` / `malformed-*` / `unknown-*` / `invalid-*` for expected-fail.
3. Cover it in `src/check.test.ts` and `scripts/check-fixtures.sh` (Mac smoke delegates there).
4. If membership is pinned, add `golden-*.json` and assert it from `src/*.test.ts`.
5. Add a one-line entry to this README.

Do not flip an existing fail fixture to passing, or a golden JSON pin, unless the PR is the contract change.

## Mac

From the repo root in Terminal (zsh/bash, Apple Silicon). Forward-slash paths only.

```bash
npm test
npx plein check fixtures/valid-basic.plein
npx plein check fixtures/broken-syntax.plein
./scripts/mac/smoke.sh
```

Homebrew: `plein check fixtures/valid-basic.plein` (run from this checkout so the relative path resolves).
