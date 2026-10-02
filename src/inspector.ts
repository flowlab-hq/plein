import type { DiagramSelection } from "./selection.js";

/** Shown when the selection is not exactly one element. */
export const INSPECTOR_SELECT_PROMPT = "Select an element to see its name and notes.";

/** Shown when the selected element has no notes clause. */
export const INSPECTOR_EMPTY_NOTES = "No notes yet.";

export type InspectorElement = {
  id: string;
  label: string;
  notes?: string;
};

export type InspectorDetail =
  | { kind: "empty"; message: string }
  | {
      kind: "element";
      id: string;
      name: string;
      notes: string;
      notesEmpty: boolean;
      emptyMessage: string;
    };

/**
 * The inspector edits one element. Several selected items, or a relationship,
 * leave the panel on the empty prompt. The selection itself is unchanged.
 */
export function elementIdForInspector(selection: readonly DiagramSelection[]): string | null {
  if (selection.length !== 1) {
    return null;
  }
  const only = selection[0]!;
  return only.kind === "element" ? only.id : null;
}

/** Collapse and expand flip the panel only. */
export function toggleInspectorCollapsed(collapsed: boolean): boolean {
  return !collapsed;
}

/**
 * Name and notes for the current selection.
 * An element with no `notes` clause is `notesEmpty` and still has its name.
 */
export function inspectorDetail(
  selection: readonly DiagramSelection[],
  elements: readonly InspectorElement[],
): InspectorDetail {
  const id = elementIdForInspector(selection);
  if (!id) {
    return { kind: "empty", message: INSPECTOR_SELECT_PROMPT };
  }
  const element = elements.find((candidate) => candidate.id === id);
  if (!element) {
    return { kind: "empty", message: INSPECTOR_SELECT_PROMPT };
  }
  const notes = element.notes ?? "";
  return {
    kind: "element",
    id: element.id,
    name: element.label,
    notes,
    notesEmpty: notes.length === 0,
    emptyMessage: INSPECTOR_EMPTY_NOTES,
  };
}
