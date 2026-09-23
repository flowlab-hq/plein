/**
 * Small XML reader for Open Exchange files.
 * Rejects DOCTYPE so external entities are not resolved.
 */

export class XmlError extends Error {
  readonly line: number;
  readonly column: number;

  constructor(message: string, line: number, column: number) {
    super(message);
    this.name = "XmlError";
    this.line = line;
    this.column = column;
  }
}

export type XmlAttribute = {
  local: string;
  ns?: string;
  value: string;
};

export type XmlElement = {
  type: "element";
  local: string;
  ns?: string;
  attrs: XmlAttribute[];
  children: XmlNode[];
  line: number;
  column: number;
};

export type XmlText = {
  type: "text";
  text: string;
};

export type XmlNode = XmlElement | XmlText;

const XML_NS = "http://www.w3.org/XML/1998/namespace";

type RawName = { raw: string; prefix?: string; local: string };

type RawAttr = RawName & { value: string };

type NsContext = {
  defaultNs?: string;
  prefixes: Map<string, string>;
};

export function parseXml(source: string): XmlElement {
  return new XmlParser(source).parse();
}

export function elementChildren(element: XmlElement, local?: string): XmlElement[] {
  const children: XmlElement[] = [];
  for (const child of element.children) {
    if (child.type !== "element") {
      continue;
    }
    if (local === undefined || child.local === local) {
      children.push(child);
    }
  }
  return children;
}

export function directText(element: XmlElement): string {
  let text = "";
  for (const child of element.children) {
    if (child.type === "text") {
      text += child.text;
    }
  }
  return text;
}

/** First attribute with this local name. Pass `ns` to require a namespace. */
export function attribute(element: XmlElement, local: string, ns?: string): string | undefined {
  for (const attr of element.attrs) {
    if (attr.local !== local) {
      continue;
    }
    if (ns !== undefined && attr.ns !== ns) {
      continue;
    }
    return attr.value;
  }
  return undefined;
}

class XmlParser {
  private index = 0;
  private line = 1;
  private column = 1;

  constructor(private readonly source: string) {}

  parse(): XmlElement {
    if (this.source.charCodeAt(0) === 0xfeff) {
      this.advance();
    }
    this.parseDeclaration();
    const rootNs: NsContext = { prefixes: new Map([["xml", XML_NS]]) };
    const nodes = this.parseNodes(rootNs, true);
    const roots = nodes.filter((node): node is XmlElement => node.type === "element");
    if (roots.length !== 1) {
      throw this.error("expected a single root element");
    }
    return roots[0]!;
  }

  private parseDeclaration(): void {
    this.skipSpace();
    if (!this.startsWith("<?xml")) {
      return;
    }
    const startLine = this.line;
    const startColumn = this.column;
    const end = this.source.indexOf("?>", this.index);
    if (end < 0) {
      throw this.error("unterminated XML declaration");
    }
    const body = this.source.slice(this.index, end);
    const encoding = /encoding\s*=\s*["']([^"']+)["']/i.exec(body);
    if (encoding && !/^utf-8$/i.test(encoding[1]!)) {
      throw new XmlError(
        `unsupported XML encoding '${encoding[1]}' (expected UTF-8)`,
        startLine,
        startColumn,
      );
    }
    this.advance(end - this.index + 2);
  }

  private parseNodes(ns: NsContext, top: boolean): XmlNode[] {
    const nodes: XmlNode[] = [];
    while (!this.eof() && !this.startsWith("</")) {
      if (this.startsWith("<?")) {
        this.skipUntil("?>", "unterminated processing instruction");
        continue;
      }
      if (this.startsWith("<!--")) {
        this.skipUntil("-->", "unterminated comment");
        continue;
      }
      if (this.startsWith("<![CDATA[")) {
        nodes.push({ type: "text", text: this.parseCdata() });
        continue;
      }
      if (this.startsWith("<!")) {
        this.rejectDoctype();
      }
      if (this.startsWith("<")) {
        nodes.push(this.parseElement(ns));
        continue;
      }
      const text = this.parseText(false);
      if (top && text.trim() === "") {
        continue;
      }
      if (text.length > 0) {
        nodes.push({ type: "text", text });
      }
    }
    return nodes;
  }

