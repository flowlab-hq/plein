import {
  isRelationshipKeyword,
  isValueStreamStageKeyword,
  isValueStreamStageLink,
  resolveElementKeyword,
  resolveRelationshipKeyword,
  toKebabCaseKeyword,
  type ElementKeyword,
  type RelationshipKeyword,
} from "./keywords.js";
import { invalidRelationshipMessage, isRelationshipAllowed } from "./relationship-matrix.js";

export class ParseError extends Error {
  readonly file: string;
  readonly line: number;
  readonly column: number;

  constructor(message: string, file: string, line: number, column: number) {
    super(`${file}:${line}:${column}: ${message}`);
    this.name = "ParseError";
    this.file = file;
    this.line = line;
    this.column = column;
  }
}

export type ElementDecl = {
  keyword: ElementKeyword;
  label: string;
  id: string;
  line: number;
  /**
   * Set when the element is declared with a specialization name, or when a
   * profile hook is attached with `hook <name>`. `keyword` stays the catalogue
   * concept, so style, layout, and Open Exchange keep using the ArchiMate 4 type.
   */
  specialization?: string;
  /**
   * Profile (organization pack) that declared `specialization`.
   * Absent for catalogue elements and for specializations declared directly
   * in the model.
   */
  profile?: string;
  /**
   * True when `specialization` was attached with `hook <name>` after the id.
   * False when the specialization name was the element keyword.
   */
  viaHook?: boolean;
  /** Parent value-stream id when this element is a nested stage. */
  container?: string;
  /**
   * Named view a canvas double-click opens.
   * Written `links view <name>` after the id, and after `hook` when that is present.
   * One destination. Absent when the element is not linked.
   */
  linksView?: string;
  /**
   * One documentation string, written `notes "<text>"` after `hook` and
   * `links view` when those are present. Absent when the clause is omitted
   * or the string is empty. Not a property list.
   */
  notes?: string;
  /** Source order among model statements. Used by `plein format`. */
  order?: number;
  /** `//` comments immediately above this declaration, text after `//`. */
  leadingComments?: string[];
  /** `//` comments after the last nested statement, before the value-stream brace. */
  trailingComments?: string[];
};

/**
 * A concept specialization declared in the model.
 * `keyword` is the catalogue concept (walked through any chain of
 * specializations). `profile` is set when the declaration sits inside a profile.
 */
export type SpecializationDecl = {
  name: string;
  /** Spelling after `specializes` (a catalogue keyword or an earlier specialization). */
  parent: string;
  keyword: ElementKeyword;
  line: number;
  /** Set when this specialization is a hook inside a profile. */
  profile?: string;
  /** Source order among model statements. Used by `plein format`. */
  order?: number;
  /** `//` comments immediately above this declaration, text after `//`. */
  leadingComments?: string[];
};

/**
 * A named profile: an in-file organization extension pack.
 * Its hooks are the specializations declared in the profile body.
 */
export type ProfileDecl = {
  name: string;
  line: number;
  /** Source order among model statements. Used by `plein format`. */
  order?: number;
  /** `//` comments immediately above this declaration, text after `//`. */
  leadingComments?: string[];
  /** `//` comments after the last hook, before the profile's closing brace. */
  trailingComments?: string[];
};

export type RelationshipDecl = {
  type: RelationshipKeyword;
  source: string;
  target: string;
  line: number;
  column: number;
  /** Parent value-stream id when this relationship was written inside its body. */
  container?: string;
  /**
   * True for the `composedOf` edge synthesized from a nested stage.
   * The formatter omits it; nesting syntax puts it back on the next parse.
   */
  synthetic?: boolean;
  /** Source order among model statements. Used by `plein format`. */
  order?: number;
  /** `//` comments immediately above this relationship, text after `//`. */
  leadingComments?: string[];
  /**
   * Open Exchange `accessType` on an `accesses` relationship.
   * One of `Access`, `Read`, `Write`, `ReadWrite`. Absent when the clause is omitted.
   */
  accessType?: string;
  /**
   * Open Exchange influence `modifier` (the strength) on an `influences` relationship.
   * One of `+`, `++`, `-`, `--`, or `0` through `10`. Absent when the clause is omitted.
   */
  modifier?: string;
  /**
   * Optional multiplicity on any relationship.
   * `*`, a whole number, or a range such as `0..1` or `1..*`. Absent when the clause is omitted.
   */
  multiplicity?: string;
};

/**
 * ArchiMate Model Exchange `AccessTypeEnum` (3.1).
 * The schema default when the attribute is omitted is `Access`; Plein stores
 * a type only when the clause or the attribute is present.
 */
export const ACCESS_TYPES = ["Access", "Read", "Write", "ReadWrite"] as const;

export type AccessType = (typeof ACCESS_TYPES)[number];

/**
 * ArchiMate Model Exchange `InfluenceStrengthEnum` (3.1).
 * The schema calls these suggestions and also allows any string. Plein checks
 * this closed set so an invalid strength fails `plein check`.
 */
