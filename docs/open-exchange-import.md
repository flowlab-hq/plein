# Open Exchange import and export (S5a / S5b)

`plein import` reads an [ArchiMate Model Exchange File Format](https://www.opengroup.org/xsd/archimate/) 3.1 document and writes `.plein`. `plein export-open-exchange` writes that same subset back to XML. The namespace is `http://www.opengroup.org/xsd/archimate/3.0/` — the 3.1 schema Archi and other tools still emit. Types map onto the [Plein ArchiMate 4 catalogue](plein-dsl-archimate-4.md).

`plein export` is a different command: one named viewpoint as HTML or SVG. Open Exchange export does not use it.

## Import

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

## Export

Same machines as import: Homebrew or `npx plein`, Node 18+. The supported Mac target is Apple Silicon. The Mac app has no Export menu for this format.

```bash
plein export-open-exchange booking.plein -o booking.xml
plein import booking.xml -o booking-again.plein
```

- Without `-o`, the XML is written to stdout. Gap notes go to stderr so a pipe stays well-formed XML.
- `-o path.xml` writes that file. A directory (or a path ending in `/`) writes `<plein-stem>.xml` inside it.
- The model `<name>` is the `.plein` file stem (`booking` for `booking.plein`). `model/@identifier` is `model-` plus that stem (`model-booking`). If an element already uses that id, a numeric suffix is added. A viewpoint name that collides with an element id or the model identifier is suffixed the same way.
- The command has no flags for the model name or identifier. Both come from the path.

The XML is a `model` in the 3.1 namespace, with `xsi:type` in PascalCase, English `<name>` elements, relationships in model order, and `views/diagrams/view` diagrams (`xsi:type="Diagram"`). A viewpoint title becomes the view `<name>`. `include` ids become `element` nodes. `nesting nested` (or `inside`) nests a child element node inside its parent when a `composition` or `aggregation` joins two included elements — composition wins, one parent per child, same rule as the diagram. Relationship and node identifiers are generated (`id-rel-N`, `id-node-N`). There are no coordinates, styles, connections, folders, or junctions.

An empty `include` exports every element. `*`, an element id, and a type keyword expand to element ids; `exclude` removes matches. Relationship selectors are not diagram connections. A view with no elements is omitted.

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

Export does not read these comments. The Open Exchange file is the source for those fields. A `.plein` that was imported and then exported drops them. See [Round-trip deltas](#round-trip-deltas).

## Fixture

[`fixtures/open-exchange/booking.xml`](../fixtures/open-exchange/booking.xml) is the representative model (NordFreight booking: strategy through implementation, all eleven relationship types, two diagrams). The pinned import is [`fixtures/open-exchange/booking.plein`](../fixtures/open-exchange/booking.plein).

[`fixtures/open-exchange/booking.export.xml`](../fixtures/open-exchange/booking.export.xml) is `plein export-open-exchange` of that `.plein`. [`fixtures/open-exchange/booking.roundtrip.plein`](../fixtures/open-exchange/booking.roundtrip.plein) is `plein import` of the export. Elements, relationships, viewpoint names, titles, include lists, and `nesting nested` match `booking.plein`. The comments do not.

```bash
plein import fixtures/open-exchange/booking.xml -o booking.plein
diff -u fixtures/open-exchange/booking.plein booking.plein
plein export-open-exchange fixtures/open-exchange/booking.plein -o booking.export.xml
diff -u fixtures/open-exchange/booking.export.xml booking.export.xml
plein import booking.export.xml -o booking.roundtrip.plein
diff -u fixtures/open-exchange/booking.roundtrip.plein booking.roundtrip.plein
plein check fixtures/open-exchange/booking.plein
plein check fixtures/open-exchange/booking.roundtrip.plein
```

`npm test` asserts those diffs and that the parsed models match. `npm run check:fixtures` asserts both `.plein` files still pass `plein check`.

The XML includes, on purpose, things the subset drops: an `AndJunction` and the relationships that touch it, a diagram label, a visual container, coordinates, fill colours, a bendpoint, and an organization folder. It also includes a property, documentation, a Dutch name beside the English label, `accessType="Write"`, an influence `modifier`, and one element node nested inside another.

## Known gaps

### Round-trip deltas

Import → export → import keeps the parsed model for the booking fixture: element keyword, label, and id; relationship type and endpoints; viewpoint name, title, include list, and `nesting nested`. It does not reproduce `booking.plein` byte for byte, and it does not reproduce `booking.xml`.

Lost because `.plein` never stored them (import dropped them, export cannot put them back):

- Junctions and relationships that reference them.
- Diagram geometry, z-order, bendpoints, and connection routing.
- Styles.
- Organization / folder trees.
- Property definitions and property values (comments only on import).
- Documentation (comments only).
- The ArchiMate viewpoint kind (`Application Cooperation`, `Strategy`).
- Names in languages other than the chosen label.
- `accessType` and influence `modifier`.
- Relationship identifiers, profiles, metadata, and non-diagram views.

Lost because export does not parse `//` comments:

- The import banner's model name and identifier (`NordFreight booking`, `id-nordfreight`). Export writes the file stem and `model-<stem>` instead (`booking`, `model-booking` for the fixture).
- Every other comment listed under [Comments are breadcrumbs](#comments-are-breadcrumbs-not-a-round-trip-format).

Other deltas:

- Generated relationship and diagram-node ids (`id-rel-N`, `id-node-N`). Import drops them again.
- A `"` in a name becomes `'` on import. `.plein` strings have no escape syntax.
- Import collapses whitespace in names.
- A model with no viewpoints exports no diagrams. The next import writes viewpoint `imported` when the file has elements.
- `view name { title "…" }` comes back as `viewpoint name "…"`, so the parser's viewpoint field becomes the view name.
- `nesting nested` with no composition or aggregation between included elements exports flat nodes. The flag does not come back.
- Include order follows the parent, then its nested children. A child listed before its parent moves under the parent.
- `autoLayout` is not in the subset.
- `*`, a type keyword, and `exclude` become an explicit id list. Relationship selectors are not written.
- An element id that is a keyword or a view clause (`node`, `include`, …) is rewritten on import (`xe-node`). Export writes the `.plein` id as-is.
- A `value-stream-stage` is already a `value-stream` element plus `composition` in the parser. Export writes `ValueStream` and `Composition`. It does not invent stage bodies.

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

- The Mac app has no Import menu and no Open Exchange export menu. Run the CLI, then open the `.plein` file.
- `DOCTYPE` is rejected so the reader does not resolve external entities.
- A `"` in a name is stored as `'`.

## Errors

Unknown types, missing endpoints, self-relationships, a non-`model` root, an unsupported namespace, and malformed XML fail the import. The message is `file:line:column: …` on stderr and the exit code is non-zero, the same class as `plein check`. Junctions are skipped instead of failed, and the summary says so.

`plein export-open-exchange` fails the same way as `plein check` when the `.plein` file is missing or invalid. It does not write a partial file.
