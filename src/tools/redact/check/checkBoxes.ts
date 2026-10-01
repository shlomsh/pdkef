/**
 * The saved-file check's view of Redact's elements: the boxes the person drew
 * plus, since RED-32, the brush strokes as their bounding boxes. A stroke is
 * typed `'blur'` here on purpose: the check treats a blur as covering its
 * area (text under it counts as covered) but never asks whether it is one
 * solid colour, which a stroke's bbox is not, even when the stroke is a solid
 * whiteout. Pure, so the island and the tests share it.
 */
import type { CheckBox } from './types.ts';

interface ElementLike {
  type: string;
  pageIndex: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  color?: string;
}

export function checkBoxesFromElements(elements: readonly ElementLike[]): CheckBox[] {
  const boxes: CheckBox[] = [];
  for (const el of elements) {
    const isBox = el.type === 'blur' || el.type === 'blackout' || el.type === 'whiteout';
    const isStroke = el.type === 'blurStroke' || el.type === 'whiteoutStroke';
    if (!isBox && !isStroke) continue;
    boxes.push({
      pageIndex: el.pageIndex,
      left: el.left ?? 0,
      top: el.top ?? 0,
      width: el.width ?? 0,
      height: el.height ?? 0,
      type: isStroke ? 'blur' : (el.type as CheckBox['type']),
      color: isStroke ? undefined : el.color,
    });
  }
  return boxes;
}
