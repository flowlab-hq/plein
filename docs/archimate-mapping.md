# Plein constructs and ArchiMate 4

Which `.plein` construct is which ArchiMate 4 concept. Syntax for each construct is the [grammar](grammar.md) ([`plein.ebnf`](plein.ebnf)). Narrative and examples are the [language reference](plein-dsl-archimate-4.md).

Allowed pairs (which source type may use which relationship toward which target type, including derived relationships) are the [relationship matrix](relationship-matrix.md). That table is not copied here.

Open Exchange `xsi:type` values are the ones `plein export-open-exchange` writes and `plein import` reads. The namespace and the gaps are [Open Exchange import and export](open-exchange-import.md).

## How a name is spelled

| Place | Spelling | Example |
| --- | --- | --- |
| `.plein` file, `plein format` | kebab-case | `business-actor`, `serving` |
| Parser, `plein inspect` | camelCase stored keyword | `businessActor`, `serves` |
| Open Exchange `xsi:type` | stored keyword with an initial capital | `BusinessActor`, `Serving` |
| This table, ArchiMate concept | ArchiMate concept name | Business Actor, Serving |

A specialization keeps the catalogue concept in all four places. The declared name is Plein syntax for a specialized concept. It is not an `xsi:type`.

## Elements

Layer is the ArchiMate layer used by [`src/archimate-style.ts`](../src/archimate-style.ts). CamelCase is accepted in a file wherever the kebab-case spelling is; for a keyword with no capital the two spellings are identical.

### Strategy

| ArchiMate concept | File spelling | Stored keyword | Open Exchange `xsi:type` |
| --- | --- | --- | --- |
| Resource | `resource` | `resource` | `Resource` |
| Capability | `capability` | `capability` | `Capability` |
| Value Stream | `value-stream` | `valueStream` | `ValueStream` |
| Course of Action | `course-of-action` | `courseOfAction` | `CourseOfAction` |

### Motivation

| ArchiMate concept | File spelling | Stored keyword | Open Exchange `xsi:type` |
| --- | --- | --- | --- |
| Stakeholder | `stakeholder` | `stakeholder` | `Stakeholder` |
| Driver | `driver` | `driver` | `Driver` |
| Assessment | `assessment` | `assessment` | `Assessment` |
| Goal | `goal` | `goal` | `Goal` |
| Outcome | `outcome` | `outcome` | `Outcome` |
| Principle | `principle` | `principle` | `Principle` |
| Requirement | `requirement` | `requirement` | `Requirement` |
| Constraint | `constraint` | `constraint` | `Constraint` |
| Meaning | `meaning` | `meaning` | `Meaning` |
| Value | `value` | `value` | `Value` |

### Business

| ArchiMate concept | File spelling | Stored keyword | Open Exchange `xsi:type` |
| --- | --- | --- | --- |
| Business Actor | `business-actor` | `businessActor` | `BusinessActor` |
| Business Role | `business-role` | `businessRole` | `BusinessRole` |
| Business Collaboration | `business-collaboration` | `businessCollaboration` | `BusinessCollaboration` |
| Business Interface | `business-interface` | `businessInterface` | `BusinessInterface` |
| Business Process | `business-process` | `businessProcess` | `BusinessProcess` |
| Business Function | `business-function` | `businessFunction` | `BusinessFunction` |
| Business Interaction | `business-interaction` | `businessInteraction` | `BusinessInteraction` |
| Business Event | `business-event` | `businessEvent` | `BusinessEvent` |
| Business Service | `business-service` | `businessService` | `BusinessService` |
| Business Object | `business-object` | `businessObject` | `BusinessObject` |
| Contract | `contract` | `contract` | `Contract` |
| Representation | `representation` | `representation` | `Representation` |
| Product | `product` | `product` | `Product` |

### Application

| ArchiMate concept | File spelling | Stored keyword | Open Exchange `xsi:type` |
| --- | --- | --- | --- |
| Application Component | `application-component` | `applicationComponent` | `ApplicationComponent` |
| Application Collaboration | `application-collaboration` | `applicationCollaboration` | `ApplicationCollaboration` |
| Application Interface | `application-interface` | `applicationInterface` | `ApplicationInterface` |
| Application Function | `application-function` | `applicationFunction` | `ApplicationFunction` |
| Application Interaction | `application-interaction` | `applicationInteraction` | `ApplicationInteraction` |
| Application Process | `application-process` | `applicationProcess` | `ApplicationProcess` |
| Application Event | `application-event` | `applicationEvent` | `ApplicationEvent` |
| Application Service | `application-service` | `applicationService` | `ApplicationService` |
| Data Object | `data-object` | `dataObject` | `DataObject` |

### Technology

