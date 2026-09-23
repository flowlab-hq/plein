# Open Exchange import (S5a)

`plein import` reads an [ArchiMate Model Exchange File Format](https://www.opengroup.org/xsd/archimate/) 3.1 document and writes `.plein`. The namespace is `http://www.opengroup.org/xsd/archimate/3.0/` — the 3.1 schema Archi and other tools still emit. Types map onto the [Plein ArchiMate 4 catalogue](plein-dsl-archimate-4.md).

**Export back to Open Exchange, and any round-trip, is S5b.** This command does not write XML.

## Command

From a Homebrew install or a source checkout (`npx plein`), on macOS or Linux. The supported Mac target is Apple Silicon; the CLI is Node 18+ and does not need the Mac app.

```bash
plein import fixtures/open-exchange/booking.xml -o booking.plein
plein check booking.plein
```

Open `booking.plein` in the Mac app the same way as any other model.

- Without `-o`, the `.plein` source is written to stdout. Gap notes go to stderr so a pipe stays valid markup.
- `-o path.plein` writes that file. A directory (or a path ending in `/`) writes `<xml-stem>.plein` inside it.
- The summary lists element, relationship, and view counts, plus what was skipped.

```bash
plein import fixtures/open-exchange/booking.xml > booking.plein
```

## Supported subset

### Document

- Root element `model`. Elements may use the 3.1 namespace as the default, a prefix (`archimate:model`), or no namespace at all.
- `xsi:type` is a QName. The local name is the ArchiMate type (`BusinessActor` or `archimate:BusinessActor`).
- The model `name` (English `xml:lang` when present, otherwise the first name) and `identifier` are recorded in a leading comment.
- Model `documentation` is kept as `// documentation:` comments.

ArchiMate 2 (`http://www.opengroup.org/xsd/archimate`, or a `/archimate/2` namespace) is rejected.

### Elements

`xsi:type` is the PascalCase form of the Plein canonical keyword:

| Open Exchange | `.plein` keyword |
| --- | --- |
| `BusinessActor` | `business-actor` |
| `ApplicationComponent` | `application-component` |
| `ValueStream` | `value-stream` |
| `SystemSoftware` | `system-software` |
| `DataObject` | `data-object` |
| `WorkPackage` | `work-package` |
| `Grouping` | `grouping` |
| `Location` | `location` |

The same rule covers every language-reference keyword, plus the composite extras `grouping` and `location`. `openExchangeElementTypes()` is that list. A unit test imports every type; the checked-in fixture is a representative slice, not a second copy of the 58-keyword catalogue (same choice as [`fixtures/valid-catalogue-layers.plein`](../fixtures/valid-catalogue-layers.plein)).

Identifiers are kept when they are already safe `.plein` ids (`id-shipper`). Otherwise they are rewritten and the original is a comment:

```plein
business-actor "Shipper" as xe-node
// open-exchange identifier: node
```

Ids that collide with an element keyword or a view clause (`node`, `include`, `value-stream-stage`, …) get an `xe-` prefix so an `include` list still refers to one element.

Labels use the English name when any `xml:lang` starts with `en`; otherwise the first name. Other languages become `// name (nl): …` comments. A `"` inside a label becomes `'` because `.plein` strings have no escape syntax.

### Relationships

All eleven Plein relationship types. Direction is unchanged: Open Exchange `source` is the left-hand id.

| `xsi:type` | `.plein` |
| --- | --- |
| `Composition` | `composition` |
| `Aggregation` | `aggregation` |
| `Assignment` | `assignment` |
| `Realization` | `realization` |
| `Serving` | `serving` |
| `Access` | `access` |
| `Influence` | `influence` |
| `Triggering` | `triggering` |
| `Flow` | `flow` |
| `Specialization` | `specialization` |
| `Association` | `association` |

`accessType` and the influence `modifier` are comments (`// accessType: Write`, `// modifier: -`), not typed fields. A relationship `name` or `documentation` is also a comment. Relationship identifiers are not kept — `.plein` relationships have no ids.

A relationship with a missing endpoint, an unknown type, or the same id on both ends fails the import.

### Views

Diagrams become viewpoints:

- `views/diagrams/view` with `xsi:type="Diagram"`. If there is no `diagrams` wrapper, direct `views/view` children are used instead.
- The view `identifier` is the viewpoint name. `<name>` is the title (`viewpoint id-booking-context "Booking context"`).
- `elementRef` on `node` elements, including nodes nested inside other element nodes, becomes the `include` list (first occurrence, document order). Relationships between included elements are drawn by the existing view rules; connections are not copied as a second relationship list.
- An element node inside another element node sets `nesting nested`, so composition and aggregation draw inside the parent. A visual `Container` around element nodes does not.
- The `viewpoint` attribute, or `viewpointRef` resolved through `views/viewpoints/viewpoint`, becomes `// ArchiMate viewpoint: …`.

When the file has no diagram at all, import writes one viewpoint named `imported` that includes every element, so the Mac app has a canvas.

### Comments are breadcrumbs, not a round-trip format

Import keeps some dropped fields as `//` comments so a reviewer can see them:

- `documentation`
- property values (`// property Owner: NordFreight`), using the `propertyDefinitions` name when the file has one
- names in languages that were not chosen for the label
- `accessType` and influence `modifier`
- the ArchiMate viewpoint name
- an identifier that had to be rewritten

S5b should treat the Open Exchange file as the source for those fields. Do not parse these comments as a schema.

## Fixture

[`fixtures/open-exchange/booking.xml`](../fixtures/open-exchange/booking.xml) is the representative model (NordFreight booking: strategy through implementation, all eleven relationship types, two diagrams). The pinned result is [`fixtures/open-exchange/booking.plein`](../fixtures/open-exchange/booking.plein).

```bash
plein import fixtures/open-exchange/booking.xml -o booking.plein
diff -u fixtures/open-exchange/booking.plein booking.plein
plein check fixtures/open-exchange/booking.plein
```

`npm test` asserts that diff. `npm run check:fixtures` asserts the `.plein` still passes `plein check`.

The XML includes, on purpose, things the subset drops: an `AndJunction` and the relationships that touch it, a diagram label, a visual container, coordinates, fill colours, a bendpoint, and an organization folder. It also includes a property, documentation, a Dutch name beside the English label, `accessType="Write"`, an influence `modifier`, and one element node nested inside another.

## Known gaps

### S5b — do not implement here

- Export `.plein` to Open Exchange XML.
- Round-trip. Import then export is not a goal of S5a, and the comment breadcrumbs above are not an exchange format.

### Dropped on import

- Diagram geometry (`x`, `y`, `w`, `h`), z-order, bendpoints, and connection routing. Layout stays ELK in Plein.
- Styles (fill, line, font, opacity). The Mac renderer keeps the [built-in layer colours and icons](archimate-style.md).
- Organization / folder trees (Archi `item` folders and the exchange `organizations` tree).
- Property definitions as real `.plein` properties. Values are comments only. The language reference's attribute syntax is not used, because the parser does not accept it yet.
- Documentation as a first-class field. Comments only.
- The ArchiMate viewpoint kind, other than the comment above.
- `Junction`, `AndJunction`, and `OrJunction`, plus any relationship that references one. The import summary counts them.
- Diagram-only labels, notes, and visual containers.
- `accessType` and influence `modifier` as typed data.
- Relationship identifiers.
- Profiles, specializations, and stereotypes. The base `xsi:type` is imported when it is a catalogue type. A custom type is an error, not a skip.
- Metadata and Dublin Core.
- Languages other than the chosen label (English if present, otherwise the first name).
- Value-stream stage nesting. A `ValueStream` stays a single element. Composition to another concept stays a top-level `composition`. Import does not invent a `value-stream-stage` body. Nested diagram nodes only set `nesting nested`.
- Non-diagram views, such as `xsi:type="Sketch"`. They are skipped.
- Any `xsi:type` outside the catalogue. The import fails with `file:line:column` rather than omitting the element.

### Other

- The Mac app has no Import menu. Run the CLI, then open the `.plein` file.
- `DOCTYPE` is rejected so the reader does not resolve external entities.
- A `"` in a name is stored as `'`.

## Errors

Unknown types, missing endpoints, self-relationships, a non-`model` root, an unsupported namespace, and malformed XML fail the import. The message is `file:line:column: …` on stderr and the exit code is non-zero, the same class as `plein check`. Junctions are skipped instead of failed, and the summary says so.
