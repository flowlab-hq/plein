# MVP check fixtures

These small fixtures exercise the `plein check` command:

- `valid-basic.plein` — minimal NordFreight-style model with typed relationships and a `view`; expected to pass with exit code 0.
- `valid-views.plein` — two viewpoints (`applicationStructure`, `applicationCooperation`) over one model, with include/exclude and `autoLayout`; expected to pass with exit code 0. Also the **golden viewpoint layout** fixture: `applicationStructure` membership is asserted by `src/layout.test.ts` against `golden-applicationStructure.json`. Switching those views (and a new view after reload) is `src/browser.test.ts`.
- `golden-applicationStructure.json` — expected node/edge ids for that viewpoint (include types keep `legacyBatch`; `exclude "* -> legacyBatch"` drops the flow edge).
- `broken-syntax.plein` — same model shape with an unclosed outer block; expected to fail with line-oriented syntax diagnostics.
- `malformed-views.plein` — viewpoint missing its keyword; expected to fail with a line-oriented views diagnostic.
- `unknown-keyword.plein` — valid structure containing the unsupported `legacyBatch` element keyword; expected to fail with an unknown-keyword diagnostic.

The fixtures are intentionally compact so parser and validator behavior is easy to inspect in review.
