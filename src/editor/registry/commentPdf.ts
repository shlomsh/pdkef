import { PDFHexString } from '@cantoo/pdf-lib';
import type { CommentElement } from '../model/editorModel.ts';
import type { SerializeContext } from './types.ts';
import { COMMENT_ANCHOR_COLOR } from './commentColors.ts';
import { boundsOf, pdfDate, userSpace, writeBandsHighlight } from './highlightPdf.ts';
import { percentToPoints } from '../geometry/coords.ts';

const NOTE_SIZE = 18;
const NO_ZOOM_NO_ROTATE = 8 + 16;

/**
 * SIGN-44: a comment's annotation. A passage is its own transparent `/Highlight`; a pin or a comment on
 * another element is a `/Text` sticky note, an 18pt square centered on its anchor point (a pin's box
 * center, or the other element's top-right corner) and kept on the page. Neither carries the Print flag,
 * so a printout stays clean.
 */
export function serializeComment(element: CommentElement, context: SerializeContext): void {
  const text = element.comment.trim() ? element.comment : undefined;
  if (!text) return;
  const comment = { text, commentedAt: element.commentedAt };
  const { anchor } = element;
  if (anchor.kind === 'passage') {
    writeBandsHighlight({
      id: element.id, box: element, bands: anchor.bands, color: COMMENT_ANCHOR_COLOR, fallbackColor: COMMENT_ANCHOR_COLOR,
      direction: anchor.direction, comment, print: false,
    }, context);
    return;
  }

  const { pdfDoc, page, pdfWidth, pdfHeight, pdfX, pdfY } = context;
  const toUser = userSpace(context);
  const boxWidth = percentToPoints(element.width, pdfWidth);
  const boxHeight = percentToPoints(element.height, pdfHeight);
  const center = anchor.kind === 'point' ? { x: pdfX + boxWidth / 2, y: pdfY - boxHeight / 2 } : { x: pdfX + boxWidth, y: pdfY };
  const half = NOTE_SIZE / 2;
  const x = Math.min(Math.max(center.x, half), pdfWidth - half);
  const y = Math.min(Math.max(center.y, half), pdfHeight - half);
  const rect = boundsOf([toUser(x - half, y + half), toUser(x + half, y - half)]);
  const { context: pdfContext } = pdfDoc;
  const noteRef = pdfContext.register(pdfContext.obj({
    Type: 'Annot', Subtype: 'Text', Rect: rect, Name: 'Comment', Open: false, F: NO_ZOOM_NO_ROTATE,
    Contents: PDFHexString.fromText(text), NM: PDFHexString.fromText(element.id),
    M: pdfDate(element.commentedAt === undefined ? undefined : new Date(element.commentedAt)),
  }));
  page.node.addAnnot(noteRef);
}
