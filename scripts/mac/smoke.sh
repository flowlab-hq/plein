#!/usr/bin/env bash
# Smoke the packaged `plein check` contract via scripts/check-fixtures.sh
# (golden fixtures including catalogue layers exit 0; expected-fail fixtures
# exit non-zero). Same catalogue as CI.
#
# Usage:
#   ./scripts/mac/smoke.sh              # build from this checkout, then check
#   PLEIN_BIN=plein ./scripts/mac/smoke.sh   # use a Homebrew (or other) install
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${PLEIN_BIN:-}" && ! -f dist/cli.js ]]; then
  npm ci
  npm run build
fi

exec "$ROOT/scripts/check-fixtures.sh"
