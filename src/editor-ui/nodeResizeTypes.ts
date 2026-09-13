import type { ResizeHandle } from '../editor/registry/types.ts';

// Split out of src/components/SignTool/nodeProps.ts (ARCH-18): ElementResizers
// is editor-ui, shared by Sign and Redact, so it cannot import a tool's
// contract file. This is the one type it actually needs; nodeProps.ts
// re-exports it so Sign's own node components keep importing it from there.

/** Native events shared by the Preact mouse and touch resize handlers. */
export type EditorPointerEvent = MouseEvent | TouchEvent;

/** Begins a resize gesture at an optional registry-defined handle. */
export type NodeResizeStart = (event: EditorPointerEvent, handle?: ResizeHandle) => void;
