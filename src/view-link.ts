import { viewSwitcherLabel } from "./browser.js";
import { checkPlein, lexPlein, ParseError, type PleinModel, type PleinToken } from "./parser.js";

/**
 * A canvas context-menu entry.
 * `elementContextMenu` always starts with the built-in view-link actions.
 * Callers append future actions in `extras`; those ids are not interpreted here.
 */
export type CanvasMenuItem =
  | {
      kind: "action";
      id: string;
      label: string;
      enabled: boolean;
      checked?: boolean;
    }
  | {
      kind: "submenu";
      id: string;
      label: string;
      enabled: boolean;
      items: CanvasMenuItem[];
    }
  | {
      kind: "separator";
      id: string;
    };

/** The view-link rewrite could not change the file. The source is left unchanged. */
export class ViewLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViewLinkError";
  }
}

const VIEW_IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Menu for a right-click on one element.
 * The first entry is **Link to view…** (one item per named view). **Clear link**
 * follows when a link is already stored. `extras` are appended after a separator
 * so a later action does not replace the link entries.
 * An unknown element id returns only `extras`.
 */
export function elementContextMenu(
  model: PleinModel,
  elementId: string,
  extras: readonly CanvasMenuItem[] = [],
): CanvasMenuItem[] {
  const element = model.elements.find((candidate) => candidate.id === elementId);
  if (!element) {
    return [...extras];
  }
  const items: CanvasMenuItem[] = [
    {
      kind: "submenu",
      id: "link-to-view",
      label: "Link to view…",
      enabled: model.views.length > 0,
      items: model.views.map((view) => ({
        kind: "action" as const,
        id: `link-to-view:${view.name}`,
        label: viewSwitcherLabel(view),
        enabled: true,
        checked: element.linksView === view.name,
      })),
    },
  ];
  if (element.linksView) {
    items.push({
      kind: "action",
      id: "clear-view-link",
      label: "Clear link",
      enabled: true,
    });
  }
  if (extras.length > 0) {
    items.push({ kind: "separator", id: "extra-actions" }, ...extras);
  }
  return items;
}

/**
 * View to open when the user double-clicks an element.
 * Returns null when `elementId` is missing or the element has no `links view`
 * clause (or the named view is not in the model). Callers treat null as a
 * no-op: the click still selects, and the current view stays put.
 */
export function doubleClickViewTarget(
  model: PleinModel,
  elementId: string | null | undefined,
): string | null {
  if (!elementId) {
    return null;
  }
  const element = model.elements.find((candidate) => candidate.id === elementId);
  if (!element?.linksView) {
    return null;
  }
  const view = model.views.find((candidate) => candidate.name === element.linksView);
  return view ? view.name : null;
}

/**
 * Store or clear one element's `links view` clause without reformatting the file.
 * `viewName` null removes the clause. The result passes `checkPlein`.
 * One destination per element: a later call replaces the previous view name.
 */
export function applyElementViewLink(
  source: string,
  elementId: string,
  viewName: string | null,
  file = "input.plein",
): string {
  let model: PleinModel;
  try {
    model = checkPlein(source, file);
  } catch (error) {
    throw new ViewLinkError(errorText(error));
  }
  if (!model.elements.some((element) => element.id === elementId)) {
    throw new ViewLinkError(`unknown element '${elementId}'`);
  }
  if (viewName !== null && !VIEW_IDENT.test(viewName)) {
    throw new ViewLinkError(`view name '${viewName}' is not an identifier`);
  }
  if (viewName !== null && !model.views.some((view) => view.name === viewName)) {
    throw new ViewLinkError(`unknown view '${viewName}'`);
  }

  let tokens: PleinToken[];
  try {
    tokens = lexPlein(source, file);
  } catch (error) {
    throw new ViewLinkError(errorText(error));
  }
  const site = findElementSite(tokens, elementId);
  const next = rewriteElementViewLink(source, site, viewName);
  let checked: PleinModel;
  try {
    checked = checkPlein(next, file);
  } catch (error) {
    throw new ViewLinkError(errorText(error));
  }
  const stored = checked.elements.find((element) => element.id === elementId)?.linksView ?? null;
  if (stored !== viewName) {
    throw new ViewLinkError(`could not store links view on '${elementId}'`);
  }
  return next;
}

type DeclSite = {
  anchorEnd: number;
  link: { start: number; nameStart: number; nameEnd: number; name: string } | null;
};

function findElementSite(tokens: readonly PleinToken[], elementId: string): DeclSite {
  const matches: DeclSite[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const asToken = tokens[i]!;
    const idToken = tokens[i + 1]!;
    if (asToken.kind !== "ident" || asToken.value !== "as" || idToken.kind !== "ident" || idToken.value !== elementId) {
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
    let link: DeclSite["link"] = null;
    if (
      links?.kind === "ident" &&
      links.value === "links" &&
      viewKeyword?.kind === "ident" &&
      viewKeyword.value === "view" &&
      viewName?.kind === "ident"
    ) {
      link = {
        start: links.offset,
        nameStart: viewName.offset,
        nameEnd: viewName.offset + viewName.value.length,
        name: viewName.value,
      };
    }
    matches.push({ anchorEnd, link });
  }
  if (matches.length !== 1) {
    throw new ViewLinkError(
      matches.length === 0
        ? `could not find element '${elementId}'`
        : `element '${elementId}' is declared more than once`,
    );
  }
  return matches[0]!;
}

function rewriteElementViewLink(source: string, site: DeclSite, viewName: string | null): string {
  if (viewName === null) {
    if (!site.link) {
      return source;
    }
    let start = site.link.start;
    if (start > 0 && source[start - 1] === " ") {
      start -= 1;
    }
    return source.slice(0, start) + source.slice(site.link.nameEnd);
  }
  if (site.link) {
    if (site.link.name === viewName) {
      return source;
    }
    return source.slice(0, site.link.nameStart) + viewName + source.slice(site.link.nameEnd);
  }
  return `${source.slice(0, site.anchorEnd)} links view ${viewName}${source.slice(site.anchorEnd)}`;
}

function errorText(error: unknown): string {
  if (error instanceof ParseError || error instanceof Error) {
    return error.message;
  }
  return String(error);
}
