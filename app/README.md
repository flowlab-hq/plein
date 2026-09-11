# Plein Mac app (multi-view browser)

A Tauri 2 app that opens a `.plein` file and browses **named viewpoints** from the `views` block on one SVG canvas. Each view is a diagram of the **same loaded model**. **Views**, **Elements**, and **Relationships** share the **left sidebar** (counts on the headings; each list scrolls). The diagram pane uses the remaining height — there is no bottom list strip.

The TypeScript `checkPlein` path from the CLI is reused. Malformed or invalid files show the same `file:line:column` diagnostics as `plein check` in a banner (Open, Finder Open With, drop, or Reload). Read/open failures use that same banner so they do not fail silently.

Membership for a named view is the markup `include` / `exclude` set (`filterModel`). Placement is `layoutViewpoint` in `src/layout.ts`; the pane draws `renderViewpointSvg(layout)` via `browseNamedView` / `switchNamedView` in `src/browser.ts`. Boxes use the shared ArchiMate type/layer map (`src/archimate-style.ts`): yellow business, cyan application, green technology/physical, purple motivation, orange strategy, pink implementation. Mapping: [docs/archimate-style.md](../docs/archimate-style.md). Aggregation and composition default to **side-by-side** (same as today). A view may set `nesting nested` so children render inside the parent; that `.plein` clause is the source of truth for PRs. The diagram toolbar **File default / Nested / Beside** control overrides placement for local preview only and is not written back to the file. **Reload** re-reads the open `.plein` and redraws the current viewpoint; a new view added in markup appears in the switcher after reload (no app code change). Open selects the first named viewpoint.

```ts
import { browseNamedView, switchNamedView } from "../../src/browser.ts";

const structure = browseNamedView(model, "applicationStructure");
diagramPane.innerHTML = structure.svg;

const cooperation = switchNamedView(model, "applicationCooperation");
diagramPane.innerHTML = cooperation.svg;
```

## Supported Macs

- **Apple Silicon (arm64)** — supported target for the `.app` / `.dmg`
- **Intel (x86_64)** — unsupported. This app is not built or tested for Intel Macs. Use the CLI (`plein check`) there if you need a model listing.

