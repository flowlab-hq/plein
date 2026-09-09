/** Canonical element keywords accepted by the happy-path parser. */
export const ELEMENT_KEYWORDS = [
  "process",
  "function",
  "event",
  "service",
  "role",
  "collaboration",
  "path",
  "grouping",
  "location",
  "businessActor",
  "businessInterface",
  "businessObject",
  "product",
  "applicationComponent",
  "applicationInterface",
  "dataObject",
  "node",
  "device",
  "systemSoftware",
  "technologyInterface",
  "communicationNetwork",
  "distributionNetwork",
  "equipment",
  "facility",
  "artifact",
  "material",
  "capability",
  "resource",
  "valueStream",
  "courseOfAction",
  "stakeholder",
  "driver",
  "assessment",
  "goal",
  "outcome",
  "principle",
  "requirement",
  "meaning",
  "value",
  "workPackage",
  "deliverable",
  "plateau",
] as const;

export type ElementKeyword = (typeof ELEMENT_KEYWORDS)[number];

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

/**
 * Kebab-case and language-reference spellings map onto the canonical keywords
 * so documented examples and peer fixtures stay loadable.
 */
const ELEMENT_ALIASES: Record<string, ElementKeyword> = {
  "business-process": "process",
  "application-process": "process",
  "technology-process": "process",
  "business-function": "function",
  "application-function": "function",
  "technology-function": "function",
  "business-event": "event",
  "application-event": "event",
  "technology-event": "event",
  "implementation-event": "event",
  "business-service": "service",
  "application-service": "service",
  "technology-service": "service",
  "business-role": "role",
  "business-collaboration": "collaboration",
  "application-collaboration": "collaboration",
  "technology-collaboration": "collaboration",
  "business-actor": "businessActor",
  "business-interface": "businessInterface",
  "business-object": "businessObject",
  "application-component": "applicationComponent",
  "application-interface": "applicationInterface",
  "data-object": "dataObject",
  "system-software": "systemSoftware",
  "technology-interface": "technologyInterface",
  "communication-network": "communicationNetwork",
  "distribution-network": "distributionNetwork",
  "value-stream": "valueStream",
  "course-of-action": "courseOfAction",
  "work-package": "workPackage",
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
}
for (const [alias, keyword] of Object.entries(ELEMENT_ALIASES)) {
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
