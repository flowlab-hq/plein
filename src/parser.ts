import {
  isRelationshipKeyword,
  isValueStreamStageKeyword,
  isValueStreamStageLink,
  resolveElementKeyword,
  resolveRelationshipKeyword,
  type ElementKeyword,
  type RelationshipKeyword,
} from "./keywords.js";

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
};

export type RelationshipDecl = {
  type: RelationshipKeyword;
  source: string;
  target: string;
  line: number;
};

export type ViewDecl = {
  name: string;
  viewpoint?: string;
  title?: string;
  includes: string[];
  excludes: string[];
  autoLayout?: string;
  line: number;
};

export type PleinModel = {
  elements: ElementDecl[];
  relationships: RelationshipDecl[];
  views: ViewDecl[];
};

type TokenKind = "ident" | "string" | "{" | "}" | "->" | ":" | "other" | "eof";

type Token = {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
};

const IDENT_START = /[A-Za-z_*]/;
const IDENT_PART = /[A-Za-z0-9_-]/;
const VIEW_CLAUSES = new Set(["include", "exclude", "title", "autoLayout", "view", "viewpoint"]);

function tokenize(source: string, file: string): Token[] {
  const tokens: Token[] = [];
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

  while (i < source.length) {
    const ch = source[i] ?? "";
    const startLine = line;
    const startColumn = column;

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") {
        advance();
      }
      continue;
    }

    if (ch === "{") {
      advance();
      tokens.push({ kind: "{", value: "{", line: startLine, column: startColumn });
      continue;
    }

    if (ch === "}") {
      advance();
      tokens.push({ kind: "}", value: "}", line: startLine, column: startColumn });
      continue;
    }

    if (ch === ":") {
      advance();
      tokens.push({ kind: ":", value: ":", line: startLine, column: startColumn });
      continue;
    }

    if (ch === "-" && source[i + 1] === ">") {
      advance();
      advance();
      tokens.push({ kind: "->", value: "->", line: startLine, column: startColumn });
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
      tokens.push({ kind: "string", value, line: startLine, column: startColumn });
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
      tokens.push({ kind: "ident", value, line: startLine, column: startColumn });
      continue;
    }

    // Styles (and include-list commas) may contain punctuation we do not treat as syntax.
    advance();
    tokens.push({ kind: "other", value: ch, line: startLine, column: startColumn });
  }

  tokens.push({ kind: "eof", value: "", line, column });
  return tokens;
}

class Parser {
  private readonly tokens: Token[];
  private readonly file: string;
  private index = 0;
  private readonly elements: ElementDecl[] = [];
  private readonly relationships: RelationshipDecl[] = [];
  private readonly views: ViewDecl[] = [];

  constructor(source: string, file: string) {
    this.file = file;
    this.tokens = tokenize(source, file);
  }

  parse(): PleinModel {
    if (this.checkIdent("plein")) {
      this.advance();
      this.expect("{", "expected '{' after plein");
      this.parseTopLevelBlocks();
      this.expect("}", "expected '}' to close plein");
    } else {
      this.parseTopLevelBlocks();
    }
    this.expect("eof", "unexpected input after document");
    return {
      elements: this.elements,
      relationships: this.relationships,
      views: this.views,
    };
  }

