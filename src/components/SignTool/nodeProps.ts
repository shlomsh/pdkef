import type { EditorElement, EditorElementPatch } from '../../editor/model/editorModel.ts';
import type { ResizeHandle } from '../../editor/registry/types.ts';
// Type-only import, same non-cycle reasoning as registry/types.ts's own.
import type { SignMessages } from '../../i18n/toolMessages';

/** Native events shared by the Preact mouse and touch resize handlers. */
export type EditorPointerEvent = MouseEvent | TouchEvent;

/** Begins a resize gesture at an optional registry-defined handle. */
export type NodeResizeStart = (event: EditorPointerEvent, handle?: ResizeHandle) => void;

/** Shared shell props for a node rendered inside DraggableWrapper. */
export interface ElementNodeProps<T extends EditorElement> {
  element: T;
  isActive: boolean;
  onResizeStart: NodeResizeStart;
  /** LOC-16 stage 2-5: threaded to ElementResizers for its resize-handle
   * titles. Optional and English-default; Redact never supplies it. */
  messages?: Partial<SignMessages>;
}

/** A type-preserving mutation callback for a rendered element variant. */
export type ElementNodeChange<T extends EditorElement> = (changes: EditorElementPatch<T>) => void;
