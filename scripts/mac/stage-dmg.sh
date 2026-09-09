#!/usr/bin/env bash
# Copy the Tauri-produced Apple Silicon .dmg to a stable Release name.
#
# Looks under app/src-tauri/target/ (native or --target aarch64-apple-darwin).
# Writes dist/macos/Plein-<version>-macos-arm64.dmg and prints the path.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

version="${VERSION:-}"
if [[ -z "${version}" ]]; then
  version="$(node -p "require('./package.json').version")"
fi
version="${version#v}"

search_roots=(
  "${ROOT}/app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg"
  "${ROOT}/app/src-tauri/target/release/bundle/dmg"
)

dmg=""
for dir in "${search_roots[@]}"; do
  if [[ -d "${dir}" ]]; then
    found="$(find "${dir}" -maxdepth 1 -type f -name '*.dmg' | sort | tail -n 1 || true)"
    if [[ -n "${found}" ]]; then
      dmg="${found}"
      break
    fi
  fi
done

if [[ -z "${dmg}" ]]; then
  echo "error: no .dmg under app/src-tauri/target/*/release/bundle/dmg" >&2
  echo "Run this on an Apple Silicon Mac after: npm run app:build" >&2
  exit 1
fi

outdir="${ROOT}/dist/macos"
mkdir -p "${outdir}"
dest="${outdir}/Plein-${version}-macos-arm64.dmg"
cp -f "${dmg}" "${dest}"

echo "${dest}"
