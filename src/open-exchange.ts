/**
 * Import a documented subset of the Open Group ArchiMate Model Exchange
 * File Format (3.1 namespace) into `.plein`.
 *
 * Export and round-trip are S5b — this module only reads XML.
 */

import {
  ELEMENT_KEYWORDS,
  isValueStreamStageKeyword,
  resolveElementKeyword,
  resolveRelationshipKeyword,
  toKebabCaseKeyword,
  type ElementKeyword,
} from "./keywords.js";
import { checkPlein, ParseError } from "./parser.js";
import {
  attribute,
  directText,
  elementChildren,
  parseXml,
  XmlError,
  type XmlElement,
} from "./xml.js";

/** ArchiMate Model Exchange File Format 3.1 element namespace. */
export const OPEN_EXCHANGE_NS = "http://www.opengroup.org/xsd/archimate/3.0/";

const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

/** View-clause names that must not be reused as element ids (they end an include list). */
const VIEW_CLAUSES = new Set([
  "include",
  "exclude",
  "title",
  "autoLayout",
  "nesting",
  "view",
  "viewpoint",
]);

const JUNCTION_TYPES = new Set(["Junction", "AndJunction", "OrJunction"]);

const VISUAL_NODE_TYPES = new Set(["Label", "Note", "Container", "Group"]);

/**
 * Open Exchange relationship xsi:type → language-reference spelling.
 * The spelling is what `.plein` authors write after the colon.
 */
const RELATIONSHIP_SPELLING: Record<string, string> = {
  Composition: "composition",
  Aggregation: "aggregation",
  Assignment: "assignment",
  Realization: "realization",
  Serving: "serving",
  Access: "access",
  Influence: "influence",
  Triggering: "triggering",
  Flow: "flow",
  Specialization: "specialization",
  Association: "association",
};

