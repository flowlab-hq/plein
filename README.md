# Plein

**Plein** (say “pleen”) is a Flowlab HQ product: human-editable ArchiMate markup that renders lightweight architecture views — without a heavyweight EA suite.

One text model → many consistent ArchiMate viewpoints. Git-friendly, PR-reviewable, metamodel-validated.

## Documentation

* [Plein DSL language reference (ArchiMate 4)](docs/plein-dsl-archimate-4.md) — document shape, element vocabulary, relationships, views, and validation guidance.
* [Grammar](docs/grammar.md) ([`plein.ebnf`](docs/plein.ebnf)) — concrete syntax a parser can implement against, including keyword and relationship spellings.
* [Plein constructs and ArchiMate 4](docs/archimate-mapping.md) — elements, relationships, views, and profiles mapped to ArchiMate 4 concepts.
* [Relationship matrix](docs/relationship-matrix.md) — allowed source, relationship, and target pairs. `plein check` rejects a combination that is not in the matrix.
* [Mac-app / LLM formatting pitfalls](docs/plein-dsl-archimate-4.md#mac-app-authoring-wrong-vs-right) — header is only `plein {`; labeled elements need `as id`; kebab-case keywords; `id -> id: serving`; unique `viewpoint` ids; copy-paste example with two views.
* [ArchiMate type colours and icons](docs/archimate-style.md) — layer fills and decorator glyphs used by the Mac SVG renderer.
* [Open Exchange import and export](docs/open-exchange-import.md) — `plein import` and `plein export-open-exchange` for a documented ArchiMate exchange subset.
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

Copy-paste `.plein` for a human or LLM: follow [Mac-app / LLM formatting pitfalls](docs/plein-dsl-archimate-4.md#mac-app-authoring-wrong-vs-right) (`plein {`, `as id`, unique `viewpoint` names). Golden patterns: this sample and [`fixtures/valid-views.plein`](fixtures/valid-views.plein).

[fixtures/samples/value-stream-demo.plein](fixtures/samples/value-stream-demo.plein) is a NordFreight **quote-to-cash** demo: one `value-stream` with nested stages that `flowsTo` / `triggers` each other **inside** the parent (`nesting nested` on the viewpoint), two `capability` elements that `serves` those stages, and two `application-component` elements that `realizes` the capabilities. Open it in the Mac app or check it:

```bash
plein check fixtures/samples/value-stream-demo.plein
```

[fixtures/samples/research-data.plein](fixtures/samples/research-data.plein) is the **research-data / ePrints / Arkivum** sample (business find/request-access, application project and Sussex Research Online – ePrints, technology File Storage / Arkivum). It has three named views (**Research data landscape**, **Published research access**, **Research storage and archive**) so the Mac app can switch viewpoints with the current view name above the canvas:

```bash
plein check fixtures/samples/research-data.plein
```

## Download the Mac app (Apple Silicon `.dmg`)

The GUI ships as an **Apple Silicon** `.dmg` on [GitHub Releases](https://github.com/flowlab-hq/plein/releases). Install and launch **without Node or npm**. Intel Macs are out of scope (untested; no x64 `.dmg`).

1. Download **`Plein-*-macos-arm64.dmg`** from the [latest Release](https://github.com/flowlab-hq/plein/releases/latest).
2. Open the disk image and drag **Plein** into Applications.
3. First launch: this build is **ad-hoc signed and not notarized** (no Apple Developer ID in CI). Right-click **Plein** → **Open** → **Open**, or System Settings → Privacy & Security → **Open Anyway**.
4. **Open…** the sample [fixtures/samples/value-stream-demo.plein](fixtures/samples/value-stream-demo.plein). The **Quote to cash** viewpoint should render with **Quote**, **Book**, and **Collect** **inside** the Quote to cash container (file default `nesting nested`). Capabilities and applications sit beside it.
5. **Open…** the broken fixture [fixtures/broken-syntax.plein](fixtures/broken-syntax.plein). The banner should show a `file:line:column` diagnostic (same class as `plein check`); no diagram. [fixtures/malformed-views.plein](fixtures/malformed-views.plein) is the same error class for a bad `views` block.

Developer ID signing and notarization are a documented follow-up — see [scripts/mac/README.md](scripts/mac/README.md).

### Arran smoke checklist

1. Download the `.dmg` from the GitHub Release.
2. Install (drag to Applications) and launch — no Node/npm.
3. Open the sample — diagram renders. Value-stream / capability boxes are **orange**; application components are **cyan**, each with a type glyph in the top-right.
4. Confirm **Views**, **Elements (8)**, and **Relationships (9)** sit in the **left sidebar**. The canvas uses the remaining height — there is **no bottom strip** of lists. Scroll a list if it overflows; counts stay on the headings.
5. Click **Quote freight** on the diagram (nested inside Quote to cash). The **Elements** row for `quote` highlights. Click the empty canvas (or press Escape) — the list highlight clears. Click **TMS** in the Elements list — the TMS box on the diagram highlights. Click a **Relationships** row (for example `rateEngine → rateQuote : realizes`) — that edge highlights. Multi-select and editing from the list are out of scope.
6. Open [fixtures/valid-views.plein](fixtures/valid-views.plein). The **View** chrome above the diagram reads **Application Structure** (always visible — not only in a scrolled list). On **Application Structure**, click **Shipment** on the diagram — the Elements row highlights. Switch to **Application Cooperation** — the highlight clears (shipment is not in that view) and the **View** name updates without reopening the file. Click **TMS** in the list — the TMS box highlights on both views.
7. Open [fixtures/valid-catalogue-layers.plein](fixtures/valid-catalogue-layers.plein). Seven boxes, one per layer: orange capability (staircase of blocks), purple goal, yellow actor (stick figure), cyan component, green node (cube), green facility (building), pink work-package. Mapping: [docs/archimate-style.md](docs/archimate-style.md). Capability must not use the value-stream chevron — pair: [fixtures/valid-capability-value-stream.plein](fixtures/valid-capability-value-stream.plein). Sidebar lists stay on the left.
8. Open the broken fixture — clear error in the UI. Sidebar and diagram stay hidden.
9. Intel: skip.

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

**Mac app:** open a `.plein` file and browse **named viewpoints** from the `views` block on one SVG canvas. The view name stays in the chrome above the canvas. **Views**, **Elements**, and **Relationships** share the **left sidebar** (counts on the headings; lists scroll; the current named view is marked **Showing**). Selecting a diagram box or edge highlights the matching list row, and selecting a list row highlights the matching diagram item (bidirectional; shift-click or a marquee selects several; Escape or empty canvas clears). A collapsible inspector on the right shows the selected element's name and notes. Leaving the notes field writes a `notes` clause into the open `.plein` (the Mac app writes the file; browser preview downloads it and **Reload** uses that text). Collapse does not clear the selection. An element with no notes shows an empty state. The diagram uses the remaining height — there is no bottom list strip. Scroll the canvas to pan (a canvas that is only wider than the pane pans sideways with the wheel); hold ⌘ or Ctrl and scroll to zoom toward the pointer (25%–400%). Each view uses the same loaded model; a new view in markup appears after **Reload**. Open selects the first named view. Layout is ELK Layered (`layoutViewpoint` / `renderViewpointSvg` in `src/layout.ts`, elkjs; goldens: `fixtures/golden-applicationStructure.json`, `fixtures/golden-nested-quote-to-cash.json`). Boxes are coloured by ArchiMate layer with type glyphs from `src/archimate-style.ts` (mapping: [docs/archimate-style.md](docs/archimate-style.md); visual pin: `fixtures/golden-catalogue-layers.svg`). Aggregation/composition default to **side-by-side**; `nesting nested` on the view draws children inside the parent. The Mac diagram chrome is one row of menus: **Layout**, **View**, and **Grid**. The row does not scroll. **Layout** opens **Auto layout** (File / On / Off), **Mode** (Default / Layered / Layers / Organic / Grid), and **Options**; the active auto layout and mode stay on the menu. **Options** holds **Direction** (File / TB / BT / LR / RL), **Routing** (File / Orthogonal / Polyline), and **Nesting** (File default / Nested / Beside). **View** opens optional **Focus** (on by default); the current choice stays on the menu. **Grid** opens **Lines** (show or hide the snap lines) and **Snap spacing**; the current lines state and spacing stay on the menu. Those controls are not a second row. Those overrides are local preview only — the `.plein` clause is the source of truth for PRs. `autoLayout off` (alias `manual`) plus `position <id> <x> <y>` freezes that view: Reload keeps those top-lefts, and turning auto-layout back on (the clause, or toolbar **On**) recomputes with the selected mode and ignores the saved positions. **Save** (toolbar, File → Save, or ⌘S) writes those clauses into the open `.plein` while Auto layout is **Off** (or **File** on a view that is already `off` / `manual`). **On** disables Save and drops unsaved moves. The file name reads **Unsaved** after a drag, a group move, or **Off** on a view the file still lays out automatically, until Save. Opening a file seats automatic boxes and orthogonal relationships on the canvas snap grid (ELK layered, layers, and organic). Toolbar **Off** freezes the layout currently on screen for this session, including across Reload, and keeps that seating; a drag then snaps the top-left to the snap spacing (default 24, **Grid → Snap spacing**). A multi-selection moves together: the box under the pointer snaps, and the rest of the set keeps its offset. Drawn lines stay 8 model units apart from the top-left of model space — snap spacing does not make them coarser, only zoom does. **Lines** under **Grid** show or hide those lines and does not turn snap off. That overlay is not `autoLayout grid` catalogue packing. Omitting a routing token keeps orthogonal (right-angle) connectors; `polyline` is the diagonal-capable alternative. `autoLayout layers` ranks elements into ArchiMate aspect bands on the same ELK Layered engine. `autoLayout organic` is an optional seeded force-directed landscape layout, and `autoLayout grid` is an optional catalogue pack by kind or name; neither replaces the layered default. When-to-use notes: [docs/plein-dsl-archimate-4.md](docs/plein-dsl-archimate-4.md). Right-click a box and choose **Link to view…** to store `links view <name>` on that element (one view). A linked box shows a chain mark; double-click, or **Open** on that menu, switches the canvas to that view. Double-click on an unlinked box does not navigate. The switcher is `browseNamedView` in `src/browser.ts`. **Reload** (toolbar, File → Reload, or ⌘R) re-reads the open file and redraws the current viewpoint. Build, Open → view, switch, reload, and golden-assert notes: [app/README.md](app/README.md). Prefer the [`.dmg` download](#download-the-mac-app-apple-silicon-dmg) if you only want the GUI.

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
plein inspect fixtures/valid-basic.plein
plein format fixtures/valid-basic.plein
plein export fixtures/valid-basic.plein --view booking-context -o booking-context.html
open booking-context.html
plein import fixtures/open-exchange/booking.xml -o booking.plein
plein check booking.plein
plein export-open-exchange booking.plein -o booking.xml
```

`plein export` writes a self-contained HTML page (or SVG) for one named view. Open that file in a browser; the Mac app does not need to be running. Details: [Export a named view](#export-a-named-view).

`plein import` reads an Open Exchange XML model and writes `.plein`. `plein export-open-exchange` writes that same subset back to XML. Details: [Import and export Open Exchange XML](#import-and-export-open-exchange-xml).

Expected walkthrough:

* `plein check fixtures/samples/value-stream-demo.plein` prints `ok fixtures/samples/value-stream-demo.plein (...)` and exits 0.
* `plein check fixtures/valid-basic.plein` prints `ok fixtures/valid-basic.plein (...)` and exits 0.
* `plein inspect fixtures/valid-basic.plein` prints JSON for that model (`"id": "shipper"`, `"name": "booking-context"`) and exits 0.
* `plein format fixtures/format-messy.plein` prints the canonical layout (same bytes as `fixtures/golden-format-messy.plein`) and exits 0. `plein format --check fixtures/golden-format-messy.plein` prints `ok` and exits 0.
* `plein check fixtures/broken-syntax.plein` prints a line-oriented diagnostic (for example `expected '}' to close plein`) and exits non-zero.
* `plein inspect fixtures/broken-syntax.plein` prints that same class of diagnostic and exits non-zero.

Packaging notes and `scripts/mac/smoke.sh` are in [scripts/mac/README.md](scripts/mac/README.md).

### Arran smoke — Mac Open + errors

Checklist for the upcoming GitHub Release `.dmg` (Gilfoyle owns packaging; this repo does not produce the disk image yet). After install, no Node/npm:

1. Launch Plein. **Open** [fixtures/samples/value-stream-demo.plein](fixtures/samples/value-stream-demo.plein). The **Quote to cash** viewpoint loads with Quote, Book, and Collect nested inside the value stream. No error banner. Value streams and capabilities are orange; application components are cyan; type glyphs sit in the top-right of each box. Left sidebar: **Views**, **Elements (8)**, **Relationships (9)** — no lists under the canvas. Click a nested stage — its Elements row highlights; click a list row — the diagram item highlights; empty canvas or Escape clears both.
2. **Open** [fixtures/valid-catalogue-layers.plein](fixtures/valid-catalogue-layers.plein). The **ArchiMate layers sample** view shows the seven-layer rainbow (orange / purple / yellow / cyan / green / green / pink) with distinct glyphs. See [docs/archimate-style.md](docs/archimate-style.md). Lists stay on the left.
3. **Open** a broken fixture. The banner shows a `file:line:column` diagnostic (same class as `plein check`). No diagram and no sidebar.
   - [fixtures/broken-syntax.plein](fixtures/broken-syntax.plein)
   - [fixtures/malformed-views.plein](fixtures/malformed-views.plein)
   - [fixtures/invalid-value-stream-nesting.plein](fixtures/invalid-value-stream-nesting.plein)

Until the `.dmg` is published, the same steps work from a local `Plein.app` (`npm run app:build`) or [app preview](app/README.md). Extended Open → view / switch / reload steps are in [app/README.md](app/README.md).

## CLI

Structural check: load a model (elements, typed relationships, and views) and exit 0 when it is valid. Syntax errors, unknown keywords, malformed views, and relationship pairs that are not in the [relationship matrix](docs/relationship-matrix.md) exit non-zero with `file:line:column` diagnostics on stderr. An invalid pair names the source type, relationship, and target type (`invalid relationship 'realization' from 'application-component' to 'business-object'`). The `styles` block is still ignored; diagram colours come from the built-in type/layer map ([docs/archimate-style.md](docs/archimate-style.md)).

`plein inspect` writes that same loaded model as JSON on stdout (elements, relationships, and views, in document order). It does not render a diagram. Parse errors use the same diagnostics and a non-zero exit as `plein check`. See [Inspect a model](#inspect-a-model).

`plein format` rewrites a `.plein` file to one canonical layout (2-space indent, stable statement and view-clause order) so a pull request diff stays readable. Formatting twice changes nothing. See [Format a model](#format-a-model).

Mac users should prefer the Homebrew steps above. From a source checkout (any OS with Node 18+):

```bash
npm install
npm run build
npx plein check fixtures/samples/value-stream-demo.plein
npx plein check fixtures/valid-basic.plein
npx plein inspect fixtures/valid-basic.plein
npx plein format fixtures/format-messy.plein
npm run check:fixtures
npm test
```

GitHub Actions (**Check fixtures**) installs the CLI, runs `npm test` (including the inspect JSON golden, the format before/after golden, the HTML/SVG export golden, and the Open Exchange import/export golden), and runs `npm run check:fixtures`: golden models in [fixtures/](fixtures/README.md) must exit 0; expected-fail fixtures must exit non-zero. The job fails if a golden check fails or an expected-fail fixture unexpectedly passes.

See [docs/plein-dsl-archimate-4.md](docs/plein-dsl-archimate-4.md) for document shape and vocabulary. Canonical typed relationships are `composedOf`, `aggregates`, `assignedTo`, `realizes`, `serves`, `accesses`, `influences`, `triggers`, `flowsTo`, `specializes`, and `associatedWith` (language-reference names such as `serving` are aliases). A custom concept is a declared specialization (`specialization customer specializes business-actor`); an undeclared name is rejected. An organization pack is a `profile` (alias `organization`) of those specializations; `hook <name>` applies a declared profile hook, and an undeclared hook is rejected.

### Inspect a model

`plein inspect` loads a `.plein` file with the same check as `plein check` and writes JSON to stdout. The document has `file`, `elements`, `relationships`, and `views`, in source order. Keywords and relationship types are canonical camelCase (`serving` is written as `serves`). Every element has `linksView` (`null` when the declaration has no `links view` clause). Every view has the same keys: `viewpoint`, `title`, `autoLayout`, and `nesting` are `null` when the file omits them, `positions` and `sizes` are always arrays (including when auto-layout is on and those clauses are not used for drawing). No HTML, SVG, or Mac app is involved.

```bash
plein inspect fixtures/valid-basic.plein
```

Exit 0 on a valid file. A missing file prints `file not found: <path>` on stderr and exits non-zero. Syntax errors, unknown keywords, and malformed views print a `file:line:column` diagnostic on stderr and exit non-zero — the same class as `plein check`.

Golden snapshot: [fixtures/golden-inspect-valid-basic.json](fixtures/golden-inspect-valid-basic.json) is `plein inspect fixtures/valid-basic.plein`. `npm test` (`src/inspect.test.ts`) fails if that file drifts. Refresh it with:

```bash
npx plein inspect fixtures/valid-basic.plein > fixtures/golden-inspect-valid-basic.json
```

### Format a model

`plein format` loads a `.plein` file with the same check as `plein check` and writes a canonical layout. Indentation is two spaces. Inside `model`, profile and specialization declarations stay in source order, then elements, then relationships. Value-stream stages stay nested. Inside a view the clause order is `include`, `exclude`, `autoLayout`, `nesting`, `position`, `size`. `autoLayout` tokens are mode, grid order, direction, then routing; defaults (`layered`, `kind`, `tb`, `orthogonal`) are omitted. `nesting beside` is omitted. Keywords are kebab-case. Relationships are `id -> id: <type>` with the language-reference spellings (`serving`, not `serves`). A view title is written on the `viewpoint` header. `//` comments are kept. The full key order is [Canonical layout](docs/plein-dsl-archimate-4.md#canonical-layout-plein-format).

```bash
plein format fixtures/format-messy.plein
plein format --write fixtures/format-messy.plein
plein format --check fixtures/golden-format-messy.plein
```

Without `--write` or `-o`, the canonical source goes to stdout and the file is left untouched. `--write` rewrites the file in place and prints `formatted <path>`. `-o <file>` writes that path instead. `--check` exits 0 and prints `ok <path>` when the bytes are already canonical; otherwise it prints `would reformat <path>` on stderr and exits non-zero. It does not write. A missing file, a syntax error, an unknown keyword, or a malformed view uses the same non-zero diagnostic as `plein check`.

Formatting twice yields the same bytes. Golden pair: [fixtures/format-messy.plein](fixtures/format-messy.plein) → [fixtures/golden-format-messy.plein](fixtures/golden-format-messy.plein). `npm test` (`src/format.test.ts`) fails if that pair drifts, and it formats every other valid fixture twice. Refresh the golden with:

```bash
npx plein format fixtures/format-messy.plein > fixtures/golden-format-messy.plein
```

### Export a named view

`plein export` writes one named viewpoint as a **self-contained HTML page** and/or **SVG**. The diagram is the same ELK + `renderViewpointSvg` path the Mac app uses. Open the file in Safari, Chrome, or Firefox — Plein.app does not need to be running, and the page does not load scripts or stylesheets from the network.

From a source checkout or a Homebrew install (`plein` on `PATH`), in the repo root. On a Mac, `open` launches the file in the default browser:

```bash
# HTML (default). --view is a viewpoint name or its title. Omit it for the first named view.
plein export fixtures/valid-basic.plein --view booking-context -o booking-context.html
open booking-context.html

# SVG only
plein export fixtures/valid-basic.plein --view "Booking context" --format svg -o booking-context.svg

# Both files: booking-context.html and booking-context.svg
plein export fixtures/valid-basic.plein --format both -o booking-context

# Another named view of the research-data sample
plein export fixtures/samples/research-data.plein --view "Published research access" -o published-research-access.html
open published-research-access.html
```

Without `-o`, HTML or SVG is written to stdout (`--format both` requires `-o`). A path that is a directory (or ends with `/`) writes `<view-name>.html` or `<view-name>.svg` inside it.

Golden snapshot: [fixtures/golden-booking-context.html](fixtures/golden-booking-context.html) is `plein export fixtures/valid-basic.plein --view booking-context --format html`. `npm test` / `./scripts/assert-export.sh` fails if that file drifts. The research-data sample asserts that `--view` selects one viewpoint (landscape vs published access vs storage).

In the Mac app, **File → Export…** (or **⇧⌘E**) writes the viewpoint on the canvas. Choose HTML, SVG, or HTML and SVG — the same formats as `plein export` — then the save panel writes the file. Quit Plein and open that file in a browser or Preview. The diagram is `renderViewpointSvg` plus `wrapViewpointHtml`, the same writer as `plein export`, using the layout already on screen (including a local Auto layout / Options preview). **Open Exchange** in that same sheet writes the whole open model as `.xml` through `exportOpenExchange` (the same writer as `plein export-open-exchange`), not the view on screen. Re-import with **File → Import Open Exchange XML…** or `plein import`. Known gaps stay the ones in [docs/open-exchange-import.md](docs/open-exchange-import.md). Details and the smoke steps: [app/README.md](app/README.md#export-the-current-view).

### Import and export Open Exchange XML

`plein import` reads an ArchiMate Model Exchange File Format 3.1 document and writes `.plein` for the subset in [docs/open-exchange-import.md](docs/open-exchange-import.md). `plein export-open-exchange` writes that same subset back to XML. This is not `plein export` (HTML/SVG of one viewpoint).

```bash
plein import fixtures/open-exchange/booking.xml -o booking.plein
plein check booking.plein
open -a Plein booking.plein
plein export-open-exchange fixtures/open-exchange/booking.plein -o booking.xml
plein import booking.xml -o booking-again.plein
```

Without `-o`, import writes `.plein` to stdout and export writes XML to stdout (gap notes stay on stderr). The booking fixture is the representative model: elements across layers, all eleven relationship types, and two diagrams. Import drops junctions, diagram geometry, styles, and organization folders, and says so in the summary. The pinned import is [fixtures/open-exchange/booking.plein](fixtures/open-exchange/booking.plein). The pinned export is [fixtures/open-exchange/booking.export.xml](fixtures/open-exchange/booking.export.xml). Importing that XML again yields [fixtures/open-exchange/booking.roundtrip.plein](fixtures/open-exchange/booking.roundtrip.plein): the same elements, relationships, and views, without the comment breadcrumbs (documentation, properties, `accessType`, the ArchiMate viewpoint kind, and the original model name).

In the Mac app, **File → Import Open Exchange XML…** (or **⇧⌘I**) uses that same importer. The open panel picks an `.xml` file and the result opens the same way as **Open…** on a `.plein` (first named viewpoint on the canvas). For `fixtures/open-exchange/booking.xml` the note above the canvas reads 17 elements, 15 relationships, and 2 views, and repeats the CLI gap notes. **All** lists Elements (17) and Relationships (15). A file outside the subset shows **Could not import this Open Exchange file** with the `file:line:column` message. Cancel shows no error. Open Exchange export in the app is **File → Export…** → **Open Exchange** (same subset). Smoke steps: [app/README.md](app/README.md#import-open-exchange-xml).

### Golden viewpoint layout

`fixtures/valid-views.plein` viewpoint `applicationStructure` is the golden include/exclude diagram. Membership is pinned in `fixtures/golden-applicationStructure.json` (`legacyBatch` stays as a node; `tms -> legacyBatch` is omitted). Nested aggregation/composition is pinned in `fixtures/golden-nested-quote-to-cash.json` (Quote/Book/Collect inside Quote to cash).

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
# diagram ↔ left-list selection (nested + multi-view):
./scripts/assert-selection-sync.sh
# static HTML/SVG export of a named view:
./scripts/assert-export.sh
```

## Branding

Product mark: [branding/plein-mark.png](branding/plein-mark.png)

## License

Plein is source-available, not OSI open source; commercial or competing use needs written permission. Licensed under PolyForm Noncommercial 1.0.0 plus the Competing Use note in [LICENSE](LICENSE).
