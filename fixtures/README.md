# MVP check fixtures

These small fixtures exercise the `plein check` command:

- `valid-basic.plein` — minimal NordFreight-style model with typed relationships and a view; expected to pass with exit code 0.
- `broken-syntax.plein` — same model shape with an unclosed outer block; expected to fail with line-oriented syntax diagnostics.
- `unknown-keyword.plein` — valid structure containing the unsupported `legacyBatch` element keyword; expected to fail with an unknown-keyword diagnostic.

The fixtures are intentionally compact so parser and validator behavior is easy to inspect in review.
