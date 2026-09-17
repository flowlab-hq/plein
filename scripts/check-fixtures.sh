#!/usr/bin/env bash
# Run `plein check` against the fixture catalogue in fixtures/README.md.
#
#   golden        — valid-*.plein and samples/  → expect exit 0
#   expected-fail — broken / unknown / malformed → expect non-zero
#
# The script (and CI) fails if a golden fixture does not pass, or if an
# expected-fail fixture unexpectedly passes. Keep these lists in lockstep
# with fixtures/README.md (Moss owns that catalogue).
#
# Usage:
#   npm run build && npm run check:fixtures
#   PLEIN_BIN=plein ./scripts/check-fixtures.sh   # Homebrew (or other) install
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${PLEIN_BIN:-}" ]]; then
  run_plein() { "$PLEIN_BIN" "$@"; }
else
  if [[ ! -f dist/cli.js ]]; then
    echo "error: dist/cli.js missing; run npm ci && npm run build first" >&2
    exit 1
  fi
  run_plein() { node "$ROOT/dist/cli.js" "$@"; }
fi

# Golden / pass fixtures (exit 0). Matches fixtures/README.md.
GOLDEN=(
  fixtures/valid-basic.plein
  fixtures/valid-views.plein
  fixtures/valid-catalogue-layers.plein
  fixtures/valid-capability-value-stream.plein
  fixtures/valid-value-stream-stages.plein
  fixtures/samples/value-stream-demo.plein
  fixtures/samples/research-data-eprints-arkivum.plein
)

# Expected-fail fixtures (non-zero). Matches fixtures/README.md.
EXPECTED_FAIL=(
  fixtures/broken-syntax.plein
  fixtures/unknown-keyword.plein
  fixtures/malformed-views.plein
  fixtures/invalid-value-stream-nesting.plein
  fixtures/unknown-value-stream-step.plein
)

fail() {
  echo "error: $*" >&2
  exit 1
}

expect_ok() {
  local file="$1"
  echo "== golden: ${file} (expect exit 0) =="
  if [[ ! -f "$file" ]]; then
    fail "missing golden fixture ${file}"
  fi
  run_plein check "$file"
}

expect_fail() {
  local file="$1"
  echo "== fail: ${file} (expect non-zero) =="
  if [[ ! -f "$file" ]]; then
    fail "missing expected-fail fixture ${file}"
  fi
  local out status
  set +e
  out="$(run_plein check "$file" 2>&1)"
  status=$?
  set -e
  if [[ "${status}" -eq 0 ]]; then
    fail "${file} unexpectedly passed"
  fi
  if [[ -z "${out}" ]]; then
    fail "${file} exited ${status} but produced no diagnostics"
  fi
  printf '%s\n' "${out}"
}

for file in "${GOLDEN[@]}"; do
  expect_ok "$file"
done

for file in "${EXPECTED_FAIL[@]}"; do
  expect_fail "$file"
done

echo "check-fixtures ok (${#GOLDEN[@]} golden, ${#EXPECTED_FAIL[@]} expected-fail)"
