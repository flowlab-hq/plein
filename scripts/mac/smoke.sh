#!/usr/bin/env bash
# Smoke the packaged `plein check` contract:
#   - golden fixtures (model + views) exit 0
#   - broken fixture exits non-zero and prints diagnostics
#   - unknown-keyword fixture exits non-zero and prints diagnostics
#   - malformed-views fixture exits non-zero and prints diagnostics
#
# Usage:
#   ./scripts/mac/smoke.sh              # build from this checkout, then check
#   PLEIN_BIN=plein ./scripts/mac/smoke.sh   # use a Homebrew (or other) install
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -n "${PLEIN_BIN:-}" ]]; then
  run_plein() { "$PLEIN_BIN" "$@"; }
else
  if [[ ! -f dist/cli.js ]]; then
    npm ci
    npm run build
  fi
  run_plein() { node "$ROOT/dist/cli.js" "$@"; }
fi

fail() {
  echo "error: $*" >&2
  exit 1
}

expect_ok() {
  local file="$1"
  echo "== golden: ${file} (expect exit 0) =="
  run_plein check "$file"
}

expect_diag() {
  local file="$1"
  echo "== fail: ${file} (expect non-zero + diagnostics) =="
  local out status
  set +e
  out="$(run_plein check "$file" 2>&1)"
  status=$?
  set -e
  if [[ "${status}" -eq 0 ]]; then
    fail "${file} unexpectedly passed"
  fi
  if [[ -z "${out}" ]]; then
    fail "${file} produced no diagnostics"
  fi
  printf '%s\n' "${out}"
}

expect_ok fixtures/valid-basic.plein
expect_ok fixtures/valid-views.plein
expect_diag fixtures/broken-syntax.plein
expect_diag fixtures/unknown-keyword.plein
expect_diag fixtures/malformed-views.plein

echo "smoke ok"
