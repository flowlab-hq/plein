import { browseNamedView } from "./browser.js";
import { renderViewpointSvg, type ViewpointLayout } from "./layout.js";
import type { PleinModel, ViewDecl } from "./parser.js";

export const EXPORT_FORMATS = ["html", "svg", "both"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

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
  const svg = browsed.svg;
  if (svg !== renderViewpointSvg(browsed.layout)) {
    throw new ExportError("internal: export SVG drifted from renderViewpointSvg");
  }
  return {
    viewName: view.name,
    title: browsed.title,
    svg,
    html: wrapViewpointHtml(browsed.layout, svg, sourceLabel),
  };
}

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
