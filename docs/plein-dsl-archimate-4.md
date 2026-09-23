# Plein DSL language reference (ArchiMate 4)

Plein is a small, human-editable language for describing ArchiMate 4 models and lightweight views. **Plein** is pronounced “pleen”. Files use the `.plein` extension and are intended to be readable in a pull request as well as by tooling.

This reference describes the current document shape and vocabulary. It is aligned with the [ArchiMate 4 specification](https://www.opengroup.org/archimate-forum/archimate-overview) and borrows the useful text-first, view-oriented approach of [Structurizr DSL](https://docs.structurizr.com/dsl).

## Document shape

A document contains these top-level blocks:

```plein
plein {
  model {
    // elements and relationships
  }

  views {
    // viewpoints and their membership
  }

  styles {
    // optional visual defaults and overrides
  }
}
```

`model`, `views`, and `styles` may also be accepted as the top-level blocks in a file without an explicit `plein` wrapper. A block may be omitted when it is empty; a useful minimum is a `model` block.

The header is only `plein {`. Do **not** put a name or description after the `plein` keyword.

* **Wrong** (fails: `expected '{' after plein`): `plein "My Model" "A description" {` or `plein MyModel {`
* **Right:** `plein {`

Put human titles on elements and views instead. Full wrong/right authoring notes, including a copy-paste example: [Mac-app authoring (wrong vs right)](#mac-app-authoring-wrong-vs-right).

### Identifiers and labels

* An identifier starts with a letter or underscore and may contain letters, digits, `_`, and `-`. Identifiers are unique within a model.
* A quoted label **requires** `as <identifier>`: `business-actor "Shipper" as shipper`. Omitting `as id` fails (`expected 'as <identifier>' after element label`).
* References in relationships and view membership use identifiers, not labels. A quoted label may contain spaces, punctuation, and Unicode.
* Re-declaring an identifier, referring to an unknown identifier, or declaring a relationship to itself is invalid.

## Model elements

Element keywords are kebab-case ArchiMate concepts grouped by domain (`value-stream`, not `valueStream`; `application-component`, not `applicationComponent`). Implementations should preserve the ArchiMate meaning of each keyword; a tool may provide a shorter alias, but authors and LLMs should emit the canonical kebab-case spelling.

### Strategy

`resource`, `capability`, `value-stream`, `course-of-action`

A `value-stream` may declare stages in a nested body. Use `value-stream-stage` (alias `valueStreamStage`) for each step. Stages are Value Stream elements; nesting records composition (`composedOf`) from the parent stream to each stage. Chain stages with `flow` / `flowsTo` or `triggering` / `triggers`.

```plein
value-stream "Order to cash" as orderToCash {
  value-stream-stage "Capture demand" as capture
  value-stream-stage "Fulfill order" as fulfill
  value-stream-stage "Collect payment" as collect
  capture -> fulfill: flow
  fulfill -> collect: triggering
}
```

`value-stream-stage` is valid only inside a `value-stream` body. Other element keywords there are unknown step keywords and fail with a line diagnostic. Stages cannot contain a nested body. A `value-stream` without a body remains a single strategy element.

### Motivation

`stakeholder`, `driver`, `assessment`, `goal`, `outcome`, `principle`, `requirement`, `constraint`, `meaning`, `value`

### Business

`business-actor`, `business-role`, `business-collaboration`, `business-interface`, `business-process`, `business-function`, `business-interaction`, `business-event`, `business-service`, `business-object`, `contract`, `representation`, `product`

### Application

`application-component`, `application-collaboration`, `application-interface`, `application-function`, `application-interaction`, `application-process`, `application-event`, `application-service`, `data-object`

### Technology and physical

`node`, `device`, `system-software`, `technology-collaboration`, `technology-interface`, `path`, `communication-network`, `technology-function`, `technology-process`, `technology-interaction`, `technology-event`, `technology-service`, `artifact`, `equipment`, `facility`, `distribution-network`, `material`

### Implementation and migration

`work-package`, `deliverable`, `implementation-event`, `plateau`, `gap`

An element has a keyword, a quoted label, and an identifier after `as`. The identifier is required when a label is present. Properties and documentation can be attached using the implementation's supported attribute syntax; unknown attributes should be reported rather than silently discarded.

### Catalogue coverage

The parser accepts every keyword listed above. Layer-specific names stay distinct: `business-process`, `application-process`, and `technology-process` are different types (same for function, event, service, collaboration, and interaction).

Unknown element types fail with a `file:line:column` diagnostic (`unknown keyword '…'`). `fixtures/unknown-keyword.plein` is the reject fixture; `src/keywords.test.ts` generates a model with all 58 language-reference types.

`fixtures/valid-catalogue-layers.plein` is a compact golden sample: one element per ArchiMate layer (Strategy, Motivation, Business, Application, Technology, Physical, Implementation and migration). Technology and Physical are sampled separately even though this reference groups them in one section. That per-layer sample is the documented choice; the generated 58-keyword catalogue is not duplicated as a `.plein` fixture.

**Intentional extras** (parser accepts; not listed as language-reference types):

* ArchiMate composite elements `grouping` and `location`.
* Short aliases `process`, `function`, `event`, `service`, `role`, and `collaboration` resolve to the Business-layer concrete types (`business-process`, and so on).
* Nested `value-stream-stage` / `valueStreamStage` inside a `value-stream` body (see Strategy). It is an authoring keyword, not a catalogue element.
* CamelCase spellings of the canonical types (`businessActor`, `workPackage`, and so on).

## Relationships

Relationships are directional: the source is on the left and the target on the right. The ArchiMate relationship type follows the colon.

```plein
shipper -> booking: serving
booking -> order: access
```

Write relationships as `id -> id: type`. Do not use infix verbs (`serves`, `aggregates`) between identifiers.

* **Wrong** (old infix style): `ProductManagement serves SoftwareAndProductServiceLine`
* **Right:** `productManagement -> softwareAndProductServiceLine: serving`

Plein supports these eleven relationship types:

| Type | Meaning |
| --- | --- |
| `composition` | the source is made of the target |
| `aggregation` | the source groups the target |
| `assignment` | an active structure performs or is responsible for the target |
| `realization` | the source realizes the target |
| `serving` | the source provides functionality to the target |
| `access` | the source accesses the target |
| `influence` | the source influences the target |
| `triggering` | the source starts or causes the target |
| `flow` | the source transfers something to the target |
| `specialization` | the source is a specialization of the target |
| `association` | a generic association between the source and target |

## Views and membership

A view gives a model a named, reviewable slice. Use `include` to add identifiers (or supported patterns) and `exclude` to remove them from the rendered view. Exclusion wins when an item matches both clauses. A view with no explicit membership may use the tool's default viewpoint, but explicit membership is more portable.

Mac samples use `viewpoint <uniqueId> "Label" { ... }`. The token immediately after `viewpoint` is the **unique view name**; the quoted string is a human label. Reusing the same id (for example two `viewpoint strategy "…"` blocks) fails with `duplicate view name 'strategy'`. `view <name> { ... }` (no quoted label) remains valid — see [`fixtures/valid-basic.plein`](../fixtures/valid-basic.plein). Prefer `viewpoint` for Mac / LLM output, matching [`fixtures/valid-views.plein`](../fixtures/valid-views.plein) and [`fixtures/samples/value-stream-demo.plein`](../fixtures/samples/value-stream-demo.plein).

```plein
views {
  viewpoint applicationStructure "Application Structure" {
    include applicationComponent applicationInterface dataObject
    include tms customsGateway
    exclude "* -> legacyBatch"
    autoLayout lr
  }
  viewpoint applicationCooperation "Application Cooperation" {
    include tms bookingApi
    autoLayout lr
  }
}
```

* **Wrong:** two blocks both `viewpoint strategy "…"`
* **Right:** unique ids such as `viewpoint applicationStructure "…"` and `viewpoint applicationCooperation "…"`

Views may include relationships when the implementation supports a relationship selector; otherwise relationships between included elements are rendered automatically. Keep view names stable because they are useful review and documentation anchors.

Direction is optional. The Mac viewer defaults to **ELK Layered** (not organic) and honours `autoLayout` direction with one of:

| Token | Meaning |
| --- | --- |
| `tb` | top → bottom (default; also bare `autoLayout`) |
| `bt` | bottom → top |
| `lr` | left → right |
| `rl` | right → left |

Existing shorthand still works: `left-right` / `horizontal` → `lr`; `top-bottom` / `vertical` → `tb`; `bottom-top` → `bt`; `right-left` → `rl`. Unknown tokens are a parse error.

### Edge routing (`orthogonal` / `polyline`)

For `layered` and `layers`, node placement stays **ELK Layered**. `organic` and `grid` place nodes with their own algorithms (below); the routing token still draws the connectors. Edge routing is a separate token on the same `autoLayout` clause, in any order with the mode, direction, and (for grid) order. Omitting it keeps the viewer default: **orthogonal** right-angle connectors (`elk.edgeRouting: ORTHOGONAL` on layered/layers; a right-angle polyline on organic and grid). That is the current default, so existing views do not grow diagonal segments.

| Token | Meaning |
| --- | --- |
| `orthogonal` | Right-angle connectors (default). Aliases: `ortho`, `right-angle`. |
| `polyline` | ELK polyline connectors. Segments may be diagonal. Alias: `poly-line`. |

```plein
viewpoint applicationCooperation "Application Cooperation" {
  include tms bookingApi customsGateway
  autoLayout lr orthogonal
}

viewpoint applicationProcess "Application Process" {
  include tms bookingApi
  autoLayout tb polyline
}
```

`autoLayout layers lr orthogonal` keeps ArchiMate aspect bands, stacks them left→right, and draws right-angle connectors. `autoLayout polyline` is top→bottom polyline routing with plain edge ranks. At most one routing token; a second is a parse error.

Orthogonal routing removes diagonal crossings on typical cooperation and process graphs: each connector is a horizontal and vertical polyline. Polyline routing is the explicit alternative when a straight (possibly diagonal) segment is preferred. Cross-band arrows in `autoLayout layers` follow the same choice.

The Mac diagram chrome can override **Mode**, **Direction**, and **Routing** (File / Orthogonal / Polyline) for local preview. Those overrides are not written back; the `.plein` clause is the source of truth for pull requests. Direction (`tb|bt|lr|rl`) and layer-band mode are unchanged by the routing token. Nested aggregation/composition stays a compound graph (children inside the parent), not a flattened rank.

### Layer bands (`autoLayout layers`)

Plain `autoLayout tb|bt|lr|rl` is ELK Layered ranked by edges. `autoLayout layers` still uses that engine, but **once per ArchiMate aspect band**: root elements are ranked into bands, each band is laid out with ELK Layered, then the bands are stacked. Empty bands are omitted. Cross-band serving/realization arrows are routed after the stack, so they cannot pull a technology node into the business band.

```plein
viewpoint bookingContext "Booking context" {
  include shipper booking rates cloud
  autoLayout layers
}
```

`autoLayout layers lr` (or `autoLayout lr layers`) keeps the same bands and stacks them left→right. Bare `autoLayout layers` is top→bottom with orthogonal connectors. A routing token does not change the bands: `autoLayout layers lr polyline` still stacks left→right and only switches the edge router.

| Band (in order) | Aspects present in the view |
| --- | --- |
| Motivation / Strategy | stakeholder, goal, capability, value-stream, … |
| Business | business-actor, business-service, business-object, … |
| Application | application-component, application-service, data-object, … |
| Technology / Physical | node, artifact, facility, … |
| Implementation | work-package, deliverable, plateau, … |

Typical multi-layer views therefore show **Business → Application → Technology** as successive bands (top→bottom for `tb`, left→right for `lr`) even when serving/realization arrows point the other way, and even when the `.plein` declares technology before business.

Nested containers are assigned **one** band as a whole: children stay inside the parent instead of jumping to their own aspect row. A composite `grouping` / `location` inherits the dominant descendant band (ties keep the earlier ArchiMate aspect) so a grouping of application components sits in Application. See [`fixtures/valid-layer-bands.plein`](../fixtures/valid-layer-bands.plein).

Within a band, disconnected nodes keep a deterministic kind-then-declaration order (all `business-actor` boxes before `business-process`, and so on) so catalogues stay stable.

The Mac chrome **Mode** control (File / Layered / Layers / Organic / Grid) previews a mode without rewriting the file. `layered` is the explicit name for today’s edge-ranked ELK layout and remains the default when the clause has no mode token. `autoLayout layers` does not replace that mode, and neither does `organic` or `grid`.

### When to use each layout mode

| Mode | How to select | Use it when |
| --- | --- | --- |
| `layered` (default) | Omit the mode, or `autoLayout layered` | Relationships are the story: processes, cooperation, sequences. ELK Layered ranks boxes by edges. Leave this as the file default unless a view needs one of the modes below. |
| `layers` | `autoLayout layers` | A multi-aspect ArchiMate view should read Motivation/Strategy → Business → Application → Technology/Physical → Implementation even when arrows point the other way. |
| `organic` | `autoLayout organic` | A landscape or inventory where clusters matter more than ranks. Seeded force-directed layout: the same file always produces the same coordinates, so the diagram is safe to review in git. |
| `grid` | `autoLayout grid` | A catalogue where relationships are secondary. Boxes pack by element kind, then by name. `autoLayout grid name` packs by name instead. Disconnected leftovers are packed into the grid rather than dropped. |

The Mac **Mode** control can preview any of these. The override is not written back; the `.plein` clause is the source of truth for pull requests. See [`fixtures/valid-organic-grid.plein`](../fixtures/valid-organic-grid.plein).

### Organic (`autoLayout organic`)

Organic runs **ELK Force** (Fruchterman–Reingold) with a fixed seed (`elk.randomSeed` `1`). Seed `0` is unseeded inside elkjs, so the stable seed is `1` — the same value layered already sets. Reordering element declarations does not move boxes: the simulation walks node ids in sorted order. Two checkouts of the same file therefore share one layout.

Use it for landscape and inventory diagrams with many relationship types and no single reading direction. Do not use it when edge ranks or ArchiMate aspect bands are the point; those stay `layered` and `layers`.

Disconnected components are simulated on their own and then packed, so an isolated box does not fly away from the cluster. Direction (`tb|bt|lr|rl`) does not re-rank organic nodes. It is still recorded on the view, and orthogonal routing uses it as the bend axis. `autoLayout organic lr polyline` keeps the force placement and draws straight (possibly diagonal) connectors. `nesting nested` still draws children inside the parent; each container is force-laid-out on its own, then placed in the parent simulation.

### Grid (`autoLayout grid`)

Grid ignores edges when it places boxes. That is the point of a catalogue: relationships stay visible, but they do not decide the reading order.

| Order token | Packing |
| --- | --- |
| `kind` (default) | One strip per element keyword, keywords in alphabetical order. Inside a strip, boxes are ordered by name, then by id. |
| `name` | One name-sorted sequence (label, then id), wrapped into a roughly square grid. |

```plein
viewpoint catalogue "Catalogue" {
  include shipper carrier book rates
  autoLayout grid
}

viewpoint catalogueByName "Catalogue by name" {
  include shipper carrier book rates
  autoLayout grid name
}
```

`autoLayout grid lr` turns kind strips into columns (left → right). `bt` / `rl` reverse that primary axis. `kind` may be written explicitly (`autoLayout grid kind`). A `kind` or `name` token on any mode other than `grid` is a parse error.

**Disconnected leftovers.** A root that has no relationship to the rest of the view (and no related descendant) is still packed. Linked boxes form the catalogue; leftovers are packed the same way in a following block (below for `tb`, above for `bt`, to the right for `lr`, to the left for `rl`) instead of being dropped or left at the origin. A view with no relationships is entirely leftovers, so the whole diagram is one catalogue. Nested children stay inside the parent and are packed there by the same order.

### Nesting (aggregation / composition)

By default, aggregation and composition are laid out **side-by-side** in the same layered graph as every other relationship. Existing models that omit a `nesting` clause keep that behaviour, so current samples do not change shape.

To draw children **inside** the parent container (view-only; geometry is not drag-editable), set the view directive:

```plein
view quote-to-cash {
  include quoteToCash, quote, book, collect
  autoLayout lr
  nesting nested
}
```

`nesting beside` is equivalent to omitting the clause. Aliases: `inside` → nested; `side-by-side` / `sideBySide` → beside. Bare `nesting` means nested.

This is the **file default**. The `.plein` directive is the source of truth for pull requests. The Mac app may override Nested vs Beside for local preview only; that override is not written back to the file (Flow Team Chat, 11 Sep 2026).

Nested mode applies to `composition` / `composedOf` and `aggregation` / `aggregates` when both ends are in the view. Other relationships (including `flow` / `triggering` between nested children) still draw as edges. Containment stands in for the nested composition/aggregation line.

The Arran smoke sample [`fixtures/samples/value-stream-demo.plein`](../fixtures/samples/value-stream-demo.plein) opts in with `nesting nested`: Quote, Book, and Collect sit inside Quote to cash and flow/trigger each other there. [`fixtures/valid-value-stream-stages.plein`](../fixtures/valid-value-stream-stages.plein) omits the clause and stays side-by-side.

## Short example: NordFreight

```plein
plein {
  model {
    business-actor "Shipper" as shipper
    business-service "Booking service" as booking
    business-object "Freight order" as order
    application-component "Rate engine" as rates
    application-service "Tracking service" as tracking
    node "NordFreight cloud" as cloud
    artifact "Order API" as order-api

    shipper -> booking: serving
    booking -> order: access
    booking -> rates: serving
    rates -> order: realization
    tracking -> order: access
    cloud -> tracking: composition
    order-api -> tracking: serving
  }

  views {
    view nordfreight-context {
      title "NordFreight booking context"
      include shipper, booking, order, rates, tracking, cloud, order-api
      exclude rates
    }
  }

  styles {
    element business-actor { background "#E8F1FF" }
    element application-service { background "#EAF7EA" }
  }
}
```

The example intentionally excludes `rates` from the context view while retaining it in the model. `model` is the source of truth; a view is presentation, not a second model.

File-level `styles { }` blocks are accepted and ignored. The Mac renderer colours boxes by ArchiMate layer and draws a type glyph from a built-in map — see [ArchiMate type colours and icons](archimate-style.md). That map is not overridden by `styles` and is not an Open Exchange or full Archi skin.

## Mac-app authoring (wrong vs right)

Humans and LLMs often generate `.plein` that the Mac app cannot parse. These rules match `plein check` and the golden fixtures [`fixtures/samples/value-stream-demo.plein`](../fixtures/samples/value-stream-demo.plein) and [`fixtures/valid-views.plein`](../fixtures/valid-views.plein).

### Header is only `plein {`

Never `plein "Name" … {`. Put titles on elements and views.

* **Wrong:** `plein "My Model" "A description" {` or `plein MyModel {`
* **Right:** `plein {`

### Labeled elements use `keyword "Label" as id`

Missing `as id` fails.

```plein
capability "Product Management" as productManagement
value-stream "Data & AI Service Line" as dataAndAIServiceLine
stakeholder "Gemba Advantage" as gembaAdvantage
```

* **Wrong:** `stakeholder "Gemba Advantage"`
* **Right:** `stakeholder "Gemba Advantage" as gembaAdvantage`
* Keywords are kebab-case: `value-stream`, `application-component`, `business-actor` — not camelCase `valueStream` / `applicationComponent`.
* Identifiers after `as` are unique within the model; use them in relationships and `include` lists. Prefer short camelCase or kebab-case ids (`productManagement`, `quoteToCash`).

### Relationships are `id -> id: serving`

Not infix `serves`.

```plein
productManagement -> softwareAndProductServiceLine: serving
dataAndAICapabilities -> dataFoundationsGovernance: aggregation
gembaAdvantage -> dataAndAIServiceLine: association
```

Eleven types: `composition`, `aggregation`, `assignment`, `realization`, `serving`, `access`, `influence`, `triggering`, `flow`, `specialization`, `association`.

* **Wrong:** `ProductManagement serves SoftwareAndProductServiceLine`
* **Right:** `productManagement -> softwareAndProductServiceLine: serving`

### Viewpoint id after `viewpoint` is unique

Never two `viewpoint strategy "…"` blocks. The token after `viewpoint` is the unique view name; the quoted string is a display label. For multi-view jump (S4), ship **≥2** uniquely named viewpoints in one file.

```plein
views {
  viewpoint dataAndAI "Data & AI Service Line" {
    title "Data & AI Service Line — value stream and capabilities"
    include dataAndAIServiceLine, dataFoundationsGovernance, dataEngineeringPlatforms
    autoLayout tb
    nesting nested
  }

  viewpoint softwareAndProduct "Software & Product Service Line" {
    title "Software & Product Service Line — value stream and capabilities"
    include softwareAndProductServiceLine, productManagement, productDesign, productEngineering
    autoLayout tb
    nesting nested
  }
}
```

* **Wrong:** two blocks both `viewpoint strategy "…"`
* **Right:** `viewpoint dataAndAI "…"` and `viewpoint softwareAndProduct "…"`

`viewpoint strategy "Quote to cash"` in [`fixtures/samples/value-stream-demo.plein`](../fixtures/samples/value-stream-demo.plein) is valid because that file has **one** view named `strategy`. A second `viewpoint strategy` in the same file is the failure.

### Minimal LLM copy-paste example (two views)

```plein
plein {
  model {
    value-stream "Software & Product Service Line" as softwareAndProductServiceLine
    capability "Product Management" as productManagement
    capability "Product Design" as productDesign
    capability "Product Engineering" as productEngineering
    grouping "Software & Product Capabilities" as softwareAndProductCapabilities

    softwareAndProductCapabilities -> productManagement: aggregation
    softwareAndProductCapabilities -> productDesign: aggregation
    softwareAndProductCapabilities -> productEngineering: aggregation

    productManagement -> softwareAndProductServiceLine: serving
    productDesign -> softwareAndProductServiceLine: serving
    productEngineering -> softwareAndProductServiceLine: serving
  }

  views {
    viewpoint softwareAndProduct "Software & Product Service Line" {
      include softwareAndProductServiceLine, productManagement, productDesign, productEngineering, softwareAndProductCapabilities
      autoLayout tb
      nesting nested
    }

    viewpoint productOnly "Product capabilities" {
      include productManagement, productDesign, productEngineering
      autoLayout lr
    }
  }
}
```

That sample follows the same patterns as the golden fixtures: `plein {`, kebab-case keywords, `keyword "Label" as id`, `id -> id: type`, and two uniquely named `viewpoint` blocks (`softwareAndProduct`, `productOnly`) like [`fixtures/valid-views.plein`](../fixtures/valid-views.plein) (`applicationStructure`, `applicationCooperation`). `nesting nested` matches [`fixtures/samples/value-stream-demo.plein`](../fixtures/samples/value-stream-demo.plein).

### Checklist before handing a `.plein` to a human

1. Starts with `plein {` (nothing between `plein` and `{`).
2. Every labeled element uses `keyword "Label" as id`.
3. Keywords kebab-case; relationships `id -> id: type`.
4. Every `viewpoint` id unique; ≥2 if the story needs S4 smoke.
5. Prefer matching patterns in [`fixtures/samples/value-stream-demo.plein`](../fixtures/samples/value-stream-demo.plein) and [`fixtures/valid-views.plein`](../fixtures/valid-views.plein).

## Validation notes

A validator should check, at minimum:

1. The document parses and has no duplicate identifiers.
2. Every relationship endpoint and every `include`/`exclude` reference resolves.
3. Each relationship uses one of the eleven supported types and has exactly one source and target.
4. Element keywords are valid ArchiMate 4 concepts, labeled elements use `keyword "Label" as id`, and IDs follow the identifier rules.
5. Each view has a unique name (the identifier after `view` or `viewpoint`); conflicting membership is resolved with `exclude` precedence.
6. `value-stream-stage` appears only inside a `value-stream` body; unknown step keywords and nested stage bodies are line diagnostics. Stage-to-stage links inside that body are `flowsTo` or `triggers` (or their language-reference aliases).
7. Warnings are emitted for unreachable elements, self-links, unused styles, and view selectors that match nothing; warnings need not make a model invalid.

Validation should be deterministic and should not mutate the source. Run `plein check` on the file before merging; checked-in golden and expected-fail models live under `fixtures/` — see [repo layout](repo-layout.md). `plein check` is the same check CI runs (`npm run check:fixtures` in `.github/workflows/check-fixtures.yml`): golden fixtures must exit 0; expected-fail fixtures must exit non-zero. Keep examples small so a pull request can review the markup as architecture.
