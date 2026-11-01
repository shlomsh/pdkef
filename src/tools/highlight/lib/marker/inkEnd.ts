import type { HighlightElement } from '#editor/model/editorModel.ts';

/** The end of a highlight's ink in page percent: where the last band stops in reading direction, and that line's top and bottom. */
export function inkEnd(el: HighlightElement): { x: number; top: number; bottom: number } {
  const rtl = el.direction === 'rtl';
  const band = el.bands[el.bands.length - 1];
  if (!band) return { x: rtl ? el.left : el.left + el.width, top: el.top, bottom: el.top + el.height };
  const left = el.left + (band.left / 100) * el.width;
  const top = el.top + (band.top / 100) * el.height;
  return {
    x: rtl ? left : left + (band.width / 100) * el.width,
    top,
    bottom: top + (band.height / 100) * el.height,
  };
}
