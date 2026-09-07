# Plein

**Plein** (say “pleen”) is a Flowlab HQ product: human-editable ArchiMate markup that renders lightweight architecture views — without a heavyweight EA suite.

One text model → many consistent ArchiMate viewpoints. Git-friendly, PR-reviewable, metamodel-validated.

## Documentation

* [Plein DSL language reference (ArchiMate 4)](docs/plein-dsl-archimate-4.md) — document shape, element vocabulary, relationships, views, and validation guidance.

Plein source files use the `.plein` extension.

## CLI

Structural check: load a model (elements + typed relationships) and exit 0 when it is valid. Syntax errors and unknown keywords exit non-zero with `file:line:column` diagnostics on stderr. `views` and `styles` are ignored for now.

```bash
npm install
npm run build
npx plein check fixtures/valid-basic.plein
npm test
```

See [docs/plein-dsl-archimate-4.md](docs/plein-dsl-archimate-4.md) for document shape and vocabulary. Canonical typed relationships are `composedOf`, `aggregates`, `assignedTo`, `realizes`, `serves`, `accesses`, `influences`, `triggers`, `flowsTo`, `specializes`, and `associatedWith` (language-reference names such as `serving` are aliases).

## Branding

Product mark: [branding/plein-mark.png](branding/plein-mark.png)
