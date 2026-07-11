import type { ElementDefinition } from './types.ts';
import { applyBoxResize } from './boxResize.ts';
export const rectangleDefinition: ElementDefinition = {
  type: 'rectangle',
  creation: { mode: 'drag', create: ({ id, pageIndex, point, color, strokeWidth }) => ({ id, type: 'rectangle', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color, strokeWidth }) },
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
