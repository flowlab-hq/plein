# Repo layout — models, fixtures, and PR review

Short Deliverable note: where `.plein` models live in this repository, how contributors add them, and how pull requests review them. Mac-first paths and commands (POSIX `/`, bash/zsh). CI that runs `plein check` on fixtures is `.github/workflows/check-fixtures.yml` (`npm run check:fixtures`); this note does not duplicate that workflow.

## Where models live

This repo is the Plein tool **and** the checked-in `.plein` sources. There is no separate `models/` tree. Architecture markup used by tests, smoke, and the Mac app lives under [`fixtures/`](../fixtures/).

```
plein/
  fixtures/                 .plein sources + golden JSON pins
    valid-*.plein           golden check (exit 0)
    samples/                demos (also golden; Mac Open smoke)
    broken-*.plein          expected-fail (syntax)
    malformed-*.plein       expected-fail (views)
    unknown-*.plein         expected-fail (keyword)
    invalid-*.plein         expected-fail (nesting / validity)
    golden-*.json           asserted membership / parse
    golden-*.html           static HTML export snapshot (`plein export`)
    README.md               fixture catalogue
  src/                      TypeScript CLI, parser, layout, tests
  app/                      Mac Tauri UI
  docs/                     language reference, ArchiMate style map, and this note
  scripts/mac/              Apple Silicon packaging and smoke
  Formula/plein.rb          Homebrew CLI
```

Canonical golden / fail pair for `plein check`:

| Role | File | Expect |
| --- | --- | --- |
| Golden | [`fixtures/valid-basic.plein`](../fixtures/valid-basic.plein) | exit 0, `ok fixtures/valid-basic.plein (...)` |
| Expected-fail | [`fixtures/broken-syntax.plein`](../fixtures/broken-syntax.plein) | non-zero, `file:line:column` diagnostic on stderr |

Other golden files (`valid-views.plein`, `valid-catalogue-layers.plein`, `valid-capability-value-stream.plein`, `valid-value-stream-stages.plein`, `samples/value-stream-demo.plein`, `samples/research-data.plein`) and fail files (`malformed-views.plein`, `unknown-keyword.plein`, `invalid-value-stream-nesting.plein`, `unknown-value-stream-step.plein`) extend the same contract. Catalogue: [`fixtures/README.md`](../fixtures/README.md). Language: [`docs/plein-dsl-archimate-4.md`](plein-dsl-archimate-4.md). Render colours/icons: [`docs/archimate-style.md`](archimate-style.md).

`.plein` files are UTF-8 text with `/` paths. Use those relative paths from the repo root on macOS and Linux. Do not use Windows `\` paths or `C:\` prefixes.

## How contributors add a model

Keep fixtures compact so a PR can review the markup as architecture, not as a dump.

1. Add a `.plein` under `fixtures/` (check cases) or `fixtures/samples/` (demo the Mac app / README would open).
2. Name by contract: `valid-*` or `samples/` must pass `plein check`; `broken-*` / `malformed-*` / `unknown-*` / `invalid-*` must fail with a line-oriented diagnostic.
3. If the case pins membership or parse shape, add a `golden-*.json` next to it (see `golden-applicationStructure.json`, `golden-catalogue-layers.json`, `golden-archimate-style.json`, `golden-capability-value-stream.json`, `golden-value-stream-stages.json`, `golden-nested-quote-to-cash.json`) and assert it from a `src/*.test.ts` file. A static export snapshot is a `golden-*.html` file (`golden-booking-context.html`, asserted by `src/export.test.ts`).
4. Wire `plein check` coverage in `src/check.test.ts` and `scripts/check-fixtures.sh` (Mac CLI smoke delegates there).
5. List the file in [`fixtures/README.md`](../fixtures/README.md) with the expected exit and diagnostic class.
6. Do not change existing golden JSON or fail diagnostics unless the PR is intentionally changing that contract.

Product models that are not check fixtures still belong under `fixtures/samples/` until a later layout split. Do not add a parallel tree without a backlog item.

## How PRs review them

Review `.plein` diffs the same way as TypeScript: identifiers, relationship types, and `views` membership are the architecture.

- **Golden** files must still print `ok <path> (...)` and exit 0.
- **Expected-fail** files must still exit non-zero and keep the documented diagnostic class (`file:line:column`, unknown keyword, nesting, and so on). A fail fixture that starts passing is a regression.
- **`golden-*.json`** diffs are membership contracts (node ids, edge ids). Treat them like snapshot tests.
- Run the local checks below from the repo root before asking for review. Peer merge (Gilfoyle) — do not merge your own PR.

```bash
npm install
npm test
npx plein check fixtures/valid-basic.plein
npx plein check fixtures/broken-syntax.plein
./scripts/mac/smoke.sh
```

`npm test` compiles with `tsc` and runs `src/*.test.ts` (including `check.test.ts`, layout golden, ArchiMate style golden, static HTML/SVG export golden, and parser golden). `./scripts/assert-viewpoint-layout.sh` is the layout-only assert. `./scripts/assert-archimate-style.sh` is the colour/icon assert. `./scripts/assert-export.sh` is the `plein export` snapshot (`fixtures/golden-booking-context.html`).

## Mac contributor notes

Supported contributor machine: **Apple Silicon** (Homebrew prefix `/opt/homebrew`). Commands are bash/zsh from Terminal.app or iTerm. Intel Macs are out of scope for the app; the CLI commands below may work there via Node 18+ but are untested.

**From a source checkout** (Node 18+ via Homebrew or otherwise):

```bash
git clone https://github.com/flowlab-hq/plein.git
cd plein
npm install
npm test
npx plein check fixtures/valid-basic.plein
npx plein check fixtures/broken-syntax.plein
./scripts/mac/smoke.sh
```

**Homebrew CLI** (no npm by hand):

```bash
brew tap flowlab-hq/plein https://github.com/flowlab-hq/plein
brew install plein
plein check fixtures/valid-basic.plein
plein check fixtures/broken-syntax.plein
```

Run those `plein check` lines from the repo root so the relative `fixtures/...` paths resolve. After `brew install`, `PLEIN_BIN=plein ./scripts/mac/smoke.sh` uses the formula binary against this checkout’s fixtures.

**Mac app:** Open… a golden file (sample or `valid-basic.plein`) then an expected-fail file (`broken-syntax.plein`). Packaging and Gatekeeper: [`scripts/mac/README.md`](../scripts/mac/README.md). GUI Open / reload: [`app/README.md`](../app/README.md).
