import type { PleinModel, PositionDecl, ViewDecl } from "./parser.js";

/** One element in document order. `keyword` is the canonical camelCase name. */
export type InspectElement = {
  keyword: string;
  label: string;
  id: string;
  line: number;
};

/** One relationship in document order. `type` is the canonical name. */
export type InspectRelationship = {
  type: string;
  source: string;
  target: string;
  line: number;
};

/**
 * One `position` clause. Present even when this view’s auto-layout is on.
 * `width` and `height` are omitted when the clause has no saved size.
 */
export type InspectPosition = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  line: number;
};

/**
 * One named view. Optional clauses are `null` when the file omits them so
 * every view in the dump has the same keys.
 */
export type InspectView = {
  name: string;
  viewpoint: string | null;
  title: string | null;
  includes: string[];
  excludes: string[];
  autoLayout: string | null;
  positions: InspectPosition[];
  nesting: string | null;
  line: number;
};

/** Stable JSON document written by `plein inspect`. */
export type InspectDump = {
  file: string;
  elements: InspectElement[];
  relationships: InspectRelationship[];
  views: InspectView[];
};

function inspectPosition(position: PositionDecl): InspectPosition {
  return {
    id: position.id,
    x: position.x,
    y: position.y,
    ...(position.width !== undefined && position.height !== undefined
      ? { width: position.width, height: position.height }
      : {}),
    line: position.line,
  };
}

function inspectView(view: ViewDecl): InspectView {
  return {
    name: view.name,
    viewpoint: view.viewpoint ?? null,
    title: view.title ?? null,
    includes: view.includes,
    excludes: view.excludes,
    autoLayout: view.autoLayout ?? null,
    positions: (view.positions ?? []).map(inspectPosition),
    nesting: view.nesting ?? null,
    line: view.line,
  };
}

/** Project a checked model into the inspect document. Does not re-parse or lay out. */
export function inspectModel(model: PleinModel, file: string): InspectDump {
  return {
    file,
    elements: model.elements.map((element) => ({
      keyword: element.keyword,
      label: element.label,
      id: element.id,
      line: element.line,
    })),
    relationships: model.relationships.map((relationship) => ({
      type: relationship.type,
      source: relationship.source,
      target: relationship.target,
      line: relationship.line,
    })),
    views: model.views.map(inspectView),
  };
}

/** Pretty-printed JSON with a trailing newline, suitable for a golden snapshot. */
export function formatInspect(dump: InspectDump): string {
  return `${JSON.stringify(dump, null, 2)}\n`;
}
