#!/usr/bin/env bash
# Build an Apple Silicon Plein .dmg with the Tauri bundler.
# Ad-hoc / unsigned unless APPLE_SIGNING_IDENTITY is set (Developer ID follow-up).
#
# Usage (Apple Silicon Mac):
#   ./scripts/mac/build-dmg.sh
#   VERSION=0.1.0 ./scripts/mac/build-dmg.sh
#
# Writes:
#   dist/macos/Plein-<version>-macos-arm64.dmg
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: Apple Silicon .dmg builds require macOS (this host is $(uname -s))." >&2
  echo "On Linux, push a v0.x.x tag or run the Release macOS .dmg GitHub Action." >&2
  exit 1
fi

arch="$(uname -m)"
if [[ "${arch}" != "arm64" ]]; then
  echo "error: Intel Macs are out of scope. Need Apple Silicon (arm64), got ${arch}." >&2
  exit 1
fi

if ! command -v rustc >/dev/null; then
  echo "error: Rust is required. Install rustup, then: rustup update && rustup target add aarch64-apple-darwin" >&2
  exit 1
fi

if ! command -v npm >/dev/null; then
  echo "error: Node 18+ / npm is required to build (end users of the .dmg do not need Node)." >&2
  exit 1
fi

rustup target add aarch64-apple-darwin

if [[ ! -d node_modules ]]; then
  npm ci
fi

npm run app:build

exec "$ROOT/scripts/mac/stage-dmg.sh"
