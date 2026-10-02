# Plein DSL language reference (ArchiMate 4)

Plein is a small, human-editable language for describing ArchiMate 4 models and lightweight views. **Plein** is pronounced “pleen”. Files use the `.plein` extension and are intended to be readable in a pull request as well as by tooling.

This reference describes the current document shape and vocabulary. It is aligned with the [ArchiMate 4 specification](https://www.opengroup.org/archimate-forum/archimate-overview) and borrows the useful text-first, view-oriented approach of [Structurizr DSL](https://docs.structurizr.com/dsl).

Concrete syntax for a parser: [Grammar](grammar.md) ([`plein.ebnf`](plein.ebnf)). Concept-by-concept correspondence: [Plein constructs and ArchiMate 4](archimate-mapping.md). Allowed relationship pairs stay in the [relationship matrix](relationship-matrix.md).

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

Unknown element types fail with a `file:line:column` diagnostic (`unknown keyword '…' (undeclared specialization)`). `fixtures/unknown-keyword.plein` is the reject fixture for a name that is not in the catalogue; `fixtures/unknown-specialization.plein` is the same failure for a custom concept that was never declared. `src/keywords.test.ts` generates a model with all 58 language-reference types. A name that is not in the catalogue is accepted only after a [concept specialization](#concept-specializations) declaration, including one declared as a [profile hook](#profile-and-organization-extension-hooks).

`fixtures/valid-catalogue-layers.plein` is a compact golden sample: one element per ArchiMate layer (Strategy, Motivation, Business, Application, Technology, Physical, Implementation and migration). Technology and Physical are sampled separately even though this reference groups them in one section. That per-layer sample is the documented choice; the generated 58-keyword catalogue is not duplicated as a `.plein` fixture.

**Intentional extras** (parser accepts; not listed as language-reference types):

* ArchiMate composite elements `grouping` and `location`.
* Short aliases `process`, `function`, `event`, `service`, `role`, and `collaboration` resolve to the Business-layer concrete types (`business-process`, and so on).
* Nested `value-stream-stage` / `valueStreamStage` inside a `value-stream` body (see Strategy). It is an authoring keyword, not a catalogue element.
* CamelCase spellings of the canonical types (`businessActor`, `workPackage`, and so on).

## Concept specializations

### Story note

Paste onto the C1a Notion page:

Architects declare a concept specialization inside `model`, then use that name as an element keyword. `plein check` accepts the name only when it was declared earlier in the file. An undeclared name fails with `unknown keyword '…' (undeclared specialization)`.

```plein
specialization customer specializes business-actor
customer "Acme Freight" as acme
```

`customer` specializes the catalogue concept `business-actor`. The element keeps that catalogue type (layer colour, icon, and Open Exchange `xsi:type`). The instance relationship `id -> id: specialization` is unchanged. Chains are allowed (`premium-customer specializes customer`) and resolve to the same catalogue type. Grouping those specializations into an organization pack is a [profile](#profile-and-organization-extension-hooks). Export writes the catalogue type and does not emit a profile.

Declare + use: `fixtures/valid-specialization.plein`. Reject: `fixtures/unknown-specialization.plein`.

### Declaration

A specialization names a more specific concept derived from a catalogue element keyword (or from a specialization already declared in the same model). It is a type declaration, not the specialization relationship between two elements.

```plein
model {
  specialization customer specializes business-actor
  specialization express-order specializes business-object

  customer "Acme Freight" as acme
  business-actor "Carrier" as carrier
  express-order "Rush booking" as rush

  acme -> rush: access
  acme -> carrier: specialization
}
```

* Write `specialization <name> specializes <parent>` in `model`, before any element that uses `<name>`.
* `<name>` is an identifier. Prefer kebab-case (`express-order`), the same convention as catalogue keywords. The declared spelling is the only spelling; there is no automatic camelCase alias.
* `<parent>` is a catalogue keyword (kebab-case or the camelCase spelling the parser already accepts) or the name of an earlier specialization. The catalogue concept at the end of the chain is the element's type.
* The verb `specialization` is an alias of `specializes`, matching the relationship alias. Any other verb fails (`expected 'specializes' after specialization name`).
* A declared name is used like a keyword: `customer "Acme Freight" as acme`. The parsed element keeps `keyword` as the catalogue type and records `specialization` as the declared name.
* `include <name>` selects elements declared with that specialization. `include <catalogue-keyword>` still selects every element of that catalogue type, including specialized ones.
* A specialization of `value-stream` may nest `value-stream-stage` steps. The stages stay value streams. Do not declare a specialization inside a value-stream body.

These are rejected with `file:line:column`:

| Situation | Diagnostic |
| --- | --- |
| Element keyword was never declared and is not in the catalogue | `unknown keyword '<name>' (undeclared specialization)` |
| Parent is not a catalogue keyword or an earlier specialization | `specialization '<name>' specializes unknown keyword '<parent>'` |
| Name is already a catalogue keyword or a short alias (`process`, `business-actor`, …) | `specialization '<name>' collides with catalogue keyword '<name>'` |
| Name is a structural word (`include`, `as`, `model`, …) | `specialization name '<name>' is reserved` |
| Name is a relationship verb (`serves`, `specializes`, …) | Not a type declaration. The verb is parsed as a relationship whose source identifier is `specialization` |
| The same name is declared twice | `duplicate specialization '<name>'` |
| Declaration sits inside a `value-stream` body | `specialization declarations belong in the model, not inside a valueStream` |

`fixtures/valid-specialization.plein` declares `customer`, `express-order`, and `premium-customer` and uses them. `fixtures/unknown-specialization.plein` uses `customer` with no declaration and must fail `plein check`.

A specialization declared directly in `model` is not a profile hook. `hook <name>` accepts only a specialization declared inside a [profile](#profile-and-organization-extension-hooks). `plein export-open-exchange` writes the catalogue `xsi:type` (for example `BusinessActor`) and does not emit a profile.

An identifier may still be named `specialization`. Write the relationship with `->` (or the existing infix verb). That is a relationship source, not a type declaration:

```plein
business-actor "Specialization" as specialization
business-role "Role" as role
specialization -> role: assignment
```

## Profile and organization extension hooks

### Story note

Paste onto the C1b Notion page:

Architects declare a profile (alias `organization`) inside `model` and put concept specializations in it. Those specializations are the profile's hooks. `plein check` accepts a hook used as an element keyword, or attached with `hook <name>` on a catalogue element of the same type. An undeclared hook fails with `undeclared profile hook '…'`. A specialization declared outside any profile stays a C1a specialization and is not a hook.

```plein
profile nordfreight {
  specialization customer specializes business-actor
}
customer "Acme Freight" as acme
business-actor "Priority desk" as desk hook customer
```

`nordfreight` is an in-file organization pack, not a downloaded profile. `customer` and `desk` keep the catalogue type `business-actor` (layer colour, icon, and Open Exchange `xsi:type`). There is no profile marketplace, and the core metamodel is unchanged. Export still writes the catalogue type and does not emit a profile.

Declare + use: `fixtures/valid-profile.plein`. Reject: `fixtures/unknown-profile-hook.plein`.

### Declaration

A profile names an organization extension pack. The only statements in its body are specialization declarations. Each of those specializations is a hook of that profile. Hook names share the model's specialization namespace: the same name cannot be declared twice, in or out of a profile.

```plein
model {
  profile nordfreight {
    specialization customer specializes business-actor
    specialization express-order specializes business-object
    specialization premium-customer specializes customer
  }

  organization planning {
    specialization planner specializes business-role
  }

  customer "Acme Freight" as acme
  business-actor "Priority desk" as desk hook customer
  business-role "Lane planner" as lane hook planner
}
```

* Write `profile <name> { ... }` in `model`, before any element that uses its hooks. `organization` is an alias of `profile`.
* `<name>` is an identifier. Prefer kebab-case (`nordfreight`). It must not be a catalogue keyword, a relationship verb, a structural word (`include`, `hook`, `profile`, …), or an existing specialization name.
* Inside the braces, write `specialization <hook> specializes <parent>` using the same rules as a [concept specialization](#concept-specializations). A hook may specialize a catalogue keyword or an earlier specialization, including one from a previous profile in the same file.
* Use a hook as an element keyword: `customer "Acme Freight" as acme`. The element keeps the catalogue type and records `specialization` plus `profile`.
* Or keep the catalogue keyword and attach one hook: `business-actor "Priority desk" as desk hook customer`. The hook's catalogue type must be that element's type. `hook` cannot be combined with a specialization keyword.
* `include <hook>` selects elements that use that hook, whether they were declared with the hook keyword or with `hook <name>`. A profile name is not a view selector.
* A hook that specializes `value-stream` may be applied with `hook <name>` on a `value-stream`, which may still nest `value-stream-stage` steps. Do not declare a profile inside a value-stream body.
* A specialization written directly in `model`, outside every profile, is unchanged and is not a profile hook.

These are rejected with `file:line:column`:

| Situation | Diagnostic |
| --- | --- |
| `hook <name>` and `<name>` was never declared | `undeclared profile hook '<name>'` |
| `hook <name>` and `<name>` is a specialization outside every profile | `specialization '<name>' is not a profile hook` |
| Hook specializes a different catalogue type than the element | `profile hook '<name>' specializes '<catalogue-type>', not '<element-type>'` |
| `hook` is written after a specialization keyword | `hook cannot be combined with specialization keyword '<name>'` |
| Profile name is a catalogue keyword | `profile '<name>' collides with catalogue keyword '<name>'` |
| Profile name is reserved (`include`, `hook`, `profile`, …) | `profile name '<name>' is reserved` |
| The same profile name is declared twice | `duplicate profile '<name>'` |
| Profile name matches a specialization, or a hook matches the profile name | `profile '<name>' collides with specialization '<name>'` or `specialization '<name>' collides with profile '<name>'` |
| Profile body contains something other than a specialization | `profile '<name>' may only declare specializations` |
| Declaration sits inside a `value-stream` body | `profile declarations belong in the model, not inside a valueStream` |
| `profile` is not followed by `<name> {` | `expected '{' after profile name` or `expected profile name and '{' after profile` |

`fixtures/valid-profile.plein` declares profiles `nordfreight` and `planning` (the second with the `organization` alias), uses hooks as keywords and with `hook`, and keeps one model-level specialization beside them. `fixtures/unknown-profile-hook.plein` attaches `hook warehouse` with no such declaration and must fail `plein check`.

This is an in-file pack only. It does not load a marketplace of profiles, draw stereotype labels, or round-trip profiles through Open Exchange. `plein export-open-exchange` writes the catalogue `xsi:type` and does not emit a profile.

An identifier may still be named `profile`. Write the relationship with `->` (or the existing infix verb). That is a relationship source, not a pack:

```plein
business-actor "Profile" as profile
business-role "Role" as role
profile -> role: assignment
```

## Relationships

Relationships are directional: the source is on the left and the target on the right. The ArchiMate relationship type follows the colon.

```plein
shipper -> booking: serving
booking -> order: access
```

Write relationships as `id -> id: type`. Do not use infix verbs (`serves`, `aggregates`) between identifiers. The file spelling and the stored keyword for each ArchiMate relationship are in the [mapping](archimate-mapping.md#relationships). The [grammar](grammar.md#relationship) lists both as accepted input.

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

Not every type may connect every pair of elements. `plein check` accepts a relationship only when the source type, the relationship, and the target type are an allowed ArchiMate pair. The table is [the relationship matrix](relationship-matrix.md) (`src/relationship-matrix-data.ts`). A specialization or profile hook is checked as its catalogue type. A `value-stream-stage` is a value stream, so `capability` `serving` a stage, `application-component` `realization` of a `capability`, and `flow` from stage to stage are allowed. An invalid pair fails with a line diagnostic that names the three parts, for example `invalid relationship 'realization' from 'application-component' to 'business-object'`.

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

The Mac chrome previews direction from **Options** (File / TB / BT / LR / RL) without rewriting the file. **Auto layout** and **Mode** stay on the diagram chrome, one click away.

### Turning auto-layout off

Declaring `autoLayout` (bare, or with a direction, a mode such as `layers` / `organic` / `grid`, or a routing token) **keeps automatic placement**. That is the default. To freeze a view so a later reload does not reflow it, set `autoLayout off` (alias `manual`) and give each element a top-left with `position`:

```plein
viewpoint story "Story" {
  include shipper booking order rates
  autoLayout off
  position shipper 40 240
  position booking 280 40
  position order 40 40
  position rates 280 240
}
```

`off` / `manual` must be the only `autoLayout` token. Coordinates are view-space pixels (decimals allowed; a leading minus is allowed). Each id may appear once, and it must exist in the model. Positions are **ignored while auto-layout is on**, so you can leave them in the file and turn `autoLayout lr` back on — the next layout runs ELK Layered again from the model.

An element in the view with no `position` stays out of the way: it is stacked in a column to the right of the placed nodes and does not move the ones that have coordinates. With `nesting nested`, a parent’s top-left stays where `position` put it and the box grows to cover its children.

The Mac diagram chrome **Auto layout** control (File / On / Off) is one click away and previews this without rewriting the file:

| Choice | Effect |
| --- | --- |
| File | Follow the view. `off` or `manual` uses `position` clauses; anything else stays automatic (layered, layers, organic, or grid). |
| Off | Freeze the positions currently on screen (the last automatic layout, or the file positions). **Reload** keeps that freeze. Drag a box to move it while auto-layout is off; nested children move with their parent. |
| On | Drop the freeze and recompute from the model. Saved `position` clauses are not applied. |

Dragging and the Off snapshot last for this open file, including across **Reload**. They are not written back. Put `position` clauses in the `.plein` when the arrangement should travel with the model.

While auto-layout is off, a drag snaps the box’s top-left to the canvas grid. The default cell is 24 view pixels, measured from user-space (0, 0) — the same coordinates as `position`, not the content box. **Grid** on the Mac chrome shows or hides the lines; hiding them does not turn snap off. **Options → Grid size** chooses 8, 16, 24, 32, or 48 for this session. Nested children move with the dragged parent and keep their offset. This overlay is not `autoLayout grid` (catalogue packing). Neighbour-align (centres and edges) is on as well. `alignDraggedBox` runs grid snap first (`gridSnapForDrag` / `snapProposedOrigin`), then may move that point only when a centre or edge is still within the align threshold.

### Edge routing (`orthogonal` / `polyline`)

For `layered` and `layers`, node placement stays **ELK Layered**. `organic` and `grid` place nodes with their own algorithms (below); the routing token still draws the connectors. Edge routing is a separate token on the same `autoLayout` clause, in any order with the mode, direction, and (for grid) order. Omitting it keeps the viewer default: **orthogonal** right-angle connectors (`elk.edgeRouting: ORTHOGONAL` on layered/layers; a right-angle polyline on organic and grid). Organic orthogonal polylines spread parallel channels after the force pack. On `layered` and `layers`, an orthogonal segment that would enter another element box is bent through a gap or around the stack — including a frozen column when auto layout is off. Boxes stay where the layout put them, and a segment that already misses every other box is left as routed. Grid routes are unchanged. That is the current default, so existing views do not grow diagonal segments.

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

The Mac diagram chrome keeps **Auto layout** (File / On / Off), **Mode** (File / Layered / Layers / Organic / Grid), and **Grid** (show or hide the snap grid) one click away. **Options** groups **Direction** (File / TB / BT / LR / RL), **Routing** (File / Orthogonal / Polyline), and **Grid size** for local preview. Those overrides are not written back; the `.plein` clause is the source of truth for pull requests. Direction (`tb|bt|lr|rl`) and layer-band mode are unchanged by the routing token. Nested aggregation/composition stays a compound graph (children inside the parent), not a flattened rank. **On** recomputes node placement for the selected mode (layered, layers, organic, or grid) and ignores `position` clauses. **Off** keeps the frozen top-lefts across Reload.

### Layer bands (`autoLayout layers`)

Plain `autoLayout tb|bt|lr|rl` is ELK Layered ranked by edges. `autoLayout layers` still uses that engine, but **once per ArchiMate aspect band**: root elements are ranked into bands, each band is laid out with ELK Layered, then the bands are stacked. Empty bands are omitted. Cross-band serving/realization arrows are routed after the stack, so they cannot pull a technology node into the business band. An orthogonal segment that would cut through another element box — a cross-band elbow or a long run down a vertical stack — is bent through an open gap or around the stack. The boxes themselves stay where the layout put them. Polyline cross-band arrows stay straight.

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

The Mac chrome **Mode** control (File / Layered / Layers / Organic / Grid) sits on the diagram chrome, one click away, and previews a mode without rewriting the file. `layered` is the explicit name for today’s edge-ranked ELK layout and remains the default when the clause has no mode token. `autoLayout layers` does not replace that mode, and neither does `organic` or `grid`.

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

Disconnected components are simulated on their own and then packed, so an isolated box does not fly away from the cluster. Direction (`tb|bt|lr|rl`) does not re-rank organic nodes. It is still recorded on the view. Orthogonal connectors keep that bend axis when the boxes sit on a diagonal. Boxes that share a row or a column connect on the facing sides. Attachment points are spread along the side, and parallel bend channels are pushed apart when the gutter has room, so a dense service line does not pile associations on one centerline or cut through neighbouring boxes when a clear gutter exists. When that gutter is deep enough, the last segment is long enough for the arrowhead; a tight pack gap keeps the spread instead of stretching the stub through the next box. Node coordinates stay the seeded pack; only those organic orthogonal bends move. `autoLayout organic lr polyline` keeps the force placement and draws straight (possibly diagonal) connectors. `nesting nested` still draws children inside the parent; each container is force-laid-out on its own, then placed in the parent simulation.

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

This is the **file default**. The `.plein` directive is the source of truth for pull requests. The Mac app’s **Options** menu overrides **Nesting** (File default / Nested / Beside) for local preview only; that override is not written back to the file (Flow Team Chat, 11 Sep 2026).

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
    rates -> order: access
    tracking -> order: access
    cloud -> tracking: serving
    order-api -> tracking: realization
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

## Canonical layout (`plein format`)

`plein format` rewrites a checked `.plein` file to one layout so a pull-request diff shows architecture changes instead of whitespace and spelling. Formatting twice produces identical bytes. Indentation is **two spaces** per level. The file uses LF newlines and ends with one newline. `//` comments stay with the statement they precede. A `styles` block is kept and reindented; check and the Mac renderer still ignore it.

Top-level order inside `plein { }` is `model`, then `views`, then `styles`. An empty block is omitted. A file with no `plein` wrapper gains one.

### Model statement order

Inside `model`, statements are grouped:

1. `profile` and model-level `specialization` declarations, in source order. Hooks stay inside their profile. `organization` is written `profile`. A blank line separates a profile from the next declaration.
2. Elements, in source order. A blank line separates this group from declarations when both exist.
3. Relationships, in source order. A blank line separates them from the elements when both exist.

An element is one line, keys in this order:

```plein
<keyword> "<label>" as <id>
<keyword> "<label>" as <id> hook <name>
```

Catalogue keywords are kebab-case (`business-actor`, not `businessActor`). A specialization used as the keyword keeps its declared spelling. `hook <name>` is only the form that attaches a hook to a catalogue keyword. A nested stage stays `value-stream-stage` inside its value stream, and `flow` / `triggering` between those stages stay in that body. The composition implied by nesting is not written out again as a relationship.

Relationships are `id -> id: <type>` with the language-reference spellings (`serving`, `composition`, `flow`, and the rest of the [relationships table](#relationships)). An infix verb (`shipper serves booking`) is rewritten to that arrow form. A specialization parent that is a catalogue keyword is kebab-case.

### View clause order

A view with a title is `viewpoint <name> "<title>"`. A view with no title is `view <name>`. A `title` clause is folded onto that header. When the header and a `title` clause both set a label, the clause is the one `plein check` keeps, and format writes that label on the header.

Clauses inside the view are written in this order:

1. `include` — one line. Selectors stay in source order and are joined with `, `. A catalogue keyword in the list is kebab-case.
2. `exclude` — the same joining rules. A selector that is not one identifier is quoted (`"* -> legacyBatch"`).
3. `autoLayout`
4. `nesting` — only when it is nested. `nesting beside` and its aliases are omitted, because beside is the default.
5. `position <id> <x> <y>` — source order. Whole numbers have no decimal point. Trailing zeros on a fractional coordinate are dropped (`10.50` is `10.5`).

`autoLayout` tokens are written in this order. A token that is the default is omitted:

| Slot | Written when | Canonical token |
| --- | --- | --- |
| mode | not the default `layered` | `layers`, `organic`, or `grid` (`layer` is written `layers`) |
| grid order | mode is `grid` and the order is `name` | `name` (`kind` is omitted) |
| direction | not the default `tb` | `bt`, `lr`, or `rl` (`left-right` and the other shorthands collapse to these) |
| routing | not the default `orthogonal` | `polyline` (`poly-line` is written `polyline`) |

`autoLayout off` is the only token when layout is frozen (`manual` is written `off`). A clause whose every token is the default is bare `autoLayout`. A view that never had an `autoLayout` clause still omits it.

```bash
plein format fixtures/format-messy.plein
plein format --write fixtures/format-messy.plein
plein format --check fixtures/golden-format-messy.plein
```

Without `--write` or `-o`, the canonical source is written to stdout. `--check` exits 0 when the file is already canonical and prints `would reformat <file>` on stderr otherwise. The before/after pair is [`fixtures/format-messy.plein`](../fixtures/format-messy.plein) and [`fixtures/golden-format-messy.plein`](../fixtures/golden-format-messy.plein). `npm test` (`src/format.test.ts`) fails if that golden drifts, or if formatting any valid fixture twice changes a byte.

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

## Open Exchange import and export

`plein import` reads an Open Exchange XML file (ArchiMate Model Exchange File Format 3.1) into this document shape. `plein export-open-exchange` writes that same subset back to XML. The Mac app’s **File → Import Open Exchange XML…** uses that same importer, and **File → Export…** → **Open Exchange** uses that same exporter. The mapping, the representative fixture, and the gaps are [Open Exchange import and export](open-exchange-import.md). HTML/SVG export is a different command (`plein export`).

Supported: every element keyword in this reference (plus `grouping` and `location`), all eleven relationship types, and diagram membership as viewpoints. Documentation, properties, extra languages, `accessType`, and influence modifiers are comments, not first-class syntax. Export does not read those comments.

Not imported, and not written on export: diagram geometry and styles, organization folders, junctions, and `value-stream-stage` reconstruction (a `ValueStream` stays one element; composition stays a relationship). Round-trip of the booking fixture keeps elements, relationships, and views; the known text deltas are in that doc.

## Validation notes

A validator should follow the [grammar](grammar.md) for what parses, then check, at minimum:

1. The document parses and has no duplicate identifiers.
2. Every relationship endpoint and every `include`/`exclude` reference resolves.
3. Each relationship uses one of the eleven supported types and has exactly one source and target.
4. The source type, relationship, and target type are an allowed pair in the [relationship matrix](relationship-matrix.md). Specializations and profile hooks are checked as their catalogue type. `value-stream-stage` is a value stream. An invalid pair fails with `invalid relationship '<relationship>' from '<source-type>' to '<target-type>'` at `file:line:column`.
5. Element keywords are valid ArchiMate 4 concepts, or specializations declared earlier in the model (`specialization <name> specializes <catalogue-type>`, including hooks inside `profile <name> { ... }`). Labeled elements use `keyword "Label" as id`, and IDs follow the identifier rules. An undeclared name is `unknown keyword '…' (undeclared specialization)`. `hook <name>` is accepted only for a specialization declared in a profile; an undeclared hook is `undeclared profile hook '…'`.
6. Each view has a unique name (the identifier after `view` or `viewpoint`); conflicting membership is resolved with `exclude` precedence.
7. `value-stream-stage` appears only inside a `value-stream` body; unknown step keywords and nested stage bodies are line diagnostics. Stage-to-stage links inside that body are `flowsTo` or `triggers` (or their language-reference aliases).
8. Warnings are emitted for unreachable elements, self-links, unused styles, and view selectors that match nothing; warnings need not make a model invalid.

Validation should be deterministic and should not mutate the source. Run `plein check` on the file before merging; checked-in golden and expected-fail models live under `fixtures/` — see [repo layout](repo-layout.md). `plein check` is the same check CI runs (`npm run check:fixtures` in `.github/workflows/check-fixtures.yml`): golden fixtures must exit 0; expected-fail fixtures must exit non-zero. Keep examples small so a pull request can review the markup as architecture.
