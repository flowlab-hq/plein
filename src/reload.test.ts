import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  layoutViewpoint,
  membershipOf,
  renderViewpointSvg,
  svgMembership,
} from "./layout.js";
import {
  firstNamedView,
  loadPleinSource,
  reloadPleinSource,
  type LoadResult,
} from "./list-model.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

async function diagramOf(loaded: LoadResult, selectedView: string | null) {
  if (!loaded.ok) {
    return null;
  }
  const viewName = selectedView ?? firstNamedView(loaded.model);
  if (!viewName) {
    return null;
  }
  const layout = await layoutViewpoint(loaded.model, viewName);
  return {
    viewName,
    membership: membershipOf(layout),
    svg: renderViewpointSvg(layout),
  };
}

test("reload after include/exclude edit updates the current viewpoint diagram", async () => {
  const file = "fixtures/valid-views.plein";
  const original = readFixture("valid-views.plein");
  const opened = loadPleinSource(original, file);
  assert.equal(opened.ok, true);
  if (!opened.ok) {
    return;
  }

  const selectedView = firstNamedView(opened.model);
  assert.equal(selectedView, "applicationStructure");
  const before = await diagramOf(opened, selectedView);
  assert.ok(before);
  assert.equal(before.membership.nodes.includes("shipment"), true);
  assert.equal(before.membership.edges.includes("bookingApi->shipment:accesses"), true);

  const edited = original.replace(
    `      exclude "* -> legacyBatch"`,
    `      exclude "* -> legacyBatch"\n      exclude shipment`,
  );
  assert.notEqual(edited, original);

  const reloaded = reloadPleinSource(edited, file, selectedView);
  assert.equal(reloaded.loaded.ok, true);
  assert.equal(reloaded.selectedView, "applicationStructure");
  const after = await diagramOf(reloaded.loaded, reloaded.selectedView);
  assert.ok(after);
  assert.equal(after.viewName, "applicationStructure");
  assert.equal(after.membership.nodes.includes("shipment"), false);
  assert.equal(after.membership.edges.includes("bookingApi->shipment:accesses"), false);
  assert.equal(after.membership.nodes.includes("legacyBatch"), true);
  assert.deepEqual(svgMembership(after.svg).nodes, after.membership.nodes);
  assert.notDeepEqual(after.membership.nodes, before.membership.nodes);
});

test("reload after adding an element updates the diagram", async () => {
  const file = "fixtures/valid-views.plein";
  const original = readFixture("valid-views.plein");
  const opened = loadPleinSource(original, file);
  assert.equal(opened.ok, true);
  if (!opened.ok) {
    return;
  }

  const selectedView = "applicationStructure";
  const before = await diagramOf(opened, selectedView);
  assert.ok(before);
  assert.equal(before.membership.nodes.includes("billing"), false);
  assert.equal(before.svg.includes("Billing"), false);

  const edited = original.replace(
    `    application-component "Legacy batch" as legacyBatch`,
    `    application-component "Legacy batch" as legacyBatch\n    application-component "Billing" as billing`,
  );
  const reloaded = reloadPleinSource(edited, file, selectedView);
  assert.equal(reloaded.loaded.ok, true);
  assert.equal(reloaded.selectedView, selectedView);
  const after = await diagramOf(reloaded.loaded, reloaded.selectedView);
  assert.ok(after);
  assert.equal(after.membership.nodes.includes("billing"), true);
  assert.match(after.svg, /Billing/);
  assert.equal(svgMembership(after.svg).nodes.includes("billing"), true);
});

test("reload keeps All selected and still redraws the named viewpoint", async () => {
  const file = "fixtures/valid-basic.plein";
  const original = readFixture("valid-basic.plein");
  const opened = loadPleinSource(original, file);
  assert.equal(opened.ok, true);
  if (!opened.ok) {
    return;
  }

  const reloaded = reloadPleinSource(
    original.replace(`include shipper, booking, order, rates`, `include shipper booking`),
    file,
    null,
  );
  assert.equal(reloaded.selectedView, null);
  const after = await diagramOf(reloaded.loaded, reloaded.selectedView);
  assert.ok(after);
  assert.equal(after.viewName, "booking-context");
  assert.deepEqual(after.membership.nodes, ["booking", "shipper"]);
});

test("reload falls back when the selected view is removed", async () => {
  const source = `plein {
  model {
    business-actor "Shipper" as shipper
    business-service "Booking service" as booking
    shipper -> booking: serving
  }
  views {
    view first {
      include shipper
    }
    view second {
      include booking
    }
  }
}
`;
  const opened = loadPleinSource(source, "two-views.plein");
  assert.equal(opened.ok, true);
  const droppedSecond = source.replace(
    `    view second {
      include booking
    }
`,
    "",
  );
  const reloaded = reloadPleinSource(droppedSecond, "two-views.plein", "second");
  assert.equal(reloaded.loaded.ok, true);
  assert.equal(reloaded.selectedView, "first");
  const after = await diagramOf(reloaded.loaded, reloaded.selectedView);
  assert.ok(after);
  assert.deepEqual(after.membership.nodes, ["shipper"]);
});

test("reload of broken source surfaces diagnostics and clears the diagram", async () => {
  const file = "fixtures/valid-basic.plein";
  const opened = loadPleinSource(readFixture("valid-basic.plein"), file);
  assert.equal(opened.ok, true);
  const reloaded = reloadPleinSource(readFixture("broken-syntax.plein"), file, "booking-context");
  assert.equal(reloaded.loaded.ok, false);
  if (reloaded.loaded.ok) {
    return;
  }
  assert.equal(reloaded.selectedView, "booking-context");
  assert.match(reloaded.loaded.error, /:\d+:\d+:/);
  assert.equal(await diagramOf(reloaded.loaded, reloaded.selectedView), null);
});

test("re-read from disk after include/exclude edit updates diagram membership", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plein-reload-"));
  const path = join(dir, "model.plein");
  try {
    const original = readFixture("valid-views.plein");
    writeFileSync(path, original);
    const opened = loadPleinSource(readFileSync(path, "utf8"), path);
    assert.equal(opened.ok, true);
    if (!opened.ok) {
      return;
    }
    const selectedView = firstNamedView(opened.model);
    const before = await diagramOf(opened, selectedView);
    assert.ok(before);
    assert.equal(before.membership.nodes.includes("shipment"), true);

    writeFileSync(
      path,
      original.replace(
        `      exclude "* -> legacyBatch"`,
        `      exclude "* -> legacyBatch"\n      exclude shipment`,
      ),
    );

    const reloaded = reloadPleinSource(readFileSync(path, "utf8"), path, selectedView);
    assert.equal(reloaded.loaded.ok, true);
    assert.equal(reloaded.selectedView, selectedView);
    const after = await diagramOf(reloaded.loaded, reloaded.selectedView);
    assert.ok(after);
    assert.equal(after.membership.nodes.includes("shipment"), false);
    assert.equal(after.membership.edges.some((edge) => edge.includes("shipment")), false);
    assert.deepEqual(svgMembership(after.svg).nodes, after.membership.nodes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
