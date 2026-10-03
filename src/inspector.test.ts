import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { formatPleinSource } from "./format.js";
import {
  INSPECTOR_EMPTY_NOTES,
  INSPECTOR_SELECT_PROMPT,
  claimNotesWrite,
  elementIdForInspector,
  enqueueNotesWrite,
  inspectorDetail,
  notesCommitBeforeSelectionChange,
  notesUnsavedStatus,
  toggleInspectorCollapsed,
  type NotesWriteQueue,
} from "./inspector.js";
import { filterModel, reloadPleinSource } from "./list-model.js";
import { ParseError, checkPlein } from "./parser.js";
import { SaveNotesError, writeElementNotes } from "./save-notes.js";
import { retainSelections } from "./selection.js";
import { applyElementViewLink } from "./view-link.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const notesFile = "fixtures/valid-notes.plein";

function readNotes(): string {
  return readFileSync(join(repoRoot, notesFile), "utf8");
}

test("empty notes stay empty and a notes clause round-trips", () => {
  const model = checkPlein(readNotes(), notesFile);
  const booking = model.elements.find((element) => element.id === "booking");
  const shipper = model.elements.find((element) => element.id === "shipper");
  assert.ok(booking);
  assert.ok(shipper);
  assert.equal(booking.notes, undefined);
  assert.equal(shipper.notes, "Owns the outbound booking");

  const empty = inspectorDetail([{ kind: "element", id: "booking" }], model.elements);
  assert.equal(empty.kind, "element");
  if (empty.kind === "element") {
    assert.equal(empty.name, "Booking service");
    assert.equal(empty.notes, "");
    assert.equal(empty.notesEmpty, true);
    assert.equal(empty.emptyMessage, INSPECTOR_EMPTY_NOTES);
  }

  const filled = inspectorDetail([{ kind: "element", id: "shipper" }], model.elements);
  assert.equal(filled.kind, "element");
  if (filled.kind === "element") {
    assert.equal(filled.name, "Shipper");
    assert.equal(filled.notes, "Owns the outbound booking");
    assert.equal(filled.notesEmpty, false);
  }

  const none = inspectorDetail([], model.elements);
  assert.equal(none.kind, "empty");
  if (none.kind === "empty") {
    assert.equal(none.message, INSPECTOR_SELECT_PROMPT);
  }
  const several = inspectorDetail(
    [
      { kind: "element", id: "shipper" },
      { kind: "element", id: "booking" },
    ],
    model.elements,
  );
  assert.equal(several.kind, "empty");
});

test("notes \"\" is omitted and format drops it", () => {
  const source = `model {\n  business-actor "Shipper" as shipper notes ""\n}\n`;
  const model = checkPlein(source, "empty-notes.plein");
  assert.equal(model.elements[0]!.notes, undefined);
  const formatted = formatPleinSource(source, "empty-notes.plein");
  assert.match(formatted, /business-actor "Shipper" as shipper\n/);
  assert.doesNotMatch(formatted, /notes/);
  assert.equal(formatPleinSource(formatted, "empty-notes.plein"), formatted);
});

test("editing notes persists through reload and clearing them does too", () => {
  const source = readNotes();
  const added = writeElementNotes(source, "booking", "Takes the booking request", notesFile);
  assert.match(added, /business-service "Booking service" as booking notes "Takes the booking request"/);
  assert.match(added, /business-actor "Shipper" as shipper notes "Owns the outbound booking"/);

  const reloaded = reloadPleinSource(added, notesFile, "booking-context");
  assert.equal(reloaded.loaded.ok, true);
  if (!reloaded.loaded.ok) {
    return;
  }
  assert.equal(reloaded.selectedView, "booking-context");
  assert.equal(
    reloaded.loaded.model.elements.find((element) => element.id === "booking")?.notes,
    "Takes the booking request",
  );
  assert.equal(
    reloaded.loaded.model.elements.find((element) => element.id === "shipper")?.notes,
    "Owns the outbound booking",
  );

  const selection = [{ kind: "element" as const, id: "booking" }];
  const kept = retainSelections(selection, filterModel(reloaded.loaded.model, reloaded.selectedView));
  assert.deepEqual(kept, selection);

  const cleared = writeElementNotes(added, "shipper", "", notesFile);
  assert.doesNotMatch(cleared, /Owns the outbound booking/);
  assert.match(cleared, /business-actor "Shipper" as shipper\n/);
  const again = reloadPleinSource(cleared, notesFile, "booking-context");
  assert.equal(again.loaded.ok, true);
  if (!again.loaded.ok) {
    return;
  }
  assert.equal(again.loaded.model.elements.find((element) => element.id === "shipper")?.notes, undefined);
  assert.equal(
    again.loaded.model.elements.find((element) => element.id === "booking")?.notes,
    "Takes the booking request",
  );
  const still = retainSelections(
    [{ kind: "element", id: "shipper" }],
    filterModel(again.loaded.model, again.selectedView),
  );
  assert.deepEqual(still, [{ kind: "element", id: "shipper" }]);
});

