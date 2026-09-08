#!/usr/bin/env bash
# Assert edit → reload → diagram membership without opening the Mac app (M9b).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
npx tsc
node --test dist/reload.test.js
