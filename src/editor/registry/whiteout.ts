import type { ElementDefinition } from './types.ts';
import { applyBoxResize } from './boxResize.ts';
export const whiteoutDefinition: ElementDefinition = {
  type: 'whiteout',
  creation: { mode: 'drag', create: ({ id, pageIndex, point, whiteoutColor }) => ({ id, type: 'whiteout', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color: whiteoutColor }) },
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
