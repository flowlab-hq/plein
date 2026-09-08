# Plein Mac app

A Tauri 2 app that opens a `.plein` file and lists elements, relationships, and views. Selecting a view filters membership using the markup `include` / `exclude` set.

**Viewpoint layout** (M9): `layoutViewpoint(model, viewName)` builds nodes/edges for that include/exclude set; `renderViewpointSvg` turns it into an SVG pane payload. Live reload (M9b) and a multi-view diagram switcher (M10) are out of scope.

The TypeScript `checkPlein` path from the CLI is reused. Malformed files show the same `file:line:column` diagnostics as `plein check`.

## Supported Macs

- **Apple Silicon (arm64)** — supported target for the `.app`
- **Intel (x86_64)** — unsupported. This app is not built or tested for Intel Macs. Use the CLI (`plein check`) there if you need a model listing.

A signed `.pkg` / notarized build is not published (no Apple signing identity). Build the `.app` locally on an Apple Silicon Mac.

## Run the UI without a `.app`

Automated load→list coverage lives in `src/list-model.test.ts`. Viewpoint include/exclude layout is `src/layout.test.ts` (or `./scripts/assert-viewpoint-layout.sh`). To click through the list UI in a browser (Open dialog is a file picker):

```bash
npm install
npm run app:preview
```

Then open http://127.0.0.1:4173 and load `fixtures/valid-basic.plein` or `fixtures/valid-views.plein`. A broken file such as `fixtures/malformed-views.plein` should show the CLI-class diagnostic.

## Build the Mac app (Apple Silicon)

Requires Xcode command-line tools, Node 18+, and a current Rust stable (`rustup update`; the crate graph needs **1.88+** even though Tauri’s crate MSRV is 1.77).

```bash
git clone -b story/mac-app-list-ui https://github.com/flowlab-hq/plein.git
cd plein
npm install
npm run app:build
```

The bundle is written to `app/src-tauri/target/release/bundle/macos/Plein.app`.

Dev loop on a Mac:

```bash
npm run app:dev
```

This Linux checkout cannot produce `Plein.app` (no macOS SDK). `npm test` and `npm run app:preview` are the verification path here.

## Open → view (Mac)

Path for one named viewpoint from a `.plein` file:

1. Launch `Plein.app` (or `npm run app:preview` in a browser).
2. **Open…** a `.plein` file — toolbar button (native dialog in the `.app`, file picker in preview), drag-and-drop onto the window, or Finder **Open With** once the `.app` is installed (`.plein` is registered as a Plein Model).
3. The `views` block supplies named viewpoints. Pick **one** name (golden: `applicationStructure` in `fixtures/valid-views.plein`). The list UI already filters that include/exclude set; the diagram pane should render `layoutViewpoint(model, viewName)` / `renderViewpointSvg(layout)` for the same name — not a live-updating editor, and not a switcher across many diagram canvases.
4. Membership must match the markup: includes add elements (and implied relationships between them); excludes remove them. `fixtures/golden-applicationStructure.json` is the asserted set.

```ts
import { layoutViewpoint, renderViewpointSvg } from "../../src/layout.ts";

const layout = layoutViewpoint(model, "applicationStructure");
diagramPane.innerHTML = renderViewpointSvg(layout);
```

Assert without opening the app:

```bash
npm test
./scripts/assert-viewpoint-layout.sh
```

## Smoke checklist (`.app`)

On an Apple Silicon Mac, after `npm run app:build`:

1. Launch `Plein.app`. The empty state asks you to open a `.plein` file.
2. **Open…** `fixtures/valid-basic.plein`. Elements, relationships, and the `booking-context` view appear.
3. Select **All**, then **booking-context**. Counts stay consistent with the include list (`shipper`, `booking`, `order`, `rates`).
4. Open `fixtures/valid-views.plein`. Select `applicationStructure`. The `tms -> legacyBatch` relationship is excluded (`exclude "* -> legacyBatch"`); typed elements remain. Diagram membership for that viewpoint is the golden set in `fixtures/golden-applicationStructure.json` (`npm test` / `./scripts/assert-viewpoint-layout.sh`).
5. Open `fixtures/malformed-views.plein`. The banner shows a `file:line:column` diagnostic (same class as `plein check`).
6. Open `fixtures/broken-syntax.plein`. Same class of line-oriented error; lists stay hidden.
7. From Finder, Open With `Plein.app` on `fixtures/valid-basic.plein`. The file loads without using **Open…**.
8. Intel Mac: skip. Documented as unsupported.
