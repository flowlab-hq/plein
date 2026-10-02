import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { layoutViewpoint, renderViewpointSvg } from "./layout.js";
import { checkPlein, ParseError } from "./parser.js";
import { formatPleinSource } from "./format.js";
import { writeManualPositions } from "./save-layout.js";
import {
  applyElementViewLink,
  doubleClickViewTarget,
  elementContextMenu,
  type CanvasMenuItem,
  ViewLinkError,
} from "./view-link.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

const twoViews = `plein {
  model {
    application-component "TMS" as tms
    application-interface "Booking API" as bookingApi

    tms -> bookingApi: serving
  }

  views {
    viewpoint structure "Structure" {
      include *
    }
    viewpoint cooperation "Cooperation" {
      include tms bookingApi
    }
  }
}
`;

test("links view persists across format and a reload parse", () => {
  const source = readFixture("valid-view-link.plein");
  const model = checkPlein(source, "fixtures/valid-view-link.plein");
  assert.equal(model.elements.find((element) => element.id === "tms")?.linksView, "cooperation");
  assert.equal(model.elements.find((element) => element.id === "bookingApi")?.linksView, undefined);

  const formatted = formatPleinSource(source, "fixtures/valid-view-link.plein");
  assert.equal(formatted, source);
  const reloaded = checkPlein(formatted, "fixtures/valid-view-link.plein");
  assert.equal(reloaded.elements.find((element) => element.id === "tms")?.linksView, "cooperation");
  assert.equal(reloaded.elements.find((element) => element.id === "bookingApi")?.linksView, undefined);
});

test("applyElementViewLink stores the link and a second parse keeps it", () => {
  const linked = applyElementViewLink(twoViews, "tms", "cooperation", "memory.plein");
  assert.match(linked, /application-component "TMS" as tms links view cooperation/);
  assert.match(linked, /tms -> bookingApi: serving/);
  const model = checkPlein(linked, "memory.plein");
  assert.equal(model.elements.find((element) => element.id === "tms")?.linksView, "cooperation");
  assert.equal(model.elements.find((element) => element.id === "bookingApi")?.linksView, undefined);

  const replaced = applyElementViewLink(linked, "tms", "structure", "memory.plein");
  assert.match(replaced, /as tms links view structure/);
  assert.doesNotMatch(replaced, /links view cooperation/);
  const again = checkPlein(replaced, "memory.plein");
  assert.equal(again.elements.find((element) => element.id === "tms")?.linksView, "structure");

  const same = applyElementViewLink(replaced, "tms", "structure", "memory.plein");
  assert.equal(same, replaced);

  const cleared = applyElementViewLink(replaced, "tms", null, "memory.plein");
  assert.equal(cleared, twoViews);
  const gone = checkPlein(cleared, "memory.plein");
  assert.equal(gone.elements.find((element) => element.id === "tms")?.linksView, undefined);
});

test("applyElementViewLink keeps a hook, a value-stream body, and a relationship source named links", () => {
  const source = `plein {
  model {
    profile freight {
      specialization customer specializes business-actor
    }
    business-actor "Shipper" as shipper hook customer
    business-actor "Links" as links
    value-stream "Quote to cash" as qtc {
      value-stream-stage "Quote" as quote
    }
    links -> shipper: association
  }

  views {
    view overview {
      include *
    }
    view detail {
      include quote
    }
  }
}
`;
  const hooked = applyElementViewLink(source, "shipper", "overview", "hook.plein");
  assert.match(hooked, /as shipper hook customer links view overview/);
  const staged = applyElementViewLink(hooked, "quote", "detail", "hook.plein");
  assert.match(staged, /as quote links view detail/);
  assert.match(staged, /links -> shipper: association/);
  const model = checkPlein(staged, "hook.plein");
  assert.equal(model.elements.find((element) => element.id === "shipper")?.linksView, "overview");
  assert.equal(model.elements.find((element) => element.id === "quote")?.linksView, "detail");
  assert.equal(model.elements.find((element) => element.id === "links")?.linksView, undefined);
  assert.equal(formatPleinSource(staged, "hook.plein"), formatPleinSource(formatPleinSource(staged, "hook.plein"), "hook.plein"));
});

test("a view link survives a manual-position save and the reverse", () => {
  const linked = applyElementViewLink(twoViews, "bookingApi", "structure", "memory.plein");
  const saved = writeManualPositions(
    linked,
    [{ view: "structure", positions: [{ id: "tms", x: 40, y: 80 }, { id: "bookingApi", x: 200, y: 80 }] }],
    "memory.plein",
  );
  const afterSave = checkPlein(saved, "memory.plein");
  assert.equal(afterSave.elements.find((element) => element.id === "bookingApi")?.linksView, "structure");
  assert.equal(afterSave.views.find((view) => view.name === "structure")?.autoLayout, "off");

  const relinked = applyElementViewLink(saved, "tms", "cooperation", "memory.plein");
  const afterLink = checkPlein(relinked, "memory.plein");
  assert.equal(afterLink.elements.find((element) => element.id === "tms")?.linksView, "cooperation");
  assert.equal(afterLink.views.find((view) => view.name === "structure")?.positions?.[0]?.id, "tms");
});

