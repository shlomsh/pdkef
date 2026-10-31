import type { ElementDefinition } from './types.ts';
import type { CommentAnchor, CommentElement, HighlightBand } from '../model/editorModel.ts';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';

const MAX_BANDS = 200;
const MAX_COMMENT_LENGTH = 4000;

function isBand(value: unknown): value is HighlightBand {
  if (!isRecord(value)) return false;
  const inRange = (key: string, min: number, max: number) =>
    hasNumber(value, key) && (value[key] as number) >= min && (value[key] as number) <= max;
  return inRange('left', -1, 101) && inRange('top', -1, 101) && inRange('width', 0, 101) && inRange('height', 0, 101);
}

function isAnchor(value: unknown): value is CommentAnchor {
  if (!isRecord(value)) return false;
  if (value.kind === 'point') return true;
  if (value.kind === 'element') return hasString(value, 'elementId') && (value.elementId as string).length > 0;
  return value.kind === 'passage' && Array.isArray(value.bands) && value.bands.length >= 1 && value.bands.length <= MAX_BANDS
    && value.bands.every(isBand) && (value.direction === undefined || value.direction === 'ltr' || value.direction === 'rtl');
}

export const commentDefinition: ElementDefinition<CommentElement> = {
  type: 'comment',
  schema: (value): value is CommentElement => isRecord(value) && value.type === 'comment' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value)
    && typeof value.comment === 'string' && value.comment.length <= MAX_COMMENT_LENGTH
    && (value.commentedAt === undefined || (typeof value.commentedAt === 'number' && Number.isFinite(value.commentedAt)))
    && isAnchor(value.anchor),
  // A press makes a pin; the Comment tool's gesture (not this definition) swaps in a passage anchor and box.
  creation: { mode: 'drag', create: ({ id, pageIndex, point }) => ({ id, type: 'comment', pageIndex, left: point.left, top: point.top, width: 0, height: 0, comment: '', anchor: { kind: 'point' } }) },
  serialize: async (element, context) => (await import('./commentPdf.ts')).serializeComment(element, context),
  view: {},
  resizeBehavior: { handles: [] },
};
