import { MAX_SYMBOL_SIGNATURE_WIDTH_PCT, MIN_STANDARD_WIDTH_PCT } from '../../constants/signGeometry.js';
import type { CenteredResizeInput, CenteredResizePatch, ElementDefinition } from './types.ts';

export function applySignatureResize({ deltaWidth, minWidth, aspectRatio, page, start }: CenteredResizeInput): CenteredResizePatch {
  const width = Math.max(minWidth, Math.min(MAX_SYMBOL_SIGNATURE_WIDTH_PCT, start.width + deltaWidth));
  const height = width * aspectRatio * (page.width / page.height);
  return {
    width,
    height,
    left: Math.max(0, Math.min(100 - width, start.left + (start.width - width) / 2)),
    top: Math.max(0, Math.min(100 - height, start.top + (start.height - height) / 2)),
  };
}

export const signatureDefinition: ElementDefinition = {
  type: 'signature',
  creation: { mode: 'external' },
  resizeBehavior: { handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], applyCenteredResize: applySignatureResize, minimumWidth: { unit: 'percent', value: MIN_STANDARD_WIDTH_PCT } },
};
