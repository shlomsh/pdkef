import type { ElementDefinition } from './types.ts';
import type { BlurStrokeElement, WhiteoutStrokeElement } from '../model/editorModel.ts';
import { isBlurStrength } from '../model/blurStrength.ts';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';

// RED-32: the two brush strokes. A stroke is created by a gesture in Redact's
// brush mode (never by the registry's `create`), is not resizable, and is
// destroyed like a box: a page carrying one is saved as one picture
// (redact.js). Sign never creates or draws them.

export const MIN_STROKE_SIZE_PT = 1;
export const MAX_STROKE_SIZE_PT = 200;
/** A pointer drag is thousands of points at most; a draft claiming more is corrupt. */
const MAX_STROKE_POINTS = 20000;

function isStrokePoints(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_STROKE_POINTS && value.every((p) => (
    Array.isArray(p) && p.length === 2
    && typeof p[0] === 'number' && Number.isFinite(p[0]) && p[0] >= 0 && p[0] <= 100
    && typeof p[1] === 'number' && Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= 100
  ));
}

function isStrokeShape(value: Record<string, unknown>): boolean {
  return hasString(value, 'id') && hasNumber(value, 'pageIndex') && hasBoxGeometry(value)
    && isStrokePoints(value.points)
    && hasNumber(value, 'sizePt') && (value.sizePt as number) >= MIN_STROKE_SIZE_PT && (value.sizePt as number) <= MAX_STROKE_SIZE_PT;
}

export const blurStrokeDefinition: ElementDefinition<BlurStrokeElement> = {
  type: 'blurStroke',
  schema: (value): value is BlurStrokeElement => isRecord(value) && value.type === 'blurStroke' && isStrokeShape(value)
    && (value.strength === undefined || isBlurStrength(value.strength)),
  creation: { mode: 'external' },
  serialize: (element, context) => (context.redaction ? { kind: 'blur' as const, element } : undefined),
  resizeBehavior: { handles: [] },
};

export const whiteoutStrokeDefinition: ElementDefinition<WhiteoutStrokeElement> = {
  type: 'whiteoutStroke',
  schema: (value): value is WhiteoutStrokeElement => isRecord(value) && value.type === 'whiteoutStroke' && isStrokeShape(value)
    && hasString(value, 'color'),
  creation: { mode: 'external' },
  serialize: (element, context) => (context.redaction ? { kind: 'solid' as const, element } : undefined),
  resizeBehavior: { handles: [] },
};