  private parseElement(parentNs: NsContext): XmlElement {
    const line = this.line;
    const column = this.column;
    this.expect("<");
    const name = this.parseName();
    const rawAttrs: RawAttr[] = [];
    while (!this.eof() && !this.startsWith(">") && !this.startsWith("/>")) {
      this.skipSpace();
      if (this.startsWith(">") || this.startsWith("/>")) {
        break;
      }
      const attrName = this.parseName();
      this.skipSpace();
      this.expect("=");
      this.skipSpace();
      rawAttrs.push({ ...attrName, value: this.parseQuoted(true) });
    }
    const selfClosing = this.startsWith("/>");
    if (selfClosing) {
      this.advance(2);
    } else {
      this.expect(">");
    }

    const ns = this.childNs(parentNs, rawAttrs);
    const element: XmlElement = {
      type: "element",
      local: name.local,
      ns: this.resolveName(ns, name, true),
      attrs: this.resolveAttrs(ns, rawAttrs),
      children: [],
      line,
      column,
    };
    if (selfClosing) {
      return element;
    }
    element.children = this.parseNodes(ns, false);
    this.expect("</");
    const end = this.parseName();
    if (end.raw !== name.raw) {
      throw this.error(`end tag '${end.raw}' does not match '${name.raw}'`);
    }
    this.skipSpace();
    this.expect(">");
    return element;
  }

  private childNs(parent: NsContext, attrs: RawAttr[]): NsContext {
    const prefixes = new Map(parent.prefixes);
    let defaultNs = parent.defaultNs;
    for (const attr of attrs) {
      if (attr.raw === "xmlns") {
        defaultNs = attr.value.length > 0 ? attr.value : undefined;
        continue;
      }
      if (attr.prefix === "xmlns") {
        prefixes.set(attr.local, attr.value);
      }
    }
    return { defaultNs, prefixes };
  }

  private resolveAttrs(ns: NsContext, attrs: RawAttr[]): XmlAttribute[] {
    const resolved: XmlAttribute[] = [];
    for (const attr of attrs) {
      if (attr.raw === "xmlns" || attr.prefix === "xmlns") {
        continue;
      }
      resolved.push({
        local: attr.local,
        ns: this.resolveName(ns, attr, false),
        value: attr.value,
      });
    }
    return resolved;
  }

  private resolveName(ns: NsContext, name: RawName, element: boolean): string | undefined {
    if (name.prefix) {
      const uri = ns.prefixes.get(name.prefix);
      if (!uri) {
        throw this.error(`undeclared namespace prefix '${name.prefix}'`);
      }
      return uri;
    }
    return element ? ns.defaultNs : undefined;
  }

  private parseCdata(): string {
    this.advance("<![CDATA[".length);
    const end = this.source.indexOf("]]>", this.index);
    if (end < 0) {
      throw this.error("unterminated CDATA section");
    }
    const text = this.source.slice(this.index, end);
    this.advance(end - this.index + 3);
    return normalizeNewlines(text);
  }

  private parseText(attribute: boolean): string {
    let raw = "";
    while (!this.eof() && this.peek() !== "<" && !(attribute && (this.peek() === '"' || this.peek() === "'"))) {
      if (this.peek() === "&") {
        raw += this.parseEntity();
        continue;
      }
      raw += this.advance();
    }
    return attribute ? normalizeAttribute(raw) : normalizeNewlines(raw);
  }

