import type { ElementDefinition } from './types.ts';
import type { WhiteoutElement } from '../../lib/editorModel.ts';
import { h } from 'preact';
import { rgb } from '@cantoo/pdf-lib';
import WhiteoutNode from '../../components/SignTool/nodes/WhiteoutNode.jsx';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { applyBoxResize } from './boxResize.ts';
import { hexToRgbFractions } from '../../lib/signHelpers.js';
import { percentToPoints } from '../../lib/coords.js';
import { renderRedactionSurface } from './redactionSurface.ts';
export const whiteoutDefinition: ElementDefinition<WhiteoutElement> = {
  type: 'whiteout',
  schema: (value): value is WhiteoutElement => isRecord(value) && value.type === 'whiteout' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: { mode: 'drag', create: ({ id, pageIndex, point, whiteoutColor }) => ({ id, type: 'whiteout', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color: whiteoutColor }) },
  render: ({ element, renderTarget }) => renderTarget === 'redact'
    ? renderRedactionSurface('whiteout', element.color)
    : h(WhiteoutNode, { element, isActive: false, onResizeStart: () => {} }),
  serialize: (element, context) => {
    const { width, height, color } = element;
    if (context.redaction) {
      return { kind: 'solid' as const, element: { ...element, color: color || '#000000' } };
    }
    const { page, pdfWidth, pdfHeight, pdfX, pdfY } = context;
    const heightPoints = percentToPoints(height, pdfHeight);
    const { r, g, b } = hexToRgbFractions(color, '#ffffff');
    page.drawRectangle({ x: pdfX, y: pdfY - heightPoints, width: percentToPoints(width, pdfWidth), height: heightPoints, color: rgb(r, g, b) });
  },
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