const elementTypeToKeyword = new Map<string, ElementKeyword>();
for (const keyword of ELEMENT_KEYWORDS) {
  elementTypeToKeyword.set(pascalType(keyword), keyword);
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export type ImportReport = {
  modelName?: string;
  modelIdentifier?: string;
  elements: number;
  relationships: number;
  views: number;
  skippedJunctions: number;
  skippedJunctionRelationships: number;
  skippedVisuals: number;
  skippedViews: number;
  synthesizedView: boolean;
};

export type ImportedPlein = {
  source: string;
  report: ImportReport;
};

type ImportedElement = {
  keyword: ElementKeyword;
  label: string;
  id: string;
  comments: string[];
};

type ImportedRelationship = {
  source: string;
  target: string;
  spelling: string;
  comments: string[];
};

type ImportedView = {
  name: string;
  title?: string;
  nesting: boolean;
  include: string[];
  comments: string[];
};

type LangText = { lang?: string; text: string };

/** PascalCase `xsi:type` values accepted for elements (Plein catalogue, including grouping and location). */
export function openExchangeElementTypes(): readonly string[] {
  return ELEMENT_KEYWORDS.map(pascalType);
}

/** PascalCase `xsi:type` values accepted for relationships. */
export function openExchangeRelationshipTypes(): readonly string[] {
  return Object.keys(RELATIONSHIP_SPELLING);
}

/**
 * Read Open Exchange XML and return `.plein` source for the documented subset.
 * The result has already passed `checkPlein`.
 */
export function importOpenExchange(xml: string, file = "input.xml"): ImportedPlein {
  let root: XmlElement;
  try {
    root = parseXml(xml);
  } catch (error) {
    if (error instanceof XmlError) {
      throw new ImportError(`${file}:${error.line}:${error.column}: ${error.message}`);
    }
    throw error;
  }

  if (root.local !== "model") {
    throw fail(file, root, `expected an Open Exchange <model> root (got <${root.local}>)`);
  }
  if (root.ns && root.ns !== OPEN_EXCHANGE_NS) {
    const older = /\/archimate\/2(\.|$)/.test(root.ns) || /\/xsd\/archimate\/?$/.test(root.ns);
    const why = older ? "ArchiMate 2 exchange is not supported. " : "";
    throw fail(
      file,
      root,
      `${why}unsupported model namespace '${root.ns}' (expected ${OPEN_EXCHANGE_NS})`,
    );
  }

  const modelName = preferred(langTexts(root, "name", true))?.text;
  const modelIdentifier = attribute(root, "identifier");
  const defs = propertyDefinitions(root);
  const usedIds = new Set<string>();
  const originalToPlein = new Map<string, string>();
  const skippedJunctions = new Set<string>();
  const elements: ImportedElement[] = [];

  for (const group of named(root, "elements")) {
    for (const element of named(group, "element")) {
      const originalId = requireAttr(file, element, "identifier");
      if (originalToPlein.has(originalId) || skippedJunctions.has(originalId)) {
        throw fail(file, element, `duplicate identifier '${originalId}'`);
      }
      const typeName = xsiType(element);
      if (!typeName) {
        throw fail(file, element, `element '${originalId}' has no xsi:type`);
      }
      if (JUNCTION_TYPES.has(typeName)) {
        skippedJunctions.add(originalId);
        continue;
      }
      const keyword = elementTypeToKeyword.get(typeName);
      if (!keyword) {
        throw fail(file, element, `unknown element type '${typeName}'`);
      }
      const allocated = allocateId(originalId, usedIds);
      originalToPlein.set(originalId, allocated.id);
      const label = labelOf(element, originalId);
      elements.push({
        keyword,
        label: label.label,
        id: allocated.id,
        comments: [
          ...label.extras,
          ...documentationComments(element),
          ...propertyComments(element, defs),
          ...(allocated.rewritten ? [`// open-exchange identifier: ${oneLine(originalId)}`] : []),
        ],
      });
    }
  }

  const relationships: ImportedRelationship[] = [];
  let skippedJunctionRelationships = 0;
  for (const group of named(root, "relationships")) {
    for (const relationship of named(group, "relationship")) {
      const originalId = attribute(relationship, "identifier") ?? "relationship";
      const typeName = xsiType(relationship);
      if (!typeName) {
        throw fail(file, relationship, `relationship '${originalId}' has no xsi:type`);
      }
      const spelling = RELATIONSHIP_SPELLING[typeName];
      if (!spelling || !resolveRelationshipKeyword(spelling)) {
        throw fail(file, relationship, `unknown relationship type '${typeName}'`);
      }
      const source = requireAttr(file, relationship, "source");
      const target = requireAttr(file, relationship, "target");
      if (source === target) {
        throw fail(file, relationship, `relationship '${originalId}' cannot target itself`);
      }
      if (skippedJunctions.has(source) || skippedJunctions.has(target)) {
        skippedJunctionRelationships += 1;
        continue;
      }
      const sourceId = originalToPlein.get(source);
      const targetId = originalToPlein.get(target);
      if (!sourceId || !targetId) {
        const missing = sourceId ? target : source;
        throw fail(
          file,
          relationship,
          `relationship '${originalId}' references unknown element '${missing}'`,
        );
      }
      const relLabel = labelOf(relationship, "");
      const comments = [
        ...(relLabel.label ? [`// name: ${relLabel.label}`] : []),
        ...relLabel.extras,
        ...documentationComments(relationship),
      ];
      const accessType = attribute(relationship, "accessType");
      if (accessType) {
        comments.push(`// accessType: ${oneLine(accessType)}`);
      }
      const modifier = attribute(relationship, "modifier");
      if (modifier) {
        comments.push(`// modifier: ${oneLine(modifier)}`);
      }
      relationships.push({ source: sourceId, target: targetId, spelling, comments });
    }
  }

  const viewpoints = viewpointNames(root);
  const collected = diagramViews(root);
  const usedViewNames = new Set<string>();
  let skippedVisuals = 0;
  let skippedViews = 0;
  const views: ImportedView[] = [];

  for (const view of collected) {
    const typeName = xsiType(view);
    if (typeName && typeName !== "Diagram") {
      skippedViews += 1;
      continue;
    }
    const walked = walkNodes(view);
    skippedVisuals += walked.visuals;
    const include: string[] = [];
    const seen = new Set<string>();
    for (const ref of walked.refs) {
      if (skippedJunctions.has(ref)) {
        continue;
      }
      const id = originalToPlein.get(ref);
      if (!id) {
        throw fail(file, view, `diagram references unknown element '${ref}'`);
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      include.push(id);
    }
    if (include.length === 0) {
      skippedViews += 1;
      continue;
    }
    const originalId = attribute(view, "identifier") ?? "";
    const heading = labelOf(view, "");
    const name = allocateViewName(originalId || heading.label || "view", usedViewNames);
    const viewpoint = viewpointLabel(view, viewpoints);
    views.push({
      name,
      title: heading.label || undefined,
      nesting: walked.nested,
      include,
      comments: [
        ...(viewpoint ? [`// ArchiMate viewpoint: ${oneLine(viewpoint)}`] : []),
        ...heading.extras,
        ...documentationComments(view),
        ...(originalId && name !== originalId
          ? [`// open-exchange identifier: ${oneLine(originalId)}`]
          : []),
      ],
    });
  }

  let synthesizedView = false;
  if (views.length === 0 && collected.length === 0 && elements.length > 0) {
    synthesizedView = true;
    const name = allocateViewName("imported", usedViewNames);
    views.push({
      name,
      title: modelName ? pleinLabel(modelName, "Imported") : "Imported",
      nesting: false,
      include: elements.map((element) => element.id),
      comments: [],
    });
  }

  const source = renderPlein({
    modelName,
    modelIdentifier,
    modelComments: documentationComments(root),
    elements,
    relationships,
    views,
  });
  const pleinFile = file.replace(/\.xml$/i, "") === file ? `${file}.plein` : file.replace(/\.xml$/i, ".plein");
  try {
    checkPlein(source, pleinFile);
  } catch (error) {
    if (error instanceof ParseError) {
      throw new ImportError(`generated .plein failed check: ${error.message}`);
    }
    throw error;
  }

  return {
    source,
    report: {
      modelName,
      modelIdentifier,
      elements: elements.length,
      relationships: relationships.length,
      views: views.length,
      skippedJunctions: skippedJunctions.size,
      skippedJunctionRelationships,
      skippedVisuals,
      skippedViews,
      synthesizedView,
    },
  };
}

/** Human-readable summary for the CLI. Notes go with the summary. */
export function formatImportReport(file: string, report: ImportReport, output?: string): string {
  const dest = output ? ` -> ${output}` : "";
  const lines = [
    `imported ${file}${dest} (${report.elements} elements, ${report.relationships} relationships, ${report.views} views)`,
    "note: diagram geometry, styles, and organization folders are not imported",
  ];
  if (report.skippedJunctions > 0) {
    const junctions = `${report.skippedJunctions} junction${report.skippedJunctions === 1 ? "" : "s"}`;
    if (report.skippedJunctionRelationships > 0) {
      const rels = `${report.skippedJunctionRelationships} relationship${report.skippedJunctionRelationships === 1 ? "" : "s"}`;
      const pronoun = report.skippedJunctions === 1 ? "it" : "them";
      lines.push(`note: skipped ${junctions} and ${rels} that referenced ${pronoun}`);
    } else {
      lines.push(`note: skipped ${junctions}`);
    }
  }
  if (report.skippedVisuals > 0) {
    lines.push(
      `note: skipped ${report.skippedVisuals} diagram-only node${report.skippedVisuals === 1 ? "" : "s"} (label or container)`,
    );
  }
  if (report.skippedViews > 0) {
    lines.push(`note: skipped ${report.skippedViews} non-diagram view${report.skippedViews === 1 ? "" : "s"}`);
  }
  if (report.synthesizedView) {
    lines.push("note: no diagrams in the exchange file; wrote viewpoint imported");
  }
  return lines.join("\n");
}

function renderPlein(input: {
  modelName?: string;
  modelIdentifier?: string;
  modelComments: string[];
  elements: ImportedElement[];
  relationships: ImportedRelationship[];
  views: ImportedView[];
}): string {
  const lines: string[] = [importBanner(input.modelName, input.modelIdentifier)];
  lines.push("// Diagram geometry, styles, and organization folders are not imported.");
  lines.push(...input.modelComments);
  lines.push("");
  lines.push("plein {");
  lines.push("  model {");
  for (const element of input.elements) {
    lines.push(
      `    ${toKebabCaseKeyword(element.keyword)} "${element.label}" as ${element.id}`,
    );
    for (const comment of element.comments) {
      lines.push(`    ${comment}`);
    }
  }
  if (input.relationships.length > 0 && input.elements.length > 0) {
    lines.push("");
  }
  for (const relationship of input.relationships) {
    lines.push(
      `    ${relationship.source} -> ${relationship.target}: ${relationship.spelling}`,
    );
    for (const comment of relationship.comments) {
      lines.push(`    ${comment}`);
    }
  }
  lines.push("  }");
  if (input.views.length > 0) {
    lines.push("");
    lines.push("  views {");
    for (const view of input.views) {
      if (view.title) {
        lines.push(`    viewpoint ${view.name} "${view.title}" {`);
      } else {
        lines.push(`    view ${view.name} {`);
      }
      for (const comment of view.comments) {
        lines.push(`      ${comment}`);
      }
      if (view.nesting) {
        lines.push("      nesting nested");
      }
      lines.push(`      include ${view.include.join(", ")}`);
      lines.push("    }");
    }
    lines.push("  }");
  }
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function importBanner(name?: string, id?: string): string {
  const bits: string[] = [];
  if (name) {
    bits.push(`"${oneLine(name)}"`);
  }
  if (id) {
    bits.push(`(${oneLine(id)})`);
  }
  const rest = bits.length > 0 ? ` ${bits.join(" ")}` : "";
  return `// Imported from Open Exchange${rest}.`;
}

function walkNodes(view: XmlElement): { refs: string[]; nested: boolean; visuals: number } {
  let visuals = 0;
  const refs: string[] = [];
  let nested = false;

  const visit = (node: XmlElement, parentIsElement: boolean): void => {
    if (node.local !== "node") {
      for (const child of named(node, "node")) {
        visit(child, false);
      }
      return;
    }
    const ref = attribute(node, "elementRef");
    const typeName = xsiType(node);
    if (!ref && isVisualNode(node, typeName)) {
      visuals += 1;
    }
    if (ref && parentIsElement) {
      nested = true;
    }
    if (ref) {
      refs.push(ref);
    }
    for (const child of named(node, "node")) {
      visit(child, Boolean(ref));
    }
  };

  visit(view, false);
  return { refs, nested, visuals };
}

function isVisualNode(node: XmlElement, typeName: string | undefined): boolean {
  if (typeName && VISUAL_NODE_TYPES.has(typeName)) {
    return true;
  }
  return named(node, "label").length > 0;
}

function diagramViews(model: XmlElement): XmlElement[] {
  const views: XmlElement[] = [];
  for (const viewsEl of named(model, "views")) {
    const diagrams = named(viewsEl, "diagrams");
    if (diagrams.length > 0) {
      for (const diagram of diagrams) {
        views.push(...named(diagram, "view"));
      }
      continue;
    }
    views.push(...named(viewsEl, "view"));
  }
  return views;
}

function viewpointNames(model: XmlElement): Map<string, string> {
  const names = new Map<string, string>();
  for (const viewsEl of named(model, "views")) {
    for (const group of named(viewsEl, "viewpoints")) {
      for (const viewpoint of named(group, "viewpoint")) {
        const id = attribute(viewpoint, "identifier");
        const name = preferred(langTexts(viewpoint, "name", true))?.text;
        if (id && name) {
          names.set(id, name);
        }
      }
    }
  }
  return names;
}

function viewpointLabel(view: XmlElement, names: Map<string, string>): string | undefined {
  const written = attribute(view, "viewpoint");
  if (written) {
    return names.get(written) ?? written;
  }
  const ref = attribute(view, "viewpointRef");
  if (ref) {
    return names.get(ref) ?? ref;
  }
  return undefined;
}

function propertyDefinitions(model: XmlElement): Map<string, string> {
  const defs = new Map<string, string>();
  for (const group of named(model, "propertyDefinitions")) {
    for (const def of named(group, "propertyDefinition")) {
      const id = attribute(def, "identifier");
      if (!id) {
        continue;
      }
      const name = preferred(langTexts(def, "name", true))?.text;
      defs.set(id, name && name.length > 0 ? name : id);
    }
  }
  return defs;
}

function propertyComments(element: XmlElement, defs: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const group of named(element, "properties")) {
    for (const prop of named(group, "property")) {
      const ref = attribute(prop, "propertyDefinitionRef") ?? "property";
      const name = defs.get(ref) ?? ref;
      const values = langTexts(prop, "value", false);
      const chosen = values.length > 0 ? preferredAll(values) : [];
      if (chosen.length === 0) {
        const direct = directText(prop).trim();
        if (direct) {
          lines.push(...commentLines(`property ${name}`, direct));
        }
        continue;
      }
      for (const value of chosen) {
        lines.push(...commentLines(`property ${name}`, value.text));
      }
    }
  }
  return lines;
}

function documentationComments(element: XmlElement): string[] {
  const docs = langTexts(element, "documentation", false);
  const kept = new Set(preferredAll(docs));
  const lines: string[] = [];
  for (const doc of docs) {
    if (!kept.has(doc)) {
      continue;
    }
    lines.push(...commentLines("documentation", doc.text));
  }
  for (const extra of docs) {
    if (kept.has(extra)) {
      continue;
    }
    const prefix = extra.lang ? `documentation (${extra.lang})` : "documentation";
    lines.push(...commentLines(prefix, extra.text));
  }
  return lines;
}

function labelOf(element: XmlElement, fallback: string): { label: string; extras: string[] } {
  const names = langTexts(element, "name", true);
  const chosen = preferred(names);
  const extras = names
    .filter((item) => item !== chosen)
    .map((item) => `// name${item.lang ? ` (${item.lang})` : ""}: ${oneLine(item.text)}`);
  const label = pleinLabel(chosen?.text ?? "", fallback);
  return { label, extras };
}

function langTexts(element: XmlElement, local: string, collapseWhitespace: boolean): LangText[] {
  const texts: LangText[] = [];
  for (const child of named(element, local)) {
    const raw = directText(child);
    const text = collapseWhitespace ? collapse(raw) : raw.trim();
    if (!text) {
      continue;
    }
    texts.push({ lang: attribute(child, "lang"), text });
  }
  return texts;
}

function preferred(texts: LangText[]): LangText | undefined {
  return texts.find((item) => isEnglish(item.lang)) ?? texts[0];
}

function preferredAll(texts: LangText[]): LangText[] {
  if (texts.length === 0) {
    return [];
  }
  if (texts.some((item) => isEnglish(item.lang))) {
    return texts.filter((item) => isEnglish(item.lang));
  }
  const lang = texts[0]!.lang;
  return texts.filter((item) => item.lang === lang);
}

function isEnglish(lang: string | undefined): boolean {
  return lang !== undefined && /^en(-|$)/i.test(lang);
}

function named(parent: XmlElement, local: string): XmlElement[] {
  return elementChildren(parent, local).filter(
    (child) => child.ns === undefined || parent.ns === undefined || child.ns === parent.ns,
  );
}

function xsiType(element: XmlElement): string | undefined {
  const typed = attribute(element, "type", XSI_NS) ?? attribute(element, "type");
  if (!typed) {
    return undefined;
  }
  const colon = typed.indexOf(":");
  const local = (colon >= 0 ? typed.slice(colon + 1) : typed).trim();
  return local.length > 0 ? local : undefined;
}

function requireAttr(file: string, element: XmlElement, local: string): string {
  const value = attribute(element, local);
  if (!value) {
    throw fail(file, element, `missing ${local}`);
  }
  return value;
}

function allocateId(raw: string, used: Set<string>): { id: string; rewritten: boolean } {
  const base = safeElementId(raw);
  let id = base;
  let n = 2;
  while (used.has(id) || !isSafeElementId(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return { id, rewritten: id !== raw };
}

function allocateViewName(raw: string, used: Set<string>): string {
  let body = raw.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  if (!/^[A-Za-z_]/.test(body)) {
    body = body.length > 0 ? `view-${body}` : "view";
  }
  let name = body;
  let n = 2;
  while (used.has(name)) {
    name = `${body}-${n}`;
    n += 1;
  }
  used.add(name);
  return name;
}

function safeElementId(raw: string): string {
  const trimmed = raw.trim();
  if (isSafeElementId(trimmed)) {
    return trimmed;
  }
  let body = trimmed.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  if (body.length === 0) {
    body = "element";
  }
  if (!/^[A-Za-z_]/.test(body)) {
    body = `xe-${body}`;
  }
  if (!isSafeElementId(body)) {
    body = `xe-${body}`;
  }
  if (!isSafeElementId(body)) {
    body = "xe-element";
  }
  return body;
}

function isSafeElementId(value: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    return false;
  }
  if (VIEW_CLAUSES.has(value)) {
    return false;
  }
  if (resolveElementKeyword(value) !== undefined) {
    return false;
  }
  if (isValueStreamStageKeyword(value)) {
    return false;
  }
  return true;
}

function pleinLabel(value: string, fallback: string): string {
  const flat = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/"/g, "'")
    .replace(/ {2,}/g, " ")
    .trim();
  if (flat.length > 0) {
    return flat;
  }
  return fallback.replace(/[\r\n\t]+/g, " ").replace(/"/g, "'").trim();
}

function commentLines(prefix: string, text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `// ${prefix}: ${line}`);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

function pascalType(keyword: string): string {
  return keyword.charAt(0).toUpperCase() + keyword.slice(1);
}

function fail(file: string, element: XmlElement | undefined, message: string): ImportError {
  if (!element) {
    return new ImportError(`${file}: ${message}`);
  }
  return new ImportError(`${file}:${element.line}:${element.column}: ${message}`);
}
