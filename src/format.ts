import {
  isAutoLayoutEnabled,
  parseEdgeRouting,
  parseGridOrder,
  parseLayoutDirection,
  parseLayoutMode,
  parseNestingMode,
} from "./layout.js";
import { resolveElementKeyword, toKebabCaseKeyword, type RelationshipKeyword } from "./keywords.js";
import {
  checkPlein,
  relationshipModifierSource,
  type ElementDecl,
  type PleinModel,
  type ProfileDecl,
  type RelationshipDecl,
  type SpecializationDecl,
  type ViewDecl,
} from "./parser.js";

/**
 * `plein format` could not emit a `.plein` string the parser can read back.
 * Labels are taken literally: the parser does not treat backslash as an escape.
 */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatError";
  }
}

/**
 * Language-reference spellings written after `:` .
 * The parser stores the camelCase canonical name; the file writes the alias.
 */
const RELATIONSHIP_SPELLING: Record<RelationshipKeyword, string> = {
  composedOf: "composition",
  aggregates: "aggregation",
  assignedTo: "assignment",
  realizes: "realization",
  serves: "serving",
  accesses: "access",
  influences: "influence",
  triggers: "triggering",
  flowsTo: "flow",
  specializes: "specialization",
  associatedWith: "association",
};

const SELECTOR_IDENT = /^[A-Za-z_*][A-Za-z0-9_-]*$/;

/**
 * Canonical `autoLayout` tokens, with defaults omitted.
 *
 * Order: mode (`layers` | `organic` | `grid`), grid order (`name`),
 * direction (`bt` | `lr` | `rl`), routing (`polyline`).
 * Omitted defaults: mode `layered`, grid order `kind`, direction `tb`,
 * routing `orthogonal`. `off` / `manual` is `off`.
 * An empty string means the clause is present and every token is the default
 * (`autoLayout` with no tokens, which the parser stores as `tb`).
 */
export function canonicalAutoLayout(value: string): string {
  if (!isAutoLayoutEnabled(value)) {
    return "off";
  }
  const mode = parseLayoutMode(value);
  const direction = parseLayoutDirection(value);
  const routing = parseEdgeRouting(value);
  const order = parseGridOrder(value);
  const tokens: string[] = [];
  if (mode !== "layered") {
    tokens.push(mode);
  }
  if (mode === "grid" && order === "name") {
    tokens.push("name");
  }
  if (direction !== "tb") {
    tokens.push(direction);
  }
  if (routing !== "orthogonal") {
    tokens.push("polyline");
  }
  return tokens.join(" ");
}

/** Rewrite a checked model to the canonical `.plein` layout. Always ends with one newline. */
export function formatPlein(model: PleinModel): string {
  const lines: string[] = [];
  if (model.headerComments && model.headerComments.length > 0) {
    pushComments(lines, model.headerComments, "");
    lines.push("");
  }
  lines.push("plein {");

  let wroteSection = false;
  if (writeModel(lines, model)) {
    wroteSection = true;
  }
  if (hasViews(model)) {
    if (wroteSection) {
      lines.push("");
    }
    writeViews(lines, model);
    wroteSection = true;
  }
  if (model.styles && model.styles.length > 0) {
    if (wroteSection) {
      lines.push("");
    }
    writeStyles(lines, model);
    wroteSection = true;
  }
  if (model.footerComments && model.footerComments.length > 0) {
    if (wroteSection) {
      lines.push("");
    }
    pushComments(lines, model.footerComments, "  ");
  }
  lines.push("}");
  if (model.trailingComments && model.trailingComments.length > 0) {
    lines.push("");
    pushComments(lines, model.trailingComments, "");
  }
  return `${lines.join("\n")}\n`;
}

/** Parse and check `source`, then return its canonical layout. */
export function formatPleinSource(source: string, file = "input.plein"): string {
  return formatPlein(checkPlein(source, file));
}

function hasViews(model: PleinModel): boolean {
  return (
    model.views.length > 0 ||
    (model.viewsComments?.length ?? 0) > 0 ||
    (model.viewsTrailingComments?.length ?? 0) > 0
  );
}

function writeModel(lines: string[], model: PleinModel): boolean {
  const declarations = declarationItems(model);
  const elements = model.elements.filter((element) => !element.container).sort(byOrder);
  const relationships = model.relationships
    .filter((relationship) => !relationship.container && !relationship.synthetic)
    .sort(byOrder);
  const hasBody =
    declarations.length > 0 ||
    elements.length > 0 ||
    relationships.length > 0 ||
    (model.modelComments?.length ?? 0) > 0 ||
    (model.modelTrailingComments?.length ?? 0) > 0;
  if (!hasBody) {
    return false;
  }

  pushComments(lines, model.modelComments, "  ");
  lines.push("  model {");

  let wrote = false;
  let lastWasProfile = false;
  for (const item of declarations) {
    if (wrote && (lastWasProfile || item.kind === "profile")) {
      lines.push("");
    }
    if (item.kind === "profile") {
      writeProfile(lines, item.profile, model);
    } else {
      writeSpecialization(lines, item.spec, "    ");
    }
    lastWasProfile = item.kind === "profile";
    wrote = true;
  }

  if (elements.length > 0) {
    if (wrote) {
      lines.push("");
    }
    for (const element of elements) {
      writeElement(lines, element, model, "    ");
    }
    wrote = true;
  }

  if (relationships.length > 0) {
    if (wrote) {
      lines.push("");
    }
    for (const relationship of relationships) {
      writeRelationship(lines, relationship, "    ");
    }
  }

  pushComments(lines, model.modelTrailingComments, "    ");
  lines.push("  }");
  return true;
}

