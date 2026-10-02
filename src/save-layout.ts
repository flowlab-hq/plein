import { checkPlein, lexPlein, ParseError, type PleinToken } from "./parser.js";

/**
 * Save could not write `autoLayout off` and `position` clauses.
 * The open file is left unchanged.
 */
export class SaveLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveLayoutError";
  }
}

/**
 * One element top-left in view space, and an optional explicit box size.
 * `x` and `y` are the `position` clause. `width` and `height` together are
 * the `size` clause. Omit both dimensions to leave the label-fit box.
 */
export type SavedPosition = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

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

const IDENT = /^[A-Za-z_*][A-Za-z0-9_-]*$/;

/**
 * Format a view-space coordinate the way `plein format` writes a `position` number.
 * Three decimal places is the stored precision. Whole numbers stay whole.
 */
export function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) {
    throw new SaveLayoutError("position coordinate must be a finite number");
  }
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) {
    return "0";
  }
  return String(rounded);
}

/** True when two coordinates would be written as the same `position` number. */
export function sameCoordinate(a: number, b: number): boolean {
  try {
    return formatCoordinate(a) === formatCoordinate(b);
  } catch {
    return false;
  }
}

/**
 * True when a manual session would not come back from the file.
 * An automatic view ignores `position` and `size` clauses, so any session on
 * that view is unsaved. A manual view is unsaved when a session top-left
 * differs from its `position` clause, or has no clause yet. An explicit
 * resize (`explicitSize`) is unsaved when it differs from the `size` clause,
 * or the file has no `size` clause yet.
 */
