import type { ResizeHandle } from '#editor/registry/types.ts';

// Split out of nodeProps.ts (ARCH-18, then in src/tools/sign/components/): ElementResizers
// is editor-ui, shared by Sign and Redact, so it could not import a tool's
// contract file. This is the one type it actually needs; nodeProps.ts
// (src/editor-ui/ since READ-02) re-exports it so the node components keep one import surface.

/** Native events shared by the Preact mouse and touch resize handlers. */
export type EditorPointerEvent = MouseEvent | TouchEvent;

/** Begins a resize gesture at an optional registry-defined handle. */
export type NodeResizeStart = (event: EditorPointerEvent, handle?: ResizeHandle) => void;
