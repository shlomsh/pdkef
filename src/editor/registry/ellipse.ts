import type { ElementDefinition } from './types.ts';
import { h } from 'preact';
import ShapeNode from '../../components/SignTool/nodes/ShapeNode.jsx';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { applyBoxResize } from './boxResize.ts';
export const ellipseDefinition: ElementDefinition = {
  type: 'ellipse',
  schema: (value) => isRecord(value) && value.type === 'ellipse' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: { mode: 'drag', create: ({ id, pageIndex, point, color, strokeWidth }) => ({ id, type: 'ellipse', pageIndex, left: point.left, top: point.top, width: 0, height: 0, color, strokeWidth }) },
  render: ({ element }) => h(ShapeNode, { element, isActive: false, onResizeStart: () => {} }),
  resizeBehavior: { handles: ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], applyBoxResize },
};
