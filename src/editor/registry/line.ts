import type { ElementDefinition, LineResizeInput, LineResizePatch } from './types.ts';
import { h } from 'preact';
import { rgb } from '@cantoo/pdf-lib';
import LineNode from '../../components/SignTool/nodes/LineNode.jsx';
import { hasNumber, hasString, isRecord } from './schema.ts';
import { hexToRgbFractions } from '../../lib/signHelpers.js';
import { percentToPoints } from '../../lib/coords.js';

export function applyLineResize({ handle, delta, start }: LineResizeInput): LineResizePatch {
  return handle === 'line-start'
    ? { x1: start.x1 + delta.x, y1: start.y1 + delta.y }
    : { x2: start.x2 + delta.x, y2: start.y2 + delta.y };
}

export const lineDefinition: ElementDefinition = {
  type: 'line',
  schema: (value) => isRecord(value) && value.type === 'line' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasNumber(value, 'x1') && hasNumber(value, 'y1')
    && hasNumber(value, 'x2') && hasNumber(value, 'y2'),
  creation: { mode: 'drag', create: ({ id, pageIndex, point, color, strokeWidth }) => ({ id, type: 'line', pageIndex, x1: point.left, y1: point.top, x2: point.left, y2: point.top, color, strokeWidth }) },
  render: ({ element }) => h(LineNode, { element, isActive: false, onResizeStart: () => {}, handlePointerDown: () => {} }),
  serialize: (element, { page, pdfWidth, pdfHeight }) => {
    const { x1, y1, x2, y2, color, strokeWidth } = element as { x1: number; y1: number; x2: number; y2: number; color?: string; strokeWidth?: number };
    const { r, g, b } = hexToRgbFractions(color, '#1463ff');
    page.drawLine({
      start: { x: percentToPoints(x1, pdfWidth), y: pdfHeight - percentToPoints(y1, pdfHeight) },
      end: { x: percentToPoints(x2, pdfWidth), y: pdfHeight - percentToPoints(y2, pdfHeight) },
      color: rgb(r, g, b), thickness: strokeWidth || 3,
    });
  },
  resizeBehavior: { handles: ['line-start', 'line-end'], applyLineResize },
};
