import type { ElementDefinition, LineResizeInput, LineResizePatch } from './types.ts';

export function applyLineResize({ handle, delta, start }: LineResizeInput): LineResizePatch {
  return handle === 'line-start'
    ? { x1: start.x1 + delta.x, y1: start.y1 + delta.y }
    : { x2: start.x2 + delta.x, y2: start.y2 + delta.y };
}

export const lineDefinition: ElementDefinition = {
  type: 'line',
  resizeBehavior: { handles: ['line-start', 'line-end'], applyLineResize },
};
