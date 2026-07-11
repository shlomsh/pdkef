import type { ElementType } from '../../lib/editorModel.ts';

export type ResizeHandle = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'line-start' | 'line-end';

export interface BoxResizeInput {
  handle: ResizeHandle;
  delta: { x: number; y: number };
  start: { left: number; top: number; width: number; height: number };
}

export interface BoxResizePatch {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LineResizeInput {
  handle: 'line-start' | 'line-end';
  delta: { x: number; y: number };
  start: { x1: number; y1: number; x2: number; y2: number };
}

export type LineResizePatch = Partial<LineResizeInput['start']>;

export interface ElementDefinition {
  type: ElementType;
  resizeBehavior: {
    handles: readonly ResizeHandle[];
    applyBoxResize?: (input: BoxResizeInput) => BoxResizePatch;
    applyLineResize?: (input: LineResizeInput) => LineResizePatch;
  };
}
