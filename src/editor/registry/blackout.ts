import type { ElementDefinition } from './types.ts';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { applyBoxResize } from './boxResize.ts';
import { renderRedactionSurface } from './redactionSurface.ts';

export const blackoutDefinition: ElementDefinition = {
  type: 'blackout',
  schema: (value) => isRecord(value) && value.type === 'blackout' && hasString(value, 'id') && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: { mode: 'drag', create: ({ id, pageIndex, point }) => ({ id, type: 'blackout', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color: '#000000' }) },
  render: ({ element }) => renderRedactionSurface('blackout', (element as { color?: string }).color),
  serialize: (element) => ({
    kind: 'solid',
    element: element as { left: number; top: number; width: number; height: number; color?: string },
  }),
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
