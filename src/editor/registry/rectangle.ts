import type { ElementDefinition } from './types.ts';
import type { RectangleElement } from '../../lib/editorModel.ts';
import { h } from 'preact';
import { rgb } from '@cantoo/pdf-lib';
import ShapeNode from '../../components/SignTool/nodes/ShapeNode.jsx';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { applyBoxResize } from './boxResize.ts';
import { hexToRgbFractions } from '../../lib/signHelpers.js';
import { percentToPoints } from '../../lib/coords.js';
export const rectangleDefinition: ElementDefinition<RectangleElement> = {
  type: 'rectangle',
  schema: (value): value is RectangleElement => isRecord(value) && value.type === 'rectangle' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: { mode: 'drag', create: ({ id, pageIndex, point, color, strokeWidth }) => ({ id, type: 'rectangle', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color, strokeWidth }) },
  render: ({ element }) => h(ShapeNode, { element, isActive: false, onResizeStart: () => {} }),
  serialize: (element, { page, pdfWidth, pdfHeight, pdfX, pdfY }) => {
    const { width, height, color, strokeWidth } = element;
    const widthPoints = percentToPoints(width, pdfWidth);
    const heightPoints = percentToPoints(height, pdfHeight);
    const { r, g, b } = hexToRgbFractions(color, '#1463ff');
    page.drawRectangle({ x: pdfX, y: pdfY - heightPoints, width: widthPoints, height: heightPoints, borderColor: rgb(r, g, b), borderWidth: strokeWidth || 3 });
  },
  view: { isShape: true },
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
