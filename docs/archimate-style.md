# ArchiMate type colours and icons

Plein colours ArchiMate elements by **layer** and draws a compact **type glyph** on each box. The Mac app (and any caller of `renderViewpointSvg`) uses one shared map: [`src/archimate-style.ts`](../src/archimate-style.ts) plus glyphs in [`src/archimate-icons.ts`](../src/archimate-icons.ts).

This is rectangle + decorator-icon notation, not full Archi figure skins, not custom themes, and not Open Exchange styling. The `.plein` `styles { }` block is still ignored.

Language-reference keywords: [Plein DSL (ArchiMate 4)](plein-dsl-archimate-4.md). Parser extras `grouping` and `location` are included here as composite.

## Layer fills

Fills are the Archi inbuilt defaults (common ArchiMate convention). Stroke is Archi’s default line colour `#5C5C5C`, except unknown types.

| Layer | Fill | Typical use |
| --- | --- | --- |
| Strategy | `#F5DEAA` | orange / beige — resource, capability, value-stream, course-of-action |
| Motivation | `#CCCCFF` | purple — stakeholder, driver, goal, requirement, … |
| Business | `#FFFFB5` | yellow — business-actor, process, service, object, … |
| Application | `#B5FFFF` | cyan / blue — application-component, interface, data-object, … |
| Technology | `#C9E7B7` | green — node, device, artifact, technology-service, … |
| Physical | `#C9E7B7` | same green as Technology — equipment, facility, distribution-network, material |
| Implementation and migration | `#FFE0E0` | pink — work-package, deliverable, plateau, gap, … |
| Composite | `#E8E8ED` | grey — grouping, location (parser extras) |
| Unknown / unsupported | `#F5F5F7` | light grey, stroke `#8E8E93` — safe default |

Physical shares Technology green on purpose (Archi does the same). Distinguish those types by glyph (cube vs building, and so on).

## Type glyphs

Every parser keyword gets a simplified 16×16 decorator in the top-right of the box. Shapes follow ArchiMate’s usual icon families (stick figure for actor/stakeholder, UML component for application-component, chevron for capability / value-stream / work-package, …). They are **not** full-size ArchiMate figures (no 3D node-as-the-box, no actor-as-the-whole-shape).

| Glyph id | Used by |
| --- | --- |
| `stick-figure` | `business-actor`, `stakeholder` |
| `role` | `business-role` |
| `collaboration` | `business-collaboration`, `application-collaboration`, `technology-collaboration` |
| `interface` | `business-interface`, `application-interface`, `technology-interface` |
| `component` | `application-component` |
| `object` | `business-object`, `data-object`, `artifact`, `deliverable` |
| `contract` | `contract` |
| `representation` | `representation` |
| `product` | `product` |
| `process` | `business-process`, `application-process`, `technology-process` |
| `function` | `business-function`, `application-function`, `technology-function` |
| `interaction` | `business-interaction`, `application-interaction`, `technology-interaction` |
| `event` | `business-event`, `application-event`, `technology-event`, `implementation-event` |
| `service` | `business-service`, `application-service`, `technology-service` |
| `node` | `node` |
| `device` | `device` |
| `system-software` | `system-software` |
| `path` | `path` |
| `network` | `communication-network`, `distribution-network` |
| `equipment` | `equipment` |
| `facility` | `facility` |
| `location` | `location` |
| `resource` | `resource` |
| `capability` | `capability` |
| `value-stream` | `value-stream` (including nested stages) |
| `course-of-action` | `course-of-action` |
| `driver` | `driver` |
| `assessment` | `assessment` |
| `goal` | `goal` |
| `outcome` | `outcome` |
| `principle` | `principle` |
| `requirement` | `requirement` |
| `constraint` | `constraint` |
| `meaning` | `meaning` |
| `value` | `value` |
| `work-package` | `work-package` |
| `plateau` | `plateau` |
| `gap` | `gap` |
| `grouping` | `grouping` |
| `material` | `material` |
| `generic` | unknown / unsupported keywords only |

Gaps vs a full Archi skin: no alternate figures, no relationship-line styling by type, no label-inside-shape variants, no Open Exchange colours. Layer-omitted aliases (`process`, `service`, …) inherit the Business concrete type they already resolve to.

## Unknown types

`elementStyle("legacyBatch")` (and any other unresolved keyword) returns the unknown palette and the `generic` square. The parser still rejects unknown keywords in `.plein` source; the default is for the renderer so a bad keyword cannot crash the SVG path.

## Visual fixture

[`fixtures/valid-catalogue-layers.plein`](../fixtures/valid-catalogue-layers.plein) is one element per layer. Membership + expected fill/icon: [`fixtures/golden-archimate-style.json`](../fixtures/golden-archimate-style.json). Rendered SVG pin: [`fixtures/golden-catalogue-layers.svg`](../fixtures/golden-catalogue-layers.svg) (open in a browser to review colours).

```bash
npm test
./scripts/assert-archimate-style.sh
# dump a viewpoint SVG (no app):
./scripts/render-viewpoint-svg.sh fixtures/valid-catalogue-layers.plein catalogue-layers
```

Mac Release smoke (Arran): open that catalogue file and the value-stream sample; expected colours are in [app/README.md](../app/README.md#arran-smoke-dmg--open--errors).
