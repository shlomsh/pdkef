import type { EditorElement, ElementType } from '../../lib/editorModel.ts';
import type { ComponentChildren } from 'preact';
import type { PDFDocument, PDFFont, PDFPage } from '@cantoo/pdf-lib';

/** The specific union member for a given `ElementType` literal, e.g. `ElementForType<'text'>` is `TextElement`. */
export type ElementForType<K extends ElementType> = Extract<EditorElement, { type: K }>;

export interface NodeRenderContext<T extends EditorElement = EditorElement> {
  element: T;
  onChange: (changes: Partial<T>) => void;
  onSelect: (event: Event) => void;
  pageWidthPoints: number;
  renderTarget?: 'sign' | 'redact';
}

export interface SerializeContext {
  pdfDoc: PDFDocument;
  page: PDFPage;
  pdfWidth: number;
  pdfHeight: number;
  pdfX: number;
  pdfY: number;
  loadCustomFont: (family: string, weight?: string, style?: string) => Promise<PDFFont | null>;
  baselineOffset: (font: PDFFont | null) => number;
  /** Redact's page-scoped destructive flatten pass requests an instruction instead. */
  redaction?: boolean;
}

export interface RedactionInstruction {
  kind: 'blur' | 'solid';
  element: { left: number; top: number; width: number; height: number; color?: string };
}

export type SerializeResult = void | RedactionInstruction | Promise<void | RedactionInstruction>;

export interface CreateContext {
  id: string;
  pageIndex: number;
  point: { left: number; top: number };
  color: string;
  whiteoutColor: string;
  strokeWidth: number;
  font: string;
  fontSize: number;
  direction: 'ltr' | 'rtl' | null;
  symbolWidth?: number;
  symbolHeight?: number;
}

export type CreationMode = 'point' | 'drag' | 'external';

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

export interface CenteredResizeInput {
  deltaWidth: number;
  minWidth: number;
  aspectRatio: number;
  page: { width: number; height: number };
  start: { left: number; top: number; width: number; height: number };
}

export interface CenteredResizePatch {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MinimumWidth {
  unit: 'pixels' | 'percent';
  value: number;
}

export interface TextResizeInput {
  startFontSize: number;
  delta: { x: number; y: number };
  startRect?: { width: number; height: number } | null;
  fallbackDeltaPoints: number;
}

export interface TextResizePatch {
  fontSize: number;
}

export interface TextPositionInput {
  start: { left: number; top: number };
  startSize: { width: number; height: number };
  nextSize: { width: number; height: number };
  isLeftHandle: boolean;
  isTopHandle: boolean;
  isRtl: boolean;
}

export interface TextPositionPatch { left: number; top: number; }

/**
 * Declarative flags DraggableWrapper reads instead of comparing `element.type`
 * directly, so the wrapper's className/style/interactivity logic stays type-agnostic
 * (E7.6). Absent flags default to `false`/standard box behavior.
 */
export interface ViewFlags {
  /** Full-bleed SVG overlay with its own endpoint-driven positioning (line). */
  isLine?: boolean;
  /** Box-style CSS Module modifier (4/8-handle resize chrome) - rectangle/ellipse/whiteout. */
  isShape?: boolean;
  /** Aspect-locked symbol CSS Module modifier. */
  isSymbol?: boolean;
  /** RTL text anchors its right edge (`right` instead of `left`) as it grows. */
  usesRtlAnchoring?: boolean;
  /** Width/height come from CSS intrinsic sizing (`auto`), not `element.width`/`height` (text). */
  usesIntrinsicSize?: boolean;
}

export interface ResizeWriteContext {
  node: HTMLElement;
  patch: Record<string, number | undefined>;
  handle: ResizeHandle;
  isRtl: boolean;
  startLeft: number;
  startTop: number;
  scaleFactor: number;
  pageWrapper: Element;
  textStartSizePercent?: { width: number; height: number } | null;
  getElementPercentSize: (node: Element, pageWrapper: Element) => { width: number; height: number };
}

export interface ElementDefinition<T extends EditorElement = EditorElement> {
  type: T['type'];
  schema: (value: unknown) => value is T;
  creation: {
    mode: CreationMode;
    create?: (context: CreateContext) => T;
  };
  render: (context: NodeRenderContext<T>) => ComponentChildren;
  serialize: (element: T, context: SerializeContext) => SerializeResult;
  /** DraggableWrapper's element-root className/style/interactivity contract for this type. */
  view?: ViewFlags;
  resizeBehavior: {
    handles: readonly ResizeHandle[];
    applyBoxResize?: (input: BoxResizeInput) => BoxResizePatch;
    applyLineResize?: (input: LineResizeInput) => LineResizePatch;
    applyCenteredResize?: (input: CenteredResizeInput) => CenteredResizePatch;
    applyTextResize?: (input: TextResizeInput) => TextResizePatch;
    applyTextPosition?: (input: TextPositionInput) => TextPositionPatch;
    minimumWidth?: MinimumWidth;
    /**
     * Per-type resize-time DOM/SVG paint, called on every gesture move (E7.6).
     * Returning a partial patch merges into the value committed on release
     * (text repositions as it resizes). Types that omit this get
     * DraggableWrapper's generic width/height/left/top style write.
     */
    writeDOM?: (context: ResizeWriteContext) => Record<string, number> | void;
  };
}
