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

### Identifiers and labels

* An identifier starts with a letter or underscore and may contain letters, digits, `_`, and `-`. Identifiers are unique within a model.
* Use `as <identifier>` to give an element a stable reference. Put human-readable text in quotes for its label: `business-actor "Shipper" as shipper`.
* References in relationships and view membership use identifiers, not labels. A quoted label may contain spaces, punctuation, and Unicode.
* Re-declaring an identifier, referring to an unknown identifier, or declaring a relationship to itself is invalid.

## Model elements

Element keywords are kebab-case ArchiMate concepts grouped by domain. Implementations should preserve the ArchiMate meaning of each keyword; a tool may provide a shorter alias, but the canonical spelling is preferred in source.

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

An element has a keyword, a label, and an optional identifier. Properties and documentation can be attached using the implementation's supported attribute syntax; unknown attributes should be reported rather than silently discarded.

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

```plein
views {
  view nordfreight-context {
    title "NordFreight booking context"
    include shipper, booking, order, tracking
    exclude internal-ledger
  }
}
```

Views may include relationships when the implementation supports a relationship selector; otherwise relationships between included elements are rendered automatically. Keep view names stable because they are useful review and documentation anchors.

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

## Validation notes

A validator should check, at minimum:

1. The document parses and has no duplicate identifiers.
2. Every relationship endpoint and every `include`/`exclude` reference resolves.
3. Each relationship uses one of the eleven supported types and has exactly one source and target.
4. Element keywords are valid ArchiMate 4 concepts, labels are present, and IDs follow the identifier rules.
5. Each view has a unique name; conflicting membership is resolved with `exclude` precedence.
6. `value-stream-stage` appears only inside a `value-stream` body; unknown step keywords and nested stage bodies are line diagnostics. Stage-to-stage links inside that body are `flowsTo` or `triggers` (or their language-reference aliases).
7. Warnings are emitted for unreachable elements, self-links, unused styles, and view selectors that match nothing; warnings need not make a model invalid.

Validation should be deterministic and should not mutate the source. Run `plein check` on the file before merging; checked-in golden and expected-fail models live under `fixtures/` — see [repo layout](repo-layout.md). `plein check` is the same check CI runs (`npm run check:fixtures` in `.github/workflows/check-fixtures.yml`): golden fixtures must exit 0; expected-fail fixtures must exit non-zero. Keep examples small so a pull request can review the markup as architecture.
