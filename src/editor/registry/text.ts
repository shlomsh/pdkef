import type { ElementDefinition } from './types.ts';
import { MAX_FONT_SIZE_PT, MIN_FONT_SIZE_PT, TEXT_RESIZE_SCALE_FACTOR } from '../../constants/signGeometry.js';
import type { TextPositionInput, TextPositionPatch, TextResizeInput, TextResizePatch } from './types.ts';

export function applyTextResize({ startFontSize, delta, startRect, fallbackDeltaPoints }: TextResizeInput): TextResizePatch {
  let fontSize = startFontSize;
  if (startRect && startRect.width > 0 && startRect.height > 0) {
    const scale = 1 + (delta.x * startRect.width + delta.y * startRect.height)
      / (startRect.width * startRect.width + startRect.height * startRect.height);
    fontSize = Math.round(startFontSize * scale);
  } else {
    fontSize = Math.round(startFontSize + fallbackDeltaPoints * TEXT_RESIZE_SCALE_FACTOR);
  }
  return { fontSize: Math.max(MIN_FONT_SIZE_PT, Math.min(MAX_FONT_SIZE_PT, fontSize)) };
}

export function applyTextPosition({ start, startSize, nextSize, isLeftHandle, isTopHandle, isRtl }: TextPositionInput): TextPositionPatch {
  let { left, top } = start;
  if (nextSize.width > 0 && startSize.width > 0) {
    if (isLeftHandle && !isRtl) left = start.left + startSize.width - nextSize.width;
    else if (!isLeftHandle && isRtl) left = start.left - startSize.width + nextSize.width;
  }
  if (nextSize.height > 0 && startSize.height > 0 && isTopHandle) {
    top = start.top + startSize.height - nextSize.height;
  }
  return { left, top };
}

export const textDefinition: ElementDefinition = {
  type: 'text',
  creation: {
    mode: 'point',
    create: ({ id, pageIndex, point, color, font, fontSize, direction }) => ({
      id, type: 'text', pageIndex, left: point.left, top: point.top, text: '',
      fontSize, fontWeight: 'normal', fontStyle: 'normal', fontFamily: font, color, autoFocus: true,
      ...(direction != null ? { textDirection: direction } : {}),
    }),
  },
  resizeBehavior: { handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], applyTextResize, applyTextPosition },
};
