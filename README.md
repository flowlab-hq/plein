# Plein

**Plein** (say “pleen”) is a Flowlab HQ product: human-editable ArchiMate markup that renders lightweight architecture views — without a heavyweight EA suite.

One text model → many consistent ArchiMate viewpoints. Git-friendly, PR-reviewable, metamodel-validated.

## Documentation

* [Plein DSL language reference (ArchiMate 4)](docs/plein-dsl-archimate-4.md) — document shape, element vocabulary, relationships, views, and validation guidance.
* [ArchiMate type colours and icons](docs/archimate-style.md) — layer fills and decorator glyphs used by the Mac SVG renderer.
* [Repo layout — models, fixtures, and PR review](docs/repo-layout.md) — where `.plein` files live, how to add golden/fail fixtures, and how pull requests review them (Mac-friendly).

Plein source files use the `.plein` extension.

## Models and PR review

Checked-in `.plein` sources live under [`fixtures/`](fixtures/) (no separate `models/` tree). Contributors add compact **golden** files (`valid-*.plein`, `samples/`) that must pass `plein check`, and **expected-fail** files (`broken-*`, `malformed-*`, `unknown-*`, `invalid-*`) that must exit non-zero with `file:line:column` diagnostics. Canonical pair: [`fixtures/valid-basic.plein`](fixtures/valid-basic.plein) (golden) and [`fixtures/broken-syntax.plein`](fixtures/broken-syntax.plein) (fail).

Review a model PR as text: identifiers, relationship types, and `views` membership. Then from the repo root (macOS Terminal or Linux; POSIX `/` paths):

```bash
npm test
npx plein check fixtures/valid-basic.plein
npx plein check fixtures/broken-syntax.plein
```

How to add a fixture, golden JSON pins, Homebrew/`./scripts/mac/smoke.sh`, and the review checklist: [docs/repo-layout.md](docs/repo-layout.md). Catalogue: [fixtures/README.md](fixtures/README.md).

## Sample model

[fixtures/samples/value-stream-demo.plein](fixtures/samples/value-stream-demo.plein) is a NordFreight **quote-to-cash** demo: one `value-stream` with nested stages that `flowsTo` / `triggers` each other, two `capability` elements that `serves` those stages, and two `application-component` elements that `realizes` the capabilities. Open it in the Mac app or check it:

```bash
plein check fixtures/samples/value-stream-demo.plein
```

## Download the Mac app (Apple Silicon `.dmg`)

