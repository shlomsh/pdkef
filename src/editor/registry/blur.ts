import type { ElementDefinition } from './types.ts';
import type { BlurElement } from '../../lib/editorModel.ts';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { applyBoxResize } from './boxResize.ts';
import { renderRedactionSurface } from './redactionSurface.ts';

export const blurDefinition: ElementDefinition<BlurElement> = {
  type: 'blur',
  schema: (value): value is BlurElement => isRecord(value) && value.type === 'blur' && hasString(value, 'id') && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: { mode: 'drag', create: ({ id, pageIndex, point }) => ({ id, type: 'blur', pageIndex, left: point.left, top: point.top, width: 0, height: 0 }) },
  render: () => renderRedactionSurface('blur'),
  serialize: (element) => ({
    kind: 'blur',
    element,
  }),
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
