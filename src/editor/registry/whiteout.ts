import type { ElementDefinition } from './types.ts';
import { h } from 'preact';
import WhiteoutNode from '../../components/SignTool/nodes/WhiteoutNode.jsx';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { applyBoxResize } from './boxResize.ts';
export const whiteoutDefinition: ElementDefinition = {
  type: 'whiteout',
  schema: (value) => isRecord(value) && value.type === 'whiteout' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: { mode: 'drag', create: ({ id, pageIndex, point, whiteoutColor }) => ({ id, type: 'whiteout', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color: whiteoutColor }) },
  render: ({ element }) => h(WhiteoutNode, { element, isActive: false, onResizeStart: () => {} }),
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
