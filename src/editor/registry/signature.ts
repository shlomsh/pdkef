import { MAX_SYMBOL_SIGNATURE_WIDTH_PCT, MIN_STANDARD_WIDTH_PCT } from '../../constants/signGeometry.js';
import { h } from 'preact';
import SignatureNode from '../../components/SignTool/nodes/SignatureNode.jsx';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { tintImageDataUrl } from '../../lib/signHelpers.js';
import { percentToPoints } from '../../lib/coords.js';
import type { CenteredResizeInput, CenteredResizePatch, ElementDefinition } from './types.ts';
import type { SignatureElement } from '../../lib/editorModel.ts';

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

export const signatureDefinition: ElementDefinition<SignatureElement> = {
  type: 'signature',
  schema: (value): value is SignatureElement => isRecord(value) && value.type === 'signature' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value) && hasString(value, 'dataUrl'),
  creation: { mode: 'external' },
  render: ({ element }) => h(SignatureNode, { element, isActive: false, onResizeStart: () => {} }),
  serialize: async (element, { pdfDoc, page, pdfWidth, pdfHeight, pdfX, pdfY }) => {
    const { dataUrl, width, height, color } = element;
    const sourceDataUrl = color && color !== '#000000' ? await tintImageDataUrl(dataUrl, color) : dataUrl;
    const embeddedImage = await pdfDoc.embedPng(sourceDataUrl.split(',')[1]);
    const heightPoints = percentToPoints(height, pdfHeight);
    page.drawImage(embeddedImage, { x: pdfX, y: pdfY - heightPoints, width: percentToPoints(width, pdfWidth), height: heightPoints });
  },
  resizeBehavior: { handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], applyCenteredResize: applySignatureResize, minimumWidth: { unit: 'percent', value: MIN_STANDARD_WIDTH_PCT } },
};
