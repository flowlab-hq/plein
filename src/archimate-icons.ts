/**
 * Compact ArchiMate decorator glyphs for the rectangle+icon notation.
 * These are simplified (not full Archi figure shapes). Unknown types use `generic`.
 */
export const ICON_IDS = [
  "stick-figure",
  "role",
  "collaboration",
  "interface",
  "component",
  "object",
  "contract",
  "representation",
  "product",
  "process",
  "function",
  "interaction",
  "event",
  "service",
  "node",
  "device",
  "system-software",
  "path",
  "network",
  "equipment",
  "facility",
  "location",
  "resource",
  "capability",
  "value-stream",
  "course-of-action",
  "driver",
  "assessment",
  "goal",
  "outcome",
  "principle",
  "requirement",
  "constraint",
  "meaning",
  "value",
  "work-package",
  "plateau",
  "gap",
  "grouping",
  "material",
  "generic",
] as const;

export type IconId = (typeof ICON_IDS)[number];

const ICONS: Record<IconId, string> = {
  "stick-figure":
    '<circle cx="8" cy="3.2" r="2.1"/><path d="M8 5.4 V10.4 M4.8 7.8 H11.2 M8 10.4 L5.2 14.6 M8 10.4 L10.8 14.6"/>',
  role: '<path d="M4 14.5 Q4 3.5 8 3.5 Q12 3.5 12 14.5"/>',
  collaboration:
    '<circle cx="5.6" cy="8" r="3.8"/><circle cx="10.4" cy="8" r="3.8"/>',
  interface: '<circle cx="11.2" cy="8" r="2.6"/><path d="M2.2 8 H8.4"/>',
  component:
    '<rect x="5" y="2.5" width="9" height="11" rx="0.5"/><rect x="2" y="4.2" width="5.2" height="2.4"/><rect x="2" y="9.2" width="5.2" height="2.4"/>',
  object:
    '<path d="M4 3.2 H10.2 L13 6.2 V13.5 H4 Z"/><path d="M10.2 3.2 V6.2 H13"/>',
  contract:
    '<path d="M4 3.2 H10.2 L13 6.2 V13.5 H4 Z"/><path d="M10.2 3.2 V6.2 H13"/><circle cx="6.4" cy="11.2" r="1.1"/><circle cx="9.8" cy="11.2" r="1.1"/>',
  representation:
    '<rect x="3.2" y="3.5" width="9.6" height="9" rx="0.6"/><path d="M4.5 11.2 L7.2 7.8 L9.1 10.1 L10.4 8.7 L12.4 11.2"/><circle cx="6.1" cy="6.2" r="0.9"/>',
  product: '<path d="M8 2.4 L14 7.2 L11.7 14.2 H4.3 L2 7.2 Z"/>',
  process: '<path d="M1.8 8 H12.4 M9.2 4.4 L13.8 8 L9.2 11.6"/>',
  function: '<rect x="2.4" y="5" width="11.2" height="6" rx="3"/>',
  interaction:
    '<rect x="1.8" y="4.6" width="7.4" height="6.8" rx="2.2"/><rect x="6.8" y="4.6" width="7.4" height="6.8" rx="2.2"/>',
  event: '<path d="M2.4 3.4 H10.6 L14.2 8 L10.6 12.6 H2.4 L5 8 Z"/>',
  service: '<ellipse cx="8" cy="8" rx="6.2" ry="3.6"/>',
  node: '<path d="M3.2 6.2 L8 3.4 L12.8 6.2 V12.2 L8 15 L3.2 12.2 Z"/><path d="M3.2 6.2 L8 9 L12.8 6.2 M8 9 V15"/>',
  device:
    '<rect x="2.4" y="3.2" width="11.2" height="8" rx="1.2"/><path d="M6.2 11.2 H9.8 L10.8 13.6 H5.2 Z"/>',
  "system-software":
    '<rect x="3" y="3" width="10" height="3.2" rx="0.6"/><rect x="3" y="6.4" width="10" height="3.2" rx="0.6"/><rect x="3" y="9.8" width="10" height="3.2" rx="0.6"/>',
  path: '<path d="M2.5 5.2 H13.5 M2.5 10.8 H13.5"/><circle cx="2.5" cy="5.2" r="1"/><circle cx="13.5" cy="5.2" r="1"/><circle cx="2.5" cy="10.8" r="1"/><circle cx="13.5" cy="10.8" r="1"/>',
  network:
    '<circle cx="4" cy="4.2" r="1.3"/><circle cx="12" cy="4.2" r="1.3"/><circle cx="4" cy="11.8" r="1.3"/><circle cx="12" cy="11.8" r="1.3"/><path d="M5.2 4.2 H10.8 M4 5.5 V10.5 M12 5.5 V10.5 M5.2 11.8 H10.8"/>',
  equipment:
    '<path d="M3.2 13.5 H12.8 V8.2 L10.4 5.6 H5.6 L3.2 8.2 Z"/><path d="M7.2 5.6 V3.4 H9.4 V5.6"/>',
  facility:
    '<path d="M2.6 13.5 H13.4 V7.2 L8 3.2 L2.6 7.2 Z"/><path d="M6.6 13.5 V10.2 H9.4 V13.5"/>',
  location:
    '<path d="M8 14.6 C8 14.6 3.4 9.4 3.4 6.8 A4.6 4.6 0 0 1 12.6 6.8 C12.6 9.4 8 14.6 8 14.6 Z"/><circle cx="8" cy="6.8" r="1.6"/>',
  resource: '<path d="M8 2.6 L13.4 8 L8 13.4 L2.6 8 Z"/>',
  capability: '<path d="M2.2 4.2 H9.4 L13.8 8 L9.4 11.8 H2.2 Z"/>',
  "value-stream": '<path d="M1.8 4.4 H9.2 L14.2 8 L9.2 11.6 H1.8 L4.4 8 Z"/>',
  "course-of-action":
    '<path d="M1.8 5.6 H8.8 L12.6 8 L8.8 10.4 H1.8 L3.8 8 Z"/><path d="M10.6 3.2 L14.4 3.2 L14.4 7"/>',
  driver: '<path d="M8 2.4 L13.6 8 L8 13.6 L2.4 8 Z"/>',
  assessment:
    '<path d="M8 2.4 L13.6 8 L8 13.6 L2.4 8 Z"/><path d="M5.2 8 H10.8"/>',
  goal: '<circle cx="8" cy="8" r="5.4"/><circle cx="8" cy="8" r="2.4"/>',
  outcome:
    '<circle cx="8" cy="8" r="5.4"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>',
  principle: '<path d="M8 3.2 V12.8 M3.2 8 H12.8 M5 5 L11 11 M11 5 L5 11"/>',
  requirement: '<path d="M3.6 4.2 H13.2 L12.4 11.8 H2.8 Z"/>',
  constraint:
    '<path d="M3.6 4.2 H13.2 L12.4 11.8 H2.8 Z"/><path d="M6.2 4.6 L5.2 11.4 M9.4 4.6 L8.4 11.4"/>',
  meaning:
    '<ellipse cx="8" cy="7.2" rx="5.6" ry="4"/><path d="M6.2 11 L5.4 14.2 L8.4 11.4"/>',
  value: '<ellipse cx="8" cy="8" rx="6" ry="3.8"/>',
  "work-package": '<path d="M2 4.4 H9.6 L14 8 L9.6 11.6 H2 Z"/>',
  plateau:
    '<path d="M3 11.8 H13 M4.2 8.8 H11.8 M5.4 5.8 H10.6"/>',
  gap: '<path d="M3.2 3.6 V12.4 M6.2 3.6 V12.4 M9.8 3.6 V12.4 M12.8 3.6 V12.4"/>',
  grouping:
    '<rect x="2.4" y="2.8" width="11.2" height="10.4" rx="1.4" stroke-dasharray="2 1.5"/>',
  material: '<path d="M3.2 12.6 L5.2 4.2 H10.8 L12.8 12.6 Z"/><path d="M5.4 8.4 H10.6"/>',
  generic: '<rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1"/>',
};

export function iconMarkup(icon: IconId): string {
  return ICONS[icon] ?? ICONS.generic;
}

export function isIconId(value: string): value is IconId {
  return Object.hasOwn(ICONS, value);
}