test("collapse and expand keep the current selection", () => {
  const selection = [{ kind: "element" as const, id: "shipper" }];
  let collapsed = false;
  collapsed = toggleInspectorCollapsed(collapsed);
  assert.equal(collapsed, true);
  assert.equal(elementIdForInspector(selection), "shipper");
  const detail = inspectorDetail(selection, [
    { id: "shipper", label: "Shipper", notes: "Owns the outbound booking" },
  ]);
  assert.equal(detail.kind, "element");
  collapsed = toggleInspectorCollapsed(collapsed);
  assert.equal(collapsed, false);
  assert.deepEqual(selection, [{ kind: "element", id: "shipper" }]);
  assert.equal(elementIdForInspector(selection), "shipper");
  assert.equal(detail.kind, "element");
  if (detail.kind === "element") {
    assert.equal(detail.name, "Shipper");
    assert.equal(detail.notes, "Owns the outbound booking");
  }
});

test("notes sit after a view link and survive writing the link", () => {
  const source = `plein {
  model {
    business-actor "Shipper" as shipper notes "Owns the outbound booking"
  }
  views {
    view context {
      include shipper
    }
  }
}
`;
  const linked = applyElementViewLink(source, "shipper", "context", "linked.plein");
  assert.match(linked, /as shipper links view context notes "Owns the outbound booking"/);
  const model = checkPlein(linked, "linked.plein");
  assert.equal(model.elements[0]!.linksView, "context");
  assert.equal(model.elements[0]!.notes, "Owns the outbound booking");

  const edited = writeElementNotes(linked, "shipper", "Updated", "linked.plein");
  assert.match(edited, /as shipper links view context notes "Updated"/);
  assert.equal(checkPlein(edited, "linked.plein").elements[0]!.linksView, "context");

  const formatted = formatPleinSource(edited, "linked.plein");
  assert.match(formatted, /business-actor "Shipper" as shipper links view context notes "Updated"/);
});

