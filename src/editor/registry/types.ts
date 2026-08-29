import type { EditorElement, ElementType } from '../../lib/editorModel.ts';
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
  symbolMark?: 'check' | 'x' | 'dot';
  /** Height of an empty one-line text box, as a % of page height. */
  textHeight?: number;
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
 * Side-handle drag that sets an explicit width without touching font size.
 * Only comb text uses it today; the corner handles keep meaning font size.
 */
export interface WidthResizeInput {
  handle: ResizeHandle;
  delta: { x: number };
  start: { left: number; width: number };
  isRtl: boolean;
  minWidth: number;
}

/**
 * Everything a type needs to say where its own width floor sits, measured at
 * grab time. Kept per-type because the answer is content-dependent (a comb's
 * floor follows its cell count and font size), and the shared resize hook has
 * no business knowing that.
 */
export interface WidthFloorInput {
  element: EditorElement;
  /** The element's font size in rendered CSS pixels, not PDF points. */
  fontSizePx: number;
  /** The page wrapper's rendered width in CSS pixels, so the answer can be a %. */
  pageWidthPx: number;
}

export interface WidthResizePatch {
  left: number;
  width: number;
  /**
   * True once the drag has pushed the raw (pre-clamp) width past `minWidth` -
   * the caller treats release in that state as "close this comb" rather than
   * "set the width to the floor value". Not a real element field; stripped
   * before the patch is committed (see useElementResize.js).
   */
  collapsed?: boolean;
}

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
  /**
   * An intrinsically sized type that may still carry an explicit `element.width`
   * on individual elements (comb text). Height stays intrinsic either way.
   */
  allowsExplicitWidth?: boolean;
}

export interface ResizeWriteContext {
  node: HTMLElement;
  patch: Record<string, number | boolean | undefined>;
  handle: ResizeHandle;
  isRtl: boolean;
  startLeft: number;
  startTop: number;
  scaleFactor: number;
  pageWrapper: Element;
  textStartSizePercent?: { width: number; height: number } | null;
  getElementPercentSize: (node: Element, pageWrapper: Element) => { width: number; height: number };
  element: EditorElement;
}

export interface ElementDefinition<T extends EditorElement = EditorElement> {
  type: T['type'];
  schema: (value: unknown) => value is T;
  creation: {
    mode: CreationMode;
    create?: (context: CreateContext) => T;
  };
  serialize: (element: T, context: SerializeContext) => SerializeResult;
  /** DraggableWrapper's element-root className/style/interactivity contract for this type. */
  view?: ViewFlags;
  resizeBehavior: {
    handles: readonly ResizeHandle[];
    applyBoxResize?: (input: BoxResizeInput) => BoxResizePatch;
    applyWidthResize?: (input: WidthResizeInput) => WidthResizePatch;
    /**
     * The `minWidth` handed to applyWidthResize, as a % of page width. Absent
     * means the shared absolute floor; a type that declares it is saying the
     * floor depends on the element's own content (see combWidthFloor).
     */
    widthFloor?: (input: WidthFloorInput) => number;
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