| ArchiMate concept | File spelling | Stored keyword | Open Exchange `xsi:type` |
| --- | --- | --- | --- |
| Node | `node` | `node` | `Node` |
| Device | `device` | `device` | `Device` |
| System Software | `system-software` | `systemSoftware` | `SystemSoftware` |
| Technology Collaboration | `technology-collaboration` | `technologyCollaboration` | `TechnologyCollaboration` |
| Technology Interface | `technology-interface` | `technologyInterface` | `TechnologyInterface` |
| Path | `path` | `path` | `Path` |
| Communication Network | `communication-network` | `communicationNetwork` | `CommunicationNetwork` |
| Technology Function | `technology-function` | `technologyFunction` | `TechnologyFunction` |
| Technology Process | `technology-process` | `technologyProcess` | `TechnologyProcess` |
| Technology Interaction | `technology-interaction` | `technologyInteraction` | `TechnologyInteraction` |
| Technology Event | `technology-event` | `technologyEvent` | `TechnologyEvent` |
| Technology Service | `technology-service` | `technologyService` | `TechnologyService` |
| Artifact | `artifact` | `artifact` | `Artifact` |

### Physical

| ArchiMate concept | File spelling | Stored keyword | Open Exchange `xsi:type` |
| --- | --- | --- | --- |
| Equipment | `equipment` | `equipment` | `Equipment` |
| Facility | `facility` | `facility` | `Facility` |
| Distribution Network | `distribution-network` | `distributionNetwork` | `DistributionNetwork` |
| Material | `material` | `material` | `Material` |

### Implementation and migration

| ArchiMate concept | File spelling | Stored keyword | Open Exchange `xsi:type` |
| --- | --- | --- | --- |
| Work Package | `work-package` | `workPackage` | `WorkPackage` |
| Deliverable | `deliverable` | `deliverable` | `Deliverable` |
| Implementation Event | `implementation-event` | `implementationEvent` | `ImplementationEvent` |
| Plateau | `plateau` | `plateau` | `Plateau` |
| Gap | `gap` | `gap` | `Gap` |

### Composite

The parser accepts these ArchiMate composite elements. The language-reference catalogue section lists the 58 concepts above and treats these two as intentional extras. Import and export still use their `xsi:type`.

| ArchiMate concept | File spelling | Stored keyword | Open Exchange `xsi:type` |
| --- | --- | --- | --- |
| Grouping | `grouping` | `grouping` | `Grouping` |
| Location | `location` | `location` | `Location` |

### Short aliases

These spellings are Business concepts. They are not extra ArchiMate types.

| Alias | ArchiMate concept | Stored keyword |
| --- | --- | --- |
| `process` | Business Process | `businessProcess` |
| `function` | Business Function | `businessFunction` |
| `event` | Business Event | `businessEvent` |
| `service` | Business Service | `businessService` |
| `role` | Business Role | `businessRole` |
| `collaboration` | Business Collaboration | `businessCollaboration` |

### Value-stream stage

`value-stream-stage` (alias `valueStreamStage`) is an authoring keyword for a nested Value Stream. It is not its own ArchiMate concept and not its own `xsi:type`. The stage's stored keyword is `valueStream` (`xsi:type="ValueStream"`).

The braces record Composition: a `composedOf` relationship from the parent value stream to the stage. `plein format` leaves that relationship implied by the nesting. A `flow` or `triggering` written between stages is a Flow or Triggering relationship between two Value Streams. The [matrix](relationship-matrix.md) checks a stage as a value stream.

## Relationships

The left-hand element is the ArchiMate source. The right-hand element is the target. Both the file spelling and the stored keyword are accepted after `:` and as an infix verb. Format writes `id -> id: <file spelling>`.

The matrix letter is the cell encoding in [`src/relationship-matrix-data.ts`](../src/relationship-matrix-data.ts). Read a cell with [relationship matrix](relationship-matrix.md).

| ArchiMate relationship | File spelling | Stored keyword | Open Exchange `xsi:type` | Matrix letter |
| --- | --- | --- | --- | --- |
| Composition | `composition` | `composedOf` | `Composition` | `c` |
| Aggregation | `aggregation` | `aggregates` | `Aggregation` | `g` |
| Assignment | `assignment` | `assignedTo` | `Assignment` | `i` |
| Realization | `realization` | `realizes` | `Realization` | `r` |
| Serving | `serving` | `serves` | `Serving` | `v` |
| Access | `access` | `accesses` | `Access` | `a` |
| Influence | `influence` | `influences` | `Influence` | `n` |
| Triggering | `triggering` | `triggers` | `Triggering` | `t` |
| Flow | `flow` | `flowsTo` | `Flow` | `f` |
| Specialization | `specialization` | `specializes` | `Specialization` | `s` |
| Association | `association` | `associatedWith` | `Association` | `o` |

Junctions (And, Or) are not relationships and not elements in `.plein`. Import skips them.

