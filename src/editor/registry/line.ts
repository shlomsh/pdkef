import type { ElementDefinition, LineResizeInput, LineResizePatch } from './types.ts';
import { h } from 'preact';
import LineNode from '../../components/SignTool/nodes/LineNode.jsx';
import { hasNumber, hasString, isRecord } from './schema.ts';

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
  resizeBehavior: { handles: ['line-start', 'line-end'], applyLineResize },
};
