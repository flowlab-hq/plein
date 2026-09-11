#!/usr/bin/env bash
# Assert diagram ↔ left-list selection sync (nested containers + multi-view).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
npx tsc
node --test dist/selection.test.js
