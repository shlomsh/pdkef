import type { ElementDefinition } from './types.ts';
import type { HighlightElement } from '../model/editorModel.ts';
import { DEFAULT_HIGHLIGHT_COLOR } from '../model/highlightColors.ts';
import { UNDERLINE_WIDTH } from '../model/underlineInk.ts';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';

const MAX_BANDS = 200;
const MIN_OPACITY = 0.3;

function isBand(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const inRange = (key: string, min: number, max: number) =>
    hasNumber(value, key) && (value[key] as number) >= min && (value[key] as number) <= max;
  return inRange('left', -1, 101) && inRange('top', -1, 101) && inRange('width', 0, 101) && inRange('height', 0, 101);
}

export const highlightDefinition: ElementDefinition<HighlightElement> = {
  type: 'highlight',
  schema: (value): value is HighlightElement => isRecord(value) && value.type === 'highlight' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value) && hasString(value, 'color')
    && Array.isArray(value.bands) && value.bands.length >= 1 && value.bands.length <= MAX_BANDS && value.bands.every(isBand)
    && (value.direction === undefined || value.direction === 'ltr' || value.direction === 'rtl')
    && (value.stroke === undefined || value.stroke === 'sketch')
    // READ-14: a style a newer build wrote stays in the draft and draws as a highlight here; dropping it would lose the mark on the next autosave
    && (value.style === undefined || typeof value.style === 'string')
    && (value.opacity === undefined || (hasNumber(value, 'opacity') && (value.opacity as number) >= MIN_OPACITY && (value.opacity as number) <= 1))
    && (value.strokeWidth === undefined || (hasNumber(value, 'strokeWidth') && (value.strokeWidth as number) >= UNDERLINE_WIDTH.min && (value.strokeWidth as number) <= UNDERLINE_WIDTH.max)),
  creation: { mode: 'drag', create: ({ id, pageIndex, point, highlightColor }) => ({ id, type: 'highlight', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color: highlightColor ?? DEFAULT_HIGHLIGHT_COLOR, bands: [] }) },
  serialize: async (element, context) => (await import('./highlightPdf.ts')).serializeHighlight(element, context),
  view: {},
  resizeBehavior: { handles: [] },
};
