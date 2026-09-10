# Fixtures

Checked-in `.plein` sources for this repo. Layout, how to add files, and how PRs review them: [docs/repo-layout.md](../docs/repo-layout.md).

These compact fixtures exercise `plein check`, `npm test`, and Mac smoke. They are intentionally small so parser and validator behavior is easy to inspect in review.

## Golden (expect exit 0)

- `valid-basic.plein` — minimal NordFreight-style model with typed relationships and a `view`; expected to pass with exit code 0. Canonical golden for `plein check`.
- `valid-views.plein` — two viewpoints (`applicationStructure`, `applicationCooperation`) over one model, with include/exclude and `autoLayout`; expected to pass with exit code 0. Also the **golden viewpoint layout** fixture: `applicationStructure` membership is asserted by `src/layout.test.ts` against `golden-applicationStructure.json`. Switching those views (and a new view after reload) is `src/browser.test.ts`.
- `golden-applicationStructure.json` — expected node/edge ids for that viewpoint (include types keep `legacyBatch`; `exclude "* -> legacyBatch"` drops the flow edge).
- `valid-value-stream-stages.plein` — one `value-stream` with three nested `value-stream-stage` steps chained by `flow` then `triggering`; expected to pass with exit code 0. Golden parse membership is `golden-value-stream-stages.json`.
- `golden-value-stream-stages.json` — expected parent id, stage ids, and relationship edges (composition plus the stage chain) for that fixture.
- `samples/value-stream-demo.plein` — Mac / README demo and **Arran Open smoke (success)**: one `value-stream` with three nested stages, two capabilities that `serves` stages, and two application components that `realizes` those capabilities; expected to pass with exit code 0.
- `basic.plein` — larger NordFreight-style model still loaded by parser / list tests; expected to parse. Prefer `valid-basic.plein` for new `plein check` coverage.

## Expected-fail (expect non-zero + `file:line:column`)

- `broken-syntax.plein` — same model shape as `valid-basic.plein` with an unclosed outer block; expected to fail with line-oriented syntax diagnostics. Canonical fail pair for `plein check` and Arran Open smoke.
- `malformed-views.plein` — viewpoint missing its keyword; expected to fail with a line-oriented views diagnostic.
- `unknown-keyword.plein` — valid structure containing the unsupported `legacyBatch` element keyword; expected to fail with an unknown-keyword diagnostic.
- `invalid-value-stream-nesting.plein` — `value-stream-stage` at model top level; expected to fail with a line-oriented nesting diagnostic.
- `unknown-value-stream-step.plein` — a `process` declared inside a `value-stream` body; expected to fail with an unknown-step-keyword diagnostic.

Pair `samples/value-stream-demo.plein` with `broken-syntax.plein`, `malformed-views.plein`, or `invalid-value-stream-nesting.plein` for the error half of the Mac Open checklist.

## Adding a fixture

1. Drop a compact `.plein` here (or under `samples/` for a demo).
2. Name `valid-*` / `samples/` for golden, or `broken-*` / `malformed-*` / `unknown-*` / `invalid-*` for expected-fail.
3. Cover it in `src/check.test.ts` (and `scripts/mac/smoke.sh` if it belongs in CLI smoke).
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
