# Plein Mac app (one viewpoint)

A Tauri 2 app that opens a `.plein` file and renders **one named viewpoint** from the `views` block as an SVG diagram. The existing list UI (elements, relationships, views) stays beside it.

The TypeScript `checkPlein` path from the CLI is reused. Malformed files show the same `file:line:column` diagnostics as `plein check`.

Membership for the diagram is the markup `include` / `exclude` set (`filterModel`). Placement is `layoutViewpoint` in `src/layout.ts`; the pane draws `renderViewpointSvg(layout)`. There is no live reload (M9b) and no dedicated multi-view switcher (M10). The Views list from the list UI remains; Open selects the first named viewpoint.

```ts
import { layoutViewpoint, renderViewpointSvg } from "../../src/layout.ts";

const layout = layoutViewpoint(model, "applicationStructure");
diagramPane.innerHTML = renderViewpointSvg(layout);
```

## Supported Macs

- **Apple Silicon (arm64)** — supported target for the `.app`
- **Intel (x86_64)** — unsupported. This app is not built or tested for Intel Macs. Use the CLI (`plein check`) there if you need a model listing.

A signed `.pkg` / notarized build is not published (no Apple signing identity). Build the `.app` locally on an Apple Silicon Mac.

## Run the UI without a `.app`

Automated load→list coverage lives in `src/list-model.test.ts`. Viewpoint include/exclude layout (golden `applicationStructure`) is `src/layout.test.ts` or `./scripts/assert-viewpoint-layout.sh`. To click through the same UI in a browser (Open dialog is a file picker):

```bash
npm install
npm test
npm run app:preview
```

Then open http://127.0.0.1:4173 and follow the Open → view path below.

## Build the Mac app (Apple Silicon)

Requires Xcode command-line tools, Node 18+, and a current Rust stable (`rustup update`; the crate graph needs **1.88+** even though Tauri’s crate MSRV is 1.77).

```bash
git clone -b story/mac-render-one-viewpoint https://github.com/flowlab-hq/plein.git
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

## Open → view path

1. Launch `Plein.app` (or `npm run app:preview` in a browser).
2. **Open…** a `.plein` file — toolbar button (native dialog in the `.app`, file picker in preview), drag-and-drop onto the window, or Finder **Open With** once the `.app` is installed (`.plein` is registered as a Plein Model).
3. The first named viewpoint in the `views` block is selected (golden: `applicationStructure` in `fixtures/valid-views.plein`).
4. The diagram pane draws `layoutViewpoint(model, viewName)` / `renderViewpointSvg(layout)`. Lists show the same include/exclude membership. Not a live-updating editor, and not a switcher across many diagram canvases.
5. Membership must match the markup: includes add elements (and implied relationships between them); excludes remove them. `fixtures/golden-applicationStructure.json` is the asserted set (`legacyBatch` stays as a node; `tms -> legacyBatch` is omitted).

Assert without opening the app:

```bash
npm test
./scripts/assert-viewpoint-layout.sh
```

Live reload on file edit is out of scope. Switching with a dedicated view switcher is out of scope; the existing Views list still filters lists, and a named selection updates the diagram.

## Smoke checklist (`.app`)

On an Apple Silicon Mac, after `npm run app:build`:

1. Launch `Plein.app`. The empty state asks you to open a `.plein` file.
2. **Open…** `fixtures/valid-basic.plein`. The diagram pane shows **Booking context** (Shipper, Booking service, Freight order, Rate engine) with serving / access / realization edges. Lists match those four elements and four relationships.
3. Click **All**. Lists show the whole model. The diagram stays on the named viewpoint **booking-context** (M9 renders one named view; M10 is the switcher).
4. Open `fixtures/valid-views.plein`. The diagram is **Application Structure**. The `tms -> legacyBatch` relationship is absent (`exclude "* -> legacyBatch"`); typed elements including `legacyBatch` remain. Membership is the golden set in `fixtures/golden-applicationStructure.json` (`npm test` / `./scripts/assert-viewpoint-layout.sh`).
5. Open `fixtures/malformed-views.plein`. The banner shows a `file:line:column` diagnostic (same class as `plein check`). No diagram.
6. Open `fixtures/broken-syntax.plein`. Same class of line-oriented error; diagram and lists stay hidden.
7. From Finder, Open With `Plein.app` on `fixtures/valid-basic.plein`. The file loads and **Booking context** renders without using **Open…**.
8. Intel Mac: skip. Documented as unsupported.
