import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { filterModel, firstNamedView, loadPleinSource } from "./list-model.js";
import { formatImportReport, ImportError, importOpenExchange } from "./open-exchange.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Mac File menu imports Open Exchange XML through the CLI importer", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const rust = readFileSync(join(repoRoot, "app/src-tauri/src/lib.rs"), "utf8");
  const readme = readFileSync(join(repoRoot, "app/README.md"), "utf8");
  const guide = readFileSync(join(repoRoot, "docs/open-exchange-import.md"), "utf8");

  const open = html.indexOf('id="open-button"');
  const toolbar = html.indexOf('id="import-button"');
  const fileLabel = html.indexOf('id="file-label"');
  assert.notEqual(open, -1, "toolbar Open… is present");
  assert.notEqual(toolbar, -1, "toolbar Import… is present");
  assert.ok(open < toolbar && toolbar < fileLabel, "Import… sits with Open");
  assert.match(html, /id="import-input"/);
  assert.match(html, /accept="\.xml,text\/xml,application\/xml"/);
  assert.match(html, /id="import-notice"/);
  assert.match(html, /Imported Open Exchange XML/);
  assert.match(html, /id="error-lead"/);
  assert.match(css, /\.notice\[hidden\]\s*\{[^}]*display:\s*none/);

  assert.match(ui, /importOpenExchange/);
  assert.match(ui, /formatImportReport/);
  assert.match(ui, /openSource\(imported\.source, file\)/);
  assert.match(ui, /Could not import this Open Exchange file/);
  assert.match(ui, /listen\("import-open-exchange"/);
  assert.match(ui, /open_open_exchange_dialog/);
  assert.match(ui, /if \(!opened\) \{\s*return;\s*\}/);
  assert.match(ui, /exportOpenExchange\(model, \{ file \}\)/);

  assert.match(rust, /"import-open-exchange",\s*"Import Open Exchange XML…"/);
  assert.match(rust, /CmdOrCtrl\+Shift\+I/);
  assert.match(rust, /emit\("import-open-exchange"/);
  assert.match(rust, /fn open_open_exchange_dialog/);
  assert.match(rust, /set_title\("Import Open Exchange XML"\)/);
  assert.match(rust, /add_filter\("Open Exchange XML", &\["xml"\]\)/);
  assert.match(rust, /open_open_exchange_dialog,/);

  assert.match(readme, /File → Import Open Exchange XML…/);
  assert.match(readme, /Could not import this Open Exchange file/);
  assert.match(readme, /importOpenExchange/);
  assert.match(readme, /17 elements, 15 relationships, 2 views/);
  assert.match(readme, /formatImportReport/);
  assert.match(guide, /File → Import Open Exchange XML…/);
  assert.match(guide, /same subset and the same summary notes/);
});

test("Mac import of booking.xml loads the CLI subset as a model", () => {
  const file = "fixtures/open-exchange/booking.xml";
  const xml = readFileSync(join(repoRoot, file), "utf8");
  const imported = importOpenExchange(xml, file);
  const loaded = loadPleinSource(imported.source, file);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }

  assert.equal(loaded.model.elements.length, 17);
  assert.equal(loaded.model.relationships.length, 15);
  assert.equal(loaded.model.views.length, 2);
  assert.equal(firstNamedView(loaded.model), "id-booking-context");

  const all = filterModel(loaded.model, null);
  assert.equal(all.elements.length, 17);
  assert.equal(all.relationships.length, 15);
  assert.equal(all.views.length, 2);

  const booking = filterModel(loaded.model, "id-booking-context");
  assert.equal(booking.elements.length, 4);
  assert.equal(booking.viewName, "id-booking-context");

  const report = formatImportReport(file, imported.report);
  assert.match(report, /imported fixtures\/open-exchange\/booking\.xml \(17 elements, 15 relationships, 2 views\)/);
  assert.match(report, /diagram geometry, styles, and organization folders are not imported/);
  assert.match(report, /skipped 1 junction and 2 relationships that referenced it/);
  assert.match(report, /skipped 2 diagram-only nodes/);
});

test("a file that is not Open Exchange XML fails with a located message", () => {
  assert.throws(
    () => importOpenExchange("<not-a-model/>", "notes.xml"),
    (error: unknown) => {
      assert.ok(error instanceof ImportError);
      assert.match(error.message, /notes\.xml:\d+:\d+: expected an Open Exchange <model> root/);
      return true;
    },
  );
});
