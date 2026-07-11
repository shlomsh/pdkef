import type { ElementDefinition } from './types.ts';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { applyBoxResize } from './boxResize.ts';

export const blurDefinition: ElementDefinition = {
  type: 'blur',
  schema: (value) => isRecord(value) && value.type === 'blur' && hasString(value, 'id') && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: { mode: 'drag', create: ({ id, pageIndex, point }) => ({ id, type: 'blur', pageIndex, left: point.left, top: point.top, width: 0, height: 0 }) },
  render: () => null,
  serialize: () => {},
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
