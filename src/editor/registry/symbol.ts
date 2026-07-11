import { MAX_SYMBOL_SIGNATURE_WIDTH_PCT, MIN_SYMBOL_WIDTH_PX } from '../../constants/signGeometry.js';
import { h } from 'preact';
import { LineCapStyle, rgb } from '@cantoo/pdf-lib';
import SymbolNode from '../../components/SignTool/nodes/SymbolNode.jsx';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { hexToRgbFractions } from '../../lib/signHelpers.js';
import { percentToPoints } from '../../lib/coords.js';
import type { CenteredResizeInput, CenteredResizePatch, ElementDefinition } from './types.ts';
import type { SymbolElement } from '../../lib/editorModel.ts';

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

export const symbolDefinition: ElementDefinition<SymbolElement> = {
  type: 'symbol',
  schema: (value): value is SymbolElement => isRecord(value) && value.type === 'symbol' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: {
    mode: 'point',
    create: ({ id, pageIndex, point, color, symbolWidth = 0, symbolHeight = 0 }) => ({
      id, type: 'symbol', pageIndex, left: point.left - symbolWidth / 2, top: point.top - symbolHeight / 2,
      width: symbolWidth, height: symbolHeight, mark: 'check', color,
    }),
  },
  render: ({ element }) => h(SymbolNode, { element, isActive: false, onResizeStart: () => {} }),
  serialize: (element, { page, pdfWidth, pdfHeight, pdfX, pdfY }) => {
    const { width, height, color, mark } = element;
    const widthPoints = percentToPoints(width, pdfWidth);
    const heightPoints = percentToPoints(height, pdfHeight);
    const { r, g, b } = hexToRgbFractions(color, '#1463ff');
    const symbolColor = rgb(r, g, b);
    if (mark === 'x') {
      const thickness = (widthPoints / 24) * 3;
      page.drawLine({ start: { x: pdfX + widthPoints * (4 / 24), y: pdfY - heightPoints * (4 / 24) }, end: { x: pdfX + widthPoints * (20 / 24), y: pdfY - heightPoints * (20 / 24) }, thickness, color: symbolColor, lineCap: LineCapStyle.Round });
      page.drawLine({ start: { x: pdfX + widthPoints * (20 / 24), y: pdfY - heightPoints * (4 / 24) }, end: { x: pdfX + widthPoints * (4 / 24), y: pdfY - heightPoints * (20 / 24) }, thickness, color: symbolColor, lineCap: LineCapStyle.Round });
    } else if (mark === 'dot') {
      page.drawEllipse({ x: pdfX + widthPoints / 2, y: pdfY - heightPoints / 2, xScale: widthPoints * (8 / 24), yScale: heightPoints * (8 / 24), color: symbolColor, borderWidth: 0 });
    } else {
      const thickness = (widthPoints / 24) * 3;
      page.drawLine({ start: { x: pdfX + widthPoints * (4 / 24), y: pdfY - heightPoints * (12 / 24) }, end: { x: pdfX + widthPoints * (9 / 24), y: pdfY - heightPoints * (17 / 24) }, thickness, color: symbolColor, lineCap: LineCapStyle.Round });
      page.drawLine({ start: { x: pdfX + widthPoints * (9 / 24), y: pdfY - heightPoints * (17 / 24) }, end: { x: pdfX + widthPoints * (20 / 24), y: pdfY - heightPoints * (6 / 24) }, thickness, color: symbolColor, lineCap: LineCapStyle.Round });
    }
  },
  view: { isSymbol: true },
  resizeBehavior: { handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], applyCenteredResize: applySymbolResize, minimumWidth: { unit: 'pixels', value: MIN_SYMBOL_WIDTH_PX } },
};
