import { checkPlein, lexPlein, ParseError, type PleinModel, type PleinToken } from "./parser.js";

/**
 * Notes could not be written into the open `.plein`.
 * The source is left unchanged.
 */
export class SaveNotesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveNotesError";
  }
}

/**
 * Store or clear one element's `notes` clause without reformatting the file.
 *
 * An empty string removes the clause. A non-empty string is one `.plein` string:
 * no double quote and no newline. The clause is written after `hook` and
 * `links view` when those are present. The result passes `checkPlein`.
 */
export function writeElementNotes(
  source: string,
  elementId: string,
  notes: string,
  file = "input.plein",
): string {
  if (notes.includes('"') || notes.includes("\n") || notes.includes("\r")) {
    throw new SaveNotesError("notes cannot contain a double quote or a newline");
  }
  let model: PleinModel;
  try {
    model = checkPlein(source, file);
  } catch (error) {
    throw new SaveNotesError(errorText(error));
  }
  if (!model.elements.some((element) => element.id === elementId)) {
    throw new SaveNotesError(`unknown element '${elementId}'`);
  }
  const storedNow = model.elements.find((element) => element.id === elementId)?.notes ?? "";
  if (storedNow === notes) {
    return source;
  }

  let tokens: PleinToken[];
  try {
    tokens = lexPlein(source, file);
  } catch (error) {
    throw new SaveNotesError(errorText(error));
  }
  const site = findElementNotesSite(tokens, elementId);
  const next = rewriteNotes(source, site, notes);
  let checked: PleinModel;
  try {
    checked = checkPlein(next, file);
  } catch (error) {
    throw new SaveNotesError(errorText(error));
  }
  const stored = checked.elements.find((element) => element.id === elementId)?.notes ?? "";
  if (stored !== notes) {
    throw new SaveNotesError(`could not store notes on '${elementId}'`);
  }
  return next;
}

type NotesSite = {
  /** End of the id, hook name, or `links view` name. A new notes clause starts here. */
  anchorEnd: number;
  notes: { start: number; end: number } | null;
};

function findElementNotesSite(tokens: readonly PleinToken[], elementId: string): NotesSite {
  const matches: NotesSite[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (isStylesBlock(tokens, i)) {
      const open = nextSignificant(tokens, i + 1);
      const close = matchingBrace(tokens, open);
      if (close >= 0) {
        i = close;
      }
      continue;
    }
    const asToken = tokens[i];
    const idToken = tokens[i + 1];
    if (
      asToken?.kind !== "ident" ||
      asToken.value !== "as" ||
      idToken?.kind !== "ident" ||
      idToken.value !== elementId
    ) {
      continue;
    }
    let cursor = i + 2;
    let anchorEnd = idToken.offset + idToken.value.length;
    const hook = tokens[cursor];
    const hookName = tokens[cursor + 1];
    if (hook?.kind === "ident" && hook.value === "hook" && hookName?.kind === "ident") {
      anchorEnd = hookName.offset + hookName.value.length;
      cursor += 2;
    }
    const links = tokens[cursor];
    const viewKeyword = tokens[cursor + 1];
    const viewName = tokens[cursor + 2];
    if (
      links?.kind === "ident" &&
      links.value === "links" &&
      viewKeyword?.kind === "ident" &&
      viewKeyword.value === "view" &&
      viewName?.kind === "ident"
    ) {
      anchorEnd = viewName.offset + viewName.value.length;
      cursor += 3;
    }
    const notesKeyword = tokens[cursor];
    const notesString = tokens[cursor + 1];
    let notes: NotesSite["notes"] = null;
    if (notesKeyword?.kind === "ident" && notesKeyword.value === "notes" && notesString?.kind === "string") {
      notes = {
        start: notesKeyword.offset,
        end: notesString.offset + notesString.value.length + 2,
      };
    }
    matches.push({ anchorEnd, notes });
  }
  if (matches.length !== 1) {
    throw new SaveNotesError(
      matches.length === 0
        ? `could not find element '${elementId}'`
        : `element '${elementId}' is declared more than once`,
    );
  }
  return matches[0]!;
}

function rewriteNotes(source: string, site: NotesSite, notes: string): string {
  if (notes.length === 0) {
    if (!site.notes) {
      return source;
    }
    return removeClause(source, site.notes.start, site.notes.end);
  }
  const quoted = ` notes "${notes}"`;
  if (!site.notes) {
    return `${source.slice(0, site.anchorEnd)}${quoted}${source.slice(site.anchorEnd)}`;
  }
  let start = site.notes.start;
  if (start > 0 && source[start - 1] === " ") {
    start -= 1;
  }
  return source.slice(0, start) + quoted + source.slice(site.notes.end);
}

function removeClause(source: string, keywordOffset: number, end: number): string {
  const lineStart = source.lastIndexOf("\n", keywordOffset - 1) + 1;
  const prefix = source.slice(lineStart, keywordOffset);
  if (/^[ \t]*$/.test(prefix)) {
    const newline = source.indexOf("\n", end);
    const lineEnd = newline < 0 ? source.length : newline + 1;
    return source.slice(0, lineStart) + source.slice(lineEnd);
  }
  let start = keywordOffset;
  if (start > 0 && source[start - 1] === " ") {
    start -= 1;
  }
  return source.slice(0, start) + source.slice(end);
}

function isStylesBlock(tokens: readonly PleinToken[], index: number): boolean {
  const token = tokens[index];
  if (!token || token.kind !== "ident" || token.value !== "styles") {
    return false;
  }
  const prev = previousSignificant(tokens, index - 1);
  if (tokens[prev]?.kind === "ident" && tokens[prev]?.value === "as") {
    return false;
  }
  const next = nextSignificant(tokens, index + 1);
  return tokens[next]?.kind === "{";
}

function nextSignificant(tokens: readonly PleinToken[], index: number): number {
  let i = index;
  while (tokens[i]?.kind === "comment") {
    i += 1;
  }
  return i;
}

function previousSignificant(tokens: readonly PleinToken[], index: number): number {
  let i = index;
  while (i >= 0 && tokens[i]?.kind === "comment") {
    i -= 1;
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

function errorText(error: unknown): string {
  if (error instanceof ParseError || error instanceof Error) {
    return error.message;
  }
  return String(error);
}
