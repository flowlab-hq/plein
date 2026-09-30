# Relationship matrix

`plein check` accepts a relationship only when the source element type, the relationship, and the target element type are an allowed ArchiMate pair. The source of truth is [`src/relationship-matrix-data.ts`](../src/relationship-matrix-data.ts). The checker loads that table. It does not special-case pairs.

The table is the Appendix B style matrix for every element keyword in the [language reference](plein-dsl-archimate-4.md), plus `grouping` and `location`. Each cell lists the relationships allowed from that source to that target, including derived relationships. Junctions are not in the table: a `.plein` relationship connects two elements.

## How to read a cell

Keys are canonical camelCase keywords (`applicationComponent`, `valueStream`). Letters:

| Letter | Relationship |
| --- | --- |
| `c` | composition |
| `g` | aggregation |
| `i` | assignment |
| `r` | realization |
| `v` | serving |
| `a` | access |
| `n` | influence |
| `t` | triggering |
| `f` | flow |
| `s` | specialization |
| `o` | association |

`capability` → `valueStream` is `fotv`, so flow, association, triggering, and serving are allowed, and realization is not. Serving is the relationship a capability uses to support a value-stream stage.

## What `plein check` reports

An invalid pair exits non-zero. The diagnostic names the source type, the relationship, and the target type, with the line and column of the relationship:

```text
fixtures/invalid-relationship.plein:6:5: invalid relationship 'realization' from 'application-component' to 'business-object'
```

Types and the relationship use language-reference spellings (`application-component`, `realization`).

A specialization or profile hook is checked as its catalogue type. `customer` that specializes `business-actor` is a business actor for this table. A `value-stream-stage` is a value stream: the stage-to-stage `flow` inside a value-stream body is `value-stream` `flow` `value-stream`.

Pairs the golden fixture [`fixtures/valid-relationship-matrix.plein`](../fixtures/valid-relationship-matrix.plein) keeps:

| Source | Relationship | Target |
| --- | --- | --- |
| `capability` | `serving` | `value-stream` (a stage) |
| `application-component` | `realization` | `capability` |
| `value-stream` | `flow` | `value-stream` (stage to stage) |
| `business-actor` | `assignment` | `business-process` |
| `business-service` | `access` | `business-object` |
| `node` | `serving` | `application-component` |
| `assessment` | `influence` | `goal` |
| `work-package` | `realization` | `capability` |

[`fixtures/invalid-relationship.plein`](../fixtures/invalid-relationship.plein) is the expected-fail pair: an application component does not realize a business object.
