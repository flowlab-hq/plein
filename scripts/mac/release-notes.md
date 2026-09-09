# Plein __VERSION__ (Apple Silicon)

Download **Plein-__VERSION__-macos-arm64.dmg** from this release. Drag **Plein** into Applications. You do not need Node or npm.

**Apple Silicon only.** Intel Macs are out of scope.

## Gatekeeper (unsigned)

This build is **ad-hoc signed** and **not notarized** — there is no Apple Developer ID in CI yet. After download:

1. Right-click **Plein** → **Open** → **Open**, or
2. System Settings → Privacy & Security → **Open Anyway**.

Developer ID signing + notarization is a follow-up (see `scripts/mac/README.md`).

## Sample and broken fixtures

- Sample (should render **Quote to cash**): [fixtures/samples/value-stream-demo.plein](https://github.com/flowlab-hq/plein/blob/main/fixtures/samples/value-stream-demo.plein)
- Broken (banner should show `file:line:column`, no diagram): [fixtures/broken-syntax.plein](https://github.com/flowlab-hq/plein/blob/main/fixtures/broken-syntax.plein)
- Malformed views (same class of UI error): [fixtures/malformed-views.plein](https://github.com/flowlab-hq/plein/blob/main/fixtures/malformed-views.plein)

Clone the repo (or download those raw files) so Open… can reach them.

## Arran smoke checklist

1. Download the `.dmg` from this release.
2. Install (drag to Applications) and launch — no Node/npm.
3. Open the sample — viewpoint diagram renders.
4. Open the broken fixture — clear error in the UI.
5. Intel: skip.
