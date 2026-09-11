/**
 * Shared ArchiMate type/layer style map for the Mac (and any) SVG render path.
 *
 * Colours follow common ArchiMate conventions as used by Archi inbuilt defaults
 * (not a full Archi skin, not Open Exchange styling, not the unused `styles {}` block).
 * Source of truth for the table in docs/archimate-style.md.
 */
import { resolveElementKeyword, type ElementKeyword } from "./keywords.js";
import { iconMarkup, type IconId } from "./archimate-icons.js";

export type { IconId };

export type ArchiMateLayer =
  | "strategy"
  | "motivation"
  | "business"
  | "application"
  | "technology"
  | "physical"
  | "implementation"
  | "composite"
  | "unknown";

export type LayerPalette = {
  fill: string;
  stroke: string;
  ink: string;
};

export type ElementStyle = {
  keyword: string;
  layer: ArchiMateLayer;
  fill: string;
  stroke: string;
  ink: string;
  icon: IconId;
};

/** Archi inbuilt fill colours; shared grey stroke (Archi defaultLineColor 92,92,92). */
export const LAYER_PALETTE: Record<ArchiMateLayer, LayerPalette> = {
  strategy: { fill: "#F5DEAA", stroke: "#5C5C5C", ink: "#1d1d1f" },
  motivation: { fill: "#CCCCFF", stroke: "#5C5C5C", ink: "#1d1d1f" },
  business: { fill: "#FFFFB5", stroke: "#5C5C5C", ink: "#1d1d1f" },
  application: { fill: "#B5FFFF", stroke: "#5C5C5C", ink: "#1d1d1f" },
  technology: { fill: "#C9E7B7", stroke: "#5C5C5C", ink: "#1d1d1f" },
  physical: { fill: "#C9E7B7", stroke: "#5C5C5C", ink: "#1d1d1f" },
  implementation: { fill: "#FFE0E0", stroke: "#5C5C5C", ink: "#1d1d1f" },
  composite: { fill: "#E8E8ED", stroke: "#5C5C5C", ink: "#1d1d1f" },
  unknown: { fill: "#F5F5F7", stroke: "#8E8E93", ink: "#1d1d1f" },
};

export const UNKNOWN_STYLE: ElementStyle = {
  keyword: "unknown",
  layer: "unknown",
  ...LAYER_PALETTE.unknown,
  icon: "generic",
};

const LAYER_BY_ELEMENT: Record<ElementKeyword, ArchiMateLayer> = {
  resource: "strategy",
  capability: "strategy",
  valueStream: "strategy",
  courseOfAction: "strategy",

  stakeholder: "motivation",
  driver: "motivation",
  assessment: "motivation",
  goal: "motivation",
  outcome: "motivation",
  principle: "motivation",
  requirement: "motivation",
  constraint: "motivation",
  meaning: "motivation",
  value: "motivation",

  businessActor: "business",
  businessRole: "business",
  businessCollaboration: "business",
  businessInterface: "business",
  businessProcess: "business",
  businessFunction: "business",
  businessInteraction: "business",
  businessEvent: "business",
  businessService: "business",
  businessObject: "business",
  contract: "business",
  representation: "business",
  product: "business",

  applicationComponent: "application",
  applicationCollaboration: "application",
  applicationInterface: "application",
  applicationFunction: "application",
  applicationInteraction: "application",
  applicationProcess: "application",
  applicationEvent: "application",
  applicationService: "application",
  dataObject: "application",

  node: "technology",
  device: "technology",
  systemSoftware: "technology",
  technologyCollaboration: "technology",
  technologyInterface: "technology",
  path: "technology",
  communicationNetwork: "technology",
  technologyFunction: "technology",
  technologyProcess: "technology",
  technologyInteraction: "technology",
  technologyEvent: "technology",
  technologyService: "technology",
  artifact: "technology",

  equipment: "physical",
  facility: "physical",
  distributionNetwork: "physical",
  material: "physical",

  workPackage: "implementation",
  deliverable: "implementation",
  implementationEvent: "implementation",
  plateau: "implementation",
  gap: "implementation",

  grouping: "composite",
  location: "composite",
};

const ICON_BY_ELEMENT: Record<ElementKeyword, IconId> = {
  resource: "resource",
  capability: "capability",
  valueStream: "value-stream",
  courseOfAction: "course-of-action",

  stakeholder: "stick-figure",
  driver: "driver",
  assessment: "assessment",
  goal: "goal",
  outcome: "outcome",
  principle: "principle",
  requirement: "requirement",
  constraint: "constraint",
  meaning: "meaning",
  value: "value",

  businessActor: "stick-figure",
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
  systemSoftware: "system-software",
  technologyCollaboration: "collaboration",
  technologyInterface: "interface",
  path: "path",
  communicationNetwork: "network",
  technologyFunction: "function",
  technologyProcess: "process",
  technologyInteraction: "interaction",
  technologyEvent: "event",
  technologyService: "service",
  artifact: "object",

  equipment: "equipment",
  facility: "facility",
  distributionNetwork: "network",
  material: "material",

  workPackage: "work-package",
  deliverable: "object",
  implementationEvent: "event",
  plateau: "plateau",
  gap: "gap",

  grouping: "grouping",
  location: "location",
};

export function layerOf(keyword: string): ArchiMateLayer {
  const canonical = resolveElementKeyword(keyword);
  if (!canonical) {
    return "unknown";
  }
  return LAYER_BY_ELEMENT[canonical];
}

export function iconOf(keyword: string): IconId {
  const canonical = resolveElementKeyword(keyword);
  if (!canonical) {
    return "generic";
  }
  return ICON_BY_ELEMENT[canonical];
}

/** Safe default for unknown / unsupported keywords. */
export function elementStyle(keyword: string): ElementStyle {
  const canonical = resolveElementKeyword(keyword);
  if (!canonical) {
    return UNKNOWN_STYLE;
  }
  const layer = LAYER_BY_ELEMENT[canonical];
  const palette = LAYER_PALETTE[layer];
  return {
    keyword: canonical,
    layer,
    fill: palette.fill,
    stroke: palette.stroke,
    ink: palette.ink,
    icon: ICON_BY_ELEMENT[canonical],
  };
}

export function renderTypeIcon(icon: IconId, stroke: string, x: number, y: number): string {
  const inner = iconMarkup(icon);
  return `<g class="type-icon" data-icon="${icon}" transform="translate(${x} ${y})" fill="none" stroke="${stroke}" color="${stroke}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
}

export function styleTable(): Array<{
  keyword: ElementKeyword;
  layer: ArchiMateLayer;
  fill: string;
  icon: IconId;
}> {
  return (Object.keys(LAYER_BY_ELEMENT) as ElementKeyword[]).map((keyword) => ({
    keyword,
    layer: LAYER_BY_ELEMENT[keyword],
    fill: LAYER_PALETTE[LAYER_BY_ELEMENT[keyword]].fill,
    icon: ICON_BY_ELEMENT[keyword],
  }));
}
