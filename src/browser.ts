import {
  layoutViewpoint,
  membershipOf,
  renderViewpointSvg,
  type LayoutMembership,
  type LayoutOptions,
  type ViewpointLayout,
} from "./layout.js";
import { filterModel, type FilteredList } from "./list-model.js";
import type { PleinModel, ViewDecl } from "./parser.js";

/**
 * One named viewpoint rendered from an already-loaded model.
 * Switching views must reuse this `model` — do not re-parse the source.
 */
export type BrowsedView = {
  model: PleinModel;
  views: ViewDecl[];
  viewName: string;
  title: string;
  list: FilteredList;
  layout: ViewpointLayout;
  membership: LayoutMembership;
  svg: string;
};

/** Named views in document order — the Mac left sidebar lists these. */
export function namedViews(model: PleinModel): ViewDecl[] {
  return model.views;
}

export function namedViewNames(model: PleinModel): string[] {
  return model.views.map((view) => view.name);
}

export function viewSwitcherLabel(view: ViewDecl): string {
  return view.title || view.name;
}

/** Human-facing name for the always-visible Mac current-view chrome. */
export function currentViewCaption(model: PleinModel, viewName: string | null): string {
  if (!viewName) {
    return "No named view";
  }
  const view = model.views.find((candidate) => candidate.name === viewName);
  if (!view) {
    return "No named view";
  }
  return viewSwitcherLabel(view);
}

/**
 * Render one named viewpoint from a loaded model (M9 layout + SVG).
 * Call this again with a different `viewName` to switch views without reload.
 */
export function browseNamedView(
  model: PleinModel,
  viewName: string,
  options?: LayoutOptions,
): BrowsedView {
  const view = model.views.find((candidate) => candidate.name === viewName);
  if (!view) {
    throw new Error(`unknown view '${viewName}'`);
  }
  const layout = layoutViewpoint(model, viewName, options);
  return {
    model,
    views: model.views,
    viewName: view.name,
    title: viewSwitcherLabel(view),
    list: filterModel(model, viewName),
    layout,
    membership: membershipOf(layout),
    svg: renderViewpointSvg(layout),
  };
}

/**
 * Switch the diagram to another named view of the same loaded model.
 * Does not re-parse source; membership still comes from that view’s include/exclude.
 */
export function switchNamedView(
  model: PleinModel,
  viewName: string,
  options?: LayoutOptions,
): BrowsedView {
  return browseNamedView(model, viewName, options);
}