export function manualPositionsAreDirty(
  autoLayout: string | undefined,
  filePositions: readonly { id: string; x: number; y: number }[],
  session:
    | ReadonlyMap<
        string,
        { x: number; y: number; width?: number; height?: number; explicitSize?: boolean }
      >
    | null
    | undefined,
  fileSizes: readonly { id: string; width: number; height: number }[] = [],
): boolean {
  if (!session || session.size === 0) {
    return false;
  }
  if (isAutoOn(autoLayout)) {
    return true;
  }
  const saved = new Map(filePositions.map((position) => [position.id, position]));
  const sizes = new Map(fileSizes.map((size) => [size.id, size]));
  for (const [id, point] of session) {
    const file = saved.get(id);
    if (!file || !sameCoordinate(file.x, point.x) || !sameCoordinate(file.y, point.y)) {
      return true;
    }
    if (point.explicitSize && point.width !== undefined && point.height !== undefined) {
      const size = sizes.get(id);
      if (
        !size ||
        !sameCoordinate(size.width, point.width) ||
        !sameCoordinate(size.height, point.height)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Write manual top-lefts into one or more views.
 *
 * Each update sets that view's `autoLayout` clause to `off` and replaces its
 * `position` clauses. A position that includes width and height also replaces
 * that id's `size` clause. Include, exclude, nesting, titles, comments on
 * other clauses, and every other view stay as they were. A comment that sat
 * on a `position` or `size` line is kept when that id is still saved.
 * The result is run through `checkPlein`. Nothing is returned when that fails.
 */
export function writeManualPositions(
  source: string,
  updates: ReadonlyArray<{ view: string; positions: readonly SavedPosition[] }>,
  file = "input.plein",
): string {
  if (updates.length === 0) {
    return source;
  }
  const seen = new Set<string>();
  let next = source;
  for (const update of updates) {
    if (seen.has(update.view)) {
      throw new SaveLayoutError(`duplicate save for view '${update.view}'`);
    }
    seen.add(update.view);
    validatePositions(update.positions);
    next = rewriteView(next, update.view, update.positions, file);
  }
  try {
    checkPlein(next, file);
  } catch (error) {
    const message = error instanceof ParseError ? error.message : error instanceof Error ? error.message : String(error);
    throw new SaveLayoutError(message);
  }
  return next;
}

function validatePositions(positions: readonly SavedPosition[]): void {
  const ids = new Set<string>();
  for (const position of positions) {
    if (!IDENT.test(position.id)) {
      throw new SaveLayoutError(`position id '${position.id}' is not an identifier`);
    }
    if (ids.has(position.id)) {
      throw new SaveLayoutError(`duplicate position for '${position.id}'`);
    }
    ids.add(position.id);
    formatCoordinate(position.x);
    formatCoordinate(position.y);
    if (position.width !== undefined || position.height !== undefined) {
      if (!(position.width !== undefined && position.height !== undefined)) {
        throw new SaveLayoutError(`size for '${position.id}' needs both width and height`);
      }
      if (!(position.width > 0) || !(position.height > 0)) {
        throw new SaveLayoutError("size width and height must be positive");
      }
      formatCoordinate(position.width);
      formatCoordinate(position.height);
    }
  }
}

function isAutoOn(autoLayout: string | undefined): boolean {
  const tokens = (autoLayout ?? "")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  return !(tokens.length === 1 && (tokens[0] === "off" || tokens[0] === "manual"));
}

type Edit = { start: number; end: number; text: string };

function rewriteView(
  source: string,
  viewName: string,
  positions: readonly SavedPosition[],
  file: string,
): string {
  let tokens: PleinToken[];
  try {
    tokens = lexPlein(source, file);
  } catch (error) {
    const message = error instanceof ParseError ? error.message : error instanceof Error ? error.message : String(error);
    throw new SaveLayoutError(message);
  }
  const found = findView(tokens, viewName);
  if (!found) {
    throw new SaveLayoutError(`unknown view '${viewName}'`);
  }

  const comments = new Map<string, string[]>();
  const sizeComments = new Map<string, string[]>();
  const edits: Edit[] = [];
  let autoCount = 0;
  let keptAuto = false;
  const cuts = layoutCuts(tokens, found.open, found.close);
  for (const cut of cuts) {
    if (cut.kind === "auto") {
      autoCount += 1;
      if (!keptAuto) {
        edits.push({ start: cut.start, end: cut.end, text: "autoLayout off" });
        keptAuto = true;
      } else {
        edits.push({ start: expandLine(source, cut.start, cut.end).start, end: expandLine(source, cut.start, cut.end).end, text: "" });
      }
      continue;
    }
    const line = expandLine(source, cut.start, cut.end);
    edits.push({ start: line.start, end: line.end, text: "" });
    if (cut.comments && cut.comments.length > 0) {
      const bucket = cut.kind === "size" ? sizeComments : comments;
      bucket.set(cut.id, cut.comments);
    }
  }

  const insertAt = insertionOffset(source, tokens, found.open, found.close, cuts);
  const nl = source.includes("\r\n") ? "\r\n" : "\n";
  const indent = clauseIndent(source, tokens[found.open]!, tokens[found.open + 1], tokens[found.close]!);
  const lines = renderLines(indent, !keptAuto, positions, comments, sizeComments);
  if (lines.length > 0) {
    edits.push({ start: insertAt, end: insertAt, text: `${lines.join(nl)}${nl}` });
  }
  return applyEdits(source, edits);
}

type LayoutCut = {
  kind: "auto" | "position" | "size";
  start: number;
  end: number;
  id: string;
  comments?: string[];
};

function layoutCuts(tokens: PleinToken[], open: number, close: number): LayoutCut[] {
  const cuts: LayoutCut[] = [];
  let pending: { texts: string[]; start: number } | null = null;
  let i = open + 1;
  while (i < close) {
    const token = tokens[i]!;
    if (token.kind === "comment") {
      if (!pending) {
        pending = { texts: [], start: token.offset };
      }
      pending.texts.push(token.value);
      i += 1;
      continue;
    }
    if (token.kind === "ident" && token.value === "autoLayout") {
      let j = i + 1;
      while (j < close && tokens[j]!.kind === "ident" && !VIEW_CLAUSES.has(tokens[j]!.value)) {
        j += 1;
      }
      const endToken = tokens[j - 1]!;
      cuts.push({ kind: "auto", start: token.offset, end: tokenEnd(endToken), id: "" });
      pending = null;
      i = j;
      continue;
    }
    if (token.kind === "ident" && token.value === "position") {
      const idTok = tokens[i + 1];
      const xTok = tokens[i + 2];
      const yTok = tokens[i + 3];
      if (!idTok || idTok.kind !== "ident" || !xTok || xTok.kind !== "number" || !yTok || yTok.kind !== "number") {
        throw new SaveLayoutError("could not read a position clause");
      }
      cuts.push({
        kind: "position",
        start: pending ? pending.start : token.offset,
        end: tokenEnd(yTok),
        id: idTok.value,
        ...(pending && pending.texts.length > 0 ? { comments: pending.texts } : {}),
      });
      pending = null;
      i += 4;
      continue;
    }
    if (token.kind === "ident" && token.value === "size") {
      const idTok = tokens[i + 1];
      const widthTok = tokens[i + 2];
      const heightTok = tokens[i + 3];
      if (
        !idTok ||
        idTok.kind !== "ident" ||
        !widthTok ||
        widthTok.kind !== "number" ||
        !heightTok ||
        heightTok.kind !== "number"
      ) {
        throw new SaveLayoutError("could not read a size clause");
      }
      cuts.push({
        kind: "size",
        start: pending ? pending.start : token.offset,
        end: tokenEnd(heightTok),
        id: idTok.value,
        ...(pending && pending.texts.length > 0 ? { comments: pending.texts } : {}),
      });
      pending = null;
      i += 4;
      continue;
    }
    pending = null;
    i += 1;
  }
  return cuts;
}

function insertionOffset(
  source: string,
  tokens: PleinToken[],
  open: number,
  close: number,
  cuts: readonly LayoutCut[],
): number {
  let i = close - 1;
  while (i > open && tokens[i]!.kind === "comment") {
    i -= 1;
  }
  const firstTrailing = i + 1 < close && tokens[i + 1]!.kind === "comment" ? tokens[i + 1]! : undefined;
  const closeToken = tokens[close]!;
  const anchor = firstTrailing ?? closeToken;
  const lineStart = source.lastIndexOf("\n", anchor.offset - 1) + 1;
  if (lineStart <= tokens[open]!.offset) {
    return closeToken.offset;
  }
  const cutCovers = cuts.some((cut) => {
    const line = expandLine(source, cut.start, cut.end);
    return lineStart >= line.start && lineStart < line.end;
  });
  if (cutCovers) {
    return closeToken.offset;
  }
  return lineStart;
}

function renderLines(
  indent: string,
  includeAuto: boolean,
  positions: readonly SavedPosition[],
  comments: ReadonlyMap<string, string[]>,
  sizeComments: ReadonlyMap<string, string[]>,
): string[] {
  const lines: string[] = [];
  if (includeAuto) {
    lines.push(`${indent}autoLayout off`);
  }
  for (const position of positions) {
    for (const comment of comments.get(position.id) ?? []) {
      lines.push(comment.length > 0 ? `${indent}// ${comment}` : `${indent}//`);
    }
    lines.push(
      `${indent}position ${position.id} ${formatCoordinate(position.x)} ${formatCoordinate(position.y)}`,
    );
  }
  for (const position of positions) {
    if (position.width === undefined || position.height === undefined) {
      continue;
    }
    for (const comment of sizeComments.get(position.id) ?? []) {
      lines.push(comment.length > 0 ? `${indent}// ${comment}` : `${indent}//`);
    }
    lines.push(
      `${indent}size ${position.id} ${formatCoordinate(position.width)} ${formatCoordinate(position.height)}`,
    );
  }
  return lines;
}

function findView(tokens: PleinToken[], name: string): { open: number; close: number } | null {
  let depth = 0;
  let viewsDepth = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.kind === "{") {
      depth += 1;
      continue;
    }
    if (token.kind === "}") {
      if (depth === viewsDepth) {
        viewsDepth = -1;
      }
      depth -= 1;
      continue;
    }
    if (token.kind === "ident" && token.value === "views" && viewsDepth < 0) {
      const next = nextSignificant(tokens, i + 1);
      if (tokens[next]?.kind === "{") {
        viewsDepth = depth + 1;
      }
      continue;
    }
    if (viewsDepth < 0 || depth !== viewsDepth || token.kind !== "ident") {
      continue;
    }
    if (token.value !== "view" && token.value !== "viewpoint") {
      continue;
    }
    const nameTok = tokens[i + 1];
    if (!nameTok || nameTok.kind !== "ident" || nameTok.value !== name) {
      continue;
    }
    let braceAt = i + 2;
    if (token.value === "viewpoint" && tokens[braceAt]?.kind === "string") {
      braceAt += 1;
    }
    if (tokens[braceAt]?.kind !== "{") {
      continue;
    }
    const close = matchingBrace(tokens, braceAt);
    if (close < 0) {
      return null;
    }
    return { open: braceAt, close };
  }
  return null;
}

function nextSignificant(tokens: readonly PleinToken[], index: number): number {
  let i = index;
  while (tokens[i]?.kind === "comment") {
    i += 1;
  }
  return i;
}

function matchingBrace(tokens: readonly PleinToken[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i += 1) {
    if (tokens[i]!.kind === "{") {
      depth += 1;
    } else if (tokens[i]!.kind === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function tokenEnd(token: PleinToken): number {
  if (token.kind === "string") {
    return token.offset + token.value.length + 2;
  }
  if (token.kind === "->") {
    return token.offset + 2;
  }
  if (token.kind === "comment") {
    return token.offset + 2 + token.value.length;
  }
  return token.offset + token.value.length;
}

function expandLine(source: string, start: number, end: number): { start: number; end: number } {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const prefix = source.slice(lineStart, start);
  const expandedStart = /^[ \t\r]*$/.test(prefix) ? lineStart : start;
  const newline = source.indexOf("\n", end);
  const lineEnd = newline < 0 ? source.length : newline;
  const suffix = source.slice(end, lineEnd);
  const expandedEnd = /^[ \t\r]*$/.test(suffix) ? Math.min(source.length, lineEnd + 1) : end;
  return { start: expandedStart, end: expandedEnd };
}

function clauseIndent(
  source: string,
  open: PleinToken,
  inner: PleinToken | undefined,
  close: PleinToken,
): string {
  const viewIndent = indentAt(source, open.offset);
  if (!inner || inner.offset >= close.offset) {
    return `${viewIndent}  `;
  }
  const lineStart = source.lastIndexOf("\n", inner.offset - 1) + 1;
  if (lineStart <= open.offset) {
    return `${viewIndent}  `;
  }
  const indent = source.slice(lineStart, inner.offset);
  if (/^[ \t]+$/.test(indent)) {
    return indent;
  }
  return `${viewIndent}  `;
}

function indentAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const match = /^[ \t]*/.exec(source.slice(lineStart, offset));
  return match?.[0] ?? "";
}

function applyEdits(source: string, edits: readonly Edit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor || edit.end < edit.start) {
      throw new SaveLayoutError("could not rewrite the view");
    }
    out += source.slice(cursor, edit.start);
    out += edit.text;
    cursor = edit.end;
  }
  out += source.slice(cursor);
  return out;
}