Access and Influence carry one optional modifier each. The clause sits on the relationship line. `plein check` accepts only the Open Exchange enumerations below. The Mac renderer draws that value on the edge.

| Relationship | Clause | Open Exchange attribute | Values |
| --- | --- | --- | --- |
| Access | `accessType <type>` | `accessType` | `Access`, `Read`, `Write`, `ReadWrite` |
| Influence | `modifier "<strength>"` | `modifier` | `+`, `++`, `-`, `--`, `0` through `10` |

The Specialization relationship connects two elements (`acme -> carrier: specialization`). A specialization declaration connects two concepts. The next section is that second construct.

## Concept specializations and profiles

ArchiMate lets an organization specialize an element concept. Plein records that specialization in the file. The instance's catalogue concept, layer, and `xsi:type` stay the parent's. Export does not write a profile.

| Plein construct | ArchiMate 4 | What the tool stores |
| --- | --- | --- |
| `specialization <name> specializes <parent>` | A specialized element concept. `<parent>` is a catalogue concept or an earlier specialized concept. | The name, the parent spelling, and the catalogue keyword at the end of the chain. |
| `profile <name> { ... }` | A named set of those specialized concepts for one organization. | A profile whose hooks are the specializations in the body. |
| `organization <name> { ... }` | The same profile construct. | Format writes `profile`. |
| Using `<name>` as the element keyword | An instance of that specialized concept. | Catalogue keyword, plus `specialization` and, for a hook, `profile`. |
| `hook <name>` after `as <id>` | The same instance, written with the catalogue keyword. | `viaHook` is set. The hook's catalogue keyword must be the element's. |
| `id -> id: specialization` | The Specialization relationship between two elements. | A relationship of type `specializes`. Checked with the matrix like any other relationship. |

A chain (`premium-customer specializes customer`, `customer specializes business-actor`) is one catalogue concept, Business Actor, for colour, icons, the matrix, and Open Exchange.

## Views and viewpoints

| Plein construct | ArchiMate 4 | Open Exchange |
| --- | --- | --- |
| `view <name> { ... }` | A view: a named diagram over the model. | `views/diagrams/view` with `xsi:type="Diagram"`. The view identifier is `<name>`. |
| `viewpoint <name> [ "<title>" ] { ... }` | The same view. The identifier is the view name. The optional string is the view's human title. | The title becomes the view's `<name>`. The identifier is still `<name>` (suffixed if it collides with an element id or the model id). |
| `title "<title>"` | The view's name (the human label). A later clause replaces a title written on the `viewpoint` header. | The same `<name>`. |
| ArchiMate Viewpoint (the catalogue of viewpoint kinds, with purpose and abstraction) | No production. A `.plein` file does not define or select a standard viewpoint kind. | Import may keep the kind as a `// ArchiMate viewpoint: …` comment. Export does not write a `viewpoint` or `viewpointRef`. |
| `include` / `exclude` | Which elements and relationships the view shows. | Included element ids become `element` nodes. Relationship patterns are not element nodes. An empty include list is the whole model. |
| `nesting nested` (alias `inside`, or bare `nesting`) | Diagram notation for Composition and Aggregation: the child is drawn inside the parent. The relationships themselves stay in the model. | A child `element` node is nested in its parent when composition or aggregation joins two included elements. Composition wins. |
| `nesting beside` and its aliases | The same relationships drawn as edges. This is the default when the clause is absent. | Flat element nodes. |
| `autoLayout`, `position`, `size` | Diagram layout. Not an ArchiMate concept. `size` is width and height in the same view-space pixels as `position`. | Not written. Import drops diagram geometry. |

`include application-component` selects every Application Component in the model, including elements whose specialized concept is derived from Application Component. `include customer` selects elements that use the specialized concept `customer`. The grammar's selector table is the full rule.

## Model structure that is not an ArchiMate concept

| Plein construct | Role |
| --- | --- |
| `plein { }` | File wrapper. Optional on input. Format always writes it. The ArchiMate model is the `model` block. |
| `model { }` | The elements, relationships, specializations, and profiles. |
| `styles { }` | Preserved text. Check and the renderer ignore it. Colours and glyphs come from the [layer map](archimate-style.md). |
| `//` comments | Preserved by format. They are not properties or documentation fields. |
| Element `id` after `as` | The identifier other statements use. Export writes it as the element identifier. |
| Quoted label | The element's name (`<name>` in Open Exchange). |
| `links view <name>` after `as <id>` | Canvas navigation only. One named view. Not a relationship, and not written to Open Exchange. |
| `notes "<text>"` after `as <id>` | One documentation string on the element. Not an ArchiMate property list. Open Exchange documentation is not imported into it, and export does not write it. |

Layer-band layout (`autoLayout layers`) stacks the view by the layers in the element tables: Motivation and Strategy, then Business, Application, Technology and Physical, then Implementation and migration. That stacking is presentation. It does not change the concepts.
