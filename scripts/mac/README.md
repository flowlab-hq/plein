# Mac packaging

Plein ships as a **Homebrew formula** so Arran (or anyone on Apple Silicon) can run `plein check` without setting up Node or npm by hand.

## What we ship

| Channel | Status |
| --- | --- |
| Homebrew formula (`Formula/plein.rb`) | **Supported** — tap this repo, `brew install plein` |
| Signed `.pkg` | **Skipped** — no Apple Developer signing identity in this project |
| Standalone `darwin-arm64` binary | **Not produced here** — this builder is Linux; a Node/Bun SEA would be tens of MB and needs a macOS host or a GitHub Release to distribute |
| GUI | **Tauri list UI** — [app/README.md](../../app/README.md). Apple Silicon `.app`; Intel unsupported |

Homebrew installs the Node runtime as a dependency and wraps `dist/cli.js`. The user only runs `brew` and `plein`. The Mac list UI is a separate Tauri `.app` (not installed by Homebrew).

## Supported Macs

- **Apple Silicon (arm64)** — supported target for Homebrew `plein check` and the Tauri `.app`
- **Intel (x86_64)** — out of scope. The formula does not block Intel (may work via Homebrew + Node, untested). The `.app` is **not** built for Intel.

## Install (same 3 steps as the README)

```bash
# 1. Homebrew, if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Tap this repository and install (Homebrew provides Node)
brew tap flowlab-hq/plein https://github.com/flowlab-hq/plein
brew install plein

# 3. Check a model
plein check path/to/file.plein
```

There is no separate `homebrew-plein` tap repo. `brew tap flowlab-hq/plein https://github.com/flowlab-hq/plein` uses this repository’s `Formula/plein.rb`.

Until a version tag exists, the formula installs from `main`. After the first tag, pin `url` + `sha256` in `Formula/plein.rb`.

To exercise the formula from this PR before it is on `main` (Apple Silicon, Homebrew installed):

```bash
git clone -b cursor/mac-install-packaging-1bc5 https://github.com/flowlab-hq/plein.git
cd plein
brew install --formula ./Formula/plein.rb
plein check fixtures/valid-basic.plein
brew test plein
```

The local formula file still fetches CLI source from `main` (already has `plein check`). After merge, the tap path in the README is enough.

## Smoke

From a source checkout (Linux or macOS):

```bash
./scripts/mac/smoke.sh
```

After Homebrew install:

```bash
PLEIN_BIN=plein ./scripts/mac/smoke.sh
```

The script checks:

1. `fixtures/valid-basic.plein` — exit 0
2. `fixtures/broken-syntax.plein` — non-zero + line-oriented diagnostics (already emitted by the TypeScript CLI)
3. `fixtures/unknown-keyword.plein` — non-zero + diagnostics (currently a parse error on `legacyBatch`; a dedicated unknown-keyword message may land from Moss later)

`brew test plein` repeats a smaller golden / broken pair inside the formula.

The Mac list UI has its own smoke checklist in [app/README.md](../../app/README.md). Load→list is covered by `npm test` (`src/list-model.test.ts`).
