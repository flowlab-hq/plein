#!/usr/bin/env bash
# Assert ArchiMate type/layer colours and icons on the shared SVG render path.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
npx tsc
node --test dist/archimate-style.test.js
