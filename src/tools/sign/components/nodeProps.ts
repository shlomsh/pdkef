import type { EditorElement, EditorElementPatch } from '../../../editor/model/editorModel.ts';
// Type-only import, same non-cycle reasoning as registry/types.ts's own.
import type { SignMessages } from '../../../i18n/toolMessages';
// ElementResizers (editor-ui, shared with Redact) owns this contract now;
// re-exported here so Sign's node components keep one import surface.
export type { EditorPointerEvent, NodeResizeStart } from '../../../editor-ui/nodeResizeTypes.ts';
import type { NodeResizeStart } from '../../../editor-ui/nodeResizeTypes.ts';

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