The GUI ships as an **Apple Silicon** `.dmg` on [GitHub Releases](https://github.com/flowlab-hq/plein/releases). Install and launch **without Node or npm**. Intel Macs are out of scope (untested; no x64 `.dmg`).

1. Download **`Plein-*-macos-arm64.dmg`** from the [latest Release](https://github.com/flowlab-hq/plein/releases/latest).
2. Open the disk image and drag **Plein** into Applications.
3. First launch: this build is **ad-hoc signed and not notarized** (no Apple Developer ID in CI). Right-click **Plein** → **Open** → **Open**, or System Settings → Privacy & Security → **Open Anyway**.
4. **Open…** the sample [fixtures/samples/value-stream-demo.plein](fixtures/samples/value-stream-demo.plein). The **Quote to cash** viewpoint should render (value stream stages, capabilities, applications).
5. **Open…** the broken fixture [fixtures/broken-syntax.plein](fixtures/broken-syntax.plein). The banner should show a `file:line:column` diagnostic (same class as `plein check`); no diagram. [fixtures/malformed-views.plein](fixtures/malformed-views.plein) is the same error class for a bad `views` block.

Developer ID signing and notarization are a documented follow-up — see [scripts/mac/README.md](scripts/mac/README.md).

### Arran smoke checklist

1. Download the `.dmg` from the GitHub Release.
2. Install (drag to Applications) and launch — no Node/npm.
3. Open the sample — diagram renders. Value-stream / capability boxes are **orange**; application components are **cyan**, each with a type glyph in the top-right.
4. Open [fixtures/valid-catalogue-layers.plein](fixtures/valid-catalogue-layers.plein). Seven boxes, one per layer: orange capability, purple goal, yellow actor (stick figure), cyan component, green node (cube), green facility (building), pink work-package. Mapping: [docs/archimate-style.md](docs/archimate-style.md).
5. Open the broken fixture — clear error in the UI.
6. Intel: skip.

Deeper Open → view / reload and the **This .plein did not load** banner live in [app/README.md](app/README.md) / [PR #16](https://github.com/flowlab-hq/plein/pull/16) (Moss: Mac Open + error smoke). Merge that PR with this one; the checklists match (sample → broken → `file:line:column`).

### Cut a release (first `.dmg`)

This Linux / cloud environment cannot produce a Mac bundle. After this lands on `main`, Arran (or anyone with push) publishes the first artifact once:

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions (**Release macOS .dmg**, `macos-14` arm64) builds the unsigned `.dmg` and attaches it to the `v0.1.0` Release with the notes in `scripts/mac/release-notes.md`. Or run that workflow from the Actions tab (`workflow_dispatch`, tick **create_release**, tag `v0.1.0`).

On an Apple Silicon Mac, `./scripts/mac/build-dmg.sh` writes `dist/macos/Plein-<version>-macos-arm64.dmg` if you need a local artifact before CI.

## Mac install (CLI + source)

The supported Mac target is **Apple Silicon**. Intel Macs are out of scope for this release (Homebrew + Node may work for the CLI there, but that path is untested). A signed `.pkg` is not published (no Apple signing identity).

**Mac app:** open a `.plein` file and browse **named viewpoints** from the `views` block on one SVG canvas. Each view uses the same loaded model; a new view in markup appears after **Reload**. Open selects the first named view. Layout is `layoutViewpoint` / `renderViewpointSvg` in `src/layout.ts` (golden: `fixtures/golden-applicationStructure.json`); boxes are coloured by ArchiMate layer with type glyphs from `src/archimate-style.ts` (mapping: [docs/archimate-style.md](docs/archimate-style.md); visual pin: `fixtures/golden-catalogue-layers.svg`). The switcher is `browseNamedView` in `src/browser.ts`. **Reload** (toolbar, File → Reload, or ⌘R) re-reads the open file and redraws the current viewpoint. Build, Open → view, switch, reload, and golden-assert notes: [app/README.md](app/README.md). Prefer the [`.dmg` download](#download-the-mac-app-apple-silicon-dmg) if you only want the GUI.

```bash
npm install
npm test
npm run app:preview
```

On an Apple Silicon Mac, `npm run app:build` writes `Plein.app` and `Plein_*.dmg`.

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

### Arran smoke — Mac Open + errors

Checklist for the upcoming GitHub Release `.dmg` (Gilfoyle owns packaging; this repo does not produce the disk image yet). After install, no Node/npm:

1. Launch Plein. **Open** [fixtures/samples/value-stream-demo.plein](fixtures/samples/value-stream-demo.plein). The **Quote to cash** viewpoint loads. No error banner. Value streams and capabilities are orange; application components are cyan; type glyphs sit in the top-right of each box.
2. **Open** [fixtures/valid-catalogue-layers.plein](fixtures/valid-catalogue-layers.plein). The **ArchiMate layers sample** view shows the seven-layer rainbow (orange / purple / yellow / cyan / green / green / pink) with distinct glyphs. See [docs/archimate-style.md](docs/archimate-style.md).
3. **Open** a broken fixture. The banner shows a `file:line:column` diagnostic (same class as `plein check`). No diagram.
   - [fixtures/broken-syntax.plein](fixtures/broken-syntax.plein)
   - [fixtures/malformed-views.plein](fixtures/malformed-views.plein)
   - [fixtures/invalid-value-stream-nesting.plein](fixtures/invalid-value-stream-nesting.plein)

Until the `.dmg` is published, the same steps work from a local `Plein.app` (`npm run app:build`) or [app preview](app/README.md). Extended Open → view / switch / reload steps are in [app/README.md](app/README.md).

## CLI

Structural check: load a model (elements, typed relationships, and views) and exit 0 when it is valid. Syntax errors, unknown keywords, and malformed views exit non-zero with `file:line:column` diagnostics on stderr. The `styles` block is still ignored; diagram colours come from the built-in type/layer map ([docs/archimate-style.md](docs/archimate-style.md)).

Mac users should prefer the Homebrew steps above. From a source checkout (any OS with Node 18+):

```bash
npm install
npm run build
npx plein check fixtures/samples/value-stream-demo.plein
npx plein check fixtures/valid-basic.plein
npm run check:fixtures
npm test
```

GitHub Actions (**Check fixtures**) installs the CLI and runs `npm run check:fixtures`: golden models in [fixtures/](fixtures/README.md) must exit 0; expected-fail fixtures must exit non-zero. The job fails if a golden check fails or an expected-fail fixture unexpectedly passes.

See [docs/plein-dsl-archimate-4.md](docs/plein-dsl-archimate-4.md) for document shape and vocabulary. Canonical typed relationships are `composedOf`, `aggregates`, `assignedTo`, `realizes`, `serves`, `accesses`, `influences`, `triggers`, `flowsTo`, `specializes`, and `associatedWith` (language-reference names such as `serving` are aliases).

### Golden viewpoint layout

`fixtures/valid-views.plein` viewpoint `applicationStructure` is the golden include/exclude diagram. Membership is pinned in `fixtures/golden-applicationStructure.json` (`legacyBatch` stays as a node; `tms -> legacyBatch` is omitted).

```bash
npm test
# or only the layout assert:
./scripts/assert-viewpoint-layout.sh
# ArchiMate colours + icons on the SVG render path:
./scripts/assert-archimate-style.sh
# edit → reload → diagram (no app):
./scripts/assert-reload-diagram.sh
# one model → many views + new view after reload:
./scripts/assert-multi-view-browser.sh
```

## Branding

Product mark: [branding/plein-mark.png](branding/plein-mark.png)