type DeclarationItem =
  | { kind: "profile"; profile: ProfileDecl; order: number }
  | { kind: "specialization"; spec: SpecializationDecl; order: number };

function declarationItems(model: PleinModel): DeclarationItem[] {
  const items: DeclarationItem[] = [
    ...model.profiles.map((profile) => ({
      kind: "profile" as const,
      profile,
      order: profile.order ?? 0,
    })),
    ...model.specializations
      .filter((spec) => !spec.profile)
      .map((spec) => ({
        kind: "specialization" as const,
        spec,
        order: spec.order ?? 0,
      })),
  ];
  items.sort((a, b) => a.order - b.order);
  return items;
}

function writeProfile(lines: string[], profile: ProfileDecl, model: PleinModel): void {
  pushComments(lines, profile.leadingComments, "    ");
  lines.push(`    profile ${profile.name} {`);
  const hooks = model.specializations.filter((spec) => spec.profile === profile.name).sort(byOrder);
  for (const hook of hooks) {
    writeSpecialization(lines, hook, "      ");
  }
  pushComments(lines, profile.trailingComments, "      ");
  lines.push("    }");
}

function writeSpecialization(lines: string[], spec: SpecializationDecl, indent: string): void {
  pushComments(lines, spec.leadingComments, indent);
  lines.push(`${indent}specialization ${spec.name} specializes ${canonicalParent(spec.parent)}`);
}

function canonicalParent(parent: string): string {
  const keyword = resolveElementKeyword(parent);
  if (keyword) {
    return toKebabCaseKeyword(keyword);
  }
  return parent;
}

type BodyStatement =
  | { kind: "element"; element: ElementDecl; order: number }
  | { kind: "relationship"; relationship: RelationshipDecl; order: number };

function writeElement(lines: string[], element: ElementDecl, model: PleinModel, indent: string): void {
  pushComments(lines, element.leadingComments, indent);
  let statement = `${indent}${elementKeyword(element)} ${quoteLabel(element.label)} as ${element.id}`;
  if (element.viaHook && element.specialization) {
    statement += ` hook ${element.specialization}`;
  }
  if (element.linksView) {
    statement += ` links view ${element.linksView}`;
  }
  if (element.notes) {
    statement += ` notes ${quoteLabel(element.notes)}`;
  }
  const children = bodyStatements(element.id, model);
  const trailing = element.trailingComments ?? [];
  if (children.length === 0 && trailing.length === 0) {
    lines.push(statement);
    return;
  }
  lines.push(`${statement} {`);
  for (const child of children) {
    if (child.kind === "element") {
      writeElement(lines, child.element, model, `${indent}  `);
    } else {
      writeRelationship(lines, child.relationship, `${indent}  `);
    }
  }
  pushComments(lines, trailing, `${indent}  `);
  lines.push(`${indent}}`);
}

function elementKeyword(element: ElementDecl): string {
  if (element.container && !element.specialization) {
    return "value-stream-stage";
  }
  if (element.specialization && !element.viaHook) {
    return element.specialization;
  }
  return toKebabCaseKeyword(element.keyword);
}

function bodyStatements(parentId: string, model: PleinModel): BodyStatement[] {
  const statements: BodyStatement[] = [
    ...model.elements
      .filter((element) => element.container === parentId)
      .map((element) => ({ kind: "element" as const, element, order: element.order ?? 0 })),
    ...model.relationships
      .filter((relationship) => relationship.container === parentId && !relationship.synthetic)
      .map((relationship) => ({
        kind: "relationship" as const,
        relationship,
        order: relationship.order ?? 0,
      })),
  ];
  statements.sort((a, b) => a.order - b.order);
  return statements;
}

function writeRelationship(lines: string[], relationship: RelationshipDecl, indent: string): void {
  pushComments(lines, relationship.leadingComments, indent);
  const spelling = RELATIONSHIP_SPELLING[relationship.type];
  lines.push(
    `${indent}${relationship.source} -> ${relationship.target}: ${spelling}${relationshipModifierSource(relationship)}`,
  );
}

