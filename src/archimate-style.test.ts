import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARCHIMATE_LAYERS,
  DEFAULT_ARCHIMATE_STYLE,
  ICON_INNER,
  LAYER_PALETTE,
  layerOf,
  renderArchimateLegendSvg,
  styleForElement,
  styleSnapshot,
} from "./archimate-style.js";
import { ELEMENT_KEYWORDS } from "./keywords.js";
import { layoutViewpoint, renderViewpointSvg, svgNodeStyles } from "./layout.js";
import { loadPleinSource } from "./list-model.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

type GoldenStyle = {
  source: string;
  default: typeof DEFAULT_ARCHIMATE_STYLE;
  layers: typeof LAYER_PALETTE;
  keywords: ReturnType<typeof styleSnapshot>["keywords"];
  catalogueLayersView: {
    file: string;
    view: string;
    nodes: { id: string; keyword: string; layer: string; fill: string; icon: string }[];
  };
};

function readGolden(): GoldenStyle {
  return JSON.parse(
    readFileSync(join(repoRoot, "fixtures", "golden-archimate-style.json"), "utf8"),
  ) as GoldenStyle;
}

function readFixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", name), "utf8");
}

test("every catalogue keyword has a layer colour and icon", () => {
  const snapshot = styleSnapshot();
  assert.deepEqual(Object.keys(snapshot.keywords).sort(), [...ELEMENT_KEYWORDS].sort());
  for (const keyword of ELEMENT_KEYWORDS) {
    const style = styleForElement(keyword);
    assert.notEqual(style.layer, "unknown", keyword);
    assert.ok(style.icon in ICON_INNER, `${keyword} icon ${style.icon}`);
    assert.equal(style.fill, LAYER_PALETTE[style.layer].fill, keyword);
    assert.match(style.fill, /^#[0-9A-F]{6}$/);
    assert.match(style.stroke, /^#[0-9A-F]{6}$/);
  }
});

test("unknown and unsupported types use the safe default style", () => {
  assert.deepEqual(styleForElement("legacyBatch"), DEFAULT_ARCHIMATE_STYLE);
  assert.deepEqual(styleForElement(""), DEFAULT_ARCHIMATE_STYLE);
  assert.deepEqual(styleForElement("not-a-type"), DEFAULT_ARCHIMATE_STYLE);
  assert.equal(layerOf("nope"), "unknown");
  assert.equal(DEFAULT_ARCHIMATE_STYLE.fill, "#F5F5F7");
  assert.equal(DEFAULT_ARCHIMATE_STYLE.icon, "unknown");
});

test("layer colours follow the common ArchiMate convention", () => {
  assert.equal(styleForElement("businessActor").fill, "#FFFFB5");
  assert.equal(styleForElement("applicationComponent").fill, "#B5FFFF");
  assert.equal(styleForElement("node").fill, "#C9E7B7");
  assert.equal(styleForElement("facility").fill, "#C9E7B7");
  assert.equal(styleForElement("goal").fill, "#CCCCFF");
  assert.equal(styleForElement("capability").fill, "#F5DEAA");
  assert.equal(styleForElement("workPackage").fill, "#FFE0E0");
  assert.equal(styleForElement("grouping").layer, "composite");
  assert.equal(layerOf("businessProcess"), "business");
  assert.equal(layerOf("applicationProcess"), "application");
  assert.equal(layerOf("technologyProcess"), "technology");
});

test("golden archimate-style.json pins the shared colour/icon map", () => {
  const golden = readGolden();
  const snapshot = styleSnapshot();
  assert.match(golden.source, /Archi inbuilt/i);
  assert.deepEqual(golden.default, snapshot.default);
  assert.deepEqual(golden.layers, snapshot.layers);
  assert.deepEqual(golden.keywords, snapshot.keywords);
  assert.deepEqual(
    ARCHIMATE_LAYERS.map((layer) => layer),
    ["strategy", "motivation", "business", "application", "technology", "physical", "implementation", "composite", "unknown"],
  );
});

test("golden legend SVG matches renderArchimateLegendSvg", () => {
  const golden = readFileSync(join(repoRoot, "fixtures", "golden-archimate-legend.svg"), "utf8");
  assert.equal(renderArchimateLegendSvg(), golden);
  assert.match(golden, /data-legend="archimate-style"/);
  for (const layer of ARCHIMATE_LAYERS) {
    assert.match(golden, new RegExp(`data-layer="${layer}"`));
    assert.match(golden, new RegExp(`fill="${LAYER_PALETTE[layer].fill}"`));
  }
  for (const icon of Object.keys(ICON_INNER)) {
    assert.match(golden, new RegExp(`data-icon="${icon}"`));
  }
});

test("catalogue-layers viewpoint SVG uses layer colours and type icons", () => {
  const golden = readGolden();
  const result = loadPleinSource(
    readFixture("valid-catalogue-layers.plein"),
    golden.catalogueLayersView.file,
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const layout = layoutViewpoint(result.model, golden.catalogueLayersView.view);
  const svg = renderViewpointSvg(layout);
  const fromSvg = svgNodeStyles(svg);
  assert.deepEqual(
    fromSvg,
    golden.catalogueLayersView.nodes
      .map((node) => ({
        id: node.id,
        layer: node.layer,
        icon: node.icon,
        fill: node.fill,
      }))
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  for (const node of golden.catalogueLayersView.nodes) {
    const rendered = fromSvg.find((entry) => entry.id === node.id);
    assert.ok(rendered, node.id);
    assert.equal(rendered!.fill, styleForElement(node.keyword).fill);
    assert.equal(rendered!.icon, styleForElement(node.keyword).icon);
    assert.match(svg, new RegExp(`href="#arrow-catalogue-layers-icon-${node.icon}"`));
  }
});

test("value-stream demo colours strategy peach and application cyan", () => {
  const result = loadPleinSource(
    readFixture("samples/value-stream-demo.plein"),
    "fixtures/samples/value-stream-demo.plein",
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const svg = renderViewpointSvg(layoutViewpoint(result.model, "strategy"));
  const styles = Object.fromEntries(svgNodeStyles(svg).map((node) => [node.id, node]));
  assert.equal(styles.quoteToCash?.layer, "strategy");
  assert.equal(styles.quoteToCash?.fill, "#F5DEAA");
  assert.equal(styles.rateQuote?.icon, "function");
  assert.equal(styles.rateEngine?.layer, "application");
  assert.equal(styles.rateEngine?.fill, "#B5FFFF");
  assert.equal(styles.tms?.icon, "component");
});
