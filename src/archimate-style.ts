/**
 * Shared ArchiMate colour and icon map for the Mac / SVG render path.
 *
 * Colours follow the common layer convention used by Archi (inbuilt defaults in
 * AbstractArchimateElementUIProvider) and the example models in the ArchiMate
 * spec. The spec itself assigns no formal semantics to colour.
 *
 * Icons are simplified 16×16 glyphs in the top-right of each box — not full
 * ArchiMate figure shapes (out of scope). Mapping: docs/archimate-style.md.
 */
import { ELEMENT_KEYWORDS, type ElementKeyword } from "./keywords.js";

export const ARCHIMATE_LAYERS = [
  "strategy",
  "motivation",
  "business",
  "application",
  "technology",
  "physical",
  "implementation",
  "composite",
  "unknown",
] as const;

export type ArchiMateLayer = (typeof ARCHIMATE_LAYERS)[number];

export type ArchiMateIconId =
  | "actor"
  | "role"
  | "collaboration"
  | "interface"
  | "process"
  | "function"
  | "interaction"
  | "event"
  | "service"
  | "object"
  | "contract"
  | "representation"
  | "product"
  | "component"
  | "node"
  | "device"
  | "systemSoftware"
  | "path"
  | "network"
  | "equipment"
  | "facility"
  | "resource"
  | "valueStream"
  | "courseOfAction"
  | "driver"
  | "assessment"
  | "goal"
  | "outcome"
  | "principle"
  | "requirement"
  | "constraint"
  | "meaning"
  | "value"
  | "workPackage"
  | "deliverable"
  | "plateau"
  | "gap"
  | "grouping"
  | "location"
  | "artifact"
  | "unknown";

export type ArchiMateStyle = {
  layer: ArchiMateLayer;
  fill: string;
  stroke: string;
  icon: ArchiMateIconId;
};

export type LayerPalette = {
  fill: string;
  stroke: string;
};

/** Archi inbuilt fills: business 255,255,181; application 181,255,255; technology 201,231,183; motivation 204,204,255; strategy 245,222,170; implementation 255,224,224. Physical shares technology green. */
export const LAYER_PALETTE: Record<ArchiMateLayer, LayerPalette> = {
  strategy: { fill: "#F5DEAA", stroke: "#C4A574" },
  motivation: { fill: "#CCCCFF", stroke: "#7A7AB8" },
  business: { fill: "#FFFFB5", stroke: "#C4C46A" },
  application: { fill: "#B5FFFF", stroke: "#5AA3A3" },
  technology: { fill: "#C9E7B7", stroke: "#6F9A5A" },
  physical: { fill: "#C9E7B7", stroke: "#6F9A5A" },
  implementation: { fill: "#FFE0E0", stroke: "#C47A7A" },
  composite: { fill: "#F2F2F7", stroke: "#8E8E93" },
  unknown: { fill: "#F5F5F7", stroke: "#8E8E93" },
};

export const DEFAULT_ARCHIMATE_STYLE: ArchiMateStyle = {
  layer: "unknown",
  ...LAYER_PALETTE.unknown,
  icon: "unknown",
};

const LAYER_KEYWORDS: Record<Exclude<ArchiMateLayer, "unknown">, readonly ElementKeyword[]> = {
  strategy: ["resource", "capability", "valueStream", "courseOfAction"],
  motivation: [
    "stakeholder",
    "driver",
    "assessment",
    "goal",
    "outcome",
    "principle",
    "requirement",
    "constraint",
    "meaning",
    "value",
  ],
  business: [
    "businessActor",
    "businessRole",
    "businessCollaboration",
    "businessInterface",
    "businessProcess",
    "businessFunction",
    "businessInteraction",
    "businessEvent",
    "businessService",
    "businessObject",
    "contract",
    "representation",
    "product",
  ],
  application: [
    "applicationComponent",
    "applicationCollaboration",
    "applicationInterface",
    "applicationFunction",
    "applicationInteraction",
    "applicationProcess",
    "applicationEvent",
    "applicationService",
    "dataObject",
  ],
  technology: [
    "node",
    "device",
    "systemSoftware",
    "technologyCollaboration",
    "technologyInterface",
    "path",
    "communicationNetwork",
    "technologyFunction",
    "technologyProcess",
    "technologyInteraction",
    "technologyEvent",
    "technologyService",
    "artifact",
  ],
  physical: ["equipment", "facility", "distributionNetwork", "material"],
  implementation: ["workPackage", "deliverable", "implementationEvent", "plateau", "gap"],
  composite: ["grouping", "location"],
};