test("unknown view, unknown element, and a missing view name are rejected", () => {
  assert.throws(
    () => checkPlein(readFixture("invalid-view-link.plein"), "fixtures/invalid-view-link.plein"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.message, /unknown view 'missing' linked from 'shipper'/);
      return true;
    },
  );
  assert.throws(
    () => applyElementViewLink(twoViews, "tms", "missing", "memory.plein"),
    (error: unknown) => error instanceof ViewLinkError && /unknown view 'missing'/.test(error.message),
  );
  assert.throws(
    () => applyElementViewLink(twoViews, "nope", "structure", "memory.plein"),
    (error: unknown) => error instanceof ViewLinkError && /unknown element 'nope'/.test(error.message),
  );
  assert.throws(
    () => checkPlein(`model {\n  business-actor "Shipper" as shipper links nowhere\n}\n`, "bad-links.plein"),
    /expected '->' or a typed relationship after 'shipper'|expected/,
  );
});

test("double-click navigates only when the element is linked", () => {
  const source = applyElementViewLink(twoViews, "tms", "cooperation", "memory.plein");
  const model = checkPlein(source, "memory.plein");
  assert.equal(doubleClickViewTarget(model, "tms"), "cooperation");
  assert.equal(doubleClickViewTarget(model, "bookingApi"), null);
  assert.equal(doubleClickViewTarget(model, null), null);
  assert.equal(doubleClickViewTarget(model, "missing"), null);

  const cleared = checkPlein(applyElementViewLink(source, "tms", null, "memory.plein"), "memory.plein");
  assert.equal(doubleClickViewTarget(cleared, "tms"), null);
});

test("context menu extras are appended and do not drop the link action", () => {
  const model = checkPlein(applyElementViewLink(twoViews, "tms", "cooperation", "memory.plein"), "memory.plein");
  const extra: CanvasMenuItem = { kind: "action", id: "future-action", label: "Future action", enabled: true };
  const menu = elementContextMenu(model, "tms", [extra]);
  assert.equal(menu[0]?.kind, "submenu");
  assert.equal(menu[0]?.id, "link-to-view");
  if (menu[0]?.kind !== "submenu") {
    return;
  }
  assert.deepEqual(
    menu[0].items.map((item) => (item.kind === "action" ? item.id : item.kind)),
    ["link-to-view:structure", "link-to-view:cooperation"],
  );
  const checked = menu[0].items.find((item) => item.kind === "action" && item.checked);
  assert.equal(checked && checked.kind === "action" ? checked.id : "", "link-to-view:cooperation");
  assert.equal(menu.some((item) => item.kind === "action" && item.id === "clear-view-link"), true);
  assert.equal(menu.at(-1)?.kind === "action" && menu.at(-1)?.id === "future-action", true);
  assert.equal(doubleClickViewTarget(model, "tms"), "cooperation");
  assert.equal(doubleClickViewTarget(model, "bookingApi"), null);

  const unlinked = elementContextMenu(model, "bookingApi", [extra]);
  assert.equal(unlinked.some((item) => item.kind === "action" && item.id === "clear-view-link"), false);
  assert.equal(unlinked.at(-1)?.id, "future-action");
  assert.equal(unlinked[0]?.id, "link-to-view");
});

test("a linked element draws a view-link mark and an unlinked element does not", async () => {
  const model = checkPlein(readFixture("valid-view-link.plein"), "fixtures/valid-view-link.plein");
  const svg = renderViewpointSvg(await layoutViewpoint(model, "structure"));
  assert.match(svg, /data-node-id="tms"[^>]*data-links-view="cooperation"/);
  assert.match(svg, /data-node-id="tms"[\s\S]*class="view-link"/);
  assert.doesNotMatch(svg, /data-node-id="bookingApi"[^>]*data-links-view/);
  assert.match(svg, /links to cooperation/);
});

test("the canvas menu is one extensible list and unlinked double-click does not navigate", () => {
  const ui = readFileSync(join(repoRoot, "app/ui/main.ts"), "utf8");
  const html = readFileSync(join(repoRoot, "app/ui/index.html"), "utf8");
  assert.match(html, /id="canvas-menu"/);
  assert.match(ui, /elementContextMenu\(/);
  assert.match(ui, /canvasMenuExtras/);
  assert.match(ui, /doubleClickViewTarget\(/);
  assert.match(ui, /applyElementViewLink\(/);
  assert.match(ui, /contextmenu/);
  assert.match(ui, /dblclick/);
  assert.match(ui, /plein-canvas-menu/);
  assert.match(ui, /if \(!viewName\)/);
  const finishResize = ui.slice(ui.indexOf("function finishResize"));
  assert.match(
    finishResize,
    /if \(!drag\.moved\) \{[\s\S]*?return;\s*\}\s*suppressDiagramClick = true;\s*suppressNextDblClick = true;/,
  );
});
