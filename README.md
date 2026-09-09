# Plein

**Plein** (say “pleen”) is a Flowlab HQ product: human-editable ArchiMate markup that renders lightweight architecture views — without a heavyweight EA suite.

One text model → many consistent ArchiMate viewpoints. Git-friendly, PR-reviewable, metamodel-validated.

## Documentation

* [Plein DSL language reference (ArchiMate 4)](docs/plein-dsl-archimate-4.md) — document shape, element vocabulary, relationships, views, and validation guidance.

Plein source files use the `.plein` extension.

## Sample model

[fixtures/samples/value-stream-demo.plein](fixtures/samples/value-stream-demo.plein) is a NordFreight **quote-to-cash** demo: one `value-stream` with nested stages that `flowsTo` / `triggers` each other, two `capability` elements that `serves` those stages, and two `application-component` elements that `realizes` the capabilities. Open it in the Mac app or check it:

```bash
plein check fixtures/samples/value-stream-demo.plein
```

## Mac install (Apple Silicon)

The supported Mac target is **Apple Silicon**. Intel Macs are out of scope for this release (Homebrew + Node may work for the CLI there, but that path is untested; the `.app` is Apple Silicon only). A signed `.pkg` is not published (no Apple signing identity).

**Mac app:** open a `.plein` file and browse **named viewpoints** from the `views` block on one SVG canvas. Each view uses the same loaded model; a new view in markup appears after **Reload**. Open selects the first named view. Layout is `layoutViewpoint` / `renderViewpointSvg` in `src/layout.ts` (golden: `fixtures/golden-applicationStructure.json`); the switcher is `browseNamedView` in `src/browser.ts`. **Reload** (toolbar, File → Reload, or ⌘R) re-reads the open file and redraws the current viewpoint. Build, Open → view, switch, reload, and golden-assert notes: [app/README.md](app/README.md).

```bash
npm install
npm test
npm run app:preview
```

On an Apple Silicon Mac, `npm run app:build` writes `Plein.app`.

**1. Install Homebrew** (skip if `brew --version` already works):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**2. Install Plein** — Homebrew provides Node if needed; you do not run npm:

```bash
brew tap flowlab-hq/plein https://github.com/flowlab-hq/plein
brew install plein
```

**3. Check a model:**

```bash
git clone https://github.com/flowlab-hq/plein.git
cd plein
plein check fixtures/valid-basic.plein
```

Expected walkthrough:

* `plein check fixtures/samples/value-stream-demo.plein` prints `ok fixtures/samples/value-stream-demo.plein (...)` and exits 0.
* `plein check fixtures/valid-basic.plein` prints `ok fixtures/valid-basic.plein (...)` and exits 0.
* `plein check fixtures/broken-syntax.plein` prints a line-oriented diagnostic (for example `expected '}' to close plein`) and exits non-zero.

Packaging notes and `scripts/mac/smoke.sh` are in [scripts/mac/README.md](scripts/mac/README.md).

## CLI

Structural check: load a model (elements, typed relationships, and views) and exit 0 when it is valid. Syntax errors, unknown keywords, and malformed views exit non-zero with `file:line:column` diagnostics on stderr. `styles` are ignored for now.

Mac users should prefer the Homebrew steps above. From a source checkout (any OS with Node 18+):

```bash
npm install
npm run build
npx plein check fixtures/samples/value-stream-demo.plein
npx plein check fixtures/valid-basic.plein
npm test
```

See [docs/plein-dsl-archimate-4.md](docs/plein-dsl-archimate-4.md) for document shape and vocabulary. Canonical typed relationships are `composedOf`, `aggregates`, `assignedTo`, `realizes`, `serves`, `accesses`, `influences`, `triggers`, `flowsTo`, `specializes`, and `associatedWith` (language-reference names such as `serving` are aliases).

### Golden viewpoint layout

`fixtures/valid-views.plein` viewpoint `applicationStructure` is the golden include/exclude diagram. Membership is pinned in `fixtures/golden-applicationStructure.json` (`legacyBatch` stays as a node; `tms -> legacyBatch` is omitted).

```bash
npm test
# or only the layout assert:
./scripts/assert-viewpoint-layout.sh
# edit → reload → diagram (no app):
./scripts/assert-reload-diagram.sh
# one model → many views + new view after reload:
./scripts/assert-multi-view-browser.sh
```

## Branding

Product mark: [branding/plein-mark.png](branding/plein-mark.png)
