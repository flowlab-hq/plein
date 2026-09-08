#!/usr/bin/env bash
# Assert the golden viewpoint layout membership (include/exclude) without opening the Mac app.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
npx tsc
node --test dist/layout.test.js