function writeViews(lines: string[], model: PleinModel): void {
  pushComments(lines, model.viewsComments, "  ");
  lines.push("  views {");
  const specNames = new Set(model.specializations.map((spec) => spec.name));
  for (const view of [...model.views].sort(byOrder)) {
    writeView(lines, view, specNames);
  }
  pushComments(lines, model.viewsTrailingComments, "    ");
  lines.push("  }");
}

function writeView(lines: string[], view: ViewDecl, specNames: ReadonlySet<string>): void {
  const nesting = canonicalNesting(view.nesting);
  const lead = [...(view.leadingComments ?? []), ...(view.titleComments ?? [])];
  if (view.nesting !== undefined && nesting === undefined) {
    lead.push(...(view.nestingComments ?? []));
  }
  pushComments(lines, lead, "    ");
  if (view.title !== undefined) {
    lines.push(`    viewpoint ${view.name} ${quoteLabel(view.title)} {`);
  } else {
    lines.push(`    view ${view.name} {`);
  }

  if (view.includes.length > 0) {
    pushComments(lines, view.includeComments, "      ");
    const includes = view.includes.map((selector) => canonicalSelector(selector, specNames)).join(", ");
    lines.push(`      include ${includes}`);
  }
  if (view.excludes.length > 0) {
    pushComments(lines, view.excludeComments, "      ");
    const excludes = view.excludes.map((selector) => canonicalSelector(selector, specNames)).join(", ");
    lines.push(`      exclude ${excludes}`);
  }
  if (view.autoLayout !== undefined) {
    pushComments(lines, view.autoLayoutComments, "      ");
    const tokens = canonicalAutoLayout(view.autoLayout);
    lines.push(tokens.length > 0 ? `      autoLayout ${tokens}` : "      autoLayout");
  }
  if (nesting === "nested") {
    pushComments(lines, view.nestingComments, "      ");
    lines.push("      nesting nested");
  }
  for (const position of view.positions ?? []) {
    pushComments(lines, position.leadingComments, "      ");
    lines.push(
      `      position ${position.id} ${formatNumber(position.x)} ${formatNumber(position.y)}`,
    );
  }
  for (const size of view.sizes ?? []) {
    pushComments(lines, size.leadingComments, "      ");
    lines.push(
      `      size ${size.id} ${formatNumber(size.width)} ${formatNumber(size.height)}`,
    );
  }
  pushComments(lines, view.trailingComments, "      ");
  lines.push("    }");
}

/** `nested` / `inside` / bare `nesting` become `nested`. Beside aliases are omitted. */
function canonicalNesting(value: string | undefined): "nested" | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseNestingMode(value) === "nested" ? "nested" : undefined;
}

function canonicalSelector(selector: string, specNames: ReadonlySet<string>): string {
  if (selector.includes("*") || selector.includes("->") || selector.startsWith("tag:")) {
    return quoteSelector(selector);
  }
  if (!specNames.has(selector)) {
    const keyword = resolveElementKeyword(selector);
    if (keyword) {
      return quoteSelector(toKebabCaseKeyword(keyword));
    }
  }
  return quoteSelector(selector);
}

function quoteSelector(selector: string): string {
  if (SELECTOR_IDENT.test(selector)) {
    return selector;
  }
  return quoteLabel(selector);
}

function writeStyles(lines: string[], model: PleinModel): void {
  const blocks = model.styles ?? [];
  blocks.forEach((block, index) => {
    if (index > 0) {
      lines.push("");
    }
    pushComments(lines, block.leadingComments, "  ");
    lines.push("  styles {");
    const body = canonicalStyleBody(block.body);
    if (body.length > 0) {
      lines.push(body);
    }
    lines.push("  }");
  });
}

/** Dedent a `styles` body and indent it by four spaces. Empty lines stay empty. */
export function canonicalStyleBody(inner: string): string {
  const normalized = inner.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "  ");
  const trimmed = normalized.split("\n").map((line) => line.trimEnd());
  while (trimmed.length > 0 && trimmed[0] === "") {
    trimmed.shift();
  }
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  if (trimmed.length === 0) {
    return "";
  }
  const indents = trimmed
    .filter((line) => line.trim() !== "")
    .map((line) => /^ */.exec(line)![0].length);
  const min = Math.min(...indents);
  return trimmed
    .map((line) => (line.trim() === "" ? "" : `    ${line.slice(min)}`))
    .join("\n");
}

function pushComments(lines: string[], comments: readonly string[] | undefined, indent: string): void {
  if (!comments) {
    return;
  }
  for (const comment of comments) {
    lines.push(comment.length > 0 ? `${indent}// ${comment}` : `${indent}//`);
  }
}

function quoteLabel(label: string): string {
  if (label.includes('"') || label.includes("\n") || label.includes("\r")) {
    throw new FormatError(
      "element label contains a double quote or newline, which .plein strings cannot encode",
    );
  }
  return `"${label}"`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    return "0";
  }
  return String(value);
}

function byOrder<T extends { order?: number }>(a: T, b: T): number {
  return (a.order ?? 0) - (b.order ?? 0);
}
