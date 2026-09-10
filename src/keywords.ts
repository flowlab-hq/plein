/**
 * Canonical ArchiMate 4 element keywords (camelCase).
 *
 * Language-reference spellings are kebab-case and resolve onto these names.
 * `grouping` and `location` are ArchiMate composite elements accepted by the
 * parser but not listed in docs/plein-dsl-archimate-4.md (intentional extra).
 */
export const ELEMENT_KEYWORDS = [
  // Strategy
  "resource",
  "capability",
  "valueStream",
  "courseOfAction",
  // Motivation
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
  // Business
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
  // Application
  "applicationComponent",
  "applicationCollaboration",
  "applicationInterface",
  "applicationFunction",
  "applicationInteraction",
  "applicationProcess",
  "applicationEvent",
  "applicationService",
  "dataObject",
  // Technology and physical
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
  "equipment",
  "facility",
  "distributionNetwork",
  "material",
  // Implementation and migration
  "workPackage",
  "deliverable",
  "implementationEvent",
  "plateau",
  "gap",
  // Composite (ArchiMate 4; omitted from the language reference)
  "grouping",
  "location",
] as const;

export type ElementKeyword = (typeof ELEMENT_KEYWORDS)[number];

/** Composite extras not listed in the DSL language reference. */
export const COMPOSITE_ELEMENT_KEYWORDS = ["grouping", "location"] as const;

export type CompositeElementKeyword = (typeof COMPOSITE_ELEMENT_KEYWORDS)[number];

/** Canonical typed relationship keywords. */
export const RELATIONSHIP_KEYWORDS = [
  "composedOf",
  "aggregates",
  "assignedTo",
  "realizes",
  "serves",
  "accesses",
  "influences",
  "triggers",
  "flowsTo",
  "specializes",
  "associatedWith",
] as const;

export type RelationshipKeyword = (typeof RELATIONSHIP_KEYWORDS)[number];

export function toKebabCaseKeyword(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Short layer-omitted spellings map onto the Business (or otherwise obvious)
 * concrete type so existing models and the language-reference alias note stay
 * valid. Layer-specific kebab-case names are distinct canonical types.
 */
const SHORT_ELEMENT_ALIASES: Record<string, ElementKeyword> = {
  process: "businessProcess",
  function: "businessFunction",
  event: "businessEvent",
  service: "businessService",
  role: "businessRole",
  collaboration: "businessCollaboration",
};

const RELATIONSHIP_ALIASES: Record<string, RelationshipKeyword> = {
  composition: "composedOf",
  aggregation: "aggregates",
  assignment: "assignedTo",
  realization: "realizes",
  serving: "serves",
  access: "accesses",
  influence: "influences",
  triggering: "triggers",
  flow: "flowsTo",
  specialization: "specializes",
  association: "associatedWith",
};

const elementLookup = new Map<string, ElementKeyword>();
for (const keyword of ELEMENT_KEYWORDS) {
  elementLookup.set(keyword, keyword);
  const kebab = toKebabCaseKeyword(keyword);
  if (kebab !== keyword) {
    elementLookup.set(kebab, keyword);
  }
}
for (const [alias, keyword] of Object.entries(SHORT_ELEMENT_ALIASES)) {
  elementLookup.set(alias, keyword);
}

const relationshipLookup = new Map<string, RelationshipKeyword>();
for (const keyword of RELATIONSHIP_KEYWORDS) {
  relationshipLookup.set(keyword, keyword);
}
for (const [alias, keyword] of Object.entries(RELATIONSHIP_ALIASES)) {
  relationshipLookup.set(alias, keyword);
}

export function resolveElementKeyword(name: string): ElementKeyword | undefined {
  return elementLookup.get(name);
}

export function resolveRelationshipKeyword(
  name: string,
): RelationshipKeyword | undefined {
  return relationshipLookup.get(name);
}

export function isElementKeyword(name: string): boolean {
  return elementLookup.has(name);
}

export function isRelationshipKeyword(name: string): boolean {
  return relationshipLookup.has(name);
}

/** Nested authoring keyword for a value stream stage (maps to a Value Stream). */
export function isValueStreamStageKeyword(name: string): boolean {
  return name === "valueStreamStage" || name === "value-stream-stage";
}

export function isValueStreamKeyword(name: string): boolean {
  return resolveElementKeyword(name) === "valueStream";
}

/** Dynamic relationships allowed between stages inside a valueStream body. */
export function isValueStreamStageLink(name: RelationshipKeyword): boolean {
  return name === "flowsTo" || name === "triggers";
}

/** Kebab-case spellings listed under Model elements in the language reference. */
export function languageReferenceElementKeywords(): string[] {
  const composites = new Set<string>(COMPOSITE_ELEMENT_KEYWORDS);
  return ELEMENT_KEYWORDS.filter((keyword) => !composites.has(keyword)).map(toKebabCaseKeyword);
}
