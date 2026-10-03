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

export type NotesField = {
  elementId: string;
  value: string;
};

/**
 * Text to store before the inspector paints a different selection.
 * A canvas press cancels the notes field's blur, and the next paint replaces
 * the textarea. The open field has to be read first. The same element
 * (a slower repaint, or collapse) commits nothing here — blur already will.
 * `nextElementId` is null when the panel returns to the empty prompt.
 */
export function notesCommitBeforeSelectionChange(
  field: NotesField,
  nextElementId: string | null,
): NotesField | null {
  if (field.elementId.length === 0 || field.elementId === nextElementId) {
    return null;
  }
  return { elementId: field.elementId, value: field.value };
}

export type NotesWrite = NotesField & {
  ticket: number;
};

export type NotesWriteQueue = {
  nextTicket: number;
  pending: NotesWrite[];
};

/** Queue one leave. Tickets only increase, so a later edit of the same element wins. */
export function enqueueNotesWrite(
  queue: NotesWriteQueue,
  elementId: string,
  value: string,
): NotesWriteQueue {
  const ticket = queue.nextTicket + 1;
  return {
    nextTicket: ticket,
    pending: [...queue.pending, { elementId, value, ticket }],
  };
}

/**
 * Take the next notes write.
 * An older edit of the same element is dropped when a later one is already
 * queued, so a blur and a click-away store the latest text once.
 */
export function claimNotesWrite(queue: NotesWriteQueue): {
  queue: NotesWriteQueue;
  write: NotesWrite | null;
} {
  let pending = queue.pending;
  while (pending.length > 0) {
    const head = pending[0]!;
    const rest = pending.slice(1);
    pending = rest;
    const newer = rest.some((item) => item.elementId === head.elementId);
    if (!newer) {
      return { queue: { ...queue, pending }, write: head };
    }
  }
  return { queue: { ...queue, pending }, write: null };
}

/**
 * Inspector status when a notes write did not land.
 * The field still shows the text that failed to store.
 */
export function notesUnsavedStatus(detail: string): string {
  const reason = detail.trim();
  if (reason.length === 0) {
    return "Could not save notes. They are still in this field.";
  }
  return `Could not save notes. They are still in this field. ${reason}`;
}
