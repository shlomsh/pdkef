import { clampZoom, fitScale, resolveZoom, type PageBox, type Viewport, type ZoomSetting } from './fit.ts';
import { ACTUAL_SIZE } from './percent.ts';
import type { KeyAction } from '../marker/keys.ts';

/** The page a fit sizes by: the widest, since the column is as wide as the widest page. */
export function widestPage(pages: readonly PageBox[]): PageBox | undefined {
  return pages.reduce<PageBox | undefined>((w, p) => (!w || p.width > w.width ? p : w), undefined);
}

/**
 * The zoom the view shows: Fit width of the card in the normal view, the remembered setting in the lamp.
 * With notes, Fit width and Fit text leave room for the notes column (R28): NOTES_W px beside the page in the
 * normal view, NOTES_W page units (the column scales) in the lamp. A numeric zoom is unchanged.
 */
export function displayZoom(setting: ZoomSetting, inLamp: boolean, page: PageBox | undefined, view: Viewport, noted: boolean): number {
  if (!page || view.width === 0) return typeof setting === 'number' && inLamp ? clampZoom(setting) : ACTUAL_SIZE;
  // The normal view's workspace already sits inside the card gutters; only the lamp, edge to edge, adds its own.
  return inLamp ? resolveZoom(setting, page, view, { noted }) : fitScale('width', page, view, { noted, notesIn: 'px', pad: 0 });
}

/** A ctrl+wheel pinch or a zoom key: the lamp's zoom inputs; the normal view leaves them to the browser. */
export function isZoomInput(input: { type: 'wheel'; ctrlKey: boolean } | { type: 'key'; action: KeyAction | null }): boolean {
  if (input.type === 'wheel') return input.ctrlKey;
  return input.action?.type === 'zoom' || input.action?.type === 'zoomActual';
}
