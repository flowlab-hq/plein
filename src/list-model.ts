import { resolveElementKeyword, resolveRelationshipKeyword } from "./keywords.js";
import {
  checkPlein,
  ParseError,
  type ElementDecl,
  type PleinModel,
  type RelationshipDecl,
  type ViewDecl,
} from "./parser.js";

export type FilteredList = {
  viewName: string | null;
  elements: ElementDecl[];
  relationships: RelationshipDecl[];
  views: ViewDecl[];
};

export type LoadSuccess = {
  ok: true;
  file: string;
  model: PleinModel;
  list: FilteredList;
};

export type LoadFailure = {
  ok: false;
  file: string;
  error: string;
};

export type LoadResult = LoadSuccess | LoadFailure;

/** First named viewpoint in document order — M9 renders this one on open. */
export function firstNamedView(model: PleinModel): string | null {
  return model.views[0]?.name ?? null;
}

/**
 * Keep the current named viewpoint across a reload when it still exists.
 * `null` means the list "All" selection — that stays "All".
 * If the named view was removed, fall back to the first remaining view.
 */
export function viewAfterReload(model: PleinModel, previousView: string | null): string | null {
  if (previousView === null) {
    return null;
  }
  if (model.views.some((view) => view.name === previousView)) {
    return previousView;
  }
  return firstNamedView(model);
}

/** Re-parse a .plein and keep the current viewpoint when possible (M9b reload). */
export function reloadPleinSource(
  source: string,
  file: string,
  previousView: string | null,
): { loaded: LoadResult; selectedView: string | null } {
  const loaded = loadPleinSource(source, file);
  return {
    loaded,
    selectedView: loaded.ok ? viewAfterReload(loaded.model, previousView) : previousView,
  };
}

type RelPattern = {
  source: string;
  target: string;
};

/** Load and check a .plein document. Failures use the same ParseError text as `plein check`. */
export function loadPleinSource(source: string, file: string): LoadResult {
  try {
    const model = checkPlein(source, file);
    return {
      ok: true,
      file,
      model,
      list: filterModel(model, null),
    };
  } catch (error) {
    return {
      ok: false,
      file,
      error: formatLoadError(error),
    };
  }
}

export function formatLoadError(error: unknown): string {
  if (error instanceof ParseError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function filterModel(model: PleinModel, viewName: string | null): FilteredList {
  if (viewName === null) {
    return {
      viewName: null,
      elements: model.elements,
      relationships: model.relationships,
      views: model.views,
    };
  }

  const view = model.views.find((candidate) => candidate.name === viewName);
  if (!view) {
    return {
      viewName,
      elements: [],
      relationships: [],
      views: model.views,
    };
  }

  const elementIncludes = view.includes.filter((selector) => !parseRelSelector(selector));
  const relIncludes = view.includes.filter((selector) => parseRelSelector(selector));
  const elementExcludes = view.excludes.filter((selector) => !parseRelSelector(selector));
  const relExcludes = view.excludes.filter((selector) => parseRelSelector(selector));

  let elements = model.elements;
  if (elementIncludes.length > 0) {
    elements = elements.filter((element) =>
      elementIncludes.some((selector) => elementMatches(element, selector)),
    );
  }
  if (elementExcludes.length > 0) {
    elements = elements.filter(
      (element) => !elementExcludes.some((selector) => elementMatches(element, selector)),
    );
  }

  const visibleIds = new Set(elements.map((element) => element.id));
  let relationships = model.relationships;
  if (relIncludes.length > 0) {
    relationships = relationships.filter((rel) =>
      relIncludes.some((selector) => relationshipMatches(rel, selector)),
    );
  } else {
    relationships = relationships.filter(
      (rel) => visibleIds.has(rel.source) && visibleIds.has(rel.target),
    );
  }
  if (relExcludes.length > 0) {
    relationships = relationships.filter(
      (rel) => !relExcludes.some((selector) => relationshipMatches(rel, selector)),
    );
  }

  return {
    viewName: view.name,
    elements,
    relationships,
    views: model.views,
  };
}

function parseRelSelector(selector: string): RelPattern | null {
  const match = /^(.+?)\s*->\s*(.+)$/.exec(selector);
  if (!match) {
    return null;
  }
  return { source: match[1]!.trim(), target: match[2]!.trim() };
}

function elementMatches(element: ElementDecl, selector: string): boolean {
  if (parseRelSelector(selector)) {
    return false;
  }
  if (selector === "*") {
    return true;
  }
  if (element.id === selector) {
    return true;
  }
  const keyword = resolveElementKeyword(selector);
  return keyword !== undefined && element.keyword === keyword;
}

function relationshipMatches(rel: RelationshipDecl, selector: string): boolean {
  const pattern = parseRelSelector(selector);
  if (pattern) {
    const sourceOk = pattern.source === "*" || pattern.source === rel.source;
    const targetOk = pattern.target === "*" || pattern.target === rel.target;
    return sourceOk && targetOk;
  }
  if (selector === "*") {
    return true;
  }
  const type = resolveRelationshipKeyword(selector);
  return type !== undefined && rel.type === type;
}
