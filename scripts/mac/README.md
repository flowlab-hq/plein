# Mac packaging

Plein ships two Apple Silicon channels:

1. **Mac app `.dmg`** — open a `.plein` and browse named viewpoints. No Node/npm at runtime.
2. **Homebrew formula** — `plein check` on the CLI. Homebrew provides Node.

## What we ship

| Channel | Status |
| --- | --- |
| GitHub Release `.dmg` (arm64) | **Supported** — tag `v0.x.x` or run **Release macOS .dmg**. Asset: `Plein-<version>-macos-arm64.dmg` |
| Homebrew formula (`Formula/plein.rb`) | **Supported** — tap this repo, `brew install plein` |
| Signed / notarized `.dmg` or `.pkg` | **Follow-up** — no Apple Developer signing identity in this project |
| Intel (x86_64) `.dmg` / `.app` | **Out of scope** — not built or tested |
| Standalone `darwin-arm64` CLI binary | **Not produced here** — Homebrew wraps `dist/cli.js` |

The `.dmg` is produced by the **Tauri bundler** (`bundle.targets`: `app` + `dmg` in `app/src-tauri/tauri.conf.json`). `create-dmg` is not required.

## Download and install (GUI)

Same steps as the [README](../../README.md#download-the-mac-app-apple-silicon-dmg):

1. Download `Plein-*-macos-arm64.dmg` from [GitHub Releases](https://github.com/flowlab-hq/plein/releases).
2. Drag **Plein** into Applications.
3. First launch is Gatekeeper-blocked (unsigned). Right-click → **Open** → **Open**.
4. Open [fixtures/samples/value-stream-demo.plein](../../fixtures/samples/value-stream-demo.plein) — orange strategy boxes, cyan applications, type glyphs.
5. Open [fixtures/valid-catalogue-layers.plein](../../fixtures/valid-catalogue-layers.plein) — seven-layer rainbow (see [docs/archimate-style.md](../../docs/archimate-style.md)).
6. Open [fixtures/broken-syntax.plein](../../fixtures/broken-syntax.plein) and confirm the UI banner shows a `file:line:column` error.

## Cut a Release

Push a version tag after this workflow is on `main`:

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```

Or **Actions → Release macOS .dmg → Run workflow** with `create_release` and tag `v0.1.0`.

The job runs on `macos-14` (Apple Silicon), builds `--target aarch64-apple-darwin --bundles app,dmg`, stages the stable name via `scripts/mac/stage-dmg.sh`, and attaches the file plus [release-notes.md](release-notes.md).

## Local `.dmg` (Apple Silicon Mac)

Needs Xcode CLT, Node 18+, Rust stable **1.88+**.

```bash
git clone https://github.com/flowlab-hq/plein.git
cd plein
./scripts/mac/build-dmg.sh
# → dist/macos/Plein-0.1.0-macos-arm64.dmg
```

Equivalent: `npm ci && npm run app:build` then `./scripts/mac/stage-dmg.sh`.

This Linux checkout cannot produce a `.dmg` (no macOS SDK).

`signingIdentity` is `"-"` (ad-hoc) so CI and local builds succeed without a keychain identity. Override later with `APPLE_SIGNING_IDENTITY` when a Developer ID exists.

## Gatekeeper and notarization follow-up

Unsigned / ad-hoc builds downloaded from the internet are quarantined. That is expected until notarization lands.

To ship a Developer ID–signed, notarized `.dmg` later:

1. Enroll in the Apple Developer Program and create a **Developer ID Application** certificate.
2. Add repo secrets (do not commit them): `APPLE_CERTIFICATE` (base64 `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`.
3. Import the cert in the workflow, set `APPLE_SIGNING_IDENTITY`, and drop or override `bundle.macOS.signingIdentity: "-"`.
4. Notarize with `xcrun notarytool` / Tauri’s notarization env (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`) and staple the `.dmg`.
5. Confirm Gatekeeper opens without the right-click bypass.

Until those secrets exist, keep shipping unsigned and keep this note in Release notes.

## Homebrew CLI

Homebrew installs the Node runtime as a dependency and wraps `dist/cli.js`. The user only runs `brew` and `plein`. The Mac app is **not** installed by Homebrew.

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

## Smoke

From a source checkout (Linux or macOS):

```bash
./scripts/mac/smoke.sh
```

After Homebrew install:

```bash
PLEIN_BIN=plein ./scripts/mac/smoke.sh
```

The script delegates to `scripts/check-fixtures.sh` (same catalogue CI uses):

1. Golden (exit 0): `valid-basic.plein`, `valid-views.plein`, `valid-catalogue-layers.plein`, `valid-capability-value-stream.plein`, `valid-value-stream-stages.plein`, `samples/value-stream-demo.plein`, `samples/research-data-eprints-arkivum.plein`
2. Expected-fail (non-zero + diagnostics): `broken-syntax.plein`, `unknown-keyword.plein`, `malformed-views.plein`, `invalid-value-stream-nesting.plein`, `unknown-value-stream-step.plein`

`brew test plein` repeats a smaller golden / broken pair inside the formula. GitHub Actions **Check fixtures** runs the same script on every push and pull request.

**Arran `.dmg` smoke** (no Node): download → install → open the sample (left sidebar Elements/Relationships, no bottom strip) → open broken → see errors. Written in the README and [release-notes.md](release-notes.md). Same pair as [PR #16](https://github.com/flowlab-hq/plein/pull/16) (Moss: Open + error banner).

The Mac app has a longer Open → view, switch, and reload checklist in [app/README.md](../../app/README.md). Load→list is covered by `npm test` (`src/list-model.test.ts`). Left-sidebar layout (no bottom strip) is `src/app-layout.test.ts`. Diagram ↔ list selection is `src/selection.test.ts` / `./scripts/assert-selection-sync.sh`. Viewpoint layout membership (golden include/exclude) is `src/layout.test.ts` / `./scripts/assert-viewpoint-layout.sh`. ArchiMate type colours and icons are `src/archimate-style.test.ts` / `./scripts/assert-archimate-style.sh`. Edit → reload → diagram is `src/reload.test.ts` / `./scripts/assert-reload-diagram.sh`. One model → many views is `src/browser.test.ts` / `./scripts/assert-multi-view-browser.sh`.