const ICON_BY_KEYWORD: Record<ElementKeyword, ArchiMateIconId> = {
  resource: "resource",
  capability: "function",
  valueStream: "valueStream",
  courseOfAction: "courseOfAction",
  stakeholder: "actor",
  driver: "driver",
  assessment: "assessment",
  goal: "goal",
  outcome: "outcome",
  principle: "principle",
  requirement: "requirement",
  constraint: "constraint",
  meaning: "meaning",
  value: "value",
  businessActor: "actor",
  businessRole: "role",
  businessCollaboration: "collaboration",
  businessInterface: "interface",
  businessProcess: "process",
  businessFunction: "function",
  businessInteraction: "interaction",
  businessEvent: "event",
  businessService: "service",
  businessObject: "object",
  contract: "contract",
  representation: "representation",
  product: "product",
  applicationComponent: "component",
  applicationCollaboration: "collaboration",
  applicationInterface: "interface",
  applicationFunction: "function",
  applicationInteraction: "interaction",
  applicationProcess: "process",
  applicationEvent: "event",
  applicationService: "service",
  dataObject: "object",
  node: "node",
  device: "device",
  systemSoftware: "systemSoftware",
  technologyCollaboration: "collaboration",
  technologyInterface: "interface",
  path: "path",
  communicationNetwork: "network",
  technologyFunction: "function",
  technologyProcess: "process",
  technologyInteraction: "interaction",
  technologyEvent: "event",
  technologyService: "service",
  artifact: "artifact",
  equipment: "equipment",
  facility: "facility",
  distributionNetwork: "network",
  material: "object",
  workPackage: "workPackage",
  deliverable: "deliverable",
  implementationEvent: "event",
  plateau: "plateau",
  gap: "gap",
  grouping: "grouping",
  location: "location",
};

const keywordLayer = new Map<ElementKeyword, ArchiMateLayer>();
for (const [layer, keywords] of Object.entries(LAYER_KEYWORDS) as [
  Exclude<ArchiMateLayer, "unknown">,
  readonly ElementKeyword[],
][]) {
  for (const keyword of keywords) {
    keywordLayer.set(keyword, layer);
  }
}

const ELEMENT_STYLE: Record<ElementKeyword, ArchiMateStyle> = Object.fromEntries(
  ELEMENT_KEYWORDS.map((keyword) => {
    const layer = keywordLayer.get(keyword) ?? "unknown";
    const palette = LAYER_PALETTE[layer];
    const style: ArchiMateStyle = {
      layer,
      fill: palette.fill,
      stroke: palette.stroke,
      icon: ICON_BY_KEYWORD[keyword],
    };
    return [keyword, style];
  }),
) as Record<ElementKeyword, ArchiMateStyle>;

const INK = "#3a3a3c";
const SW = "1.15";