Prefer the GitHub Release **`.dmg`** ([README](../README.md#download-the-mac-app-apple-silicon-dmg)) if you only want to run the app — no Node/npm. A signed / notarized build is not published (no Apple signing identity). Ad-hoc local/CI builds: `./scripts/mac/build-dmg.sh` or `npm run app:build` on an Apple Silicon Mac.

## Run the UI without a `.app`

Automated load→list coverage lives in `src/list-model.test.ts`. The left-sidebar layout (no bottom list strip) is pinned in `src/app-layout.test.ts`. Viewpoint include/exclude layout (golden `applicationStructure`) is `src/layout.test.ts` or `./scripts/assert-viewpoint-layout.sh`. Type/layer colours and icons are `src/archimate-style.test.ts` or `./scripts/assert-archimate-style.sh` (visual pin `fixtures/golden-catalogue-layers.svg`). Edit → reload → diagram is `src/reload.test.ts` or `./scripts/assert-reload-diagram.sh`. One model → many views (and a new view after reload) is `src/browser.test.ts` or `./scripts/assert-multi-view-browser.sh`. To click through the same UI in a browser (Open dialog is a file picker):

```bash
npm install
npm test
npm run app:preview
```

Then open http://127.0.0.1:4173 and follow the Open → view path below. Arran smoke files: [fixtures/samples/value-stream-demo.plein](../fixtures/samples/value-stream-demo.plein) (success) and [fixtures/broken-syntax.plein](../fixtures/broken-syntax.plein) / [fixtures/malformed-views.plein](../fixtures/malformed-views.plein) (line-level errors).

## Build the Mac app (Apple Silicon)

Requires Xcode command-line tools, Node 18+, and a current Rust stable (`rustup update`; the crate graph needs **1.88+** even though Tauri’s crate MSRV is 1.77).

```bash
git clone https://github.com/flowlab-hq/plein.git
cd plein
npm install
npm run app:build
```

Bundles land under `app/src-tauri/target/aarch64-apple-darwin/release/bundle/`:

- `macos/Plein.app`
- `dmg/Plein_<version>_aarch64.dmg`

`./scripts/mac/stage-dmg.sh` copies the disk image to `dist/macos/Plein-<version>-macos-arm64.dmg` for GitHub Releases.

Dev loop on a Mac:

```bash
npm run app:dev
```

This Linux checkout cannot produce `Plein.app` (no macOS SDK). `npm test` and `npm run app:preview` are the verification path here.

## Open → view path

1. Launch `Plein.app` (or `npm run app:preview` in a browser).
2. **Open…** a `.plein` file — toolbar button (native dialog in the `.app`, file picker in preview), drag-and-drop onto the window, or Finder **Open With** once the `.app` is installed (`.plein` is registered as a Plein Model).
3. The first named viewpoint in the `views` block is selected (golden: `applicationStructure` in `fixtures/valid-views.plein`).
4. The diagram pane draws `browseNamedView(model, viewName)` (layout + SVG from M9). Tabs above the diagram list every named view in the file. Clicking a tab switches the canvas without reloading the file. The left sidebar lists the current view’s elements and relationships (or the whole model when **All** is selected).
5. Membership must match the markup: includes add elements (and implied relationships between them); excludes remove them. `fixtures/golden-applicationStructure.json` is the asserted set (`legacyBatch` stays as a node; `tms -> legacyBatch` is omitted).

## Switch named views

`fixtures/valid-views.plein` has two viewpoints on one model: **Application Structure** and **Application Cooperation**.

1. Open that file. The diagram is **Application Structure** (five typed nodes; no `tms -> legacyBatch` edge). Left sidebar: **Elements (5)** / **Relationships (3)**.
2. Click **Application Cooperation** on the diagram switcher (or the matching row in the Views list). The same loaded model now shows TMS and Booking API only, with the serving edge. Sidebar: **Elements (2)** / **Relationships (1)**.
3. Click **Application Structure** again. Membership returns to the golden set. You did not reopen the file.
4. Click **All** in the Views list. Sidebar lists show the whole model (**5** / **4**). The diagram stays on the last named viewpoint you selected.

## Reload after edit

Edit the open `.plein` in any text editor, save, then reload. The app re-reads the file from disk and redraws the **current** viewpoint — you do not quit `Plein.app`.

In the Mac app:

1. **Reload** in the toolbar, or **File → Reload**, or **⌘R**.
2. The diagram, switcher, and lists update from the saved file.
3. If the current named viewpoint still exists, it stays selected. If you deleted that view, Plein falls back to the first remaining named view.
4. A **new** `view` / `viewpoint` block in the markup appears in the switcher after reload. Click it to draw that view — no app rebuild.

Browser preview (`npm run app:preview`) has no filesystem path after the file picker, so **Reload** re-parses the last loaded text. After disk edits in preview, use **Open…** again. The Mac `.app` is the supported reload path.

Assert without opening the app:

```bash
npm test
./scripts/assert-viewpoint-layout.sh
./scripts/assert-archimate-style.sh
./scripts/assert-reload-diagram.sh
./scripts/assert-multi-view-browser.sh
```

## Arran smoke — left sidebar lists

Release `.dmg` or local `Plein.app` (no Node required on the Release path):

1. **Open** [fixtures/samples/value-stream-demo.plein](../fixtures/samples/value-stream-demo.plein). **Views**, **Elements (8)**, and **Relationships (9)** are in the **left sidebar**. The diagram fills the remaining height — no bottom list strip.
2. Scroll Elements and Relationships if the pane is short. Headings keep the counts visible.
3. **Open** [fixtures/valid-views.plein](../fixtures/valid-views.plein). Application Structure: **Elements (5)** / **Relationships (3)** (`tms -> legacyBatch` absent). Click **Application Cooperation**: **Elements (2)** / **Relationships (1)**. Click **All**: whole model (**5** / **4**); the diagram stays on the last named view.
4. Toggle **File default / Nested / Beside**. Lists stay on the left; nested render still works on the canvas.
5. **Open** [fixtures/broken-syntax.plein](../fixtures/broken-syntax.plein). Banner only — sidebar and diagram stay hidden.

## Arran smoke (`.dmg` / Open + errors)

After installing from the GitHub Release `.dmg` (when published) or a local `Plein.app`:

1. **Open** [fixtures/samples/value-stream-demo.plein](../fixtures/samples/value-stream-demo.plein). The diagram is **Quote to cash — value stream, capabilities, applications**. Quote, Book, and Collect sit **inside** the Quote to cash container (file `nesting nested`). No error banner. Strategy boxes (value stream, capability) are orange `#F5DEAA`; application components are cyan `#B5FFFF`; each box has a type glyph in the top-right. Capability uses the staircase-of-blocks glyph; value-stream uses the notched chevron. Left sidebar: **Views**, **Elements (8)**, **Relationships (9)**. The canvas uses the remaining height — no bottom list strip. Scroll a list if it overflows; counts stay on the headings.
2. Use **File default / Nested / Beside** on the diagram toolbar to preview the other placement without editing the file. **File default** follows the `.plein` clause. Lists stay on the left.
3. **Open** [fixtures/valid-catalogue-layers.plein](../fixtures/valid-catalogue-layers.plein). The diagram is **ArchiMate layers sample** with seven coloured boxes (orange / purple / yellow / cyan / green node / green facility / pink). Stick-figure on the actor, component glyph on Rate engine, cube on the node, building on the facility. Mapping: [docs/archimate-style.md](../docs/archimate-style.md). Golden SVG: [fixtures/golden-catalogue-layers.svg](../fixtures/golden-catalogue-layers.svg). Lists stay on the left.
4. **Open** [fixtures/broken-syntax.plein](../fixtures/broken-syntax.plein) (or [malformed-views.plein](../fixtures/malformed-views.plein) / [invalid-value-stream-nesting.plein](../fixtures/invalid-value-stream-nesting.plein)). The banner reads **This .plein did not load** plus a `file:line:column` diagnostic — the same class as `plein check`. Diagram and sidebar stay hidden.

`.dmg` packaging is out of scope here (Gilfoyle).

## Smoke checklist (`.app`)

**Release path (Arran, no Node):** [README Arran checklist](../README.md#arran-smoke-checklist) — download `.dmg` → install → open the sample (orange/cyan + glyphs; left sidebar Elements/Relationships) → open the catalogue-layers fixture (seven-layer rainbow) → open broken → see errors. Open + error banner wording is [PR #16](https://github.com/flowlab-hq/plein/pull/16).

On an Apple Silicon Mac, after `npm run app:build`:

1. Launch `Plein.app`. The empty state asks you to open a `.plein` file.
2. **Open…** [fixtures/samples/value-stream-demo.plein](../fixtures/samples/value-stream-demo.plein). The diagram pane shows **Quote to cash** with Quote, Book, and Collect nested inside the value stream. Orange strategy boxes, cyan application boxes, type glyphs on each. No error banner. Left sidebar lists **Elements (8)** and **Relationships (9)** under Views — no bottom strip. Toggle **File default / Nested / Beside** to preview the other placement locally.
3. **Open…** [fixtures/valid-catalogue-layers.plein](../fixtures/valid-catalogue-layers.plein). Seven layer colours as in [docs/archimate-style.md](../docs/archimate-style.md). Hover a box: tooltip is `type — label`. Lists stay on the left.
4. **Open…** `fixtures/valid-basic.plein`. The diagram pane shows **Booking context** (Shipper, Booking service, Freight order, Rate engine) with serving / access / realization edges. Shipper / Booking / Freight order are yellow; Rate engine is cyan. Left sidebar matches those four elements and four relationships.
5. Click **All**. Sidebar lists show the whole model. The diagram stays on the named viewpoint **booking-context**.
6. Open `fixtures/valid-views.plein`. The diagram is **Application Structure**. The `tms -> legacyBatch` relationship is absent (`exclude "* -> legacyBatch"`); typed elements including `legacyBatch` remain. Membership is the golden set in `fixtures/golden-applicationStructure.json` (`npm test` / `./scripts/assert-viewpoint-layout.sh`). Application boxes are cyan with component / interface / object glyphs. Sidebar **Elements (5)** / **Relationships (3)**.
7. Click **Application Cooperation** on the diagram switcher. The canvas shows TMS and Booking API only (same file, same model). Sidebar becomes **Elements (2)** / **Relationships (1)**. Click **Application Structure** again; golden membership returns.
8. Open `fixtures/malformed-views.plein`. The banner shows **This .plein did not load** and a `file:line:column` diagnostic (same class as `plein check`). No diagram.
9. Open `fixtures/broken-syntax.plein`. Same class of line-oriented error; diagram and lists stay hidden.
10. From Finder, Open With `Plein.app` on `fixtures/samples/value-stream-demo.plein`. The file loads and **Quote to cash** renders without using **Open…**.
11. Keep `valid-views.plein` open. In a text editor, add a new view under `views` (for example `view legacy-flow { title "Legacy flow" include tms legacyBatch }`) and save. Click **Reload** (or **⌘R** / **File → Reload**). **Legacy flow** appears in the switcher. Click it: TMS and Legacy batch, with the flow edge. No app rebuild.
12. Still on that file, add `exclude shipment` under `applicationStructure` (or change an element label) and save. Reload. The **Application Structure** diagram matches the saved markup without restarting the app.
13. Intel Mac: skip. Documented as unsupported.
