# Grammar

Concrete syntax of a `.plein` file, as `src/parser.ts` accepts it today. The productions are [`plein.ebnf`](plein.ebnf). This page is the lexical rules, the decision procedure those productions need, and the checks that run after a successful parse.

Author-facing vocabulary and examples: [Plein DSL language reference (ArchiMate 4)](plein-dsl-archimate-4.md). Concept names: [Plein constructs and ArchiMate 4](archimate-mapping.md). Which source type may use which relationship: [relationship matrix](relationship-matrix.md) (`src/relationship-matrix-data.ts`). The matrix is not restated here.

`plein check` is `checkPlein`: parse, then the checks below. `plein format` rewrites a checked file to one spelling and one clause order; the grammar accepts every spelling in the tables, and format emits the file spelling.

## Notation

[`plein.ebnf`](plein.ebnf) uses this notation:

| Form | Meaning |
| --- | --- |
| `rule = expr ;` | A production |
| juxtaposition | Sequence |
| `a \| b` | Alternative |
| `[ a ]` | Optional |
| `{ a }` | Repeat zero or more |
| `"tok"` | Terminal spelling |
| `(* *)` | Comment |

Keywords are case-sensitive identifier spellings. The lexer does not reserve them: `include` is an identifier that starts a clause only inside a view body.

## Lexical syntax

Whitespace is space, tab, CR, and LF. It separates tokens and is otherwise ignored.

A comment starts at `//` and runs to the end of the line. The stored text is the remainder with surrounding whitespace removed. `/* */` is not a comment. `//` inside a string is two characters of the label.

Comments are legal between statements: before the first block, between top-level blocks, between model statements, between specializations in a profile, between statements in a value-stream body, between view clauses, and after the last statement before a closing brace. A comment in the middle of a statement is a parse error (`business-actor "Shipper" as` then `//` then `shipper` fails, because the next token after `as` must be the identifier). The exception is an `include` or `exclude` list: a comment between selectors stays with that list when another selector follows it. A comment immediately before the next view clause ends the list.

| Token | Form |
| --- | --- |
| identifier | Start: `A`–`Z`, `a`–`z`, `_`, or `*`. Continue: those letters, digits, `_`, or `-`. `*` is not a continue character, so `*` alone is the wildcard selector. The two characters `->` end an identifier and are the arrow token. `shipper->booking` is an identifier, an arrow, and an identifier. |
| string | `"`, then any characters except `"` and newline, then `"`. No escape. A backslash is a literal character. A newline before the closing quote is `unterminated string`. |
| number | Optional `-`, one or more digits, then an optional `.` and one or more digits. `-` starts a number only when a digit follows. No exponent. `.5` is not a number. |
| symbols | `{`, `}`, `:`, `->` |
| other | Any remaining character, one character per token. The include-list comma is this token. |

Identifiers are ASCII. A label may contain spaces, punctuation, and Unicode. An identifier may not.

`plein format` refuses a label that contains `"` or a newline, because a string cannot encode either.

## Document

```
document          = wrapped-document | bare-document
wrapped-document  = "plein" "{" { top-level-block } "}"
bare-document     = { top-level-block }
top-level-block   = model-block | views-block | styles-block
```

Nothing may appear between `plein` and `{`. `plein "Name" {` fails with `expected '{' after plein`.

`model`, `views`, and `styles` may each appear more than once, in any order. Later blocks append to the same model. An empty file, a file of only comments, and an empty `model { }` are syntactically valid.

