# Plein Mac app (multi-view browser)

A Tauri 2 app that opens a `.plein` file, or imports an Open Exchange XML model, and browses **named viewpoints** from the `views` block on one SVG canvas. Each view is a diagram of the **same loaded model**. **Views**, **Elements**, and **Relationships** share the **left sidebar** (counts on the headings; each list scrolls). The diagram pane uses the remaining height — there is no bottom list strip.

The TypeScript `checkPlein` path from the CLI is reused. **File → Import Open Exchange XML…** calls `importOpenExchange` (the same function as `plein import`) and then loads that `.plein` through the same path as **Open…**. Malformed or invalid files show the same `file:line:column` diagnostics as `plein check` in a banner (Open, Finder Open With, drop, or Reload). Read/open failures use that same banner so they do not fail silently.

Membership for a named view is the markup `include` / `exclude` set (`filterModel`). Placement is ELK Layered via `layoutViewpoint` in `src/layout.ts` (elkjs); the pane draws `renderViewpointSvg(layout)` via `browseNamedView` / `switchNamedView` in `src/browser.ts`. Boxes use the shared ArchiMate type/layer map (`src/archimate-style.ts`): yellow business, cyan application, green technology/physical, purple motivation, orange strategy, pink implementation. Mapping: [docs/archimate-style.md](../docs/archimate-style.md). `autoLayout tb|bt|lr|rl` sets the layered direction (shorthand `left-right` / `horizontal` still maps to `lr`). Edge routing is a separate `autoLayout` token: `orthogonal` (default, right-angle) or `polyline` (may be diagonal), for example `autoLayout lr orthogonal`. `autoLayout layers` still uses ELK Layered but ranks root elements into ArchiMate aspect bands (Motivation/Strategy → Business → Application → Technology/Physical → Implementation), lays out **within each band**, then stacks the bands; `autoLayout layers lr` stacks those bands left-to-right. `autoLayout organic` is a seeded force-directed layout for landscapes (same file, same coordinates; not the default). `autoLayout grid` packs a catalogue by kind then name (`grid name` packs by name) and still places disconnected leftovers. When-to-use notes: [docs/plein-dsl-archimate-4.md](../docs/plein-dsl-archimate-4.md). Aggregation and composition default to **side-by-side**. A view may set `nesting nested` so children render inside the parent as an ELK compound graph; that `.plein` clause is the source of truth for PRs. The diagram chrome keeps **Auto layout** (File / On / Off) and **Mode** (File / Layered / Layers / Organic / Grid) one click away. **Grid** shows or hides the snap grid. **Options** groups **Direction** (File / TB / BT / LR / RL), **Routing** (File / Orthogonal / Polyline), **Nesting** (File default / Nested / Beside), and **Grid size** (8 / 16 / 24 / 32 / 48, default 24). Those controls override for local preview only and are not written back to the file. **File** follows the view: `autoLayout off` or `manual` places elements from `position <id> <x> <y>` and leaves automatic layout unused, so Reload does not reflow that view. **On** recomputes from the model (layered, layers, organic, or grid) and ignores those positions. **Off** snapshots the current placement (and drag-to-move keeps editing it) for this open file, including across Reload. Hiding the grid does not turn snap off: with auto-layout off, a dragged box’s top-left still lands on a cell. The overlay is not `autoLayout grid` catalogue packing. Declaring `autoLayout` without `off` stays automatic, including `organic` and `grid`. **Reload** re-reads the open `.plein` and redraws the current viewpoint; a new view added in markup appears in the sidebar after reload (no app code change). Open selects the first named viewpoint.

Right-click a diagram box for **Link to view…** (`elementContextMenu` in `src/view-link.ts`). The choice writes `links view <view-id>` onto that element and reloads the file, so the link is in the `.plein` the next time it opens. The Mac app writes the open path. Browser preview downloads the `.plein` and keeps that text for **Reload**. An Open Exchange import keeps the link in the session only — **Reload** re-imports the XML, which has no place for the clause. **Clear link** removes it. The menu is one list: the link actions, then any later entries in `canvasMenuExtras`. An extra action dispatches `plein-canvas-menu` and does not write the file. A linked box draws a chain and its tooltip names the view. Double-click opens that view through the same switch as a **Views** row. Double-click on a box with no link does not change the view (the click still selects). There is one destination per element, no back stack, and the menu does not edit relationships.

