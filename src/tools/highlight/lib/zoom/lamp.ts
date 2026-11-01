import { clampZoom, fitScale, resolveZoom, type PageBox, type Viewport, type ZoomSetting } from './fit.ts';
import { ACTUAL_SIZE } from './percent.ts';
import type { KeyAction } from '../marker/keys.ts';

/** The page a fit sizes by: the widest, since the column is as wide as the widest page. */
export function widestPage(pages: readonly PageBox[]): PageBox | undefined {
  return pages.reduce<PageBox | undefined>((w, p) => (!w || p.width > w.width ? p : w), undefined);
}

/** The zoom the view shows: Fit width of the card in the normal view, the remembered setting in the lamp. */
export function displayZoom(setting: ZoomSetting, inLamp: boolean, page: PageBox | undefined, view: Viewport): number {
  if (!page || view.width === 0) return typeof setting === 'number' && inLamp ? clampZoom(setting) : ACTUAL_SIZE;
  return inLamp ? resolveZoom(setting, page, view, { noted: false }) : fitScale('width', page, view, { noted: false });
}

/** In the normal view a ctrl+wheel pinch or a zoom key opens the lamp, where the zoom then works. */
export function opensLamp(input: { type: 'wheel'; ctrlKey: boolean } | { type: 'key'; action: KeyAction | null }): boolean {
  if (input.type === 'wheel') return input.ctrlKey;
  return input.action?.type === 'zoom' || input.action?.type === 'zoomActual';
}
