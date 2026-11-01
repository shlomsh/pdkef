import {
  beginMarkedContent,
  endMarkedContent,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
} from '@cantoo/pdf-lib';
import type { PDFDocument, PDFFont } from '@cantoo/pdf-lib';
import { pagePercentToEditorPoint } from '../geometry/coords.ts';
import { getElementDefinition } from '../registry/index.ts';
import { isComment, resolveCommentBoxes } from '../comments/anchors.ts';
import { baselineOffsetEmFromMetrics } from '../text/fonts.js';
import { HELVETICA_BASELINE_OFFSET_EM, DEFAULT_LINE_HEIGHT_EM } from '../model/signGeometry.js';
import { pageGeometryFromPdfLibPage } from '../adapters/pdf/pdfLibGeometry.ts';
import type { EditorElement } from '../model/editorModel.ts';

type LoadCustomFont = (family: string, weight?: string, style?: string) => Promise<PDFFont | null>;

interface DrawElementsOptions {
  /** Loads and embeds a face into `pdfDoc`. Needed only when a text element is drawn. */
  loadCustomFont?: LoadCustomFont;
  /** Called after each drawn element with the fraction done, in 0..1. */
  onProgress?: (progress: number) => void;
}

function baselineOffsetEm(pdfFont: PDFFont | null, lineHeightEm = DEFAULT_LINE_HEIGHT_EM): number {
  try {
    const fk = (pdfFont as unknown as { embedder?: { font?: { unitsPerEm: number; ascent: number; descent: number } } } | null)?.embedder?.font;
    if (fk?.unitsPerEm && Number.isFinite(fk?.ascent) && Number.isFinite(fk?.descent)) {
      // Same formula the editor lays out with, from the embedded font's own
      // metrics rather than the bundled table - see fonts.js.
      return baselineOffsetEmFromMetrics(
        fk.ascent / fk.unitsPerEm,
        fk.descent / fk.unitsPerEm,
        lineHeightEm,
      );
    }
  } catch {
    // expected: Use the historic Helvetica fallback when fontkit metrics are unavailable.
  }
  return HELVETICA_BASELINE_OFFSET_EM;
}

const noFontLoader: LoadCustomFont = async () => {
  throw new Error('drawElements: a text element needs loadCustomFont');
};

/**
 * Bakes each element into `pdfDoc` through its registry owner, in one tool-agnostic pass.
 * Document opening, fonts, page handling and saving stay with the caller.
 */
export async function drawElements(
  pdfDoc: PDFDocument,
  sourceElements: EditorElement[],
  { loadCustomFont = noFontLoader, onProgress }: DrawElementsOptions,
): Promise<void> {
  // SIGN-44: a comment anchored to a highlight lives in that highlight's own annotation, not in one of its own.
  const elements = resolveCommentBoxes(sourceElements);
  const highlightComments = new Map<string, EditorElement & { comment: string; commentedAt?: number }>();
  const highlightIds = new Set(elements.filter((el) => el.type === 'highlight').map((el) => el.id));
  for (const el of elements) {
    if (isComment(el) && el.anchor.kind === 'element' && highlightIds.has(el.anchor.elementId) && !highlightComments.has(el.anchor.elementId)) {
      highlightComments.set(el.anchor.elementId, el);
    }
  }

  const drawn = elements.filter((el) => !(isComment(el) && el.anchor.kind === 'element' && highlightIds.has(el.anchor.elementId)));
  for (let i = 0; i < drawn.length; i++) {
    const element = drawn[i];
    const anchored = highlightComments.get(element.id);
    const page = pdfDoc.getPage(element.pageIndex);
    const pageGeometry = pageGeometryFromPdfLibPage(page);
    const { x: pdfX, y: pdfY } = pagePercentToEditorPoint({
      x: ('left' in element ? element.left : (element as { x1?: number }).x1) ?? 0,
      y: ('top' in element ? element.top : (element as { y1?: number }).y1) ?? 0,
    }, pageGeometry);

    // Every registry serializer draws in one rotation/crop-neutral editor
    // space. This one graphics-state transform maps the complete result back
    // to raw PDF user space; page /Rotate then displays it exactly where the
    // pdf.js viewport and DOM overlay placed it.
    //
    // The whole frame sits in a `/PDkef` marked-content sequence (RED-55), so a
    // later Delete reads what was one element as one thing, not as loose paths.
    page.pushOperators(
      beginMarkedContent('PDkef'),
      pushGraphicsState(),
      concatTransformationMatrix(...pageGeometry.editorToPdf),
    );
    try {
      await (getElementDefinition(element.type).serialize as (el: EditorElement, ctx: unknown) => Promise<void>)(element, {
        pdfDoc, page,
        pdfWidth: pageGeometry.width,
        pdfHeight: pageGeometry.height,
        pdfX,
        pdfY,
        pageGeometry,
        loadCustomFont,
        baselineOffset: baselineOffsetEm,
        ...(anchored && { comment: { text: anchored.comment, commentedAt: anchored.commentedAt } }),
      });
    } finally {
      page.pushOperators(popGraphicsState(), endMarkedContent());
    }
    onProgress?.((i + 1) / drawn.length);
  }
}
