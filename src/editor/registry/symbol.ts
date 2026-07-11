import { MAX_SYMBOL_SIGNATURE_WIDTH_PCT, MIN_SYMBOL_WIDTH_PX } from '../../constants/signGeometry.js';
import type { CenteredResizeInput, CenteredResizePatch, ElementDefinition } from './types.ts';

export function applySymbolResize({ deltaWidth, minWidth, aspectRatio, page, start }: CenteredResizeInput): CenteredResizePatch {
  const width = Math.max(minWidth, Math.min(MAX_SYMBOL_SIGNATURE_WIDTH_PCT, start.width + deltaWidth));
  const height = width * aspectRatio * (page.width / page.height);
  return {
    width,
    height,
    left: Math.max(0, Math.min(100 - width, start.left + (start.width - width) / 2)),
    top: Math.max(0, Math.min(100 - height, start.top + (start.height - height) / 2)),
  };
}

export const symbolDefinition: ElementDefinition = {
  type: 'symbol',
  creation: {
    mode: 'point',
    create: ({ id, pageIndex, point, color, symbolWidth = 0, symbolHeight = 0 }) => ({
      id, type: 'symbol', pageIndex, left: point.left - symbolWidth / 2, top: point.top - symbolHeight / 2,
      width: symbolWidth, height: symbolHeight, mark: 'check', color,
    }),
  },
  resizeBehavior: { handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], applyCenteredResize: applySymbolResize, minimumWidth: { unit: 'pixels', value: MIN_SYMBOL_WIDTH_PX } },
};
