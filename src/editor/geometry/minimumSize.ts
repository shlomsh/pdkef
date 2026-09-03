import {
  DEFAULT_SHAPE_FALLBACK_ASPECT_RATIO,
  DEFAULT_SHAPE_FALLBACK_WIDTH_PCT,
  DEFAULT_WHITEOUT_HEIGHT_PCT,
  DEFAULT_WHITEOUT_LEFT_OFFSET_PCT,
  DEFAULT_WHITEOUT_TOP_OFFSET_PCT,
  DEFAULT_WHITEOUT_WIDTH_PCT,
  LINE_RESET_SPREAD_PCT,
  MIN_LINE_LENGTH_PCT,
  MIN_SHAPE_THRESHOLD_PCT,
} from '../../constants/signGeometry.js';
import type { EditorElement } from '../model/editorModel.ts';
import { widthPercentToHeightPercent } from './coords.js';

export interface MinimumSizeContext {
  tool: string;
  rectWidth: number;
  rectHeight: number;
  startLeftPercent: number;
  startTopPercent: number;
}

/** Applies the same release-time minimum geometry used by the Sign reducer. */
export function ensureMinimumElementSize(
  element: EditorElement,
  context: MinimumSizeContext,
): EditorElement {
  const { tool, rectWidth, rectHeight, startLeftPercent, startTopPercent } = context;
  if (tool === 'line') {
    if (element.type !== 'line') return element;
    const tiny = Math.hypot(element.x2 - element.x1, element.y2 - element.y1) < MIN_LINE_LENGTH_PCT;
    return tiny
      ? {
          ...element,
          x1: Math.max(0, startLeftPercent - LINE_RESET_SPREAD_PCT),
          y1: startTopPercent,
          x2: Math.min(100, startLeftPercent + LINE_RESET_SPREAD_PCT),
          y2: startTopPercent,
        }
      : element;
  }

  if (!('width' in element) || !('height' in element)) return element;
  if (element.width >= MIN_SHAPE_THRESHOLD_PCT || element.height >= MIN_SHAPE_THRESHOLD_PCT) return element;

  if (tool === 'whiteout') {
    return {
      ...element,
      left: startLeftPercent - DEFAULT_WHITEOUT_LEFT_OFFSET_PCT,
      top: startTopPercent - DEFAULT_WHITEOUT_TOP_OFFSET_PCT,
      width: DEFAULT_WHITEOUT_WIDTH_PCT,
      height: DEFAULT_WHITEOUT_HEIGHT_PCT,
    };
  }

  const width = DEFAULT_SHAPE_FALLBACK_WIDTH_PCT;
  const height = widthPercentToHeightPercent(
    width,
    DEFAULT_SHAPE_FALLBACK_ASPECT_RATIO,
    rectWidth,
    rectHeight,
  );
  return {
    ...element,
    left: startLeftPercent - width / 2,
    top: startTopPercent - height / 2,
    width,
    height,
  };
}
