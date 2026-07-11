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

export const symbolDefinition: ElementDefinition = { type: 'symbol', resizeBehavior: { handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], applyCenteredResize: applySymbolResize, minimumWidth: { unit: 'pixels', value: MIN_SYMBOL_WIDTH_PX } } };
