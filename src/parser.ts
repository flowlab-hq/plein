import {
  isRelationshipKeyword,
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

export type PleinModel = {
  elements: ElementDecl[];
  relationships: RelationshipDecl[];
};

type TokenKind = "ident" | "string" | "{" | "}" | "->" | ":" | "other" | "eof";

type Token = {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
};

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_-]/;

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

    // Views/styles may contain punctuation we do not interpret yet.
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
    };
  }

  private parseTopLevelBlocks(): void {
    while (!this.check("}") && !this.check("eof")) {
      if (this.checkIdent("model")) {
        this.parseModel();
        continue;
      }
      if (this.checkIdent("views") || this.checkIdent("styles")) {
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
    const elementKeyword = resolveElementKeyword(first.value);

    if (this.check("string")) {
      if (!elementKeyword) {
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
      this.elements.push({
        keyword: elementKeyword,
        label,
        id: id.value,
        line: first.line,
      });
      return;
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
      this.relationships.push({
        type,
        source: first.value,
        target: target.value,
        line: first.line,
      });
      return;
    }

    if (this.check("ident") && isRelationshipKeyword(this.peek().value)) {
      const type = resolveRelationshipKeyword(this.advance().value);
      if (!type) {
        throw new ParseError("unknown relationship type", this.file, first.line, first.column);
      }
      const target = this.expect("ident", "expected relationship target");
      this.relationships.push({
        type,
        source: first.value,
        target: target.value,
        line: first.line,
      });
      return;
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

  return model;
}
