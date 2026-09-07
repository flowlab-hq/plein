# Plein Mac app (list UI)

A Tauri 2 app that opens a `.plein` file and lists elements, relationships, and views. Selecting a view filters membership using the markup `include` / `exclude` set. There is no diagram canvas.

The TypeScript `checkPlein` path from the CLI is reused. Malformed files show the same `file:line:column` diagnostics as `plein check`.

## Supported Macs

- **Apple Silicon (arm64)** — supported target for the `.app`
- **Intel (x86_64)** — unsupported. This app is not built or tested for Intel Macs. Use the CLI (`plein check`) there if you need a model listing.

A signed `.pkg` / notarized build is not published (no Apple signing identity). Build the `.app` locally on an Apple Silicon Mac.

## Run the UI without a `.app`

Automated load→list coverage lives in `src/list-model.test.ts` (`npm test`). To click through the same UI in a browser (Open dialog is a file picker):

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

## Open a file

- **Open…** in the toolbar (native dialog inside the `.app`, file picker in the browser preview)
- Drag a `.plein` file onto the window
- Double-click / Open With in Finder once the `.app` is installed (`.plein` is registered as a Plein Model)

## Smoke checklist (`.app`)

On an Apple Silicon Mac, after `npm run app:build`:

1. Launch `Plein.app`. The empty state asks you to open a `.plein` file. There is no canvas.
2. **Open…** `fixtures/valid-basic.plein`. Elements, relationships, and the `booking-context` view appear.
3. Select **All**, then **booking-context**. Counts stay consistent with the include list (`shipper`, `booking`, `order`, `rates`).
4. Open `fixtures/valid-views.plein`. Select `applicationStructure`. The `tms -> legacyBatch` relationship is excluded (`exclude "* -> legacyBatch"`); typed elements remain.
5. Open `fixtures/malformed-views.plein`. The banner shows a `file:line:column` diagnostic (same class as `plein check`).
6. Open `fixtures/broken-syntax.plein`. Same class of line-oriented error; lists stay hidden.
7. From Finder, Open With `Plein.app` on `fixtures/valid-basic.plein`. The file loads without using **Open…**.
8. Intel Mac: skip. Documented as unsupported.
