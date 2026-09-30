import { browseNamedView } from "./browser.js";
import { renderViewpointSvg, type ViewpointLayout } from "./layout.js";
import type { PleinModel, ViewDecl } from "./parser.js";

export type ExportPaths = {
  html?: string;
  svg?: string;
  /** Open Exchange XML for the whole model. */
  xml?: string;
};

export const EXPORT_FORMATS = ["html", "svg", "both"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Formats in the Mac Export… sheet.
 * `open-exchange` is the whole model (`exportOpenExchange`).
 * `plein export --format` still accepts only `html`, `svg`, and `both`.
 */
export const MAC_EXPORT_FORMATS = [...EXPORT_FORMATS, "open-exchange"] as const;

export type MacExportFormat = (typeof MAC_EXPORT_FORMATS)[number];

/** A viewpoint name or title could not be exported. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

export type ExportedView = {
  viewName: string;
  title: string;
  /** Same bytes as `renderViewpointSvg` / the Mac diagram pane. */
  svg: string;
  /** Self-contained HTML page with that SVG inlined. No network, no app. */
  html: string;
};

/**
 * Resolve `--view` to one named viewpoint.
 * A viewpoint name wins. Otherwise a unique title matches.
 * Omit `viewArg` to export the first named view in document order.
 */
export function resolveNamedView(model: PleinModel, viewArg?: string): ViewDecl {
  if (model.views.length === 0) {
    throw new ExportError("file has no named view");
  }
  if (viewArg === undefined || viewArg === "") {
    return model.views[0]!;
  }

  const byName = model.views.find((view) => view.name === viewArg);
  if (byName) {
    return byName;
  }

  const byTitle = model.views.filter((view) => view.title === viewArg);
  if (byTitle.length === 1) {
    return byTitle[0]!;
  }
  if (byTitle.length > 1) {
    const names = byTitle.map((view) => view.name).join(", ");
    throw new ExportError(
      `ambiguous view '${viewArg}' matches ${names}; pass a viewpoint name`,
    );
  }

  const names = model.views.map((view) => view.name).join(", ");
  throw new ExportError(`unknown view '${viewArg}' (named views: ${names})`);
}

/**
 * Static HTML document for one viewpoint. The SVG is the shared renderer
 * (`renderViewpointSvg`); CSS is inline. Browsers open the file with no Mac app.
 */
export function wrapViewpointHtml(
  layout: ViewpointLayout,
  svg: string,
  sourceLabel?: string,
): string {
  const heading = layout.title ?? layout.viewName;
  const title = `${heading} — Plein`;
  const source = sourceLabel ? ` · ${sourceLabel}` : "";
  const meta = `view ${layout.viewName}${source}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; background: #f5f5f7; color: #1d1d1f; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header { padding: 20px 24px 0; }
  h1 { font-size: 20px; font-weight: 600; margin: 0; }
  p { margin: 4px 0 0; color: #6e6e73; font-size: 13px; }
  main { padding: 16px 24px 32px; overflow: auto; }
  svg { display: block; background: #fff; border-radius: 12px; }
</style>
</head>
<body>
<!-- Plein static export. Open this file in a browser. No Mac app required. -->
<header>
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(meta)}</p>
</header>
<main>
${svg}</main>
</body>
</html>
`;
}

/**
 * Static HTML and SVG for a layout that is already on screen
 * (`browseNamedView` / the Mac canvas). Same writer as `exportNamedView`:
 * `renderViewpointSvg` plus `wrapViewpointHtml`.
 */
export function exportViewpoint(layout: ViewpointLayout, sourceLabel?: string): ExportedView {
  const svg = renderViewpointSvg(layout);
  return {
    viewName: layout.viewName,
    title: layout.title || layout.viewName,
    svg,
    html: wrapViewpointHtml(layout, svg, sourceLabel),
  };
}

/**
 * Export one named viewpoint from an already-checked model.
 * Layout and SVG are `browseNamedView` (ELK + `renderViewpointSvg`).
 */
export async function exportNamedView(
  model: PleinModel,
  viewArg?: string,
  sourceLabel?: string,
): Promise<ExportedView> {
  const view = resolveNamedView(model, viewArg);
  const browsed = await browseNamedView(model, view.name);
  const exported = exportViewpoint(browsed.layout, sourceLabel);
  if (exported.svg !== browsed.svg || exported.title !== browsed.title) {
    throw new ExportError("internal: export SVG drifted from renderViewpointSvg");
  }
  return exported;
}

/**
 * Save-panel stem for Open Exchange. The open file name, not the view.
 * A trailing `.plein` or `.xml` is removed so the dialog appends `.xml` once.
 * Import keeps the document path as `booking.xml`; without this strip the
 * panel would suggest `booking.xml.xml`. Dots left at the end of that stem
 * are removed too (`booking2..xml` → `booking2`), so the suggestion is
 * `booking2.xml`.
 */
export function openExchangeSuggestedStem(file: string): string {
  const base = (file.split(/[\\/]/).pop() ?? "").trim();
  const stem = base
    .replace(/\.plein$/i, "")
    .replace(/\.xml$/i, "")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .trim();
  return stem.length > 0 ? stem : "model";
}

/**
 * Paths written for one save-panel choice.
 * `both` writes `<stem>.html` and `<stem>.svg` beside each other,
 * the same pairing as `plein export --format both -o <stem>`.
 * `open-exchange` writes one `.xml` file for the whole model.
 */
export function exportSavePaths(pickedPath: string, format: MacExportFormat): ExportPaths {
  const trimmed = pickedPath.trim();
  if (!trimmed) {
    throw new ExportError("export path is empty");
  }
  if (format === "html") {
    return { html: forceExportExtension(trimmed, "html") };
  }
  if (format === "svg") {
    return { svg: forceExportExtension(trimmed, "svg") };
  }
  if (format === "open-exchange") {
    return { xml: forceOpenExchangeExtension(trimmed) };
  }
  const stem = exportPathStem(trimmed);
  return { html: `${stem}.html`, svg: `${stem}.svg` };
}

function forceOpenExchangeExtension(path: string): string {
  if (/\.xml$/i.test(path)) {
    return path;
  }
  const stripped = path.replace(/\.(html|svg)$/i, "");
  if (stripped.length === 0 || stripped.endsWith("/") || stripped.endsWith("\\")) {
    return `${stripped}model.xml`;
  }
  return `${stripped}.xml`;
}

function forceExportExtension(path: string, ext: "html" | "svg"): string {
  if (new RegExp(`\\.${ext}$`, "i").test(path)) {
    return path;
  }
  return `${exportPathStem(path)}.${ext}`;
}

function exportPathStem(path: string): string {
  const stripped = path.replace(/\.(html|svg)$/i, "");
  if (stripped.length === 0 || stripped.endsWith("/") || stripped.endsWith("\\")) {
    return `${stripped}view`;
  }
  return stripped;
}

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function isMacExportFormat(value: string): value is MacExportFormat {
  return (MAC_EXPORT_FORMATS as readonly string[]).includes(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
