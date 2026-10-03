import type { PleinModel, PositionDecl, SizeDecl, ViewDecl } from "./parser.js";

/** One element in document order. `keyword` is the canonical camelCase name. */
export type InspectElement = {
  keyword: string;
  label: string;
  id: string;
  line: number;
  /** Named view from `links view`, or `null` when the element has no link. */
  linksView: string | null;
  /** `notes` string, or `null` when the clause is omitted or empty. */
  notes: string | null;
};

/** One relationship in document order. `type` is the canonical name. */
export type InspectRelationship = {
  type: string;
  source: string;
  target: string;
  line: number;
  /** Access type, or `null` when the relationship is not a typed access. */
  accessType: string | null;
  /** Influence strength, or `null` when the relationship is not a typed influence. */
  modifier: string | null;
};

/** One `position` clause. Present even when this view’s auto-layout is on. */
export type InspectPosition = {
  id: string;
  x: number;
  y: number;
  line: number;
};

/** One `size` clause. Present even when this view’s auto-layout is on. */
export type InspectSize = {
  id: string;
  width: number;
  height: number;
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
  sizes: InspectSize[];
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
    line: position.line,
  };
}

function inspectSize(size: SizeDecl): InspectSize {
  return {
    id: size.id,
    width: size.width,
    height: size.height,
    line: size.line,
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
    sizes: (view.sizes ?? []).map(inspectSize),
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
      linksView: element.linksView ?? null,
      notes: element.notes ?? null,
    })),
    relationships: model.relationships.map((relationship) => ({
      type: relationship.type,
      source: relationship.source,
      target: relationship.target,
      line: relationship.line,
      accessType: relationship.accessType ?? null,
      modifier: relationship.modifier ?? null,
    })),
    views: model.views.map(inspectView),
  };
}

/** Pretty-printed JSON with a trailing newline, suitable for a golden snapshot. */
export function formatInspect(dump: InspectDump): string {
  return `${JSON.stringify(dump, null, 2)}\n`;
}
