#!/usr/bin/env bash
# Assert static HTML/SVG export of a named viewpoint (plein export).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
npx tsc
node --test dist/export.test.js
