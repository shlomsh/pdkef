import type { ElementDefinition, LineResizeInput, LineResizePatch } from './types.ts';

export function applyLineResize({ handle, delta, start }: LineResizeInput): LineResizePatch {
  return handle === 'line-start'
    ? { x1: start.x1 + delta.x, y1: start.y1 + delta.y }
    : { x2: start.x2 + delta.x, y2: start.y2 + delta.y };
}

export const lineDefinition: ElementDefinition = {
  type: 'line',
  creation: { mode: 'drag', create: ({ id, pageIndex, point, color, strokeWidth }) => ({ id, type: 'line', pageIndex, x1: point.left, y1: point.top, x2: point.left, y2: point.top, color, strokeWidth }) },
  resizeBehavior: { handles: ['line-start', 'line-end'], applyLineResize },
};
