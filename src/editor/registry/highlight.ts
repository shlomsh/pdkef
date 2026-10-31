import type { ElementDefinition } from './types.ts';
import type { HighlightElement } from '../model/editorModel.ts';
import { DEFAULT_HIGHLIGHT_COLOR } from '../model/highlightColors.ts';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';

const MAX_BANDS = 200;
const MAX_COMMENT_LENGTH = 4000;

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
    && (value.comment === undefined || (typeof value.comment === 'string' && value.comment.length <= MAX_COMMENT_LENGTH))
    && (value.direction === undefined || value.direction === 'ltr' || value.direction === 'rtl'),
  creation: { mode: 'drag', create: ({ id, pageIndex, point, highlightColor }) => ({ id, type: 'highlight', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color: highlightColor ?? DEFAULT_HIGHLIGHT_COLOR, bands: [] }) },
  serialize: async (element, context) => (await import('./highlightPdf.ts')).serializeHighlight(element, context),
  view: {},
  resizeBehavior: { handles: [] },
};
