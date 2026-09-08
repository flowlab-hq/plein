# Plein

**Plein** (say “pleen”) is a Flowlab HQ product: human-editable ArchiMate markup that renders lightweight architecture views — without a heavyweight EA suite.

One text model → many consistent ArchiMate viewpoints. Git-friendly, PR-reviewable, metamodel-validated.

## Documentation

* [Plein DSL language reference (ArchiMate 4)](docs/plein-dsl-archimate-4.md) — document shape, element vocabulary, relationships, views, and validation guidance.

Plein source files use the `.plein` extension.

## Mac install (Apple Silicon)

The supported Mac target is **Apple Silicon**. Intel Macs are out of scope for this release (Homebrew + Node may work for the CLI there, but that path is untested; the `.app` is Apple Silicon only). A signed `.pkg` is not published (no Apple signing identity).

**Mac app:** open a `.plein` file and render **one named viewpoint** from the `views` block as an SVG diagram. The list UI (elements, relationships, views) stays beside it. Open selects the first named view. Layout of that include/exclude set is `layoutViewpoint` / `renderViewpointSvg` in `src/layout.ts` (golden: `fixtures/golden-applicationStructure.json`). **Reload** (toolbar, File → Reload, or ⌘R) re-reads the open file and redraws the current viewpoint. A dedicated multi-view switcher is out of scope. Build, Open → view, reload, and golden-assert notes: [app/README.md](app/README.md).

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

* `plein check fixtures/valid-basic.plein` prints `ok fixtures/valid-basic.plein (...)` and exits 0.
* `plein check fixtures/broken-syntax.plein` prints a line-oriented diagnostic (for example `expected '}' to close plein`) and exits non-zero.

Packaging notes and `scripts/mac/smoke.sh` are in [scripts/mac/README.md](scripts/mac/README.md).

## CLI

Structural check: load a model (elements, typed relationships, and views) and exit 0 when it is valid. Syntax errors, unknown keywords, and malformed views exit non-zero with `file:line:column` diagnostics on stderr. `styles` are ignored for now.

Mac users should prefer the Homebrew steps above. From a source checkout (any OS with Node 18+):

```bash
npm install
npm run build
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
```

## Branding

Product mark: [branding/plein-mark.png](branding/plein-mark.png)
