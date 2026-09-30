import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Mac File menu exports the current view through the shared writer", () => {
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "app/ui/styles.css"), "utf8");
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const rust = readFileSync(join(repoRoot, "app/src-tauri/src/lib.rs"), "utf8");
  const readme = readFileSync(join(repoRoot, "app/README.md"), "utf8");

  const toolbar = html.indexOf('id="export-button"');
  const fileLabel = html.indexOf('id="file-label"');
  assert.notEqual(toolbar, -1, "toolbar Export… is present");
  assert.ok(toolbar < fileLabel, "Export… sits with Open and Reload");
  assert.match(html, /id="export-dialog"/);
  assert.match(html, /name="export-format" value="html"/);
  assert.match(html, /name="export-format" value="svg"/);
  assert.match(html, /name="export-format" value="both"/);
  assert.match(html, /id="error-lead"/);
  assert.match(html, /Could not export this view|This \.plein did not load/);
  assert.match(css, /\.export-dialog\[hidden\]\s*\{[^}]*display:\s*none/);

  assert.match(ui, /exportViewpoint/);
  assert.match(ui, /exportSavePaths/);
  assert.match(ui, /listen\("export-view"/);
  assert.match(ui, /Could not export this view/);
  assert.match(ui, /pick_export_path/);
  assert.match(ui, /write_export_file/);
  assert.match(ui, /suggestedName/);
  assert.match(ui, /assertExportMatchesCanvas/);
  assert.match(ui, /data-node-id/);
  assert.match(ui, /data-edge-id/);

  assert.match(rust, /"export", "Export…"/);
  assert.match(rust, /CmdOrCtrl\+Shift\+E/);
  assert.match(rust, /emit\("export-view"/);
  assert.match(rust, /fn pick_export_path/);
  assert.match(rust, /fn write_export_file/);
  assert.match(rust, /blocking_save_file/);
  assert.match(rust, /"html" => \("Export HTML"/);
  assert.match(rust, /"svg" => \("Export SVG"/);
  assert.match(rust, /"both" => \("Export HTML and SVG"/);
  assert.match(rust, /unknown export format/);
  assert.match(rust, /could not write/);

  assert.match(readme, /File → Export…/);
  assert.match(readme, /Could not export this view/);
  assert.match(readme, /renderViewpointSvg/);
  assert.match(readme, /wrapViewpointHtml/);
});