Selection is **bidirectional** (`src/selection.ts`). A diagram box or edge highlights the matching left-list row, and a list row highlights the matching diagram item. Shift-click adds or removes an item; a drag on empty canvas marquee-selects element boxes. With auto-layout off, dragging a selected box moves the whole selection together. Nested children select independently of their container. Switching views keeps every highlight that is still in that view’s list. A plain click on empty canvas, or Escape, clears the set. Editing properties from the list is out of scope. Nest `composedOf` edges that are implied by nested layout have a list row but no SVG edge — the list still highlights.

```ts
import { browseNamedView, switchNamedView } from "../../src/browser.ts";

const structure = await browseNamedView(model, "applicationStructure");
diagramPane.innerHTML = structure.svg;

const cooperation = await switchNamedView(model, "applicationCooperation");
diagramPane.innerHTML = cooperation.svg;
```

## Supported Macs

- **Apple Silicon (arm64)** — supported target for the `.app` / `.dmg`
- **Intel (x86_64)** — unsupported. This app is not built or tested for Intel Macs. Use the CLI (`plein check`) there if you need a model listing.

Prefer the GitHub Release **`.dmg`** ([README](../README.md#download-the-mac-app-apple-silicon-dmg)) if you only want to run the app — no Node/npm. A signed / notarized build is not published (no Apple signing identity). Ad-hoc local/CI builds: `./scripts/mac/build-dmg.sh` or `npm run app:build` on an Apple Silicon Mac.

## Run the UI without a `.app`

Automated load→list coverage lives in `src/list-model.test.ts`. The left-sidebar layout (no bottom list strip) is pinned in `src/app-layout.test.ts`. Diagram ↔ list selection (nested containers + multi-view) is `src/selection.test.ts` or `./scripts/assert-selection-sync.sh`. Viewpoint include/exclude layout (golden `applicationStructure`) is `src/layout.test.ts` or `./scripts/assert-viewpoint-layout.sh`. Type/layer colours and icons are `src/archimate-style.test.ts` or `./scripts/assert-archimate-style.sh` (visual pin `fixtures/golden-catalogue-layers.svg`). Edit → reload → diagram is `src/reload.test.ts` or `./scripts/assert-reload-diagram.sh`. One model → many views (and a new view after reload) is `src/browser.test.ts` or `./scripts/assert-multi-view-browser.sh`. To click through the same UI in a browser (Open and Import dialogs are file pickers):

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
4. The diagram pane draws `browseNamedView(model, viewName)` (layout + SVG from M9). The **View** chrome above the canvas always shows the current view name (outside the scrollable SVG). Clicking a **Views** row in the left sidebar switches the canvas without reloading the file. The left sidebar lists the current view’s elements and relationships (or the whole model when **All** is selected). **All** filters the lists only; the **View** name and the **Showing** row stay on the last named viewpoint.
5. Membership must match the markup: includes add elements (and implied relationships between them); excludes remove them. `fixtures/golden-applicationStructure.json` is the asserted set (`legacyBatch` stays as a node; `tms -> legacyBatch` is omitted).

## Switch named views

`fixtures/valid-views.plein` has two viewpoints on one model: **Application Structure** and **Application Cooperation**.

1. Open that file. The diagram is **Application Structure** (five typed nodes; no `tms -> legacyBatch` edge). The **View** chrome reads **Application Structure**. Left sidebar: that row is marked **Showing**. **Elements (5)** / **Relationships (3)**.
2. Click **Application Cooperation** in the left **Views** list. The same loaded model now shows TMS and Booking API only, with the serving edge. The **View** chrome updates to **Application Cooperation** without reopening the file. Sidebar: **Elements (2)** / **Relationships (1)**.
3. Click **Application Structure** again. Membership returns to the golden set. The **View** name returns to **Application Structure**. You did not reopen the file.
4. Click **All** in the Views list. Sidebar lists show the whole model (**5** / **4**). The diagram and the **View** chrome stay on the last named viewpoint you selected. Scroll the canvas or the Views list — the **View** name above the diagram stays visible.

## Current view name (S4)

The current named view is always visible in the **View** chrome above the canvas (`#current-view` / `#diagram-heading`). That chrome is outside the scrollable SVG, so scrolling the diagram or the left lists does not hide it. Switching views updates the name in place (`currentViewCaption` / `browseNamedView`) — the file stays open. **All** is a list filter, not a viewpoint; the chrome still names the viewpoint on the canvas.

## Selection sync (diagram ↔ lists)

Bidirectional. Click a box or edge on the canvas to highlight the matching left-list row; click a list row to highlight (and scroll to) the matching diagram item. Nested children select on their own; the parent container is one chrome (title + type icon) and selects as one item from its title or empty interior. Escape or a plain click on empty canvas clears both. Switching views keeps each highlight that is still in the new list. Editing from the list is out of scope.

**Multi-select.** Shift-click a box, edge, or list row to add it, or to remove it if it is already selected. Shift-click on empty canvas does not clear. Drag on empty canvas (auto-layout on or off) draws a marquee and selects every element box the rectangle meets; shift-drag adds those boxes and leaves the previous selection in place. Connectors are not marquee targets. Each selected box and edge keeps the blue stroke, and the matching list rows highlight. Two or more boxes also get a dashed outline around the set.

**Group move** works with **Auto layout** **Off**, or a view already on manual positions. Dragging one selected box moves every selected box by the same delta, so relative positions stay. The box under the pointer still snaps to the grid and to neighbour centres and edges; the rest of the set keeps its offset from that box. Nested children of a moved container move with it, as they do for a single box. Dragging a box that is not selected moves only that box and its nested children. A move that changes positions marks the file **Unsaved** until **Save**. Auto layout **On** still does not drag boxes.

**Edge resize** uses the same manual placement. Drag the left or right edge to change width, or the top or bottom edge to change height. The opposite edge stays put, so a left or top drag also moves the top-left. The dragged edge snaps to the canvas grid. A corner, the interior, and empty canvas are not resize handles: the interior still moves (including a group move), and empty canvas still starts a marquee. One edge drag resizes that element only. The new size stays for this session. **Save** writes it as `size <id> <width> <height>` next to the `position` clauses. The box will not shrink below 48 by 32. A nested parent still grows to cover its children.

Out of scope: editing properties for the whole set, align/distribute commands, and turning the selection into a nested container.

Assert without opening the app: `./scripts/assert-selection-sync.sh` (or `npm test`).

## Canvas pan and zoom

The diagram is one SVG in a scrollable pane (`#diagram`). Gestures over that pane:

- **Scroll** (mouse wheel or trackpad) **pans**. The **View** name stays in the chrome above the canvas.
- **⌘/Ctrl + scroll zooms** toward the pointer, so the diagram point under the cursor stays put. Trackpad pinch is delivered as Ctrl+scroll and zooms the same way. Zoom is limited to **25%–400%**.
- Zoom scales the whole viewpoint, including nested containers, in auto-layout and in manual placement (`autoLayout off` / toolbar **Off**). It does not take pointer clicks: selection and node drag are unchanged.
- Opening a file or switching named views returns the canvas to **100%** (the laid-out size; fit-to-view on open is unchanged). Reload of the same view keeps the current zoom.

Hover empty canvas for the same note. Limits and pointer anchoring are `npm test` (`src/canvas-zoom.test.ts`).

Manual smoke (`npm run app:preview` or `Plein.app`):

1. Open [fixtures/samples/value-stream-demo.plein](../fixtures/samples/value-stream-demo.plein) (Quote, Book, and Collect nested in Quote to cash).
2. Scroll over the diagram — it pans. Click a nested stage — the matching Elements row still highlights. Drag is unchanged while auto-layout is on (boxes are not draggable).
3. Hold **⌘** (Mac) or **Ctrl** and scroll over a nested box — that box stays under the pointer while the view zooms. Further scrolling stops at a readable maximum and a minimum where boxes are still visible.
4. Turn **Auto layout** **Off**, drag a box, then ⌘/Ctrl+scroll again — the drag still moves the box, and zoom still centres on the pointer.
5. Switch to another named view, or open another file — the canvas returns to normal size.

## Canvas snap grid

The diagram pane draws a snap grid in model space, from the top-left `(0, 0)` outward — the same coordinates as `position` clauses, including empty canvas past the boxes. Drawn lines are **8** model units apart (a stronger line every four of those). That drawn pitch does not change when you pick a larger **Grid size**. Only zoom changes how big the lines look on screen.

**Grid size** is snap spacing only: 8, 16, 24, 32, or 48. The default is **24** (the diagram padding; a default-width box is seven snap cells wide). Each of those sizes lands on a drawn line. Boxes are seated on that spacing (both edges on a cell) and orthogonal relationships run along those lines. That seating applies with **Auto layout** **Off** and with **Auto layout** **On**, including the default file-open path (ELK layered, layers, and organic). **Mode → Grid** catalogue packing is not reseated.

This is a placement aid. It does not replace **Mode → Grid** (`autoLayout grid`), which still packs a catalogue by kind or name.

| Control | Where | Effect |
| --- | --- | --- |
| **Grid** | Diagram chrome, beside **Options** | Shows or hides the lines. Default is shown. Hiding the lines does not turn snap off. |
| **Grid size** | **Options** (8, 16, 24, 32, 48) | Snap spacing in model units. Default is 24. Does not redraw a coarser or finer grid. A non-default size is named on the Options button (`Grid 32`). |

Both settings last for this app session. They are not written back to the `.plein`.

Snap runs only while auto-layout is off (toolbar **Off**, or a view with `autoLayout off` / `manual`), because that is when boxes can be dragged. The pointer delta is not clamped to the current content box: dragging past the outermost box still grows the canvas, and the grid grows with model space, including a negative origin. The dragged box’s top-left snaps to the nearest snap cell. A multi-selection uses that same snap on the box under the pointer; the other selected boxes keep their offset from it. Nested children move by that same delta, so they keep their offset from the parent.

The neighbour-align pass (centres and edges of nearby boxes) is already on, via `alignDraggedBox`. **Grid snap runs first** on the unclamped pointer position: `gridSnapForDrag` passes `snapProposedOrigin` as the `gridSnap` hook. Neighbour alignment may then move that point, and only if its candidate is still within the align threshold; otherwise the grid result stands. Hiding the lines does not omit `gridSnap`. Alignment guides can pull a box off the cell only in that within-threshold case, and that drop stays off the cell until you change Grid size.

Smoke (`npm run app:preview` or `Plein.app`):

1. Open [fixtures/valid-basic.plein](../fixtures/valid-basic.plein) and leave **Auto layout** on **File** (the view is automatic). The grid fills the canvas from the top-left. Boxes sit on cells and orthogonal relationship lines run along the grid without turning **Auto layout** **Off**. The same seating is on [fixtures/valid-manual-layout.plein](../fixtures/valid-manual-layout.plein) with **Auto layout** **Off**.
2. Turn **Auto layout** **Off**. Click **Grid**. The lines disappear. Drag a box: its top-left still jumps to a cell. Click **Grid** again: the lines return, and the box stays where the snap left it.
3. Open **Options → Grid size** and choose **32**. The drawn lines look the same. Drag a box: it lands on 32-unit cells, still on a drawn line. The Options button reads **Grid 32**. Zoom in: the lines get larger. Zoom is the only control that does that.
4. Drag a box past the left or top of the diagram. The canvas grows, the grid continues into the new region, and the box is not stuck against the old content edge.
5. **Mode → Grid** still packs by kind or name and does not move those boxes onto the snap lattice. With **Auto layout** **On**, boxes stay on the lattice and are not draggable. Turning **Auto layout** **Off** keeps that seating and makes a drag snap to the same cells.

## Save manual positions

**Save** (toolbar button, **File → Save**, or **⌘S**) writes the positions on screen into the open `.plein`. The shape is the existing view clause, not a second layout format:

```plein
autoLayout off
position shipper 40 240
position booking 280 40
size shipper 216 80
```

Coordinates are view-space top-lefts (`position <id> <x> <y>`). An edge resize adds `size <id> <width> <height>` in the same pixels. Each id in that view is written once. A `size` already in the file is kept when you save a move that did not resize that box. Other clauses, other views that you have not moved, and the rest of the file stay as they were. A group move stores every box that moved. A resize stores that one box.

| Auto layout | Save |
| --- | --- |
| **Off** | Enabled. Writes `autoLayout off` and the top-lefts on screen for this view, plus a `size` clause for each box you resized. Also writes any other view that still has unsaved moves or resizes. |
| **File**, and this view is `off` or `manual` | Enabled. Same write. The view is already manual in the file. |
| **On** | Disabled. Placement is recomputed. `position` clauses are not applied and are not updated. |
| **File**, and this view is automatic | Disabled. Same as **On** for this view. |

Turning **On** discards unsaved moves. Turning **Off** on a view the file still lays out automatically marks the file unsaved, because that freeze is not in the file yet. A drag or a group move does the same. The toolbar file name reads **Unsaved —** until **Save**. **Save** clears it and returns **Auto layout** to **File**, so the open view follows the clauses just written.

**Reload** re-reads the file and keeps an unsaved freeze on screen. It does not write. Quit and reopen uses only what **Save** wrote.

In `Plein.app`, **Save** overwrites the open `.plein` path. Browser preview (`npm run app:preview`) cannot write that path, so **Save** downloads the `.plein` and keeps the saved text for **Reload**. Open the download to see the same positions in a new session. An Open Exchange import has no `.plein` to save; **Save** stays disabled.

Direction, routing, nesting, mode, and grid size are still local preview. **Save** does not write them.

## Reload after edit

Edit the open `.plein` in any text editor, save, then reload. The app re-reads the file from disk and redraws the **current** viewpoint — you do not quit `Plein.app`.

In the Mac app:

1. **Reload** in the toolbar, or **File → Reload**, or **⌘R**.
2. The diagram, switcher, and lists update from the saved file.
3. If the current named viewpoint still exists, it stays selected. If you deleted that view, Plein falls back to the first remaining named view.
4. A **new** `view` / `viewpoint` block in the markup appears in the switcher after reload. Click it to draw that view — no app rebuild.

Browser preview (`npm run app:preview`) has no filesystem path after the file picker, so **Reload** re-parses the last loaded text. After disk edits in preview, use **Open…** again. The Mac `.app` is the supported reload path.

## Import Open Exchange XML

**File → Import Open Exchange XML…**, the toolbar **Import…** button, or **⇧⌘I** reads an ArchiMate Model Exchange File Format document and opens it as a model. The converter is `importOpenExchange` — the same subset as `plein import`, not a second one. The open panel accepts an `.xml` file (in browser preview, the file picker replaces that panel). Cancel leaves the current model alone and shows no banner.

The imported source is loaded with `loadPleinSource`, the same path as **Open…** on a `.plein`. The first named viewpoint is selected. **Reload** (⌘R) re-imports that XML: from disk in `Plein.app`, or the text from the file picker in browser preview. Opening a `.plein` leaves the import session.

The note above the canvas is the CLI summary (`formatImportReport`): element, relationship, and view counts, plus the same gap notes. Diagram geometry, styles, and organization folders are not imported. Skipped junctions, diagram-only nodes, and non-diagram views are counted in that note. The subset is not wider than `plein import`.

A failed import shows **Could not import this Open Exchange file** and the `file:line:column` message (the same class as `plein import` on stderr). The diagram and sidebar stay hidden. A failed read of the chosen file uses that same banner. Nothing is written, and the failure is not silent.

Open Exchange export of the whole model is **File → Export…** → **Open Exchange** (`exportOpenExchange`, the S5b subset). HTML, SVG, and HTML and SVG in that sheet still follow the viewpoint on the canvas.

Smoke from `Plein.app` (or `npm run app:preview` for the file picker):

1. **File → Import Open Exchange XML…** and choose [fixtures/open-exchange/booking.xml](../fixtures/open-exchange/booking.xml).
2. The note reads **17 elements, 15 relationships, 2 views**, and says diagram geometry, styles, and organization folders are not imported. It also notes the skipped junction and the diagram-only nodes.
3. The canvas is **Booking context**, the first viewpoint, the same path as opening [booking.plein](../fixtures/open-exchange/booking.plein). **Views** lists **Booking context** and **Quote to cash**. Click **All**: **Elements (17)** and **Relationships (15)**.
4. Import a file that is not Open Exchange XML. The banner says **Could not import this Open Exchange file**. No diagram.
5. With a model open, **File → Import Open Exchange XML…** and press **Cancel**. The diagram stays, and no error banner appears.

## Export the current view

**File → Export…**, the toolbar **Export…** button, or **⇧⌘E** writes the viewpoint on the canvas. **All** in the Views list filters the sidebar only. Export follows the named view in the **View** chrome. **Open Exchange** in the same sheet is the whole model; see [Export the open model as Open Exchange](#export-the-open-model-as-open-exchange).

1. Choose **HTML**, **SVG**, or **HTML and SVG** — the same formats as `plein export --format html|svg|both`.
2. **Save…** opens the standard Mac save panel (in browser preview, the browser downloads the file instead). HTML is one `.html` page. SVG is one `.svg`. **HTML and SVG** writes both files from the name you choose (`booking.html` and `booking.svg`).
3. Quit `Plein.app` and open the file in Safari, Chrome, Firefox, or Preview. The page does not need the Mac app, and it does not load scripts or stylesheets from the network.
4. The diagram is the layout already on screen, written by `renderViewpointSvg` and `wrapViewpointHtml` (the same writer as `plein export` / `exportNamedView`). Elements and relationships match the canvas, including a local Auto layout / Options preview or boxes you dragged.

Cancel the save panel and nothing is written, and no error banner appears. If there is no view to export, the save panel does not open, and the banner reads **Could not export this view** with the reason (no file, the file did not load, or the diagram is not ready). A failed write uses that same banner — it does not fail silently.

Smoke from `Plein.app` (or `npm run app:preview` for the dialog; the preview download replaces the save panel):

1. **Open** [fixtures/valid-views.plein](../fixtures/valid-views.plein). The **View** chrome reads **Application Structure**.
2. **File → Export…**. Choose **HTML**. **Save…** and pick a file. Quit Plein. Open the HTML in a browser. The diagram is Application Structure (including `legacyBatch`, without `tms -> legacyBatch`).
3. Launch Plein again, open the same file, and click **Application Cooperation**. **Export…** as **SVG**. Open the `.svg` in a browser or Preview. The diagram is TMS and Booking API only.
4. On Application Structure, choose **HTML and SVG**. The folder you save to contains both an `.html` and an `.svg` for that view.
5. **Open** [fixtures/broken-syntax.plein](../fixtures/broken-syntax.plein). **File → Export…**. The banner says **Could not export this view**. No file is written.
6. With a view open, **File → Export…** and press **Cancel** on the save panel (or **Cancel** in the format sheet). The diagram stays, and no error banner appears.

## Export the open model as Open Exchange

**File → Export…**, the toolbar **Export…**, or **⇧⌘E**, then **Open Exchange**. That choice writes the **whole open model** as XML. It is not the viewpoint on the canvas (HTML, SVG, and HTML and SVG are unchanged and still follow the **View** chrome).

1. Choose **Open Exchange**. The sheet title reads **Export Open Exchange**, and the line under it names the `.plein` file, not only the view.
2. **Save…** opens the standard Mac save panel with a `.xml` name taken from the file stem (`booking.plein` or an imported `booking.xml` → `booking.xml`, not `booking.xml.xml`). Trailing dots in front of that extension collapse (`booking2..xml` → `booking2.xml`). In browser preview, the browser downloads that `.xml` instead.
3. The bytes are `exportOpenExchange` — the same writer as `plein export-open-exchange`. Re-import with **File → Import Open Exchange XML…** or `plein import`. On the booking fixture, the file matches [fixtures/open-exchange/booking.export.xml](../fixtures/open-exchange/booking.export.xml), and importing it again matches [fixtures/open-exchange/booking.roundtrip.plein](../fixtures/open-exchange/booking.roundtrip.plein).
4. Comments, the original model name, diagram geometry, styles, and the other gaps in [docs/open-exchange-import.md](../docs/open-exchange-import.md) stay out. That is the S5b subset, not a new one.

Cancel the save panel and nothing is written, and no error banner appears. A failed write shows **Could not export Open Exchange**. If the file did not load, **Export…** still shows **Could not export this view** and does not open the sheet — the same gate as HTML and SVG.

Assert without opening the app:

```bash
npm test
./scripts/assert-viewpoint-layout.sh
./scripts/assert-archimate-style.sh
./scripts/assert-reload-diagram.sh
./scripts/assert-multi-view-browser.sh
./scripts/assert-selection-sync.sh
```

## Arran smoke — S4 multi-view navigation

Mac app checklist for named-view navigation. Export of the open view is [Export the current view](#export-the-current-view). Release `.dmg` or `npm run app:preview`:

1. **Open** [fixtures/valid-views.plein](../fixtures/valid-views.plein) (≥2 named views). The **View** chrome reads **Application Structure**. The matching Views row is marked **Showing**. Do not reopen the file for the rest of this list.
2. Click **Application Cooperation** in the left **Views** list (not along the top of the canvas). The canvas switches (TMS + Booking API). The **View** chrome reads **Application Cooperation**. There is no view-switcher tablist above the diagram.
3. Click **Application Structure**. Golden membership returns. The **View** name follows. Same file still open.
4. Scroll the canvas (plain scroll pans; ⌘/Ctrl+scroll zooms) and the Views list. The **View** name above the diagram stays visible.
5. Click **All**. Sidebar lists the whole model. The **View** chrome still names the last named viewpoint.

Assert without the app: `./scripts/assert-multi-view-browser.sh` (or `npm test`).

## Arran smoke — left sidebar lists

Release `.dmg` or local `Plein.app` (no Node required on the Release path):

1. **Open** [fixtures/samples/value-stream-demo.plein](../fixtures/samples/value-stream-demo.plein). **Views**, **Elements (8)**, and **Relationships (9)** are in the **left sidebar**. The diagram fills the remaining height — no bottom list strip.
2. Scroll Elements and Relationships if the pane is short. Headings keep the counts visible.
3. Click **Quote freight** on the diagram (child inside Quote to cash). The Elements row for `quote` highlights — not the parent container. Click the **Quote to cash** title or empty interior (not a child) — one parent chrome highlights and the parent Elements row highlights (not two stacked boxes / two list rows). Click **TMS** in the Elements list — the TMS box highlights. Click a visible relationship row — the edge highlights. Click empty canvas or press Escape — both highlights clear.
4. **Open** [fixtures/valid-views.plein](../fixtures/valid-views.plein). Application Structure: **Elements (5)** / **Relationships (3)** (`tms -> legacyBatch` absent). The **View** chrome reads **Application Structure**. Click **Shipment** on the diagram — its list row highlights. Click **Application Cooperation**: **Elements (2)** / **Relationships (1)** and the shipment highlight clears. The **View** chrome reads **Application Cooperation** (file still open). Click **TMS** in the list — the box highlights. Click **All**: whole model (**5** / **4**); the diagram and **View** name stay on the last named view and TMS stays selected if it is still listed.
5. Open **Options** and choose **File default**, **Nested**, or **Beside**. Lists stay on the left; nested render still works on the canvas. Selection follows the item across the local nesting preview.
6. **Open** [fixtures/broken-syntax.plein](../fixtures/broken-syntax.plein). Banner only — sidebar and diagram stay hidden.

## Arran smoke (`.dmg` / Open + errors)

After installing from the GitHub Release `.dmg` (when published) or a local `Plein.app`:

1. **Open** [fixtures/samples/value-stream-demo.plein](../fixtures/samples/value-stream-demo.plein). The diagram is **Quote to cash — value stream, capabilities, applications**. Quote, Book, and Collect sit **inside** the Quote to cash container (file `nesting nested`). No error banner. Strategy boxes (value stream, capability) are orange `#F5DEAA`; application components are cyan `#B5FFFF`; each box has a type glyph in the top-right. Capability uses the staircase-of-blocks glyph; value-stream uses the notched chevron. Left sidebar: **Views**, **Elements (8)**, **Relationships (9)**. The canvas uses the remaining height — no bottom list strip. Scroll a list if it overflows; counts stay on the headings.
2. Open **Options** and use **File default / Nested / Beside** to preview the other placement without editing the file. **File default** follows the `.plein` clause. Lists stay on the left.
3. **Open** [fixtures/valid-catalogue-layers.plein](../fixtures/valid-catalogue-layers.plein). The diagram is **ArchiMate layers sample** with seven coloured boxes (orange / purple / yellow / cyan / green node / green facility / pink). Stick-figure on the actor, component glyph on Rate engine, cube on the node, building on the facility. Mapping: [docs/archimate-style.md](../docs/archimate-style.md). Golden SVG: [fixtures/golden-catalogue-layers.svg](../fixtures/golden-catalogue-layers.svg). Lists stay on the left.
4. **Open** [fixtures/broken-syntax.plein](../fixtures/broken-syntax.plein) (or [malformed-views.plein](../fixtures/malformed-views.plein) / [invalid-value-stream-nesting.plein](../fixtures/invalid-value-stream-nesting.plein)). The banner reads **This .plein did not load** plus a `file:line:column` diagnostic — the same class as `plein check`. Diagram and sidebar stay hidden.

`.dmg` packaging is out of scope here (Gilfoyle).

## Smoke checklist (`.app`)

**Release path (Arran, no Node):** [README Arran checklist](../README.md#arran-smoke-checklist) — download `.dmg` → install → open the sample (orange/cyan + glyphs; left sidebar Elements/Relationships) → open the catalogue-layers fixture (seven-layer rainbow) → open broken → see errors. Open + error banner wording is [PR #16](https://github.com/flowlab-hq/plein/pull/16).

On an Apple Silicon Mac, after `npm run app:build`:

1. Launch `Plein.app`. The empty state asks you to open a `.plein` file or import an Open Exchange XML model.
2. **Open…** [fixtures/samples/value-stream-demo.plein](../fixtures/samples/value-stream-demo.plein). The diagram pane shows **Quote to cash** with Quote, Book, and Collect nested inside the value stream. Orange strategy boxes, cyan application boxes, type glyphs on each. No error banner. Left sidebar lists **Elements (8)** and **Relationships (9)** under Views — no bottom strip. Open **Options** and choose **File default / Nested / Beside** to preview the other placement locally. Click a nested stage on the diagram and confirm the matching Elements row highlights; click a list row and confirm the diagram item highlights; click empty canvas to clear.
3. **Open…** [fixtures/valid-catalogue-layers.plein](../fixtures/valid-catalogue-layers.plein). Seven layer colours as in [docs/archimate-style.md](../docs/archimate-style.md). Hover a box: tooltip is `type — label`. Lists stay on the left.
4. **Open…** `fixtures/valid-basic.plein`. The diagram pane shows **Booking context** (Shipper, Booking service, Freight order, Rate engine) with serving / access / realization edges. Shipper / Booking / Freight order are yellow; Rate engine is cyan. Left sidebar matches those four elements and four relationships.
5. Click **All**. Sidebar lists show the whole model. The diagram stays on the named viewpoint **booking-context**.
6. Open `fixtures/valid-views.plein`. The diagram is **Application Structure**. The `tms -> legacyBatch` relationship is absent (`exclude "* -> legacyBatch"`); typed elements including `legacyBatch` remain. Membership is the golden set in `fixtures/golden-applicationStructure.json` (`npm test` / `./scripts/assert-viewpoint-layout.sh`). Application boxes are cyan with component / interface / object glyphs. Sidebar **Elements (5)** / **Relationships (3)**.
7. Click **Application Cooperation** in the left **Views** list. The canvas shows TMS and Booking API only (same file, same model). The **View** chrome reads **Application Cooperation**. Sidebar becomes **Elements (2)** / **Relationships (1)**. Click **Application Structure** again; golden membership returns and the **View** name follows. No view-switcher buttons appear along the top of the canvas.
8. Open `fixtures/malformed-views.plein`. The banner shows **This .plein did not load** and a `file:line:column` diagnostic (same class as `plein check`). No diagram.
9. Open `fixtures/broken-syntax.plein`. Same class of line-oriented error; diagram and lists stay hidden.
10. From Finder, Open With `Plein.app` on `fixtures/samples/value-stream-demo.plein`. The file loads and **Quote to cash** renders without using **Open…**.
11. Keep `valid-views.plein` open. In a text editor, add a new view under `views` (for example `view legacy-flow { title "Legacy flow" include tms legacyBatch }`) and save. Click **Reload** (or **⌘R** / **File → Reload**). **Legacy flow** appears in the switcher. Click it: TMS and Legacy batch, with the flow edge. No app rebuild.
12. Still on that file, add `exclude shipment` under `applicationStructure` (or change an element label) and save. Reload. The **Application Structure** diagram matches the saved markup without restarting the app.
13. Intel Mac: skip. Documented as unsupported.
