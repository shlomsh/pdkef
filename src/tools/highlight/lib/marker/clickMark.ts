// R10 to R12 as pure decisions: what a click does, and the element it lays. The browser's click count
// decides (clickScope.ts); this file adds which earlier marks the new one replaces.
import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { ReadingDirection } from '#lib/pageLayout/bands.ts';
import { highlightGeometry } from '#lib/pageLayout/swipe.ts';
import { clickOutcome } from './clickScope.ts';
import type { Marker } from './markerState.ts';

export type ClickUnit = 'word' | 'sentence' | 'line';
/** The mark a click laid, which the next click of the same run may grow. */
export interface ClickSequence { id: string; unit: ClickUnit }
interface ClickPlan { unit: ClickUnit; replaceIds: string[] }

/**
 * `inks`: the marks the presses of this click run laid on their own (a press that drifted a few
 * pixels, or a tap on a short word), oldest first. `overId`: the highlight under the click, if any.
 */
export function planClick({ detail, pageKind, inks, overId, sequence }: {
  detail: number;
  pageKind: 'text' | 'scan';
  inks: string[];
  overId: string | null;
  sequence: ClickSequence | null;
}): ClickPlan | null {
  // The third click lands on the word the second one laid: that mark is ours to grow, not an existing highlight.
  const onSequence = detail >= 3 && sequence !== null && overId === sequence.id;
  const own = onSequence || (overId !== null && inks.includes(overId));
  const outcome = clickOutcome({ detail, pageKind, pressInkId: null, overExistingId: own ? null : overId });
  if (outcome.mark === 'none') return null;
  if (onSequence && sequence.unit === outcome.mark) return null;
  return { unit: outcome.mark, replaceIds: onSequence ? [sequence.id] : inks };
}

/** One highlight from the boxes of a unit (page percent), laid in the armed marker; null when they cover no area. */
export function clickMarkElement({ id, pageIndex, boxes, marker, direction }: {
  id: string;
  pageIndex: number;
  boxes: Array<{ left: number; top: number; width: number; height: number }>;
  marker: Marker;
  direction: ReadingDirection;
}): HighlightElement | null {
  const geometry = highlightGeometry(boxes.filter((box) => box.width > 0 && box.height > 0));
  if (!geometry) return null;
  return {
    id, type: 'highlight', pageIndex, ...geometry, color: marker.color,
    ...(marker.style === 'underline' ? { style: 'underline' as const } : {}),
    ...(marker.opacity < 1 ? { opacity: marker.opacity } : {}),
    ...(direction === 'rtl' ? { direction } : {}),
  };
}
