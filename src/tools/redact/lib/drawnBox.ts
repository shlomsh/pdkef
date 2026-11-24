import type { RedactToolType } from '#editor/model/editorModel.ts';
import type { BlurStrength } from '#editor/model/blurStrength.ts';
import type { PercentBox } from '#editor-ui/whiteout/pageColor.ts';
import type { RedactElement } from './redactElements.ts';

/** The tools that draw a box by dragging; Delete never does. */
export type DrawnBoxType = Exclude<RedactToolType, 'delete'>;

export const BLACKOUT_COLOR = '#000000';

/**
 * The element a finished drag places, or null when the press drew nothing
 * (no box, or a width or height of 1% or less). A press that drew nothing has
 * not spent the tool's one placement, so the caller leaves the tool armed -
 * otherwise a mistimed tap would silently disarm and the next real drag would
 * do nothing at all.
 *
 * RED-51: a whiteout takes the page's own colour (a synchronous read of the
 * canvas, inside this one-shot commit) and keeps following it. `samplePage` and
 * `newId` are only called for a box that is placed.
 */
export function drawnBoxElement({ newId, pageIndex, type, patch, blurStrength, samplePage }: {
  newId: () => string;
  pageIndex: number;
  type: DrawnBoxType;
  patch: PercentBox | undefined;
  blurStrength: BlurStrength;
  samplePage: (pageIndex: number, box: PercentBox) => string | null | undefined;
}): RedactElement | null {
  if (!patch || patch.width <= 1 || patch.height <= 1) return null;
  return {
    id: newId(), pageIndex, ...patch, type,
    ...(type === 'whiteout' ? { color: samplePage(pageIndex, patch) ?? '#ffffff', colorMode: 'auto' as const } : {}),
    ...(type === 'blackout' ? { color: BLACKOUT_COLOR } : {}),
    ...(type === 'blur' ? { strength: blurStrength } : {}),
  };
}