test("notes on a stage and a hook stay on that declaration", () => {
  const source = `plein {
  model {
    profile nordfreight {
      specialization customer specializes business-actor
    }
    business-actor "Desk" as desk hook customer notes "Priority desk"
    value-stream "Order to cash" as otc notes "End to end" {
      value-stream-stage "Quote" as quote notes "First step"
    }
  }
}
`;
  const model = checkPlein(source, "stage-notes.plein");
  assert.equal(model.elements.find((element) => element.id === "desk")?.notes, "Priority desk");
  assert.equal(model.elements.find((element) => element.id === "otc")?.notes, "End to end");
  assert.equal(model.elements.find((element) => element.id === "quote")?.notes, "First step");
  const formatted = formatPleinSource(source, "stage-notes.plein");
  assert.match(formatted, /as desk hook customer notes "Priority desk"/);
  assert.match(formatted, /as otc notes "End to end" \{/);
  assert.match(formatted, /as quote notes "First step"/);
  const cleared = writeElementNotes(source, "quote", "", "stage-notes.plein");
  assert.match(cleared, /value-stream-stage "Quote" as quote\n/);
  assert.match(cleared, /as otc notes "End to end"/);
});

test("a notes rewrite leaves a styles block and other clauses alone", () => {
  const source = `plein {
  model {
    business-actor "Shipper" as shipper
    business-service "Booking" as booking
  }
  views {
    view context {
      include shipper, booking
      // dock note
      position shipper 10 12
    }
  }
  styles {
    as shipper notes "not an element"
  }
}
`;
  const next = writeElementNotes(source, "shipper", "Hello", "styles.plein");
  assert.match(next, /business-actor "Shipper" as shipper notes "Hello"/);
  assert.match(next, /as shipper notes "not an element"/);
  assert.match(next, /\/\/ dock note\n\s+position shipper 10 12/);
  assert.equal(checkPlein(next, "styles.plein").elements.find((element) => element.id === "booking")?.notes, undefined);
});

test("notes rejects a quote, a missing string, a duplicate, and a reserved name", () => {
  assert.throws(
    () => writeElementNotes(`model { business-actor "Shipper" as shipper }\n`, "shipper", 'say "hi"', "bad.plein"),
    (error: unknown) => error instanceof SaveNotesError && /double quote or a newline/.test(error.message),
  );
  assert.throws(
    () => checkPlein(`model { business-actor "Shipper" as shipper notes }\n`, "missing.plein"),
    (error: unknown) => error instanceof ParseError && /expected a string after 'notes'/.test(error.message),
  );
  assert.throws(
    () =>
      checkPlein(
        `model { business-actor "Shipper" as shipper notes "one" notes "two" }\n`,
        "dup.plein",
      ),
    (error: unknown) => error instanceof ParseError && /duplicate notes clause/.test(error.message),
  );
  assert.throws(
    () =>
      checkPlein(
        `model { specialization notes specializes business-actor }\n`,
        "reserved.plein",
      ),
    (error: unknown) => error instanceof ParseError && /specialization name 'notes' is reserved/.test(error.message),
  );
  const relationship = checkPlein(
    `model {\n  business-actor "Shipper" as shipper\n  business-actor "Notes" as notes\n  notes -> shipper: association\n}\n`,
    "rel.plein",
  );
  assert.equal(relationship.relationships[0]!.source, "notes");
  assert.equal(relationship.elements.find((element) => element.id === "notes")?.notes, undefined);
});

test("clicking another element or the canvas commits the open notes before the field is replaced", () => {
  const typed = { elementId: "shipper", value: "Owns the outbound booking now" };
  assert.deepEqual(notesCommitBeforeSelectionChange(typed, "booking"), typed);
  assert.deepEqual(notesCommitBeforeSelectionChange(typed, null), typed);
  assert.equal(notesCommitBeforeSelectionChange(typed, "shipper"), null);
  assert.equal(notesCommitBeforeSelectionChange({ elementId: "", value: "orphan" }, "booking"), null);
});

test("a blur and a click-away of one edit keep the latest notes once", () => {
  let queue: NotesWriteQueue = { nextTicket: 0, pending: [] };
  queue = enqueueNotesWrite(queue, "shipper", "Own");
  queue = enqueueNotesWrite(queue, "shipper", "Owns the outbound booking now");
  const claimed = claimNotesWrite(queue);
  assert.equal(claimed.write?.elementId, "shipper");
  assert.equal(claimed.write?.value, "Owns the outbound booking now");
  assert.equal(claimed.write?.ticket, 2);
  assert.deepEqual(claimed.queue.pending, []);
  assert.equal(claimNotesWrite(claimed.queue).write, null);
});

test("notes for two elements stay in order when the later edit is a different element", () => {
  let queue: NotesWriteQueue = { nextTicket: 0, pending: [] };
  queue = enqueueNotesWrite(queue, "shipper", "Desk");
  queue = enqueueNotesWrite(queue, "booking", "Request");
  queue = enqueueNotesWrite(queue, "shipper", "Desk priority");
  const first = claimNotesWrite(queue);
  assert.equal(first.write?.elementId, "booking");
  assert.equal(first.write?.value, "Request");
  const second = claimNotesWrite(first.queue);
  assert.equal(second.write?.elementId, "shipper");
  assert.equal(second.write?.value, "Desk priority");
  assert.deepEqual(second.queue.pending, []);
});

test("a failed notes write tells the inspector the text is still in the field", () => {
  assert.equal(
    notesUnsavedStatus("notes cannot contain a double quote or a newline"),
    "Could not save notes. They are still in this field. notes cannot contain a double quote or a newline",
  );
  assert.equal(notesUnsavedStatus("  "), "Could not save notes. They are still in this field.");
});
