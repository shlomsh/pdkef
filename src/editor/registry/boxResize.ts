import { MAX_SHAPE_SIZE_PCT, MIN_SHAPE_SIZE_PCT } from '../../constants/signGeometry.js';
import type { BoxResizeInput, BoxResizePatch } from './types.ts';

const clampSize = (value: number, pageLimit: number) =>
  Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(pageLimit, value)));

/**
 * Anchor-preserving resize behavior for box elements. Bounds are applied to
 * the dragged dimension against its opposite fixed edge, never by moving an
 * unrelated left/top edge after the fact.
 */
export function applyBoxResize({ handle, delta, start }: BoxResizeInput): BoxResizePatch {
  let { width, height, left, top } = start;
  const maxWidthFromRightGrowth = 100 - start.left;
  const maxWidthFromLeftGrowth = start.left + start.width;
  const maxHeightFromBottomGrowth = 100 - start.top;
  const maxHeightFromTopGrowth = start.top + start.height;

  if (handle === 'right' || handle === 'bottom-right' || handle === 'top-right') {
    width = clampSize(start.width + delta.x, maxWidthFromRightGrowth);
  }
  if (handle === 'left' || handle === 'bottom-left' || handle === 'top-left') {
    width = clampSize(start.width - delta.x, maxWidthFromLeftGrowth);
    left = start.left - (width - start.width);
  }
  if (handle === 'bottom' || handle === 'bottom-right' || handle === 'bottom-left') {
    height = clampSize(start.height + delta.y, maxHeightFromBottomGrowth);
  }
  if (handle === 'top' || handle === 'top-right' || handle === 'top-left') {
    height = clampSize(start.height - delta.y, maxHeightFromTopGrowth);
    top = start.top - (height - start.height);
  }

  return { width, height, left, top };
}
