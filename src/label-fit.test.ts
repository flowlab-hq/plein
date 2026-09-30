import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LABEL_DESCENT,
  LABEL_PAD_X,
  MAX_NODE_WIDTH,
  NODE_HEIGHT,
  NODE_WIDTH,
  TYPE_ICON_GAP,
  TYPE_ICON_INSET_X,
  bandHeightForLines,
  fitLeafBox,
  labelBaselines,
  labelContentWidth,
  labelTextWidth,
  wrapLabel,
} from "./label-fit.js";

const BORROWED = "Capability (BORROWED)";
const LONG_BORROWED = "Customer Onboarding Capability (BORROWED)";

test("short labels stay on one line in the default box", () => {
  for (const label of ["Shipper", "Pricing", "NordFreight cloud", "On-time delivery", "Quote to cash"]) {
    const fitted = fitLeafBox(label);
    assert.deepEqual(fitted.lines, [label], label);
    assert.equal(fitted.width, NODE_WIDTH, label);
    assert.equal(fitted.height, NODE_HEIGHT, label);
    assert.ok(labelTextWidth(label) <= labelContentWidth(NODE_WIDTH), label);
  }
});

test("a borrowed capability wraps inside the default box instead of one wide line", () => {
  const fitted = fitLeafBox(BORROWED);
  assert.ok(fitted.lines.length >= 2);
  assert.equal(fitted.width, NODE_WIDTH);
  assert.equal(fitted.height, NODE_HEIGHT);
  assert.deepEqual(fitted.lines.join(" "), BORROWED);
  for (const line of fitted.lines) {
    assert.ok(labelTextWidth(line) <= labelContentWidth(fitted.width), line);
  }
});

test("a longer borrowed name stays readable without a huge box", () => {
  const fitted = fitLeafBox(LONG_BORROWED);
  assert.equal(fitted.lines.length, 2);
  assert.ok(fitted.width > NODE_WIDTH);
  assert.ok(fitted.width <= MAX_NODE_WIDTH);
  assert.ok(fitted.width < labelTextWidth(LONG_BORROWED));
  assert.equal(fitted.height, NODE_HEIGHT);
  assert.deepEqual(fitted.lines.join(" "), LONG_BORROWED);
  for (const line of fitted.lines) {
    assert.ok(labelTextWidth(line) <= labelContentWidth(fitted.width), line);
  }
});

test("names that cannot fit on two lines grow in height and stay within the max width", () => {
  const label = Array.from({ length: 24 }, (_, index) => `capability${index}`).join(" ");
  const fitted = fitLeafBox(label);
  assert.equal(fitted.width, MAX_NODE_WIDTH);
  assert.ok(fitted.lines.length > 2);
  assert.ok(fitted.height > NODE_HEIGHT);
  assert.deepEqual(fitted.lines.join(" "), label);
  for (const line of fitted.lines) {
    assert.ok(labelTextWidth(line) <= labelContentWidth(fitted.width));
  }
});

test("an unbreakable token wraps inside the max box instead of overflowing", () => {
  const label = "M".repeat(40);
  const fitted = fitLeafBox(label);
  assert.equal(fitted.width, MAX_NODE_WIDTH);
  assert.ok(fitted.lines.length > 1);
  assert.equal(fitted.lines.join(""), label);
  for (const line of fitted.lines) {
    assert.ok(labelTextWidth(line) <= labelContentWidth(fitted.width));
  }
});

test("wrapped baselines stay inside the label band and clear the type icon", () => {
  for (const label of [BORROWED, LONG_BORROWED, "M".repeat(40)]) {
    const fitted = fitLeafBox(label);
    const baselines = labelBaselines(fitted.lines.length, fitted.height);
    assert.equal(baselines.length, fitted.lines.length);
    const last = baselines[baselines.length - 1]!;
    assert.ok(last + LABEL_DESCENT <= fitted.height, label);
    const iconLeft = fitted.width - TYPE_ICON_INSET_X;
    for (const line of fitted.lines) {
      assert.ok(LABEL_PAD_X + labelTextWidth(line) <= iconLeft - TYPE_ICON_GAP + 0.01, line);
    }
  }
});

test("one line keeps the historical centered baseline", () => {
  assert.deepEqual(labelBaselines(1, NODE_HEIGHT), [30]);
  assert.deepEqual(labelBaselines(1, 48), [28]);
  assert.equal(bandHeightForLines(1, 48), 48);
  assert.equal(bandHeightForLines(2, 48), 48);
  assert.ok(bandHeightForLines(4, 48) > 48);
});

test("wrapLabel preserves a label that already fits", () => {
  assert.deepEqual(wrapLabel("Shipper & Co", 200), ["Shipper & Co"]);
});
