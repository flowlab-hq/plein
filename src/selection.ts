import { edgeId } from "./layout.js";
import type { FilteredList } from "./list-model.js";
import type { RelationshipDecl } from "./parser.js";

/** One diagram or list item. A selection set is an ordered list of these. */
export type DiagramSelection =
  | { kind: "element"; id: string }
  | { kind: "relationship"; id: string };

/** User-space rectangle. Width and height are non-negative. */
export type MarqueeRect = { x: number; y: number; width: number; height: number };

/**
 * Attributes from the closest SVG hit target.
 * Element boxes sit above connector hit targets, so a click on a box selects
 * the element. Visible strokes paint above the boxes and do not take hits.
 * Nested-parent chrome sits below both.
 */
export type DiagramHit = {
  nodeId?: string | null;
  edgeId?: string | null;
  containerId?: string | null;
};

export function elementSelection(id: string): DiagramSelection {
  return { kind: "element", id };
}

export function relationshipSelection(
  source: string,
  target: string,
  type: string,
): DiagramSelection {
  return { kind: "relationship", id: edgeId(source, target, type) };
}

export function relationshipId(rel: Pick<RelationshipDecl, "source" | "target" | "type">): string {
  return edgeId(rel.source, rel.target, rel.type);
}

/**
 * Map a diagram click to a selection.
 * Closest node wins, then edge, then nested-container background.
 * An empty hit (canvas background) clears selection.
 */
export function selectionFromDiagramHit(hit: DiagramHit): DiagramSelection | null {
  if (hit.nodeId) {
    return elementSelection(hit.nodeId);
  }
  if (hit.edgeId) {
    return { kind: "relationship", id: hit.edgeId };
  }
  if (hit.containerId) {
    return elementSelection(hit.containerId);
  }
  return null;
}

export function isSameSelection(
  left: DiagramSelection | null,
  right: DiagramSelection | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.kind === right.kind && left.id === right.id;
}

/**
 * Keep the current item when it is still in the (possibly filtered) list.
 * Switching views or reloading drops a selection that is no longer listed.
 */
export function retainSelection(
  selection: DiagramSelection | null,
  list: FilteredList,
): DiagramSelection | null {
  if (!selection) {
    return null;
  }
  if (selection.kind === "element") {
    return list.elements.some((element) => element.id === selection.id) ? selection : null;
  }
  return list.relationships.some((rel) => relationshipId(rel) === selection.id) ? selection : null;
}

export type ListRowRef = {
  list: "elements" | "relationships";
  id: string;
};

/** Which left-list row should highlight for this selection. */
export function listRowForSelection(selection: DiagramSelection): ListRowRef {
  return selection.kind === "element"
    ? { list: "elements", id: selection.id }
    : { list: "relationships", id: selection.id };
}

/**
 * SVG attribute targets to mark `data-selected`.
 * A nested parent is one group (`data-node-id` + `data-container-id` on the
 * same element), so both keys resolve to a single chrome highlight.
 * Implied-by-nest relationships have no edge group — `edge` is still the id to look for.
 */
export function diagramTargetsForSelection(selection: DiagramSelection): {
  nodeId?: string;
  edgeId?: string;
  containerId?: string;
} {
  if (selection.kind === "element") {
    return { nodeId: selection.id, containerId: selection.id };
  }
  return { edgeId: selection.id };
}

/** True when the rendered SVG contains a hit target for this selection. */
export function svgHasSelectionTarget(svg: string, selection: DiagramSelection): boolean {
  if (selection.kind === "element") {
    return (
      svg.includes(`data-node-id="${selection.id}"`) ||
      svg.includes(`data-container-id="${selection.id}"`)
    );
  }
  return svg.includes(`data-edge-id="${selection.id}"`);
}

export function selectionIncludes(
  items: readonly DiagramSelection[],
  item: DiagramSelection,
): boolean {
  return items.some((candidate) => candidate.kind === item.kind && candidate.id === item.id);
}

/**
 * Plain click replaces the set with `hit`, or clears it when the canvas is empty.
 * Shift-click toggles `hit`. Shift-click on empty canvas leaves the set so a
 * marquee can extend it instead of clearing.
 */
export function nextSelectionFromClick(
  current: readonly DiagramSelection[],
  hit: DiagramSelection | null,
  shiftKey: boolean,
): DiagramSelection[] {
  if (shiftKey) {
    if (!hit) {
      return [...current];
    }
    if (selectionIncludes(current, hit)) {
      return current.filter((item) => item.kind !== hit.kind || item.id !== hit.id);
    }
    return [...current, hit];
  }
  return hit ? [hit] : [];
}

/** Drag box from `start` to `end`, with positive width and height. */
export function normalizeMarquee(
  start: { x: number; y: number },
  end: { x: number; y: number },
): MarqueeRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function rectsIntersect(a: MarqueeRect, b: MarqueeRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Element boxes the marquee meets. Connectors have no box, so they stay out
 * of a marquee; shift-click still toggles them. `additive` unions with
 * `current` (shift-marquee). Otherwise the marquee replaces the set.
 */
export function selectionFromMarquee(
  nodes: ReadonlyArray<{ id: string; x: number; y: number; width: number; height: number }>,
  marquee: MarqueeRect,
  current: readonly DiagramSelection[] = [],
  additive = false,
): DiagramSelection[] {
  const hit: DiagramSelection[] = [];
  for (const node of nodes) {
    if (rectsIntersect(marquee, node)) {
      hit.push(elementSelection(node.id));
    }
  }
  if (!additive) {
    return hit;
  }
  const next = [...current];
  for (const item of hit) {
    if (!selectionIncludes(next, item)) {
      next.push(item);
    }
  }
  return next;
}

/** Drop items that are no longer in the filtered list. Order of the rest stays. */
export function retainSelections(
  selection: readonly DiagramSelection[],
  list: FilteredList,
): DiagramSelection[] {
  const kept: DiagramSelection[] = [];
  for (const item of selection) {
    const next = retainSelection(item, list);
    if (next) {
      kept.push(next);
    }
  }
  return kept;
}

export function selectedElementIds(selection: readonly DiagramSelection[]): string[] {
  const ids: string[] = [];
  for (const item of selection) {
    if (item.kind === "element") {
      ids.push(item.id);
    }
  }
  return ids;
}