export const INFLUENCE_MODIFIERS = [
  "+",
  "++",
  "-",
  "--",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;

export type InfluenceModifier = (typeof INFLUENCE_MODIFIERS)[number];

const ACCESS_TYPE_SET = new Set<string>(ACCESS_TYPES);
const INFLUENCE_MODIFIER_SET = new Set<string>(INFLUENCE_MODIFIERS);

/** Canonical relationship-line suffix for a typed modifier and an optional multiplicity. */
export function relationshipModifierSource(
  relationship: Pick<RelationshipDecl, "accessType" | "modifier" | "multiplicity">,
): string {
  const parts: string[] = [];
  if (relationship.accessType) {
    parts.push(`accessType ${relationship.accessType}`);
  }
  if (relationship.modifier !== undefined) {
    parts.push(`modifier "${relationship.modifier}"`);
  }
  if (relationship.multiplicity !== undefined) {
    parts.push(`multiplicity "${relationship.multiplicity}"`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

/** Text drawn on an Access or Influence edge. The typed value itself. */
export function relationshipModifierLabel(
  relationship: Pick<RelationshipDecl, "accessType" | "modifier">,
): string | undefined {
  return relationship.accessType ?? relationship.modifier;
}

/** Text drawn on a relationship edge: the typed modifier, the multiplicity, or both. */
export function relationshipEdgeLabel(
  relationship: Pick<RelationshipDecl, "accessType" | "modifier" | "multiplicity">,
): string | undefined {
  const typed = relationshipModifierLabel(relationship);
  if (relationship.multiplicity === undefined) {
    return typed;
  }
  return typed === undefined ? relationship.multiplicity : `${typed} ${relationship.multiplicity}`;
}

/**
 * A multiplicity `plein check` accepts.
 * `*`, a whole number without a leading zero (`0`, `1`, `12`), or
 * `lower..upper` / `lower..*` with `lower` <= `upper`.
 */
export function isRelationshipMultiplicity(value: string): boolean {
  if (value === "*") {
    return true;
  }
  const match = /^(0|[1-9]\d*)(?:\.\.(\*|(?:0|[1-9]\d*)))?$/.exec(value);
  if (!match) {
    return false;
  }
  const upper = match[2];
  if (upper === undefined || upper === "*") {
    return true;
  }
  return compareWholeNumbers(match[1]!, upper) <= 0;
}

function compareWholeNumbers(left: string, right: string): number {
  if (left.length !== right.length) {
    return left.length < right.length ? -1 : 1;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** Top-left of one element when auto-layout is off. Ignored while auto-layout is on. */
export type PositionDecl = {
  id: string;
  x: number;
  y: number;
  line: number;
  /** `//` comments immediately above this `position` clause, text after `//`. */
  leadingComments?: string[];
};

/**
 * Explicit width and height of one element when auto-layout is off.
 * Ignored while auto-layout is on. Omitted clauses keep the label-fit box.
 */
export type SizeDecl = {
  id: string;
  width: number;
  height: number;
  line: number;
  /** `//` comments immediately above this `size` clause, text after `//`. */
  leadingComments?: string[];
};

export type ViewDecl = {
  name: string;
  viewpoint?: string;
  title?: string;
  includes: string[];
  excludes: string[];
  autoLayout?: string;
  /**
   * Explicit coordinates used only when this view’s auto-layout is off
   * (`autoLayout off` / `autoLayout manual`). Declaring `autoLayout` without
   * `off` keeps automatic placement and ignores these positions.
   */
  positions?: PositionDecl[];
  /**
   * Explicit box size used only when this view’s auto-layout is off.
   * Declaring `autoLayout` without `off` ignores these sizes, same as `position`.
   */
  sizes?: SizeDecl[];
  /**
   * File default for aggregation/composition placement.
   * Omit or `beside` = today’s side-by-side graph. `nested` draws children
   * inside the parent. The Mac app may override this for local preview only.
   */
  nesting?: string;
  line: number;
  /** Source order among views. Used by `plein format`. */
  order?: number;
  /** `//` comments immediately above this view, text after `//`. */
  leadingComments?: string[];
  /** Comments that belonged to a `title` clause. Printed above the view. */
  titleComments?: string[];
  includeComments?: string[];
  excludeComments?: string[];
  autoLayoutComments?: string[];
  nestingComments?: string[];
  /** `//` comments after the last clause, before the view's closing brace. */
  trailingComments?: string[];
};

/** One ignored `styles` block. `body` is the source inside the braces. */
export type StyleBlock = {
  body: string;
  /** Source order among top-level blocks. Used by `plein format`. */
  order?: number;
  leadingComments?: string[];
};

export type PleinModel = {
  elements: ElementDecl[];
  relationships: RelationshipDecl[];
  views: ViewDecl[];
  specializations: SpecializationDecl[];
  profiles: ProfileDecl[];
  /** `//` comments before the first block, text after `//`. */
  headerComments?: string[];
  /** `//` comments inside `plein` after the last block. */
  footerComments?: string[];
  /** `//` comments after the closing document brace. */
  trailingComments?: string[];
  /** Comments immediately above `model` blocks, in source order. */
  modelComments?: string[];
  /** Comments after the last model statement, before `model`'s closing brace. */
  modelTrailingComments?: string[];
  /** Comments immediately above `views` blocks, in source order. */
  viewsComments?: string[];
  /** Comments after the last view, before `views`' closing brace. */
  viewsTrailingComments?: string[];
  /** Ignored `styles` blocks, preserved so `plein format` can reprint them. */
  styles?: StyleBlock[];
};

export type TokenKind = "ident" | "string" | "number" | "{" | "}" | "->" | ":" | "comment" | "other" | "eof";

export type PleinToken = {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
  /** Index of this token in the source. Used to slice an ignored `styles` body. */
  offset: number;
};

const IDENT_START = /[A-Za-z_*]/;
const IDENT_PART = /[A-Za-z0-9_-]/;
const VIEW_CLAUSES = new Set([
  "include",
  "exclude",
  "title",
  "autoLayout",
  "position",
  "size",
  "nesting",
  "view",
  "viewpoint",
]);
/** Disables automatic layout for this view. `manual` is an alias of `off`. */
const AUTO_LAYOUT_OFF = new Set(["off", "manual"]);
const NESTING_MODES = new Set(["nested", "inside", "beside", "sideBySide", "side-by-side", "side_by_side"]);
const LAYOUT_MODE_TOKENS = new Set(["layers", "layer", "layered", "organic", "grid"]);
const LAYOUT_GRID_ORDER_TOKENS = new Set(["kind", "name"]);
const LAYOUT_ROUTING_TOKENS = new Set([
  "orthogonal",
  "ortho",
  "right-angle",
  "rightAngle",
  "right_angle",
  "polyline",
  "poly-line",
  "polyLine",
]);
const LAYOUT_DIRECTION_TOKENS = new Set([
  "tb",
  "bt",
  "lr",
  "rl",
  "left-right",
  "leftRight",
  "left_right",
  "horizontal",
  "right-left",
  "rightLeft",
  "right_left",
  "top-bottom",
  "topBottom",
  "top_bottom",
  "vertical",
  "bottom-top",
  "bottomTop",
  "bottom_top",
]);
/**
 * Identifiers that would swallow a model or view clause if used as a
 * specialization name. Relationship verbs are rejected separately.
 */
const RESERVED_SPECIALIZATION_NAMES = new Set([
  "plein",
  "model",
  "views",
  "styles",
  "view",
  "viewpoint",
  "include",
  "exclude",
  "title",
  "autoLayout",
  "position",
  "size",
  "nesting",
  "as",
  "of",
  "profile",
  "organization",
  "hook",
  "links",
  "notes",
  "accessType",
  "modifier",
  "multiplicity",
]);

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function tokenize(source: string, file: string): PleinToken[] {
  const tokens: PleinToken[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const advance = (): string => {
    const ch = source[i] ?? "";
    i += 1;
    if (ch === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return ch;
  };

  const push = (kind: TokenKind, value: string, startLine: number, startColumn: number, offset: number): void => {
    tokens.push({ kind, value, line: startLine, column: startColumn, offset });
  };

  while (i < source.length) {
    const ch = source[i] ?? "";
    const startLine = line;
    const startColumn = column;
    const startOffset = i;

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      advance();
      advance();
      let text = "";
      while (i < source.length && source[i] !== "\n") {
        text += advance();
      }
      push("comment", text.trim(), startLine, startColumn, startOffset);
      continue;
    }

    if (ch === "{") {
      advance();
      push("{", "{", startLine, startColumn, startOffset);
      continue;
    }

    if (ch === "}") {
      advance();
      push("}", "}", startLine, startColumn, startOffset);
      continue;
    }

    if (ch === ":") {
      advance();
      push(":", ":", startLine, startColumn, startOffset);
      continue;
    }

    if (ch === "-" && source[i + 1] === ">") {
      advance();
      advance();
      push("->", "->", startLine, startColumn, startOffset);
      continue;
    }

    if ((ch >= "0" && ch <= "9") || (ch === "-" && isDigit(source[i + 1] ?? ""))) {
      let value = advance();
      while (i < source.length && isDigit(source[i] ?? "")) {
        value += advance();
      }
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        value += advance();
        while (i < source.length && isDigit(source[i] ?? "")) {
          value += advance();
        }
      }
      push("number", value, startLine, startColumn, startOffset);
      continue;
    }

    if (ch === '"') {
      advance();
      let value = "";
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\n") {
          throw new ParseError("unterminated string", file, startLine, startColumn);
        }
        value += advance();
      }
      if (source[i] !== '"') {
        throw new ParseError("unterminated string", file, startLine, startColumn);
      }
      advance();
      push("string", value, startLine, startColumn, startOffset);
      continue;
    }

    if (IDENT_START.test(ch)) {
      let value = advance();
      while (i < source.length) {
        const next = source[i] ?? "";
        if (next === "-" && source[i + 1] === ">") {
          break;
        }
        if (!IDENT_PART.test(next)) {
          break;
        }
        value += advance();
      }
      push("ident", value, startLine, startColumn, startOffset);
      continue;
    }

    // Styles (and include-list commas) may contain punctuation we do not treat as syntax.
    advance();
    push("other", ch, startLine, startColumn, startOffset);
  }

  tokens.push({ kind: "eof", value: "", line, column, offset: i });
  return tokens;
}

/** Lexer tokens, including source offsets, for a surgical rewrite of a `.plein` file. */
export function lexPlein(source: string, file = "input.plein"): PleinToken[] {
  return tokenize(source, file);
}

class Parser {
  private readonly tokens: PleinToken[];
  private readonly source: string;
  private readonly file: string;
  private index = 0;
  private nextOrder = 0;
  private readonly elements: ElementDecl[] = [];
  private readonly relationships: RelationshipDecl[] = [];
  private readonly views: ViewDecl[] = [];
  private readonly specializations: SpecializationDecl[] = [];
  private readonly specializationByName = new Map<string, SpecializationDecl>();
  private readonly profiles: ProfileDecl[] = [];
  private readonly profileByName = new Map<string, ProfileDecl>();
  /** Profile whose body is currently being parsed, if any. */
  private currentProfile: string | undefined;
  private headerComments: string[] = [];
  private footerComments: string[] = [];
  private trailingComments: string[] = [];
  private modelComments: string[] = [];
  private modelTrailingComments: string[] = [];
  private viewsComments: string[] = [];
  private viewsTrailingComments: string[] = [];
  private readonly styles: StyleBlock[] = [];

  constructor(source: string, file: string) {
    this.source = source;
    this.file = file;
    this.tokens = tokenize(source, file);
  }

  parse(): PleinModel {
    this.headerComments = this.drainComments();
    if (this.checkIdent("plein")) {
      this.advance();
      this.expect("{", "expected '{' after plein");
      this.parseTopLevelBlocks();
      this.footerComments.push(...this.drainComments());
      this.expect("}", "expected '}' to close plein");
    } else {
      this.parseTopLevelBlocks();
    }
    this.trailingComments = this.drainComments();
    this.expect("eof", "unexpected input after document");
    return {
      elements: this.elements,
      relationships: this.relationships,
      views: this.views,
      specializations: this.specializations,
      profiles: this.profiles,
      ...(this.headerComments.length > 0 ? { headerComments: this.headerComments } : {}),
      ...(this.footerComments.length > 0 ? { footerComments: this.footerComments } : {}),
      ...(this.trailingComments.length > 0 ? { trailingComments: this.trailingComments } : {}),
      ...(this.modelComments.length > 0 ? { modelComments: this.modelComments } : {}),
      ...(this.modelTrailingComments.length > 0
        ? { modelTrailingComments: this.modelTrailingComments }
        : {}),
      ...(this.viewsComments.length > 0 ? { viewsComments: this.viewsComments } : {}),
      ...(this.viewsTrailingComments.length > 0
        ? { viewsTrailingComments: this.viewsTrailingComments }
        : {}),
      ...(this.styles.length > 0 ? { styles: this.styles } : {}),
    };
  }

  private parseTopLevelBlocks(): void {
    while (!this.check("}") && !this.check("eof")) {
      const comments = this.drainComments();
      if (this.check("}") || this.check("eof")) {
        this.footerComments.push(...comments);
        break;
      }
      if (this.checkIdent("model")) {
        this.modelComments.push(...comments);
        this.parseModel();
        continue;
      }
      if (this.checkIdent("views")) {
        this.viewsComments.push(...comments);
        this.parseViews();
        continue;
      }
      if (this.checkIdent("styles")) {
        this.captureStyles(comments);
        continue;
      }
      const token = this.peek();
      throw new ParseError(
        `unexpected '${token.value || token.kind}' (expected model, views, or styles)`,
        this.file,
        token.line,
        token.column,
      );
    }
  }

  private parseModel(): void {
    this.advance();
    this.expect("{", "expected '{' after model");
    while (!this.check("}") && !this.check("eof")) {
      const comments = this.drainComments();
      if (this.check("}") || this.check("eof")) {
        this.modelTrailingComments.push(...comments);
        break;
      }
      this.parseModelStatement(comments);
    }
    this.expect("}", "expected '}' to close model");
  }

  private parseModelStatement(comments: string[]): void {
    const first = this.expect("ident", "expected element keyword or relationship source");
    if (isValueStreamStageKeyword(first.value)) {
      throw new ParseError(
        "valueStreamStage must be nested inside a valueStream",
        this.file,
        first.line,
        first.column,
      );
    }
    if (first.value === "specialization" && this.isSpecializationDeclaration()) {
      this.parseSpecialization(first, comments);
      return;
    }
    if (this.isProfileKeyword(first.value) && this.isProfileDeclaration()) {
      this.parseProfile(first, comments);
      return;
    }
    this.parseElementOrRelationship(first, { valueStreamBody: false }, comments);
  }

  private isProfileKeyword(value: string): boolean {
    return value === "profile" || value === "organization";
  }

  /**
   * `profile <name> { ... }` (alias `organization`) declares an org pack.
   * `profile -> target: type` and infix `profile serves target` stay relationships.
   */
  private isProfileDeclaration(): boolean {
    const name = this.peek();
    if (name.kind !== "ident") {
      return false;
    }
    return this.tokens[this.index + 1]?.kind === "{";
  }

  private parseProfile(start: PleinToken, comments: string[]): void {
    const name = this.expect("ident", "expected profile name");
    this.expect("{", "expected '{' after profile name");
    const decl = this.addProfile(start, name, comments);
    this.currentProfile = name.value;
    while (!this.check("}") && !this.check("eof")) {
      const hookComments = this.drainComments();
      if (this.check("}") || this.check("eof")) {
        if (hookComments.length > 0) {
          decl.trailingComments = [...(decl.trailingComments ?? []), ...hookComments];
        }
        break;
      }
      const first = this.expect("ident", "expected specialization in profile");
      if (first.value === "specialization" && this.isSpecializationDeclaration()) {
        this.parseSpecialization(first, hookComments);
        continue;
      }
      throw new ParseError(
        `profile '${name.value}' may only declare specializations`,
        this.file,
        first.line,
        first.column,
      );
    }
    this.expect("}", `expected '}' to close profile '${name.value}'`);
    this.currentProfile = undefined;
  }

  private addProfile(start: PleinToken, name: PleinToken, comments: string[]): ProfileDecl {
    if (resolveElementKeyword(name.value) !== undefined || isValueStreamStageKeyword(name.value)) {
      throw new ParseError(
        `profile '${name.value}' collides with catalogue keyword '${name.value}'`,
        this.file,
        name.line,
        name.column,
      );
    }
    if (
      resolveRelationshipKeyword(name.value) !== undefined ||
      RESERVED_SPECIALIZATION_NAMES.has(name.value)
    ) {
      throw new ParseError(
        `profile name '${name.value}' is reserved`,
        this.file,
        name.line,
        name.column,
      );
    }
    if (this.profileByName.has(name.value)) {
      throw new ParseError(
        `duplicate profile '${name.value}'`,
        this.file,
        name.line,
        name.column,
      );
    }
    if (this.specializationByName.has(name.value)) {
      throw new ParseError(
        `profile '${name.value}' collides with specialization '${name.value}'`,
        this.file,
        name.line,
        name.column,
      );
    }
    const decl: ProfileDecl = {
      name: name.value,
      line: start.line,
      order: this.nextOrder++,
      ...(comments.length > 0 ? { leadingComments: comments } : {}),
    };
    this.profiles.push(decl);
    this.profileByName.set(name.value, decl);
    return decl;
  }

  /**
   * `specialization <name> specializes <parent>` declares a concept.
   * `specialization -> target: type` and infix `specialization serves target`
   * stay relationships: the verb is the immediate next token.
   */
  private isSpecializationDeclaration(): boolean {
    if (this.check("->") || this.check("string") || this.check("}") || this.check("eof")) {
      return false;
    }
    const name = this.peek();
    if (name.kind !== "ident") {
      return false;
    }
    if (resolveRelationshipKeyword(name.value) !== undefined) {
      return false;
    }
    return true;
  }

  private parseSpecialization(start: PleinToken, comments: string[]): void {
    const name = this.expect("ident", "expected specialization name");
    const verb = this.expect("ident", "expected 'specializes' after specialization name");
    if (resolveRelationshipKeyword(verb.value) !== "specializes") {
      throw new ParseError(
        `expected 'specializes' after specialization name (got '${verb.value}')`,
        this.file,
        verb.line,
        verb.column,
      );
    }
    const parentPleinToken = this.expect("ident", "expected catalogue type after specializes");
    const catalogue = resolveElementKeyword(parentPleinToken.value);
    const parentDecl = this.specializationByName.get(parentPleinToken.value);
    if (!catalogue && !parentDecl) {
      throw new ParseError(
        `specialization '${name.value}' specializes unknown keyword '${parentPleinToken.value}'`,
        this.file,
        parentPleinToken.line,
        parentPleinToken.column,
      );
    }
    this.addSpecialization(start, name, parentPleinToken.value, catalogue ?? parentDecl!.keyword, comments);
  }

  private addSpecialization(
    start: PleinToken,
    name: PleinToken,
    parent: string,
    keyword: ElementKeyword,
    comments: string[],
  ): void {
    if (resolveElementKeyword(name.value) !== undefined || isValueStreamStageKeyword(name.value)) {
      throw new ParseError(
        `specialization '${name.value}' collides with catalogue keyword '${name.value}'`,
        this.file,
        name.line,
        name.column,
      );
    }
    if (
      resolveRelationshipKeyword(name.value) !== undefined ||
      RESERVED_SPECIALIZATION_NAMES.has(name.value)
    ) {
      throw new ParseError(
        `specialization name '${name.value}' is reserved`,
        this.file,
        name.line,
        name.column,
      );
    }
    if (this.specializationByName.has(name.value)) {
      throw new ParseError(
        `duplicate specialization '${name.value}'`,
        this.file,
        name.line,
        name.column,
      );
    }
    if (this.profileByName.has(name.value)) {
      throw new ParseError(
        `specialization '${name.value}' collides with profile '${name.value}'`,
        this.file,
        name.line,
        name.column,
      );
    }
    const decl: SpecializationDecl = {
      name: name.value,
      parent,
      keyword,
      line: start.line,
      order: this.nextOrder++,
      ...(comments.length > 0 ? { leadingComments: comments } : {}),
    };
    if (this.currentProfile) {
      decl.profile = this.currentProfile;
    }
    this.specializations.push(decl);
    this.specializationByName.set(name.value, decl);
  }

  private parseElementOrRelationship(
    first: PleinToken,
    options: { valueStreamBody: boolean; parentId?: string },
    comments: string[],
  ): void {
    const elementKeyword = resolveElementKeyword(first.value);
    const specialization = options.valueStreamBody
      ? undefined
      : this.specializationByName.get(first.value);

    if (this.check("string")) {
      if (
        !options.valueStreamBody &&
        this.isProfileKeyword(first.value) &&
        !specialization
      ) {
        throw new ParseError(
          "expected profile name and '{' after profile",
          this.file,
          first.line,
          first.column,
        );
      }
      if (options.valueStreamBody && !isValueStreamStageKeyword(first.value)) {
        throw new ParseError(
          `unknown step keyword '${first.value}'`,
          this.file,
          first.line,
          first.column,
        );
      }
      if (!options.valueStreamBody && !elementKeyword && !specialization) {
        throw new ParseError(
          `unknown keyword '${first.value}' (undeclared specialization)`,
          this.file,
          first.line,
          first.column,
        );
      }
      const label = this.advance().value;
      if (!this.checkIdent("as")) {
        const token = this.peek();
        throw new ParseError("expected 'as <identifier>' after element label", this.file, token.line, token.column);
      }
      this.advance();
      const id = this.expect("ident", "expected identifier after 'as'");
      if (options.valueStreamBody && this.check("{")) {
        throw new ParseError(
          "valueStreamStage cannot nest a body",
          this.file,
          this.peek().line,
          this.peek().column,
        );
      }
      const hookName = this.takeProfileHook();
      const linksView = this.takeViewLink();
      const notesText = this.takeElementNotes();
      if (options.valueStreamBody && this.check("{")) {
        throw new ParseError(
          "valueStreamStage cannot nest a body",
          this.file,
          this.peek().line,
          this.peek().column,
        );
      }
      const keyword = options.valueStreamBody
        ? "valueStream"
        : (specialization?.keyword ?? elementKeyword!);
      const element: ElementDecl = {
        keyword,
        label,
        id: id.value,
        line: first.line,
        order: this.nextOrder++,
        ...(comments.length > 0 ? { leadingComments: comments } : {}),
        ...(options.valueStreamBody && options.parentId ? { container: options.parentId } : {}),
        ...(linksView ? { linksView: linksView.value } : {}),
        ...(notesText ? { notes: notesText } : {}),
      };
      if (hookName && specialization) {
        throw new ParseError(
          `hook cannot be combined with specialization keyword '${specialization.name}'`,
          this.file,
          hookName.line,
          hookName.column,
        );
      }
      if (specialization) {
        element.specialization = specialization.name;
        if (specialization.profile) {
          element.profile = specialization.profile;
        }
      }
      if (hookName) {
        this.applyProfileHook(element, hookName);
        element.viaHook = true;
      }
      this.elements.push(element);
      if (options.valueStreamBody && options.parentId) {
        this.relationships.push({
          type: "composedOf",
          source: options.parentId,
          target: id.value,
          line: first.line,
          column: first.column,
          synthetic: true,
          order: this.nextOrder++,
        });
      }
      if (!options.valueStreamBody && keyword === "valueStream" && this.check("{")) {
        this.parseValueStreamBody(id.value);
      }
      return;
    }

    if (options.valueStreamBody && isValueStreamStageKeyword(first.value)) {
      throw new ParseError(
        `expected '"label" as <identifier>' after ${first.value}`,
        this.file,
        first.line,
        first.column,
      );
    }

    if (this.check("->")) {
      this.advance();
      const target = this.expect("ident", "expected relationship target");
      this.expect(":", "expected ':' before relationship type");
      const typePleinToken = this.expect("ident", "expected relationship type");
      const type = resolveRelationshipKeyword(typePleinToken.value);
      if (!type) {
        throw new ParseError(
          `unknown relationship type '${typePleinToken.value}'`,
          this.file,
          typePleinToken.line,
          typePleinToken.column,
        );
      }
      this.pushRelationship(first, target, type, typePleinToken, options, comments);
      return;
    }

    if (this.check("ident") && isRelationshipKeyword(this.peek().value)) {
      const typePleinToken = this.advance();
      const type = resolveRelationshipKeyword(typePleinToken.value);
      if (!type) {
        throw new ParseError("unknown relationship type", this.file, first.line, first.column);
      }
      const target = this.expect("ident", "expected relationship target");
      this.pushRelationship(first, target, type, typePleinToken, options, comments);
      return;
    }

    if (options.valueStreamBody) {
      throw new ParseError(
        `expected valueStreamStage, '->', or flowsTo/triggers after '${first.value}'`,
        this.file,
        first.line,
        first.column,
      );
    }

    if (elementKeyword) {
      throw new ParseError(
        `expected '"label" as <identifier>' after ${first.value}`,
        this.file,
        first.line,
        first.column,
      );
    }

    if (this.isProfileKeyword(first.value) && this.check("ident")) {
      const name = this.peek();
      throw new ParseError(
        "expected '{' after profile name",
        this.file,
        name.line,
        name.column,
      );
    }

    if (first.value === "hook") {
      throw new ParseError(
        "profile hook must follow the element id ('as <id> hook <name>')",
        this.file,
        first.line,
        first.column,
      );
    }

    throw new ParseError(
      `expected '->' or a typed relationship after '${first.value}'`,
      this.file,
      first.line,
      first.column,
    );
  }

  /**
   * `links view <name>` after the element id (and optional hook).
   * `links` is the clause only when the next identifier is `view`.
   * A relationship whose source identifier is `links` is left alone.
   */
  private takeViewLink(): PleinToken | undefined {
    if (!this.checkIdent("links")) {
      return undefined;
    }
    const next = this.tokens[this.index + 1];
    if (!next || next.kind !== "ident" || next.value !== "view") {
      return undefined;
    }
    this.advance();
    this.advance();
    return this.expect("ident", "expected view name after 'links view'");
  }

  /**
   * `notes "<text>"` after the element id, optional hook, and optional view link.
   * `notes` starts the clause only when the next token is a string, so a
   * relationship whose source identifier is `notes` is left alone.
   * An empty string is the same as omitting the clause.
   */
  private takeElementNotes(): string | undefined {
    if (!this.checkIdent("notes")) {
      return undefined;
    }
    const next = this.tokens[this.index + 1];
    if (next?.kind === "->" || (next?.kind === "ident" && isRelationshipKeyword(next.value))) {
      return undefined;
    }
    if (!next || next.kind !== "string") {
      const token = this.peek();
      throw new ParseError("expected a string after 'notes'", this.file, token.line, token.column);
    }
    this.advance();
    const text = this.advance().value;
    if (this.checkIdent("notes")) {
      const again = this.tokens[this.index + 1];
      if (again?.kind === "string") {
        const token = this.peek();
        throw new ParseError("duplicate notes clause", this.file, token.line, token.column);
      }
    }
    if (this.checkIdent("hook")) {
      const token = this.peek();
      throw new ParseError("'hook' must come before 'notes'", this.file, token.line, token.column);
    }
    if (this.checkIdent("links")) {
      const after = this.tokens[this.index + 1];
      if (after?.kind === "ident" && after.value === "view") {
        const token = this.peek();
        throw new ParseError("'links view' must come before 'notes'", this.file, token.line, token.column);
      }
    }
    return text.length > 0 ? text : undefined;
  }

  /** `hook <name>` after an element id. The name token is the hook. */
  private takeProfileHook(): PleinToken | undefined {
    if (!this.checkIdent("hook")) {
      return undefined;
    }
    this.advance();
    return this.expect("ident", "expected profile hook name after 'hook'");
  }

  private applyProfileHook(element: ElementDecl, hookName: PleinToken): void {
    const decl = this.specializationByName.get(hookName.value);
    if (!decl) {
      throw new ParseError(
        `undeclared profile hook '${hookName.value}'`,
        this.file,
        hookName.line,
        hookName.column,
      );
    }
    if (!decl.profile) {
      throw new ParseError(
        `specialization '${hookName.value}' is not a profile hook`,
        this.file,
        hookName.line,
        hookName.column,
      );
    }
    if (decl.keyword !== element.keyword) {
      throw new ParseError(
        `profile hook '${hookName.value}' specializes '${toKebabCaseKeyword(decl.keyword)}', not '${toKebabCaseKeyword(element.keyword)}'`,
        this.file,
        hookName.line,
        hookName.column,
      );
    }
    element.specialization = decl.name;
    element.profile = decl.profile;
  }

  private parseValueStreamBody(parentId: string): void {
    this.expect("{", "expected '{' after valueStream");
    const parent = this.elements[this.elements.length - 1];
    while (!this.check("}") && !this.check("eof")) {
      const comments = this.drainComments();
      if (this.check("}") || this.check("eof")) {
        if (comments.length > 0 && parent && parent.id === parentId) {
          parent.trailingComments = [...(parent.trailingComments ?? []), ...comments];
        }
        break;
      }
      const first = this.expect("ident", "expected valueStreamStage or relationship source");
      if (first.value === "specialization" && this.isSpecializationDeclaration()) {
        throw new ParseError(
          "specialization declarations belong in the model, not inside a valueStream",
          this.file,
          first.line,
          first.column,
        );
      }
      if (this.isProfileKeyword(first.value) && this.isProfileDeclaration()) {
        throw new ParseError(
          "profile declarations belong in the model, not inside a valueStream",
          this.file,
          first.line,
          first.column,
        );
      }
      this.parseElementOrRelationship(first, { valueStreamBody: true, parentId }, comments);
    }
    this.expect("}", "expected '}' to close valueStream");
  }

  private pushRelationship(
    source: PleinToken,
    target: PleinToken,
    type: RelationshipKeyword,
    typePleinToken: PleinToken,
    options: { valueStreamBody: boolean; parentId?: string },
    comments: string[],
  ): void {
    const modifiers = this.takeRelationshipModifiers(type);
    if (options.valueStreamBody && !isValueStreamStageLink(type)) {
      throw new ParseError(
        `value stream stages may only use flowsTo or triggers (got '${type}')`,
        this.file,
        typePleinToken.line,
        typePleinToken.column,
      );
    }
    this.relationships.push({
      type,
      source: source.value,
      target: target.value,
      line: source.line,
      column: source.column,
      order: this.nextOrder++,
      ...(options.valueStreamBody && options.parentId ? { container: options.parentId } : {}),
      ...(comments.length > 0 ? { leadingComments: comments } : {}),
      ...(modifiers.accessType !== undefined ? { accessType: modifiers.accessType } : {}),
      ...(modifiers.modifier !== undefined ? { modifier: modifiers.modifier } : {}),
      ...(modifiers.multiplicity !== undefined ? { multiplicity: modifiers.multiplicity } : {}),
    });
  }

  /**
   * Optional `accessType`, `modifier`, or `multiplicity` clause after the type.
   * `accessType` is the clause only when the next token is an identifier that
   * is not a relationship spelling, so `accessType -> order: access` stays a
   * source. `modifier` and `multiplicity` are clauses only when the next token
   * is a value and a string is not followed by `as`, so `modifier "Label" as id`
   * stays an element.
   */
  private takeRelationshipModifiers(type: RelationshipKeyword): {
    accessType?: string;
    modifier?: string;
    multiplicity?: string;
  } {
    const accessType = this.takeAccessTypeClause(type);
    const modifier = this.takeInfluenceModifierClause(type);
    const multiplicity = this.takeMultiplicityClause();
    if (accessType !== undefined && this.startsAccessTypeClause()) {
      const token = this.peek();
      throw new ParseError("duplicate accessType clause", this.file, token.line, token.column);
    }
    if (modifier !== undefined && this.startsInfluenceModifierClause()) {
      const token = this.peek();
      throw new ParseError("duplicate modifier clause", this.file, token.line, token.column);
    }
    if (multiplicity !== undefined && this.startsMultiplicityClause()) {
      const token = this.peek();
      throw new ParseError("duplicate multiplicity clause", this.file, token.line, token.column);
    }
    return {
      ...(accessType !== undefined ? { accessType } : {}),
      ...(modifier !== undefined ? { modifier } : {}),
      ...(multiplicity !== undefined ? { multiplicity } : {}),
    };
  }

  private startsAccessTypeClause(): boolean {
    if (!this.checkIdent("accessType")) {
      return false;
    }
    const next = this.tokens[this.index + 1];
    if (!next || next.kind !== "ident") {
      return false;
    }
    return !isRelationshipKeyword(next.value);
  }

  private takeAccessTypeClause(type: RelationshipKeyword): string | undefined {
    if (!this.checkIdent("accessType")) {
      return undefined;
    }
    const next = this.tokens[this.index + 1];
    if (next?.kind === "->" || (next?.kind === "ident" && isRelationshipKeyword(next.value))) {
      return undefined;
    }
    const token = this.peek();
    if (type !== "accesses") {
      throw new ParseError(
        "accessType is only valid on an access relationship",
        this.file,
        token.line,
        token.column,
      );
    }
    this.advance();
    const value = this.expect("ident", "expected access type after 'accessType'");
    return value.value;
  }

  private startsInfluenceModifierClause(): boolean {
    if (!this.checkIdent("modifier")) {
      return false;
    }
    const next = this.tokens[this.index + 1];
    if (!next || next.kind === "->" || (next.kind === "ident" && isRelationshipKeyword(next.value))) {
      return false;
    }
    if (next.kind === "string") {
      const after = this.tokens[this.index + 2];
      return !(after?.kind === "ident" && after.value === "as");
    }
    if (next.kind === "number") {
      return true;
    }
    return next.kind === "other" && (next.value === "+" || next.value === "-");
  }

  private takeInfluenceModifierClause(type: RelationshipKeyword): string | undefined {
    if (!this.startsInfluenceModifierClause()) {
      return undefined;
    }
    const token = this.peek();
    if (type !== "influences") {
      throw new ParseError(
        "modifier is only valid on an influence relationship",
        this.file,
        token.line,
        token.column,
      );
    }
    this.advance();
    return this.readInfluenceStrength();
  }

  /** A quoted strength, an integer token, or a run of `+` or `-`. */
  private readInfluenceStrength(): string {
    const token = this.peek();
    if (token.kind === "string" || token.kind === "number") {
      this.advance();
      return token.value;
    }
    if (token.kind === "other" && (token.value === "+" || token.value === "-")) {
      const sign = token.value;
      let value = "";
      while (this.peek().kind === "other" && this.peek().value === sign) {
        value += this.advance().value;
      }
      return value;
    }
    throw new ParseError(
      "expected an influence modifier after 'modifier'",
      this.file,
      token.line,
      token.column,
    );
  }

  /**
   * `multiplicity` is a clause when a value follows it.
   * `multiplicity -> clerk: association` stays a relationship source.
   * `multiplicity "Label" as id` stays an element.
   */
  private startsMultiplicityClause(): boolean {
    if (!this.checkIdent("multiplicity")) {
      return false;
    }
    const next = this.tokens[this.index + 1];
    if (!next || next.kind === "->" || (next.kind === "ident" && isRelationshipKeyword(next.value))) {
      return false;
    }
    if (next.kind === "string") {
      const after = this.tokens[this.index + 2];
      return !(after?.kind === "ident" && after.value === "as");
    }
    return true;
  }

  private takeMultiplicityClause(): string | undefined {
    if (!this.startsMultiplicityClause()) {
      return undefined;
    }
    this.advance();
    return this.readMultiplicity();
  }

  /** A quoted value, a number, `*`, or `bound..bound`. Check accepts the value set. */
  private readMultiplicity(): string {
    const token = this.peek();
    if (token.kind === "string") {
      this.advance();
      return token.value;
    }
    if (token.kind === "number" || (token.kind === "ident" && token.value === "*")) {
      this.advance();
      return this.finishMultiplicity(token.value);
    }
    throw new ParseError(
      "expected a multiplicity after 'multiplicity'",
      this.file,
      token.line,
      token.column,
    );
  }

  /** Append `..` and an upper bound when those tokens are present. */
  private finishMultiplicity(lower: string): string {
    const dot = this.peek();
    const second = this.tokens[this.index + 1];
    if (!(dot.kind === "other" && dot.value === "." && second?.kind === "other" && second.value === ".")) {
      return lower;
    }
    const upper = this.tokens[this.index + 2];
    if (!upper || (upper.kind !== "number" && !(upper.kind === "ident" && upper.value === "*"))) {
      throw new ParseError(
        "expected a number or '*' after '..' in a multiplicity",
        this.file,
        second.line,
        second.column,
      );
    }
    this.advance();
    this.advance();
    this.advance();
    return `${lower}..${upper.value}`;
  }

  private parseViews(): void {
    this.advance();
    this.expect("{", "expected '{' after views");
    while (!this.check("}") && !this.check("eof")) {
      const comments = this.drainComments();
      if (this.check("}") || this.check("eof")) {
        this.viewsTrailingComments.push(...comments);
        break;
      }
      if (this.checkIdent("view")) {
        this.parseNamedView(comments);
        continue;
      }
      if (this.checkIdent("viewpoint")) {
        this.parseViewpoint(comments);
        continue;
      }
      const token = this.peek();
      throw new ParseError(
        `unexpected '${token.value || token.kind}' in views (expected view or viewpoint)`,
        this.file,
        token.line,
        token.column,
      );
    }
    this.expect("}", "expected '}' to close views");
  }

  private parseNamedView(comments: string[]): void {
    const start = this.advance();
    const name = this.expect("ident", "expected view name");
    this.expect("{", "expected '{' after view name");
    const view = this.parseViewBody({
      name: name.value,
      includes: [],
      excludes: [],
      positions: [],
      sizes: [],
      line: start.line,
      order: this.nextOrder++,
      ...(comments.length > 0 ? { leadingComments: comments } : {}),
    });
    this.views.push(view);
  }

  private parseViewpoint(comments: string[]): void {
    const start = this.advance();
    const viewpoint = this.expect("ident", "expected viewpoint keyword");
    let title: string | undefined;
    if (this.check("string")) {
      title = this.advance().value;
    }
    this.expect("{", "expected '{' after viewpoint");
    const view = this.parseViewBody({
      name: viewpoint.value,
      viewpoint: viewpoint.value,
      title,
      includes: [],
      excludes: [],
      positions: [],
      sizes: [],
      line: start.line,
      order: this.nextOrder++,
      ...(comments.length > 0 ? { leadingComments: comments } : {}),
    });
    this.views.push(view);
  }

  private parseViewBody(view: ViewDecl): ViewDecl {
    const positions = view.positions ?? [];
    view.positions = positions;
    const sizes = view.sizes ?? [];
    view.sizes = sizes;
    while (!this.check("}") && !this.check("eof")) {
      const comments = this.drainComments();
      if (this.check("}") || this.check("eof")) {
        if (comments.length > 0) {
          view.trailingComments = [...(view.trailingComments ?? []), ...comments];
        }
        break;
      }
      if (this.checkIdent("include")) {
        const clause = this.advance();
        const inline: string[] = [];
        view.includes.push(...this.parseSelectorList("include", clause, inline));
        this.attachClauseComments(view, "includeComments", [...comments, ...inline]);
        continue;
      }
      if (this.checkIdent("exclude")) {
        const clause = this.advance();
        const inline: string[] = [];
        view.excludes.push(...this.parseSelectorList("exclude", clause, inline));
        this.attachClauseComments(view, "excludeComments", [...comments, ...inline]);
        continue;
      }
      if (this.checkIdent("title")) {
        this.advance();
        const title = this.expect("string", "expected quoted title after title");
        view.title = title.value;
        this.attachClauseComments(view, "titleComments", comments);
        continue;
      }
      if (this.checkIdent("autoLayout")) {
        this.advance();
        const tokens: PleinToken[] = [];
        while (this.check("ident") && !this.isViewClauseStart()) {
          tokens.push(this.advance());
        }
        view.autoLayout = this.parseAutoLayoutPleinTokens(tokens);
        this.attachClauseComments(view, "autoLayoutComments", comments);
        continue;
      }
      if (this.checkIdent("position")) {
        const start = this.advance();
        const id = this.expect("ident", "expected element id after position");
        const x = this.expectCoordinate("expected x coordinate after position");
        const y = this.expectCoordinate("expected y coordinate after position");
        if (positions.some((position) => position.id === id.value)) {
          throw new ParseError(
            `duplicate position for '${id.value}'`,
            this.file,
            id.line,
            id.column,
          );
        }
        positions.push({
          id: id.value,
          x,
          y,
          line: start.line,
          ...(comments.length > 0 ? { leadingComments: comments } : {}),
        });
        continue;
      }
      if (this.checkIdent("size")) {
        const start = this.advance();
        const id = this.expect("ident", "expected element id after size");
        const width = this.expectCoordinate("expected width after size");
        const height = this.expectCoordinate("expected height after size");
        if (!(width > 0) || !(height > 0)) {
          throw new ParseError(
            "size width and height must be positive",
            this.file,
            start.line,
            start.column,
          );
        }
        if (sizes.some((size) => size.id === id.value)) {
          throw new ParseError(
            `duplicate size for '${id.value}'`,
            this.file,
            id.line,
            id.column,
          );
        }
        sizes.push({
          id: id.value,
          width,
          height,
          line: start.line,
          ...(comments.length > 0 ? { leadingComments: comments } : {}),
        });
        continue;
      }
      if (this.checkIdent("nesting")) {
        this.advance();
        if (this.check("ident") && !this.isViewClauseStart()) {
          const mode = this.advance();
          if (!NESTING_MODES.has(mode.value)) {
            throw new ParseError(
              `unknown nesting mode '${mode.value}' (expected nested or beside)`,
              this.file,
              mode.line,
              mode.column,
            );
          }
          view.nesting = mode.value;
        } else {
          view.nesting = "nested";
        }
        this.attachClauseComments(view, "nestingComments", comments);
        continue;
      }
      const token = this.peek();
      throw new ParseError(
        `unexpected '${token.value || token.kind}' in view '${view.name}'`,
        this.file,
        token.line,
        token.column,
      );
    }
    this.expect("}", `expected '}' to close view '${view.name}'`);
    return view;
  }

  private attachClauseComments(
    view: ViewDecl,
    key: "includeComments" | "excludeComments" | "titleComments" | "autoLayoutComments" | "nestingComments",
    comments: string[],
  ): void {
    if (comments.length === 0) {
      return;
    }
    view[key] = [...(view[key] ?? []), ...comments];
  }

  private parseSelectorList(verb: string, start: PleinToken, inlineComments: string[]): string[] {
    const selectors: string[] = [];
    while (!this.check("}") && !this.check("eof") && !this.isViewClauseStart()) {
      if (this.check("comment")) {
        if (!this.commentContinuesList()) {
          break;
        }
        inlineComments.push(...this.drainComments());
        continue;
      }
      const token = this.peek();
      if (token.kind === "ident" || token.kind === "string") {
        selectors.push(this.advance().value);
        continue;
      }
      if (token.kind === "other" && token.value === ",") {
        this.advance();
        continue;
      }
      throw new ParseError(
        `unexpected '${token.value || token.kind}' in ${verb} list`,
        this.file,
        token.line,
        token.column,
      );
    }
    if (selectors.length === 0) {
      throw new ParseError(`expected selector after ${verb}`, this.file, start.line, start.column);
    }
    return selectors;
  }

  /** A comment inside an include/exclude list stays with that list when another selector follows. */
  private commentContinuesList(): boolean {
    let index = this.index;
    while (this.tokens[index]?.kind === "comment") {
      index += 1;
    }
    const token = this.tokens[index];
    if (!token) {
      return false;
    }
    if (token.kind === "ident" && VIEW_CLAUSES.has(token.value)) {
      return false;
    }
    if (token.kind === "ident" || token.kind === "string") {
      return true;
    }
    return token.kind === "other" && token.value === ",";
  }

  private isViewClauseStart(): boolean {
    const token = this.peek();
    return token.kind === "ident" && VIEW_CLAUSES.has(token.value);
  }

  /**
   * `autoLayout` tokens are a layout mode (`layered` / `layers` / `organic` /
   * `grid`), a direction (`tb|bt|lr|rl` and shorthand), an edge routing
   * (`orthogonal` / `polyline`), and — only with `grid` — an order
   * (`kind` / `name`), in any order. At most one of each.
   * Bare `autoLayout` remains `tb` (plain ELK Layered, top→bottom, orthogonal).
   * Omitting a mode stays `layered`; `organic` is not the default.
   * `off` or `manual` alone disables auto-layout and must not be combined
   * with a mode, direction, routing, or grid order.
   */
  private parseAutoLayoutPleinTokens(tokens: PleinToken[]): string {
    if (tokens.length === 0) {
      return "tb";
    }
    const disabled = tokens.find((token) => AUTO_LAYOUT_OFF.has(token.value));
    if (disabled) {
      if (tokens.length !== 1) {
        const other = tokens.find((token) => token !== disabled)!;
        throw new ParseError(
          `autoLayout ${disabled.value} cannot be combined with '${other.value}'`,
          this.file,
          other.line,
          other.column,
        );
      }
      return disabled.value;
    }
    if (tokens.length > 4) {
      const extra = tokens[4]!;
      throw new ParseError(
        `too many autoLayout tokens '${extra.value}' (expected a mode, a direction, orthogonal or polyline, and/or grid order kind or name)`,
        this.file,
        extra.line,
        extra.column,
      );
    }
    let mode: PleinToken | undefined;
    let direction: PleinToken | undefined;
    let routing: PleinToken | undefined;
    let gridOrder: PleinToken | undefined;
    for (const token of tokens) {
      if (LAYOUT_MODE_TOKENS.has(token.value)) {
        if (mode) {
          throw new ParseError(
            `duplicate autoLayout mode '${token.value}'`,
            this.file,
            token.line,
            token.column,
          );
        }
        mode = token;
        continue;
      }
      if (LAYOUT_DIRECTION_TOKENS.has(token.value)) {
        if (direction) {
          throw new ParseError(
            `duplicate autoLayout direction '${token.value}'`,
            this.file,
            token.line,
            token.column,
          );
        }
        direction = token;
        continue;
      }
      if (LAYOUT_ROUTING_TOKENS.has(token.value)) {
        if (routing) {
          throw new ParseError(
            `duplicate autoLayout routing '${token.value}'`,
            this.file,
            token.line,
            token.column,
          );
        }
        routing = token;
        continue;
      }
      if (LAYOUT_GRID_ORDER_TOKENS.has(token.value)) {
        if (gridOrder) {
          throw new ParseError(
            `duplicate autoLayout grid order '${token.value}'`,
            this.file,
            token.line,
            token.column,
          );
        }
        gridOrder = token;
        continue;
      }
      throw new ParseError(
        `unknown autoLayout token '${token.value}' (expected layered, layers, organic, grid, off, manual, a direction, orthogonal, polyline, or grid order kind/name)`,
        this.file,
        token.line,
        token.column,
      );
    }
    if (gridOrder && mode?.value !== "grid") {
      throw new ParseError(
        `grid order '${gridOrder.value}' requires autoLayout grid`,
        this.file,
        gridOrder.line,
        gridOrder.column,
      );
    }
    return tokens.map((token) => token.value).join(" ");
  }

  private captureStyles(comments: string[]): void {
    this.advance();
    const open = this.expect("{", "expected '{' to open ignored block");
    let depth = 1;
    let closeOffset = open.offset;
    while (depth > 0) {
      const token = this.peek();
      if (token.kind === "eof") {
        throw new ParseError("unterminated block", this.file, token.line, token.column);
      }
      if (token.kind === "{") {
        depth += 1;
      } else if (token.kind === "}") {
        depth -= 1;
        if (depth === 0) {
          closeOffset = token.offset;
        }
      }
      this.advance();
    }
    this.styles.push({
      body: this.source.slice(open.offset + 1, closeOffset),
      order: this.nextOrder++,
      ...(comments.length > 0 ? { leadingComments: comments } : {}),
    });
  }

  private drainComments(): string[] {
    const comments: string[] = [];
    while (this.check("comment")) {
      comments.push(this.advance().value);
    }
    return comments;
  }

  private peek(): PleinToken {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private checkIdent(value: string): boolean {
    const token = this.peek();
    return token.kind === "ident" && token.value === value;
  }

  private advance(): PleinToken {
    const token = this.peek();
    if (token.kind !== "eof") {
      this.index += 1;
    }
    return token;
  }

  private expectCoordinate(message: string): number {
    const token = this.peek();
    if (token.kind !== "number") {
      throw new ParseError(message, this.file, token.line, token.column);
    }
    this.advance();
    const value = Number(token.value);
    if (!Number.isFinite(value)) {
      throw new ParseError(message, this.file, token.line, token.column);
    }
    return value;
  }

  private expect(kind: TokenKind, message: string): PleinToken {
    const token = this.peek();
    if (token.kind !== kind) {
      throw new ParseError(message, this.file, token.line, token.column);
    }
    return this.advance();
  }
}

export function parsePlein(source: string, file = "input.plein"): PleinModel {
  return new Parser(source, file).parse();
}

export function checkPlein(source: string, file = "input.plein"): PleinModel {
  const model = parsePlein(source, file);
  const seen = new Map<string, ElementDecl>();

  for (const element of model.elements) {
    const existing = seen.get(element.id);
    if (existing) {
      throw new ParseError(
        `duplicate identifier '${element.id}'`,
        file,
        element.line,
        1,
      );
    }
    seen.set(element.id, element);
  }

  for (const rel of model.relationships) {
    if (!seen.has(rel.source)) {
      throw new ParseError(`unknown identifier '${rel.source}'`, file, rel.line, 1);
    }
    if (!seen.has(rel.target)) {
      throw new ParseError(`unknown identifier '${rel.target}'`, file, rel.line, 1);
    }
    if (rel.source === rel.target) {
      throw new ParseError(
        `relationship '${rel.type}' cannot target itself`,
        file,
        rel.line,
        1,
      );
    }
    const sourceElement = seen.get(rel.source)!;
    const targetElement = seen.get(rel.target)!;
    if (!isRelationshipAllowed(sourceElement.keyword, rel.type, targetElement.keyword)) {
      throw new ParseError(
        invalidRelationshipMessage(sourceElement.keyword, rel.type, targetElement.keyword),
        file,
        rel.line,
        rel.column,
      );
    }
    if (rel.accessType !== undefined && !ACCESS_TYPE_SET.has(rel.accessType)) {
      throw new ParseError(
        `unknown access type '${rel.accessType}' (expected Access, Read, Write, or ReadWrite)`,
        file,
        rel.line,
        rel.column,
      );
    }
    if (rel.modifier !== undefined && !INFLUENCE_MODIFIER_SET.has(rel.modifier)) {
      throw new ParseError(
        `unknown influence modifier '${rel.modifier}' (expected +, ++, -, --, or 0 through 10)`,
        file,
        rel.line,
        rel.column,
      );
    }
    if (rel.multiplicity !== undefined && !isRelationshipMultiplicity(rel.multiplicity)) {
      throw new ParseError(
        `unknown multiplicity '${rel.multiplicity}' (expected *, a whole number, or a range such as 0..1 or 1..*)`,
        file,
        rel.line,
        rel.column,
      );
    }
  }

  const specializationNames = new Set(model.specializations.map((item) => item.name));
  const viewNames = new Map<string, ViewDecl>();
  for (const view of model.views) {
    const existing = viewNames.get(view.name);
    if (existing) {
      throw new ParseError(`duplicate view name '${view.name}'`, file, view.line, 1);
    }
    viewNames.set(view.name, view);

    for (const selector of [...view.includes, ...view.excludes]) {
      if (!isResolvableViewSelector(selector, specializationNames)) {
        continue;
      }
      if (!seen.has(selector)) {
        throw new ParseError(
          `unknown identifier '${selector}' in view '${view.name}'`,
          file,
          view.line,
          1,
        );
      }
    }

    for (const position of view.positions ?? []) {
      if (!seen.has(position.id)) {
        throw new ParseError(
          `unknown identifier '${position.id}' in view '${view.name}'`,
          file,
          position.line,
          1,
        );
      }
    }
    for (const size of view.sizes ?? []) {
      if (!seen.has(size.id)) {
        throw new ParseError(
          `unknown identifier '${size.id}' in view '${view.name}'`,
          file,
          size.line,
          1,
        );
      }
    }
  }

  for (const element of model.elements) {
    if (!element.linksView) {
      continue;
    }
    if (!viewNames.has(element.linksView)) {
      throw new ParseError(
        `unknown view '${element.linksView}' linked from '${element.id}'`,
        file,
        element.line,
        1,
      );
    }
  }

  return model;
}

function isResolvableViewSelector(
  selector: string,
  specializations: ReadonlySet<string>,
): boolean {
  if (selector.includes("*") || selector.includes("->") || selector.startsWith("tag:")) {
    return false;
  }
  if (resolveElementKeyword(selector) !== undefined) {
    return false;
  }
  return !specializations.has(selector);
}
