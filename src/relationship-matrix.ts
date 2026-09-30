import {
  relationshipLanguageName,
  toKebabCaseKeyword,
  type ElementKeyword,
  type RelationshipKeyword,
} from "./keywords.js";
import { RELATIONSHIP_MATRIX } from "./relationship-matrix-data.js";

/**
 * Appendix B letter for each canonical relationship.
 * `i` is assignment (ArchiMate's letter); `a` is access.
 */
const RELATIONSHIP_LETTER: Record<RelationshipKeyword, string> = {
  accesses: "a",
  composedOf: "c",
  flowsTo: "f",
  aggregates: "g",
  assignedTo: "i",
  influences: "n",
  associatedWith: "o",
  realizes: "r",
  specializes: "s",
  triggers: "t",
  serves: "v",
};

export { RELATIONSHIP_MATRIX };

/** True when Appendix B allows this source type, relationship, and target type. */
export function isRelationshipAllowed(
  source: ElementKeyword,
  relationship: RelationshipKeyword,
  target: ElementKeyword,
): boolean {
  const allowed = RELATIONSHIP_MATRIX[source]?.[target];
  if (!allowed) {
    return false;
  }
  return allowed.includes(RELATIONSHIP_LETTER[relationship]);
}

/**
 * Pair diagnostic body. Types and the relationship use language-reference
 * spellings (`business-actor`, `serving`), which are what authors write.
 */
export function invalidRelationshipMessage(
  source: ElementKeyword,
  relationship: RelationshipKeyword,
  target: ElementKeyword,
): string {
  return `invalid relationship '${relationshipLanguageName(relationship)}' from '${toKebabCaseKeyword(source)}' to '${toKebabCaseKeyword(target)}'`;
}
