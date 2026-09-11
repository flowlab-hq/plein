#!/usr/bin/env bash
# Assert the shared ArchiMate colour/icon map and legend SVG without opening the Mac app.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
npx tsc
node --test dist/archimate-style.test.js
