#!/usr/bin/env bash
# Print one named viewpoint as SVG (shared Mac render path). Usage:
#   ./scripts/render-viewpoint-svg.sh fixtures/valid-catalogue-layers.plein catalogue-layers
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
file="${1:?usage: $0 <file.plein> [viewName]}"
view="${2:-}"
if [[ ! -f dist/list-model.js || ! -f dist/layout.js ]]; then
  npx tsc
fi
node --input-type=module - "$root" "$file" "$view" <<'EOF'
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [root, file, viewArg] = process.argv.slice(2);
const { loadPleinSource } = await import(pathToFileURL(join(root, "dist/list-model.js")).href);
const { layoutViewpoint, renderViewpointSvg } = await import(
  pathToFileURL(join(root, "dist/layout.js")).href
);

const source = readFileSync(file, "utf8");
const result = loadPleinSource(source, file);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
const viewName = viewArg || result.model.views[0]?.name;
if (!viewName) {
  console.error("error: file has no named view");
  process.exit(1);
}
process.stdout.write(renderViewpointSvg(await layoutViewpoint(result.model, viewName)));
EOF
