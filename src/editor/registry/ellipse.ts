import type { ElementDefinition } from './types.ts';
import { applyBoxResize } from './boxResize.ts';
export const ellipseDefinition: ElementDefinition = {
  type: 'ellipse',
  creation: { mode: 'drag', create: ({ id, pageIndex, point, color, strokeWidth }) => ({ id, type: 'ellipse', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color, strokeWidth }) },
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
