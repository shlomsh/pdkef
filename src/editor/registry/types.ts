import type { ElementType } from '../../lib/editorModel.ts';

export type ResizeHandle = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'line-start' | 'line-end';

export interface ElementDefinition {
  type: ElementType;
  resizeBehavior: { handles: readonly ResizeHandle[] };
}
