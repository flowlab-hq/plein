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

Direction is optional. The Mac viewer lays the view out with **ELK Layered** and honours `autoLayout` with one of:

| Token | Meaning |
| --- | --- |
| `tb` | top → bottom (default; also bare `autoLayout`) |
| `bt` | bottom → top |
| `lr` | left → right |
| `rl` | right → left |

Existing shorthand still works: `left-right` / `horizontal` → `lr`; `top-bottom` / `vertical` → `tb`; `bottom-top` → `bt`; `right-left` → `rl`. Unknown tokens are a parse error.

The Mac diagram chrome (the space left by removing the top view-switcher) can override **Mode** and **Direction** for local preview. Those overrides are not written back; the `.plein` clause is the source of truth for pull requests. Nested aggregation/composition stays a compound graph (children inside the parent), not a flattened rank.

### Layer bands (`autoLayout layers`)

Plain `autoLayout tb|bt|lr|rl` is ELK Layered ranked by edges. `autoLayout layers` still uses that engine, but first partitions **root** elements into ArchiMate aspect bands, then lays out within each band. Empty bands are omitted.

```plein
viewpoint bookingContext "Booking context" {
  include shipper booking rates cloud
  autoLayout layers
}
```

`autoLayout layers lr` (or `autoLayout lr layers`) keeps the same bands and stacks them left→right. Bare `autoLayout layers` is top→bottom.

| Band (in order) | Aspects present in the view |
| --- | --- |
| Motivation / Strategy | stakeholder, goal, capability, value-stream, … |
| Business | business-actor, business-service, business-object, … |
| Application | application-component, application-service, data-object, … |
| Technology / Physical | node, artifact, facility, … |
| Implementation | work-package, deliverable, plateau, … |

Typical multi-layer views therefore show **Business → Application → Technology** as successive bands (top→bottom for `tb`, left→right for `lr`) even when serving/realization arrows point the other way.

Nested containers are assigned **one** band as a whole: children stay inside the parent instead of jumping to their own aspect row. A composite `grouping` / `location` inherits the dominant descendant band (ties keep the earlier ArchiMate aspect) so a grouping of application components sits in Application. See [`fixtures/valid-layer-bands.plein`](../fixtures/valid-layer-bands.plein).

The Mac chrome **Mode** control (File / Layered / Layers) previews this without rewriting the file. `layered` is the explicit name for today’s edge-ranked ELK layout.

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
