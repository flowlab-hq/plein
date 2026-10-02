import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EXPORT_FORMATS, exportSavePaths, MAC_EXPORT_FORMATS } from "./export.js";
import { loadPleinSource } from "./list-model.js";
import { exportOpenExchange, importOpenExchange } from "./open-exchange.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Mac File menu exports the current view through the shared writer", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const rust = readFileSync(join(repoRoot, "app/src-tauri/src/lib.rs"), "utf8");
  const readme = readFileSync(join(repoRoot, "app/README.md"), "utf8");

  const menuStart = html.indexOf('<details id="file-menu"');
  const fileMenu = html.slice(menuStart, html.indexOf("</details>", menuStart));
  const exportItem = fileMenu.indexOf('id="export-button"');
  const openItem = fileMenu.indexOf('id="open-button"');
  assert.notEqual(exportItem, -1, "File menu Export… is present");
  assert.ok(openItem !== -1 && openItem < exportItem, "Export… sits with Open in the File menu");
  const toolbar = html.slice(html.indexOf('<header class="toolbar">'), html.indexOf("</header>"));
  assert.equal(toolbar.replace(fileMenu, "").includes('id="export-button"'), false);
  assert.match(html, /id="export-dialog"/);
  assert.match(html, /name="export-format" value="html"/);
  assert.match(html, /name="export-format" value="svg"/);
  assert.match(html, /name="export-format" value="both"/);
  assert.match(html, /name="export-format" value="open-exchange"/);
  assert.ok(
    html.indexOf('value="both"') < html.indexOf('value="open-exchange"'),
    "Open Exchange follows HTML and SVG",
  );
  assert.match(html, /id="error-lead"/);
  assert.match(html, /Could not export this view|This \.plein did not load/);
  assert.match(css, /\.export-dialog\[hidden\]\s*\{[^}]*display:\s*none/);

  assert.match(ui, /exportViewpoint/);
  assert.match(ui, /exportOpenExchange\(model, \{ file \}\)/);
  assert.match(ui, /exportSavePaths/);
  assert.match(ui, /listen\("export-view"/);
  assert.match(ui, /Could not export this view/);
  assert.match(ui, /Could not export Open Exchange/);
  assert.match(ui, /format: "open-exchange"/);
  assert.match(ui, /pick_export_path/);
  assert.match(ui, /write_export_file/);
  assert.match(ui, /suggestedName/);
  assert.match(ui, /openExchangeSuggestedStem\(loaded\.file\)/);
  assert.match(ui, /openExchangeSuggestedStem\(file\)/);
  assert.match(ui, /assertExportMatchesCanvas/);
  assert.match(ui, /data-node-id/);
  assert.match(ui, /data-edge-id/);
  assert.ok(
    ui.indexOf("await commitOpenExchangeExport()") < ui.indexOf("exported = exportViewpoint"),
    "Open Exchange returns before the view writer",
  );

  assert.match(rust, /"export", "Export…"/);
  assert.match(rust, /CmdOrCtrl\+Shift\+E/);
  assert.match(rust, /emit\("export-view"/);
  assert.match(rust, /fn pick_export_path/);
  assert.match(rust, /fn write_export_file/);
  assert.match(rust, /blocking_save_file/);
  assert.match(rust, /"html" => \("Export HTML"/);
  assert.match(rust, /"svg" => \("Export SVG"/);
  assert.match(rust, /"both" => \("Export HTML and SVG"/);
  assert.match(rust, /"open-exchange" => \("Export Open Exchange", "Open Exchange XML", "xml"\)/);
  assert.match(rust, /unknown export format/);
  assert.match(rust, /could not write/);

  assert.match(readme, /File → Export…/);
  assert.match(readme, /Could not export this view/);
  assert.match(readme, /Could not export Open Exchange/);
  assert.match(readme, /renderViewpointSvg/);
  assert.match(readme, /wrapViewpointHtml/);
  assert.match(readme, /exportOpenExchange/);
  assert.match(readme, /Open Exchange/);
});

test("Mac Open Exchange export matches export-open-exchange on the booking fixture", () => {
  assert.deepEqual(MAC_EXPORT_FORMATS.slice(0, EXPORT_FORMATS.length), [...EXPORT_FORMATS]);
  assert.equal(MAC_EXPORT_FORMATS.at(-1), "open-exchange");
  assert.deepEqual(exportSavePaths("/tmp/booking.xml", "open-exchange"), { xml: "/tmp/booking.xml" });

  const file = "fixtures/open-exchange/booking.plein";
  const loaded = loadPleinSource(readFileSync(join(repoRoot, file), "utf8"), file);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  const exported = exportOpenExchange(loaded.model, { file: loaded.file });
  const pinned = readFileSync(join(repoRoot, "fixtures/open-exchange/booking.export.xml"), "utf8");
  assert.equal(exported.xml, pinned);
  assert.equal(exported.report.elements, 17);
  assert.equal(exported.report.relationships, 15);
  assert.equal(exported.report.views, 2);
  const again = importOpenExchange(exported.xml, "booking.xml");
  assert.equal(
    again.source,
    readFileSync(join(repoRoot, "fixtures/open-exchange/booking.roundtrip.plein"), "utf8"),
  );
});
