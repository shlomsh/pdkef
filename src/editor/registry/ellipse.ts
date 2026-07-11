import type { ElementDefinition } from './types.ts';
import { applyBoxResize } from './boxResize.ts';
export const ellipseDefinition: ElementDefinition = { type: 'ellipse', resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize } };
