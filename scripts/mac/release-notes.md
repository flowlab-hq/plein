# Plein __VERSION__ (Apple Silicon)

Download **Plein-__VERSION__-macos-arm64.dmg** from this release. Drag **Plein** into Applications. You do not need Node or npm.

**Apple Silicon only.** Intel Macs are out of scope.

## Gatekeeper (unsigned)

This build is **ad-hoc signed** and **not notarized** — there is no Apple Developer ID in CI yet. After download:

1. Right-click **Plein** → **Open** → **Open**, or
2. System Settings → Privacy & Security → **Open Anyway**.

Developer ID signing + notarization is a follow-up (see `scripts/mac/README.md`).

## Sample and broken fixtures

- Sample (should render **Quote to cash**, orange strategy / cyan applications + glyphs): [fixtures/samples/value-stream-demo.plein](https://github.com/flowlab-hq/plein/blob/main/fixtures/samples/value-stream-demo.plein)
- Catalogue layers (seven-layer rainbow): [fixtures/valid-catalogue-layers.plein](https://github.com/flowlab-hq/plein/blob/main/fixtures/valid-catalogue-layers.plein) — mapping in [docs/archimate-style.md](https://github.com/flowlab-hq/plein/blob/main/docs/archimate-style.md)
- Broken (banner should show `file:line:column`, no diagram): [fixtures/broken-syntax.plein](https://github.com/flowlab-hq/plein/blob/main/fixtures/broken-syntax.plein)
- Malformed views (same class of UI error): [fixtures/malformed-views.plein](https://github.com/flowlab-hq/plein/blob/main/fixtures/malformed-views.plein)

Open + error banner copy (**This .plein did not load**) is [PR #16](https://github.com/flowlab-hq/plein/pull/16).

Clone the repo (or download those raw files) so Open… can reach them.

## Arran smoke checklist

1. Download the `.dmg` from this release.
2. Install (drag to Applications) and launch — no Node/npm.
3. Open the sample — viewpoint diagram renders (orange value streams / capabilities, cyan applications, type glyphs).
4. Open the catalogue-layers fixture — seven layer colours (orange / purple / yellow / cyan / green / green / pink).
5. Open the broken fixture — clear error in the UI.
6. Intel: skip.