  private parseTopLevelBlocks(): void {
    while (!this.check("}") && !this.check("eof")) {
      if (this.checkIdent("model")) {
        this.parseModel();
        continue;
      }
      if (this.checkIdent("views")) {
        this.parseViews();
        continue;
      }
      if (this.checkIdent("styles")) {
        this.advance();
        this.skipBlock();
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
      this.parseModelStatement();
    }
    this.expect("}", "expected '}' to close model");
  }

  private parseModelStatement(): void {
    const first = this.expect("ident", "expected element keyword or relationship source");
    if (isValueStreamStageKeyword(first.value)) {
      throw new ParseError(
        "valueStreamStage must be nested inside a valueStream",
        this.file,
        first.line,
        first.column,
      );
    }
    this.parseElementOrRelationship(first, { valueStreamBody: false });
  }

  private parseElementOrRelationship(
    first: Token,
    options: { valueStreamBody: boolean; parentId?: string },
  ): void {
    const elementKeyword = resolveElementKeyword(first.value);

    if (this.check("string")) {
      if (options.valueStreamBody && !isValueStreamStageKeyword(first.value)) {
        throw new ParseError(
          `unknown step keyword '${first.value}'`,
          this.file,
          first.line,
          first.column,
        );
      }
      if (!options.valueStreamBody && !elementKeyword) {
        throw new ParseError(
          `unknown keyword '${first.value}'`,
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
      this.elements.push({
        keyword: options.valueStreamBody ? "valueStream" : elementKeyword!,
        label,
        id: id.value,
        line: first.line,
      });
      if (options.valueStreamBody && options.parentId) {
        this.relationships.push({
          type: "composedOf",
          source: options.parentId,
          target: id.value,
          line: first.line,
        });
      }
      if (!options.valueStreamBody && elementKeyword === "valueStream" && this.check("{")) {
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
      const typeToken = this.expect("ident", "expected relationship type");
      const type = resolveRelationshipKeyword(typeToken.value);
      if (!type) {
        throw new ParseError(
          `unknown relationship type '${typeToken.value}'`,
          this.file,
          typeToken.line,
          typeToken.column,
        );
      }
      this.pushRelationship(first, target, type, typeToken, options.valueStreamBody);
      return;
    }

    if (this.check("ident") && isRelationshipKeyword(this.peek().value)) {
      const typeToken = this.advance();
      const type = resolveRelationshipKeyword(typeToken.value);
      if (!type) {
        throw new ParseError("unknown relationship type", this.file, first.line, first.column);
      }
      const target = this.expect("ident", "expected relationship target");
      this.pushRelationship(first, target, type, typeToken, options.valueStreamBody);
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

    throw new ParseError(
      `expected '->' or a typed relationship after '${first.value}'`,
      this.file,
      first.line,
      first.column,
    );
  }

  private parseValueStreamBody(parentId: string): void {
    this.expect("{", "expected '{' after valueStream");
    while (!this.check("}") && !this.check("eof")) {
      const first = this.expect("ident", "expected valueStreamStage or relationship source");
      this.parseElementOrRelationship(first, { valueStreamBody: true, parentId });
    }
    this.expect("}", "expected '}' to close valueStream");
  }

  private pushRelationship(
    source: Token,
    target: Token,
    type: RelationshipKeyword,
    typeToken: Token,
    valueStreamBody: boolean,
  ): void {
    if (valueStreamBody && !isValueStreamStageLink(type)) {
      throw new ParseError(
        `value stream stages may only use flowsTo or triggers (got '${type}')`,
        this.file,
        typeToken.line,
        typeToken.column,
      );
    }
    this.relationships.push({
      type,
      source: source.value,
      target: target.value,
      line: source.line,
    });
  }

  private parseViews(): void {
    this.advance();
    this.expect("{", "expected '{' after views");
    while (!this.check("}") && !this.check("eof")) {
      if (this.checkIdent("view")) {
        this.parseNamedView();
        continue;
      }
      if (this.checkIdent("viewpoint")) {
        this.parseViewpoint();
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

  private parseNamedView(): void {
    const start = this.advance();
    const name = this.expect("ident", "expected view name");
    this.expect("{", "expected '{' after view name");
    const view = this.parseViewBody({
      name: name.value,
      includes: [],
      excludes: [],
      line: start.line,
    });
    this.views.push(view);
  }

  private parseViewpoint(): void {
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
      line: start.line,
    });
    this.views.push(view);
  }

  private parseViewBody(view: ViewDecl): ViewDecl {
    while (!this.check("}") && !this.check("eof")) {
      if (this.checkIdent("include")) {
        const clause = this.advance();
        view.includes.push(...this.parseSelectorList("include", clause));
        continue;
      }
      if (this.checkIdent("exclude")) {
        const clause = this.advance();
        view.excludes.push(...this.parseSelectorList("exclude", clause));
        continue;
      }
      if (this.checkIdent("title")) {
        this.advance();
        const title = this.expect("string", "expected quoted title after title");
        view.title = title.value;
        continue;
      }
      if (this.checkIdent("autoLayout")) {
        this.advance();
        if (this.check("ident") && !this.isViewClauseStart()) {
          view.autoLayout = this.advance().value;
        } else {
          view.autoLayout = "tb";
        }
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

  private parseSelectorList(verb: string, start: Token): string[] {
    const selectors: string[] = [];
    while (!this.check("}") && !this.check("eof") && !this.isViewClauseStart()) {
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

  private isViewClauseStart(): boolean {
    const token = this.peek();
    return token.kind === "ident" && VIEW_CLAUSES.has(token.value);
  }

  private skipBlock(): void {
    this.expect("{", "expected '{' to open ignored block");
    let depth = 1;
    while (depth > 0) {
      const token = this.peek();
      if (token.kind === "eof") {
        throw new ParseError("unterminated block", this.file, token.line, token.column);
      }
      if (token.kind === "{") {
        depth += 1;
      } else if (token.kind === "}") {
        depth -= 1;
      }
      this.advance();
    }
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private checkIdent(value: string): boolean {
    const token = this.peek();
    return token.kind === "ident" && token.value === value;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== "eof") {
      this.index += 1;
    }
    return token;
  }

  private expect(kind: TokenKind, message: string): Token {
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
  }

  const viewNames = new Map<string, ViewDecl>();
  for (const view of model.views) {
    const existing = viewNames.get(view.name);
    if (existing) {
      throw new ParseError(`duplicate view name '${view.name}'`, file, view.line, 1);
    }
    viewNames.set(view.name, view);

    for (const selector of [...view.includes, ...view.excludes]) {
      if (!isResolvableViewSelector(selector)) {
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
  }

  return model;
}

function isResolvableViewSelector(selector: string): boolean {
  if (selector.includes("*") || selector.includes("->") || selector.startsWith("tag:")) {
    return false;
  }
  return resolveElementKeyword(selector) === undefined;
}
