import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ICON_IDS, iconMarkup, isIconId } from "./archimate-icons.js";
import {
  ELEMENT_KEYWORDS,
  resolveElementKeyword,
} from "./keywords.js";
import {
  LAYER_PALETTE,
  UNKNOWN_STYLE,
  elementStyle,
  layerOf,
  styleTable,
} from "./archimate-style.js";
import {
  layoutViewpoint,
  renderViewpointSvg,
  svgNodeStyles,
  type LayoutNode,
  type ViewpointLayout,
} from "./layout.js";
import { loadPleinSource } from "./list-model.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

type GoldenStyle = {
  palette: Record<string, string>;
  stroke: string;
  unknownStroke: string;
  catalogueLayersView: {
    file: string;
    view: string;
    svg: string;
    nodes: Array<{
      id: string;
      keyword: string;
      layer: string;
      fill: string;
      icon: string;
    }>;
  };
};

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

function loadGoldenStyle(): GoldenStyle {
  return JSON.parse(readFixture("golden-archimate-style.json")) as GoldenStyle;
}

test("every catalogue keyword has a layer colour and icon, never the unknown default", () => {
  const table = styleTable();
  assert.equal(table.length, ELEMENT_KEYWORDS.length);
  for (const keyword of ELEMENT_KEYWORDS) {
    const style = elementStyle(keyword);
    assert.equal(style.keyword, keyword);
    assert.notEqual(style.layer, "unknown", keyword);
    assert.notEqual(style.icon, "generic", keyword);
    assert.equal(style.fill, LAYER_PALETTE[style.layer].fill, keyword);
    assert.match(style.fill, /^#[0-9A-F]{6}$/, keyword);
    assert.equal(isIconId(style.icon), true, keyword);
  }
});

test("unknown and unsupported keywords use the safe default style", () => {
  for (const keyword of ["legacyBatch", "not-a-type", "", "widget"]) {
    const style = elementStyle(keyword);
    assert.deepEqual(style, UNKNOWN_STYLE, keyword);
    assert.equal(style.layer, "unknown");
    assert.equal(style.fill, LAYER_PALETTE.unknown.fill);
    assert.equal(style.icon, "generic");
    assert.equal(layerOf(keyword), "unknown");
  }
});

test("short aliases inherit the business-layer concrete style", () => {
  assert.equal(resolveElementKeyword("process"), "businessProcess");
  assert.equal(elementStyle("process").layer, "business");
  assert.equal(elementStyle("process").fill, LAYER_PALETTE.business.fill);
  assert.equal(elementStyle("process").icon, "process");
});

test("physical shares technology green and keeps a distinct icon", () => {
  const node = elementStyle("node");
  const facility = elementStyle("facility");
  assert.equal(node.layer, "technology");
  assert.equal(facility.layer, "physical");
  assert.equal(node.fill, facility.fill);
  assert.equal(node.fill, LAYER_PALETTE.technology.fill);
  assert.notEqual(node.icon, facility.icon);
});

test("golden catalogue-layers SVG colours and icons match the style map", async () => {
  const golden = loadGoldenStyle();
  const result = loadPleinSource(
    readFixture("valid-catalogue-layers.plein"),
    golden.catalogueLayersView.file,
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const layout = await layoutViewpoint(result.model, golden.catalogueLayersView.view);
  const svg = renderViewpointSvg(layout);
  const fromSvg = svgNodeStyles(svg);
  const expected = golden.catalogueLayersView.nodes.slice().sort((a, b) => a.id.localeCompare(b.id));

  assert.deepEqual(
    fromSvg.map((node) => ({
      id: node.id,
      keyword: node.keyword,
      layer: node.layer,
      fill: node.fill,
      icon: node.icon,
    })),
    expected,
  );

  for (const node of expected) {
    assert.equal(node.fill, golden.palette[node.layer], node.id);
    const mapped = elementStyle(node.keyword);
    assert.equal(mapped.layer, node.layer, node.id);
    assert.equal(mapped.fill, node.fill, node.id);
    assert.equal(mapped.icon, node.icon, node.id);
  }

  const committed = readFileSync(join(repoRoot, golden.catalogueLayersView.svg), "utf8");
  assert.equal(svg, committed, "fixtures/golden-catalogue-layers.svg is stale; re-render it");
});

test("applicationStructure boxes use application cyan plus type icons", async () => {
  const result = loadPleinSource(readFixture("valid-views.plein"), "fixtures/valid-views.plein");
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const svg = renderViewpointSvg(await layoutViewpoint(result.model, "applicationStructure"));
  const styles = svgNodeStyles(svg);
  assert.ok(styles.length > 0);
  for (const node of styles) {
    assert.equal(node.layer, "application");
    assert.equal(node.fill, LAYER_PALETTE.application.fill);
    assert.match(svg, new RegExp(`data-node-id="${node.id}"[\\s\\S]*?data-icon="${node.icon}"`));
  }
  const tms = styles.find((node) => node.id === "tms");
  const shipment = styles.find((node) => node.id === "shipment");
  assert.equal(tms?.icon, "component");
  assert.equal(shipment?.icon, "object");
});

test("renderViewpointSvg paints the unknown default for an unsupported keyword", () => {
  const node: LayoutNode = {
    id: "legacy",
    label: "Legacy batch",
    keyword: "legacyBatch" as LayoutNode["keyword"],
    x: 24,
    y: 24,
    width: 168,
    height: 52,
  };
  const layout: ViewpointLayout = {
    viewName: "unknown-types",
    direction: "tb",
    nesting: "beside",
    width: 216,
    height: 100,
    nodes: [node],
    edges: [],
  };
  const svg = renderViewpointSvg(layout);
  const styles = svgNodeStyles(svg);
  assert.deepEqual(styles, [
    {
      id: "legacy",
      keyword: "legacyBatch",
      layer: "unknown",
      icon: "generic",
      fill: LAYER_PALETTE.unknown.fill,
    },
  ]);
  assert.match(svg, /data-layer="unknown"/);
  assert.match(svg, /data-icon="generic"/);
});

test("icon id catalogue is the set used by the style map plus generic", () => {
  const used = new Set(styleTable().map((row) => row.icon));
  used.add("generic");
  assert.deepEqual([...used].sort(), [...ICON_IDS].slice().sort());
});

test("each icon id has its own markup", () => {
  const markups = ICON_IDS.map((id) => iconMarkup(id));
  assert.equal(new Set(markups).size, ICON_IDS.length);
});

test("capability and value-stream glyphs differ and match ArchiMate conventions", () => {
  assert.equal(elementStyle("capability").icon, "capability");
  assert.equal(elementStyle("value-stream").icon, "value-stream");
  assert.notEqual(iconMarkup("capability"), iconMarkup("value-stream"));

  // Capability is the staircase of blocks (outer step + inner grid), not a chevron.
  assert.match(iconMarkup("capability"), /H13\.8 V2\.4 H9\.4 V6\.4 H5\.4 V10\.4/);
  assert.doesNotMatch(iconMarkup("capability"), /L14\.2 8|L4\.4 8/);

  // Value stream is the notched / double chevron pointing right.
  assert.match(iconMarkup("value-stream"), /L14\.2 8 L9\.2 11\.6 H1\.8 L4\.4 8/);
  assert.doesNotMatch(iconMarkup("value-stream"), /H13\.8 V2\.4 H9\.4/);
});

test("golden capability vs value-stream SVG icons differ and match the style map", async () => {
  const golden = JSON.parse(readFixture("golden-capability-value-stream.json")) as {
    file: string;
    view: string;
    svg: string;
    nodes: Array<{
      id: string;
      keyword: string;
      layer: string;
      fill: string;
      icon: string;
    }>;
  };
  const result = loadPleinSource(readFixture("valid-capability-value-stream.plein"), golden.file);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const svg = renderViewpointSvg(await layoutViewpoint(result.model, golden.view));
  const fromSvg = svgNodeStyles(svg);
  const expected = golden.nodes.slice().sort((a, b) => a.id.localeCompare(b.id));

  assert.deepEqual(
    fromSvg.map((node) => ({
      id: node.id,
      keyword: node.keyword,
      layer: node.layer,
      fill: node.fill,
      icon: node.icon,
    })),
    expected,
  );

  const planning = fromSvg.find((node) => node.id === "planning");
  const quoteToCash = fromSvg.find((node) => node.id === "quoteToCash");
  assert.equal(planning?.icon, "capability");
  assert.equal(quoteToCash?.icon, "value-stream");
  assert.notEqual(planning?.icon, quoteToCash?.icon);

  assert.match(svg, /data-node-id="planning"[\s\S]*?data-icon="capability"[\s\S]*?H13\.8 V2\.4 H9\.4 V6\.4 H5\.4 V10\.4/);
  assert.match(svg, /data-node-id="quoteToCash"[\s\S]*?data-icon="value-stream"[\s\S]*?L14\.2 8 L9\.2 11\.6 H1\.8 L4\.4 8/);

  const committed = readFileSync(join(repoRoot, golden.svg), "utf8");
  assert.equal(svg, committed, "fixtures/golden-capability-value-stream.svg is stale; re-render it");
});