  private parseQuoted(attribute: boolean): string {
    const quote = this.peek();
    if (quote !== '"' && quote !== "'") {
      throw this.error("expected a quoted attribute value");
    }
    this.advance();
    let raw = "";
    while (!this.eof() && this.peek() !== quote) {
      if (this.peek() === "<") {
        throw this.error("unescaped '<' in attribute value");
      }
      if (this.peek() === "&") {
        raw += this.parseEntity();
        continue;
      }
      raw += this.advance();
    }
    if (this.peek() !== quote) {
      throw this.error("unterminated attribute value");
    }
    this.advance();
    return attribute ? normalizeAttribute(raw) : raw;
  }

  private parseEntity(): string {
    const startLine = this.line;
    const startColumn = this.column;
    this.expect("&");
    const semi = this.source.indexOf(";", this.index);
    if (semi < 0) {
      throw new XmlError("unterminated character reference", startLine, startColumn);
    }
    const body = this.source.slice(this.index, semi);
    this.advance(semi - this.index + 1);
    if (body === "lt") return "<";
    if (body === "gt") return ">";
    if (body === "amp") return "&";
    if (body === "quot") return '"';
    if (body === "apos") return "'";
    const hex = /^#x([0-9a-fA-F]+)$/.exec(body);
    const decimal = /^#([0-9]+)$/.exec(body);
    if (!hex && !decimal) {
      throw new XmlError(`unsupported entity '&${body};'`, startLine, startColumn);
    }
    const code = hex ? Number.parseInt(hex[1]!, 16) : Number.parseInt(decimal![1]!, 10);
    if (
      !Number.isFinite(code) ||
      code <= 0 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      throw new XmlError("invalid character reference", startLine, startColumn);
    }
    return String.fromCodePoint(code);
  }

  private parseName(): RawName {
    const start = this.index;
    const first = this.peek();
    if (!/[:A-Za-z_]/.test(first)) {
      throw this.error("expected a name");
    }
    this.advance();
    while (/[:A-Za-z0-9._-]/.test(this.peek())) {
      this.advance();
    }
    const raw = this.source.slice(start, this.index);
    const colon = raw.indexOf(":");
    if (colon < 0) {
      return { raw, local: raw };
    }
    return { raw, prefix: raw.slice(0, colon), local: raw.slice(colon + 1) };
  }

  private rejectDoctype(): never {
    const rest = this.source.slice(this.index, this.index + 32);
    if (/^<!DOCTYPE/i.test(rest)) {
      throw this.error("DOCTYPE is not allowed");
    }
    throw this.error("unsupported markup");
  }

  private skipUntil(marker: string, message: string): void {
    const from = this.index;
    const at = this.source.indexOf(marker, from);
    if (at < 0) {
      throw this.error(message);
    }
    this.advance(at - from + marker.length);
  }

  private skipSpace(): void {
    while (/[\t\n\r ]/.test(this.peek())) {
      this.advance();
    }
  }

  private expect(text: string): void {
    if (!this.startsWith(text)) {
      throw this.error(`expected '${text}'`);
    }
    this.advance(text.length);
  }

  private startsWith(text: string): boolean {
    return this.source.startsWith(text, this.index);
  }

  private peek(): string {
    return this.source[this.index] ?? "";
  }

  private eof(): boolean {
    return this.index >= this.source.length;
  }

  private advance(count = 1): string {
    let out = "";
    for (let n = 0; n < count; n += 1) {
      const ch = this.source[this.index] ?? "";
      if (ch === "") {
        throw this.error("unexpected end of XML");
      }
      this.index += 1;
      out += ch;
      const next = this.source[this.index] ?? "";
      if (ch === "\n" || (ch === "\r" && next !== "\n")) {
        this.line += 1;
        this.column = 1;
        continue;
      }
      if (ch !== "\r") {
        this.column += 1;
      }
    }
    return out;
  }

  private error(message: string): XmlError {
    return new XmlError(message, this.line, this.column);
  }
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeAttribute(text: string): string {
  return normalizeNewlines(text).replace(/[\t\n]/g, " ");
}
