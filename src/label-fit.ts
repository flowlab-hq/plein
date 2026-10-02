/**
 * Wrap element labels inside the diagram box.
 *
 * SVG `<text>` does not wrap, and the pane has no live font measurer that
 * Node tests and the Mac/web view can share. Widths are Inter Regular advances
 * at 13px — the same size as the system sans on the box — with a gap before
 * the type icon so a slightly wider face (San Francisco) still clears it.
 * Short names stay on one line in the default box. Longer names wrap; the box
 * widens only enough to keep a name to two lines, then grows in height.
 */

/** Default element box. Short labels stay this size. */
export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 52;

/**
 * Smallest width and height an edge drag or a saved size may use.
 * Below the label-fit box, so a resize is not stuck to the text.
 * Both are multiples of the default snap cell (24).
 */
export const MIN_RESIZE_WIDTH = 48;
export const MIN_RESIZE_HEIGHT = 24;

/**
 * Widest box a label may claim while trying to stay on two lines.
 * Past this, extra words add lines and the box grows in height instead.
 */
export const MAX_NODE_WIDTH = 280;

/** Label inset from the left edge of the box. Matches the SVG `x`. */
export const LABEL_PAD_X = 12;

/** Type icon is drawn at `width - TYPE_ICON_INSET_X`. */
export const TYPE_ICON_INSET_X = 20;

/** Clearance between the end of a line and the type icon. */
export const TYPE_ICON_GAP = 14;

export const LABEL_FONT_SIZE = 13;
export const LABEL_LINE_HEIGHT = 16;

/** Baseline within one line box (13px face in a 16px line). */
const LABEL_BASELINE = 12;

/** Padding above the first line and below the last when the box grows. */
const LABEL_PAD_Y = 8;

/** Room under the last baseline so descenders stay inside the band. */
export const LABEL_DESCENT = 4;

const UNITS_PER_EM = 2048;

/**
 * Inter Regular advances for code points 32..126, in font units (2048 / em).
 * Unknown characters use a full em so they wrap early instead of clipping.
 */
const ASCII_ADVANCES = [
  576, 589, 954, 1297, 1314, 2011, 1319, 614, 747, 747, 1026, 1355, 590, 942, 590, 738, 1292, 833,
  1249, 1265, 1323, 1215, 1270, 1159, 1267, 1270, 590, 618, 1355, 1355, 1355, 1047, 1978, 1413, 1340,
  1496, 1478, 1231, 1209, 1528, 1522, 550, 1169, 1376, 1158, 1850, 1543, 1566, 1308, 1566, 1318, 1314,
  1322, 1524, 1413, 2018, 1397, 1390, 1288, 747, 738, 747, 965, 934, 661, 1150, 1254, 1170, 1254, 1194,
  758, 1256, 1211, 496, 496, 1124, 496, 1794, 1210, 1228, 1254, 1254, 771, 1081, 670, 1211, 1151, 1676,
  1118, 1151, 1131, 873, 681, 873, 1355,
];

export type FittedLabel = {
  lines: string[];
  width: number;
  height: number;
};

function advanceOf(character: string): number {
  const code = character.codePointAt(0) ?? 0;
  if (code >= 32 && code <= 126) {
    return ASCII_ADVANCES[code - 32] ?? UNITS_PER_EM;
  }
  return UNITS_PER_EM;
}

/** Width of `text` in CSS pixels at the diagram label size. */
export function labelTextWidth(text: string): number {
  let units = 0;
  for (const character of text) {
    units += advanceOf(character);
  }
  return (units * LABEL_FONT_SIZE) / UNITS_PER_EM;
}

/** Horizontal room for label text inside a box of `boxWidth`, clear of the icon. */
export function labelContentWidth(boxWidth: number): number {
  return Math.max(32, boxWidth - LABEL_PAD_X - TYPE_ICON_INSET_X - TYPE_ICON_GAP);
}

const LABEL_CHROME = LABEL_PAD_X + TYPE_ICON_INSET_X + TYPE_ICON_GAP;

function breakWord(word: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && labelTextWidth(candidate) > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [word];
}

/**
 * Greedy wrap on spaces. A word wider than `maxWidth` breaks by character so
 * the line still fits. A label that already fits is returned unchanged.
 */
export function wrapLabel(label: string, maxWidth: number): string[] {
  if (labelTextWidth(label) <= maxWidth) {
    return [label];
  }
  const words = label.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [""];
  }
  const lines: string[] = [];
  let current = "";
  const pushCurrent = (): void => {
    if (current) {
      lines.push(current);
      current = "";
    }
  };
  for (const word of words) {
    if (labelTextWidth(word) > maxWidth) {
      pushCurrent();
      lines.push(...breakWord(word, maxWidth));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (labelTextWidth(candidate) <= maxWidth) {
      current = candidate;
    } else {
      pushCurrent();
      current = word;
    }
  }
  pushCurrent();
  return lines;
}

/** Height of a label band. One line keeps `minimum` so short boxes stay put. */
export function bandHeightForLines(lineCount: number, minimum: number): number {
  if (lineCount <= 1) {
    return minimum;
  }
  return Math.max(minimum, LABEL_PAD_Y + lineCount * LABEL_LINE_HEIGHT + LABEL_PAD_Y);
}

/** Baselines for `lineCount` lines centered in a band of `bandHeight`. */
export function labelBaselines(lineCount: number, bandHeight: number): number[] {
  if (lineCount <= 1) {
    return [Math.round(bandHeight / 2) + 4];
  }
  const block = lineCount * LABEL_LINE_HEIGHT;
  const top = Math.max(0, Math.round((bandHeight - block) / 2));
  const first = top + LABEL_BASELINE;
  return Array.from({ length: lineCount }, (_, index) => first + index * LABEL_LINE_HEIGHT);
}

function narrowestBoxWidth(label: string, maxLines: number, minWidth: number, maxWidth: number): number {
  if (wrapLabel(label, labelContentWidth(maxWidth)).length > maxLines) {
    return maxWidth;
  }
  let lo = minWidth;
  let hi = maxWidth;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (wrapLabel(label, labelContentWidth(mid)).length <= maxLines) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

/**
 * Box for a leaf (or the minimum size of a container's own label).
 * One line that fits stays `NODE_WIDTH` × `NODE_HEIGHT`.
 */
export function fitLeafBox(label: string): FittedLabel {
  if (labelTextWidth(label) <= labelContentWidth(NODE_WIDTH)) {
    return { lines: [label], width: NODE_WIDTH, height: NODE_HEIGHT };
  }
  const words = label.trim().split(/\s+/).filter((word) => word.length > 0);
  let longest = 0;
  for (const word of words) {
    longest = Math.max(longest, labelTextWidth(word));
  }
  const widthForWord =
    longest <= labelContentWidth(NODE_WIDTH)
      ? NODE_WIDTH
      : Math.min(MAX_NODE_WIDTH, Math.max(NODE_WIDTH, Math.ceil(longest + LABEL_CHROME)));
  let width = widthForWord;
  if (wrapLabel(label, labelContentWidth(width)).length > 2 && width < MAX_NODE_WIDTH) {
    width = narrowestBoxWidth(label, 2, width, MAX_NODE_WIDTH);
  }
  const lines = wrapLabel(label, labelContentWidth(width));
  return {
    lines,
    width,
    height: bandHeightForLines(lines.length, NODE_HEIGHT),
  };
}
