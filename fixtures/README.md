# MVP check fixtures

These small fixtures exercise the `plein check` command:

- `valid-basic.plein` — minimal NordFreight-style model with typed relationships and a `view`; expected to pass with exit code 0.
- `valid-views.plein` — two viewpoints (`applicationStructure`, `applicationCooperation`) over one model, with include/exclude and `autoLayout`; expected to pass with exit code 0. Also the **golden viewpoint layout** fixture: `applicationStructure` membership is asserted by `src/layout.test.ts` against `golden-applicationStructure.json`. Switching those views (and a new view after reload) is `src/browser.test.ts`.
- `golden-applicationStructure.json` — expected node/edge ids for that viewpoint (include types keep `legacyBatch`; `exclude "* -> legacyBatch"` drops the flow edge).
- `broken-syntax.plein` — same model shape with an unclosed outer block; expected to fail with line-oriented syntax diagnostics.
- `malformed-views.plein` — viewpoint missing its keyword; expected to fail with a line-oriented views diagnostic.
- `unknown-keyword.plein` — valid structure containing the unsupported `legacyBatch` element keyword; expected to fail with an unknown-keyword diagnostic.
- `valid-value-stream-stages.plein` — one `value-stream` with three nested `value-stream-stage` steps chained by `flow` then `triggering`; expected to pass with exit code 0. Golden parse membership is `golden-value-stream-stages.json`.
- `golden-value-stream-stages.json` — expected parent id, stage ids, and relationship edges (composition plus the stage chain) for that fixture.
- `invalid-value-stream-nesting.plein` — `value-stream-stage` at model top level; expected to fail with a line-oriented nesting diagnostic.
- `unknown-value-stream-step.plein` — a `process` declared inside a `value-stream` body; expected to fail with an unknown-step-keyword diagnostic.
- `samples/value-stream-demo.plein` — Mac / README demo and **Arran Open smoke (success)**: one `value-stream` with three nested stages, two capabilities that `serves` stages, and two application components that `realizes` those capabilities; expected to pass with exit code 0. Pair with `broken-syntax.plein`, `malformed-views.plein`, or `invalid-value-stream-nesting.plein` for the error half of that checklist.

The fixtures are intentionally compact so parser and validator behavior is easy to inspect in review.