`plein format` emits a single `plein { }` wrapper and writes `model`, then `views`, then `styles`, omitting a block that has nothing to write. See [Canonical layout](plein-dsl-archimate-4.md#canonical-layout-plein-format).

A `styles` block is kept as the raw source between its matching braces and is not interpreted. Brace matching counts `{` and `}` tokens. A brace inside a string or a `//` comment does not change the depth. `plein check` and the Mac renderer ignore the body. Format reindents it.

## Choosing a model statement

A model statement starts with an identifier. Classify it in this order. The same order applies inside a value-stream body, with the failures in [Value-stream body](#value-stream-body).

1. `value-stream-stage` or `valueStreamStage` at model level fails: `valueStreamStage must be nested inside a valueStream`.
2. `specialization`, when the next token is an identifier that is not a relationship spelling, is a [specialization declaration](#specialization-declaration). `->`, a string, `}`, or a relationship spelling means this word is a relationship source instead.
3. `profile` or `organization`, when the next token is an identifier and the token after that is `{`, is a [profile](#profile). Comments are tokens, so a comment between the name and `{` does not take this branch.
4. Otherwise the statement is an element or a relationship. The next token decides:
   - A string starts an [element](#element).
   - `->` starts an arrow relationship: `ident "->" ident ":" relationship-type`.
   - An identifier that is a relationship spelling starts an infix relationship: `ident relationship-type ident`.
   - Anything else is a parse error.

`specialization serves booking` is infix (step 2 does not match, because `serves` is a relationship spelling). `specialization customer specializes business-actor` is a declaration. `profile -> role: assignment` is an arrow relationship whose source identifier is `profile`.

There is no property list, documentation block, influence modifier, or access type on an element or a relationship. Those are comments when a tool needs to record them. See [Open Exchange import and export](open-exchange-import.md).

## Element

```
element-decl = element-head string "as" ident [ hook ] [ value-stream-body ]
hook         = "hook" ident
```

`element-head` is an element keyword or the name of a specialization declared earlier in the file. The quoted label and `as` plus an identifier are required. `stakeholder "Gemba Advantage"` fails with `expected 'as <identifier>' after element label`.

Element keywords are the alternatives of `element-keyword` in [`plein.ebnf`](plein.ebnf):

* The file spelling is kebab-case (`business-actor`, `value-stream`). `plein format` writes this spelling.
* The stored spelling is camelCase (`businessActor`, `valueStream`). `plein inspect` writes this spelling. For a keyword with no capital, the two spellings are the same (`resource`, `node`, `gap`).
* Kebab-case is produced from the stored name by inserting `-` before each capital letter and lowercasing that letter. Only those generated spellings are accepted. A name that merely looks like kebab-case and is not in the list fails.

Six short aliases resolve to the Business catalogue keyword:

| Alias | Stored keyword | File spelling |
| --- | --- | --- |
| `process` | `businessProcess` | `business-process` |
| `function` | `businessFunction` | `business-function` |
| `event` | `businessEvent` | `business-event` |
| `service` | `businessService` | `business-service` |
| `role` | `businessRole` | `business-role` |
| `collaboration` | `businessCollaboration` | `business-collaboration` |

`grouping` and `location` are accepted catalogue keywords. The language-reference element list omits them on purpose; the grammar includes them.

An unknown head fails with `unknown keyword '<name>' (undeclared specialization)`.

`hook <name>` is optional and sits immediately after the element id. The name must be a specialization declared inside a profile, and that specialization's catalogue keyword must be this element's catalogue keyword. `hook` on a specialization used as the element head fails with `hook cannot be combined with specialization keyword '<name>'`. A hook name that was never declared fails with `undeclared profile hook '<name>'`. A model-level specialization fails with `specialization '<name>' is not a profile hook`.

Element identifiers are unique within the model. View names are a separate namespace and may reuse an element id. `plein check` reports `duplicate identifier '<id>'`.

## Value-stream body

A `{` after the element id opens a body only when the element's catalogue keyword is `valueStream`. That includes a specialization or hook whose chain ends at `valueStream`. The body is a sequence of stage declarations and relationships.

```
stage-decl = ( "value-stream-stage" | "valueStreamStage" ) string "as" ident [ hook ]
```

A stage is a `valueStream` element. The parse records a `composedOf` relationship from the enclosing value stream to the stage. That relationship is implied by the braces. `plein format` does not write it back out; parsing the nested form creates it again.

Any other element keyword in the body fails with `unknown step keyword '<name>'`. A stage cannot contain a nested `{` body. A specialization declaration in the body fails with `specialization declarations belong in the model, not inside a valueStream`. A profile declaration fails with `profile declarations belong in the model, not inside a valueStream`.

A relationship in the body uses the same arrow and infix forms as the model. The type must resolve to `flowsTo` or `triggers` (`flow`, `triggering`, `flowsTo`, `triggers`). Any other type fails with `value stream stages may only use flowsTo or triggers`.

## Specialization declaration

```
"specialization" specialization-name specializes-verb specialization-parent
specializes-verb = "specializes" | "specialization"
```

The verb is the relationship spelling that resolves to `specializes`. Any other word fails with `expected 'specializes' after specialization name`.

`specialization-parent` is an element keyword (any accepted spelling) or the exact declared spelling of a specialization that already appears earlier in the file. There is no camelCase alias for a declared name: `express-order` and `expressOrder` are different names. The catalogue keyword at the end of the chain is the element's stored keyword.

The declaration is a type. It is a different production from the relationship `id -> id: specialization`.

A declared name is rejected when:

| Situation | Diagnostic |
| --- | --- |
| The name is a catalogue keyword, a short alias, or a stage keyword | `specialization '<name>' collides with catalogue keyword '<name>'` |
| The name is a relationship spelling or a reserved word (below) | `specialization name '<name>' is reserved` |
| The name is already a profile name | `specialization '<name>' collides with profile '<name>'` |
| The same name is declared twice | `duplicate specialization '<name>'` |
| The parent is unknown | `specialization '<name>' specializes unknown keyword '<parent>'` |

Reserved words: `plein`, `model`, `views`, `styles`, `view`, `viewpoint`, `include`, `exclude`, `title`, `autoLayout`, `position`, `size`, `nesting`, `as`, `of`, `profile`, `organization`, `hook`.

## Profile

```
( "profile" | "organization" ) profile-name "{" { specialization-decl } "}"
```

`organization` is an alias of `profile`. `plein format` writes `profile`.

The body contains specialization declarations only. Each of those declarations is a hook of this profile. A hook may specialize a catalogue keyword or a specialization declared earlier, including one from an earlier profile or from earlier in the same profile. An element, a relationship, or a nested profile fails with `profile '<name>' may only declare specializations`.

Profile names use the same collision rules as specialization names (`profile '<name>' collides with catalogue keyword '<name>'`, `profile name '<name>' is reserved`, `duplicate profile '<name>'`, `profile '<name>' collides with specialization '<name>'`).

`profile <name>` without a following `{` fails with `expected '{' after profile name`. `profile` followed by a string fails with `expected profile name and '{' after profile`.

## Relationship

```
arrow-relationship = ident "->" ident ":" relationship-type
infix-relationship = ident relationship-type ident
```

Both forms parse. `plein format` writes the arrow form with the file spelling: `shipper -> booking: serving`.

`relationship-type` is one of these eleven pairs. The file spelling is the language-reference name. The stored keyword is what the parser and `plein inspect` keep. Both are accepted after `:` and as the infix verb.

| File spelling | Stored keyword |
| --- | --- |
| `composition` | `composedOf` |
| `aggregation` | `aggregates` |
| `assignment` | `assignedTo` |
| `realization` | `realizes` |
| `serving` | `serves` |
| `access` | `accesses` |
| `influence` | `influences` |
| `triggering` | `triggers` |
| `flow` | `flowsTo` |
| `specialization` | `specializes` |
| `association` | `associatedWith` |

A hyphenated verb (`flows-to`, `composed-of`, `assigned-to`) is not a spelling. It fails with `unknown relationship type '<name>'`.

The left identifier is the source and the right identifier is the target. `plein check` requires both to be element ids, rejects a relationship whose source and target are the same id, and rejects a pair that the [relationship matrix](relationship-matrix.md) does not allow. A specialization or hook is checked as its catalogue keyword. A stage is checked as `valueStream`.

## Views

```
named-view     = "view" ident "{" view-body "}"
viewpoint-view = "viewpoint" ident [ string ] "{" view-body "}"
```

The identifier is the view name in both forms. `viewpoint` also records that same identifier as the view's viewpoint field and may take a quoted title before `{`. `view` has no string between the name and `{`. A `title` clause inside the body sets the title, and a later `title` clause replaces an earlier one, including a title written on the `viewpoint` header.

View names are unique (`duplicate view name '<name>'`). They are not required to differ from element ids.

Clauses may appear in any order. `plein format` writes them as `include`, `exclude`, `autoLayout`, `nesting`, each `position`, then each `size`. A view with a title is rewritten as `viewpoint <name> "<title>"`. A view with no title is rewritten as `view <name>`.

### Selectors

```
include-clause = "include" selector { [ "," ] selector }
exclude-clause = "exclude" selector { [ "," ] selector }
selector       = ident | string
```

The same rule builds an `exclude` list. At least one selector is required. Commas are optional `other` tokens and may repeat, lead, or trail. Format joins selectors with `, `.

A selector is one identifier or one string. `*` is an identifier, so `include *` needs no quotes. A pattern that contains `->` cannot be one identifier, because `->` is its own token. Write it as one string: `exclude "* -> legacyBatch"`. The same quoting rule applies to a `tag:` selector (`"tag:shipping"`). An unquoted `tag:shipping` is the identifier `tag`, the character `:`, and the identifier `shipping`, which fails in the list.

`plein check` resolves a selector as follows:

| Selector | Check |
| --- | --- |
| Contains `*`, contains `->`, or starts with `tag:` | Pattern. Not required to name an element. |
| An element keyword (any accepted spelling) | Type selector. Not required to name an element. |
| A declared specialization name | Type selector. Not required to name an element. |
| Anything else | Must be an element id in this model. |

Membership, implemented by `filterModel` in `src/list-model.ts` and by diagram include expansion:

* An empty `include` list means every element. Relationships are those whose two ends are both visible, unless the view also has a relationship pattern in `include`.
* `*` matches every element.
* An element id matches that element.
* A declared specialization name matches elements that use that specialization.
* An element keyword matches elements whose catalogue keyword is that keyword, including elements that specialize it.
* A selector that matches `source -> target` (optional whitespace around `->`) is a relationship pattern. `*` on either side matches any endpoint. `exclude "* -> legacyBatch"` drops every relationship whose target id is `legacyBatch`.
* `exclude` wins when an element or relationship matches both an include and an exclude.
* A `tag:` selector passes the check and matches no element in the current membership code.

A profile name is not a selector.

### `autoLayout`

```
auto-layout-clause = "autoLayout" { auto-layout-token }
```

Following identifiers are consumed until the next view-clause keyword (`include`, `exclude`, `title`, `autoLayout`, `position`, `size`, `nesting`, `view`, `viewpoint`). At most one token from each group. `kind` or `name` is legal only with mode `grid`. `off` or `manual` must be the only token.

The parser stores the tokens joined by a space, in source order. Bare `autoLayout` stores `tb`. Format rewrites to the canonical subset in [the language reference](plein-dsl-archimate-4.md#canonical-layout-plein-format): mode, then grid order, then direction, then routing, dropping tokens that are the default.

| Group | Accepted tokens | Stored / formatted meaning |
| --- | --- | --- |
| off | `off`, `manual` | Disables automatic layout. Format writes `off`. |
| mode | `layered`, `layers`, `layer`, `organic`, `grid` | `layer` is the layers mode. Format writes `layers`, `organic`, or `grid`, and omits `layered`. |
| direction | `tb`, `bt`, `lr`, `rl`, `left-right`, `leftRight`, `left_right`, `horizontal`, `right-left`, `rightLeft`, `right_left`, `top-bottom`, `topBottom`, `top_bottom`, `vertical`, `bottom-top`, `bottomTop`, `bottom_top` | Shorthands mean `lr`, `rl`, `tb`, and `bt` as in the language reference. Format writes `bt`, `lr`, or `rl`, and omits `tb`. |
| routing | `orthogonal`, `ortho`, `right-angle`, `rightAngle`, `right_angle`, `polyline`, `poly-line`, `polyLine` | Format writes `polyline` and omits orthogonal. |
| grid order | `kind`, `name` | Legal with `grid` only. Format writes `name` and omits `kind`. |

What each mode draws: [Views and membership](plein-dsl-archimate-4.md#views-and-membership).

### `position`, `size`, and `nesting`

```
position-clause = "position" ident number number
size-clause     = "size" ident number number
nesting-clause  = "nesting" [ nesting-mode ]
nesting-mode    = "nested" | "inside" | "beside" | "sideBySide" | "side-by-side" | "side_by_side"
```

Coordinates are numbers (decimals and a leading minus are legal). The same element id may appear once in a view (`duplicate position for '<id>'`). `plein check` requires the id to exist in the model. Positions apply when this view's auto-layout value is `off` or `manual`.

`size <id> <width> <height>` is the explicit box in the same view-space pixels. Width and height must be positive (`size width and height must be positive`). The same element id may appear once (`duplicate size for '<id>'`). `plein check` requires the id to exist in the model. Sizes apply only when auto-layout is `off` or `manual`, and they are ignored while auto-layout is on, the same way `position` is. An element with no `size` clause keeps the label-fit box. The viewer will not draw a box smaller than 48 by 32. A nested parent still grows to cover its children.

```
size shipper 216 80
``` The Mac app **Save** control writes this shape: `autoLayout off` plus one `position` clause per element top-left, for the view on screen. It does not invent a second coordinate format. **Save** is available only while that view is in manual placement.

`nesting` consumes a mode token only when the next identifier is not a view-clause keyword. Bare `nesting` stores `nested`. The parser stores the mode spelling it saw (`inside`, `side-by-side`, and the rest). Format writes `nesting nested` for `nested` and `inside`, and omits beside and its aliases.

## Checks after a successful parse

Syntax errors above are parse errors. `checkPlein` then reports:

1. Duplicate element ids.
2. A relationship source or target that is not an element id.
3. A relationship whose source and target are the same id.
4. A source type, relationship, and target type that the [relationship matrix](relationship-matrix.md) does not list. The diagnostic uses file spellings: `invalid relationship '<relationship>' from '<source-type>' to '<target-type>'`.
5. Duplicate view names.
6. An `include` or `exclude` selector that the selector table treats as an element id, when no element has that id.
7. A `position` or `size` id that is not an element id.

Specialization, profile, hook, value-stream, and `autoLayout` failures in the sections above are raised while parsing, because they decide which production matched.

## Implementations

A parser that follows [`plein.ebnf`](plein.ebnf) and the decision procedure on this page accepts the same programs as `src/parser.ts`. Where a fixture and this page disagree, the fixture and `plein check` are the oracle: golden files under `fixtures/` must parse, and `broken-*`, `malformed-*`, `unknown-*`, and `invalid-*` must fail.

`npm test` (`src/grammar.test.ts`) fails if `plein.ebnf` or the [mapping](archimate-mapping.md) drops a catalogue keyword or a relationship spelling that `src/keywords.ts` accepts.
