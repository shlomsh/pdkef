import type { ElementDefinition } from './types.ts';
import type { BlackoutElement } from '../../lib/editorModel.ts';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { applyBoxResize } from './boxResize.ts';
import { renderRedactionSurface } from './redactionSurface.ts';

export const blackoutDefinition: ElementDefinition<BlackoutElement> = {
  type: 'blackout',
  schema: (value): value is BlackoutElement => isRecord(value) && value.type === 'blackout' && hasString(value, 'id') && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: { mode: 'drag', create: ({ id, pageIndex, point }) => ({ id, type: 'blackout', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color: '#000000' }) },
  render: ({ element }) => renderRedactionSurface('blackout', element.color),
  serialize: (element) => ({
    kind: 'solid',
    element,
  }),
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
