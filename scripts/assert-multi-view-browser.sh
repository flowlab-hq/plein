#!/usr/bin/env bash
# Assert one loaded model → many named views, and a new view appearing after reload (M10).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
npx tsc
node --test dist/browser.test.js
