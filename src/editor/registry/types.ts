import type { ElementType } from '../../lib/editorModel.ts';
import type { ComponentChildren } from 'preact';
import type { PDFDocument, PDFFont, PDFPage } from '@cantoo/pdf-lib';

export interface NodeRenderContext {
  element: Record<string, unknown>;
  onChange: (changes: Record<string, unknown>) => void;
  onSelect: (event: Event) => void;
  pageWidthPoints: number;
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
}

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

export interface ElementDefinition {
  type: ElementType;
  schema: (value: unknown) => boolean;
  creation: {
    mode: CreationMode;
    create?: (context: CreateContext) => Record<string, unknown>;
  };
  render: (context: NodeRenderContext) => ComponentChildren;
  serialize: (element: Record<string, unknown>, context: SerializeContext) => void | Promise<void>;
  resizeBehavior: {
    handles: readonly ResizeHandle[];
    applyBoxResize?: (input: BoxResizeInput) => BoxResizePatch;
    applyLineResize?: (input: LineResizeInput) => LineResizePatch;
    applyCenteredResize?: (input: CenteredResizeInput) => CenteredResizePatch;
    applyTextResize?: (input: TextResizeInput) => TextResizePatch;
    applyTextPosition?: (input: TextPositionInput) => TextPositionPatch;
    minimumWidth?: MinimumWidth;
  };
}
