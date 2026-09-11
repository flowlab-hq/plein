import { edgeId } from "./layout.js";
import type { FilteredList } from "./list-model.js";
import type { RelationshipDecl } from "./parser.js";

/** Single-item diagram/list selection. Multi-select is out of scope. */
export type DiagramSelection =
  | { kind: "element"; id: string }
  | { kind: "relationship"; id: string };

/**
 * Attributes from the closest SVG hit target.
 * Node groups sit above edges; container backgrounds sit below both.
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
 * A nested container highlights both its header node and the background rect.
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