function strokePath(d: string): string {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function strokeCircle(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="${SW}"/>`;
}

function strokeEllipse(cx: number, cy: number, rx: number, ry: number): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${INK}" stroke-width="${SW}"/>`;
}

function strokeRect(x: number, y: number, width: number, height: number, rx = 0): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="none" stroke="${INK}" stroke-width="${SW}"/>`;
}

/** Inner SVG for a 16×16 type glyph (no wrapping `<svg>`). */
export const ICON_INNER: Record<ArchiMateIconId, string> = {
  actor:
    strokeCircle(8, 3.4, 2) +
    strokePath("M8 5.6 V10.4 M5.2 7.6 H10.8 M8 10.4 L5.4 14.2 M8 10.4 L10.6 14.2"),
  role: strokePath("M3.5 12.5 Q3.5 4.5 8 4.5 Q12.5 4.5 12.5 12.5 M3.2 12.8 H12.8"),
  collaboration: strokeCircle(6, 8, 3.4) + strokeCircle(10, 8, 3.4),
  interface: strokeCircle(11, 8, 2.4) + strokePath("M1.8 8 H8.5"),
  process: strokePath("M2 8 H12 M8.5 4.5 L13.2 8 L8.5 11.5"),
  function: strokePath("M4 3.2 H12 Q14 3.2 14 8 Q14 12.8 12 12.8 H4 Q8 8 4 3.2 Z"),
  interaction:
    strokePath("M3.2 5.2 H8.2 Q10.2 5.2 10.2 8 Q10.2 10.8 8.2 10.8 H3.2 Q5.2 8 3.2 5.2 Z") +
    strokePath("M5.8 5.2 H10.8 Q12.8 5.2 12.8 8 Q12.8 10.8 10.8 10.8 H5.8"),
  event: strokePath("M3 8 L6.2 3.4 H13.4 L10.2 8 L13.4 12.6 H6.2 Z"),
  service: strokeEllipse(8, 8, 6.2, 3.4),
  object: strokeRect(3.2, 3.2, 9.6, 9.6, 0.6),
  contract:
    strokeRect(3.2, 3.2, 9.6, 9.6, 0.6) + strokePath("M3.2 6.2 H12.8 M3.2 8.2 H12.8"),
  representation: strokePath("M3.2 3.4 H12.8 V11.2 Q10.4 13.4 8 11.6 Q5.6 9.8 3.2 11.6 Z"),
  product: strokeRect(3.2, 6.2, 9.6, 6.6, 0.4) + strokeRect(5.4, 3.2, 5.2, 3, 0.4),
  component:
    strokeRect(5.2, 3.2, 8.2, 9.6, 0.4) +
    strokeRect(2.6, 5, 4.2, 2.2, 0.3) +
    strokeRect(2.6, 8.8, 4.2, 2.2, 0.3),
  node:
    strokePath("M4 6.2 L8 4.2 L12 6.2 L8 8.2 Z M4 6.2 V11.4 L8 13.4 V8.2 M12 6.2 V11.4 L8 13.4"),
  device:
    strokeRect(2.6, 3.2, 10.8, 7.4, 0.8) + strokePath("M8 10.6 V12.4 M5.2 12.6 H10.8"),
  systemSoftware:
    strokeRect(3.4, 3.2, 9.2, 3.2, 0.6) +
    strokeRect(3.4, 6.4, 9.2, 3.2, 0.6) +
    strokeRect(3.4, 9.6, 9.2, 3.2, 0.6),
  path: strokePath("M2.4 11.2 L6 4.8 L10 11.2 L13.6 4.8") + strokeCircle(2.4, 11.2, 0.9) + strokeCircle(13.6, 4.8, 0.9),
  network:
    strokeCircle(8, 8, 2) +
    strokeCircle(3.2, 4.4, 1.5) +
    strokeCircle(12.8, 4.4, 1.5) +
    strokeCircle(8, 13.2, 1.5) +
    strokePath("M4.4 5.2 L6.6 6.8 M11.6 5.2 L9.4 6.8 M8 10 L8 11.7"),
  equipment:
    strokeRect(3.2, 6.4, 9.6, 6.4, 0.4) +
    strokeRect(5.6, 3.2, 4.8, 3.4, 0.3) +
    strokePath("M6.4 3.2 V1.8 M9.6 3.2 V1.8"),
  facility:
    strokePath("M2.8 13.2 H13.2 V7.2 L8 3.2 L2.8 7.2 Z M6.2 13.2 V9.4 H9.8 V13.2"),
  resource: strokeRect(3.2, 3.2, 9.6, 9.6, 0.4) + strokePath("M3.6 3.6 L12.4 12.4 M12.4 3.6 L3.6 12.4"),
  valueStream: strokePath("M1.8 4.6 H9.4 L14.2 8 L9.4 11.4 H1.8 L4.4 8 Z"),
  courseOfAction: strokeCircle(11.2, 8, 2.6) + strokePath("M1.8 8 H8.4 M5.4 5.2 L8.6 8 L5.4 10.8"),
  driver:
    strokeCircle(8, 8, 5.2) +
    strokeCircle(8, 8, 1.4) +
    strokePath("M8 2.8 V5.2 M8 10.8 V13.2 M2.8 8 H5.2 M10.8 8 H13.2"),
  assessment: strokeCircle(8, 8.4, 5) + strokePath("M8 8.4 L11.2 4.6 M8 3.4 V4.6"),
  goal: strokeCircle(8, 8, 5.4) + strokeCircle(8, 8, 3.2) + strokeCircle(8, 8, 1.2),
  outcome: strokeCircle(8, 8, 5.2) + strokePath("M5.2 8.2 L7.2 10.4 L11.2 5.6"),
  principle: strokePath("M8 2.4 L13.4 8 L8 13.6 L2.6 8 Z") + strokeCircle(8, 8, 1.6),
  requirement: strokeRect(3.4, 3.2, 9.4, 9.6, 0.4) + strokePath("M5.4 3.2 V12.8"),
  constraint: strokeRect(3.4, 3.2, 9.4, 9.6, 0.4) + strokePath("M5.4 3.2 V12.8 M4.2 12 L12.2 4"),
  meaning: strokePath("M4 5.2 Q4 3.6 5.6 3.6 Q7.2 3.6 7.2 5.4 Q7.2 7.6 4.8 9.4 M9 5.2 Q9 3.6 10.6 3.6 Q12.2 3.6 12.2 5.4 Q12.2 7.6 9.8 9.4"),
  value: strokePath("M8 2.6 L13.4 8 L8 13.4 L2.6 8 Z"),
  workPackage: strokePath("M2 5.2 H10.2 L14 8 L10.2 10.8 H2 L4.6 8 Z"),
  deliverable:
    strokePath("M4.2 5.4 H11.8 L13.2 7.2 V12.6 H2.8 V7.2 Z M2.8 7.2 H13.2"),
  plateau: strokeRect(3.2, 3.6, 9.6, 8.8, 0.4) + strokePath("M3.2 8 H12.8"),
  gap: strokePath("M3 3.6 H7.2 V7.4 H3 Z M8.8 8.6 H13 V12.4 H8.8 Z M6.4 6.2 L9.6 9.8"),
  grouping: `<rect x="3" y="3" width="10" height="10" rx="1.2" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-dasharray="2 1.5"/>`,
  location: strokePath("M8 13.4 C8 13.4 3.4 9.2 3.4 6.4 Q3.4 3.2 8 3.2 Q12.6 3.2 12.6 6.4 C12.6 9.2 8 13.4 8 13.4 Z") + strokeCircle(8, 6.3, 1.5),
  artifact: strokePath("M4.2 2.8 H9.4 L12.2 5.6 V13.2 H4.2 Z M9.4 2.8 V5.6 H12.2"),
  unknown: strokeRect(3.2, 3.2, 9.6, 9.6, 1.2) + strokePath("M6.2 6.2 Q6.2 4.8 8 4.8 Q9.8 4.8 9.8 6.4 Q9.8 7.8 8 8.2 V9.4") + `<circle cx="8" cy="11.4" r="0.7" fill="${INK}"/>`,
};

export function layerOf(keyword: string): ArchiMateLayer {
  return styleForElement(keyword).layer;
}

export function styleForElement(keyword: string): ArchiMateStyle {
  const mapped = ELEMENT_STYLE[keyword as ElementKeyword];
  if (mapped) {
    return mapped;
  }
  return DEFAULT_ARCHIMATE_STYLE;
}

export function iconInnerSvg(icon: string): string {
  return ICON_INNER[icon as ArchiMateIconId] ?? ICON_INNER.unknown;
}

export function styleSnapshot(): {
  default: ArchiMateStyle;
  layers: Record<ArchiMateLayer, LayerPalette>;
  keywords: Record<ElementKeyword, { layer: ArchiMateLayer; icon: ArchiMateIconId; fill: string; stroke: string }>;
} {
  const keywords = Object.fromEntries(
    ELEMENT_KEYWORDS.map((keyword) => {
      const style = ELEMENT_STYLE[keyword];
      return [
        keyword,
        { layer: style.layer, icon: style.icon, fill: style.fill, stroke: style.stroke },
      ];
    }),
  ) as Record<ElementKeyword, { layer: ArchiMateLayer; icon: ArchiMateIconId; fill: string; stroke: string }>;
  return {
    default: DEFAULT_ARCHIMATE_STYLE,
    layers: LAYER_PALETTE,
    keywords,
  };
}

const FONT = "-apple-system, BlinkMacSystemFont, sans-serif";

/**
 * Deterministic SVG legend of layer colours and type glyphs.
 * Pinned as fixtures/golden-archimate-legend.svg for visual review.
 */
export function renderArchimateLegendSvg(): string {
  const layers = ARCHIMATE_LAYERS;
  const icons = Object.keys(ICON_INNER) as ArchiMateIconId[];
  const pad = 24;
  const swatchW = 88;
  const swatchH = 40;
  const swatchGap = 10;
  const cols = 8;
  const iconCellW = 92;
  const iconCellH = 36;
  const width = pad * 2 + cols * iconCellW;
  const layerRows = 2;
  const iconRows = Math.ceil(icons.length / cols);
  const height = pad + 28 + layerRows * (swatchH + swatchGap) + 28 + iconRows * iconCellH + pad;

  const layerMarkup = layers
    .map((layer, index) => {
      const palette = LAYER_PALETTE[layer];
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = pad + col * (swatchW + swatchGap);
      const y = pad + 32 + row * (swatchH + swatchGap);
      return `    <g data-layer="${layer}" transform="translate(${x} ${y})">
      <rect width="${swatchW}" height="${swatchH}" rx="6" fill="${palette.fill}" stroke="${palette.stroke}"/>
      <text x="8" y="24" fill="#1d1d1f" font-size="11" font-family="${FONT}">${layer}</text>
    </g>`;
    })
    .join("\n");

  const iconOriginY = pad + 32 + layerRows * (swatchH + swatchGap) + 20;
  const iconMarkup = icons
    .map((icon, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = pad + col * iconCellW;
      const y = iconOriginY + row * iconCellH;
      return `    <g data-icon="${icon}" transform="translate(${x} ${y})">
      <g transform="translate(0 8)">${ICON_INNER[icon]}</g>
      <text x="20" y="20" fill="#3a3a3c" font-size="10" font-family="${FONT}">${icon}</text>
    </g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-legend="archimate-style" role="img" aria-label="Plein ArchiMate colours and icons">
  <title>Plein ArchiMate colours and icons</title>
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${pad}" y="${pad + 8}" fill="#1d1d1f" font-size="16" font-family="${FONT}">Plein ArchiMate colours and icons</text>
  <g class="layers">
${layerMarkup}
  </g>
  <text x="${pad}" y="${iconOriginY - 8}" fill="#6e6e73" font-size="12" font-family="${FONT}">Type glyphs (simplified; not full ArchiMate figures)</text>
  <g class="icons">
${iconMarkup}
  </g>
</svg>
`;
}
