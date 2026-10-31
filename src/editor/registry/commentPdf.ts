import { PDFHexString } from '@cantoo/pdf-lib';
import type { CommentElement } from '../model/editorModel.ts';
import type { SerializeContext } from './types.ts';
import { COMMENT_ANCHOR_COLOR } from './commentColors.ts';
import { addNumberBadge, boundsOf, pdfDate, userSpace, writeBandsHighlight } from './highlightPdf.ts';
import { percentToPoints } from '../geometry/coords.ts';

const NOTE_SIZE = 18;
const NO_ZOOM_NO_ROTATE = 8 + 16;

/**
 * SIGN-44: a comment's annotation. A passage is its own `/Highlight` in the comment tint; a pin or a
 * comment on another element is a `/Text` sticky note at the box's reading-end top corner. Neither
 * carries the Print flag, so a printout stays clean. A number adds the grouped `/FreeText` badge.
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

  const { pdfDoc, page, pdfWidth, pdfHeight, pdfX, pdfY, commentNumber } = context;
  const toUser = userSpace(context);
  // Pins and element comments follow the page's reading order, which is left to right.
  const left = pdfX;
  const right = pdfX + percentToPoints(element.width, pdfWidth);
  const top = pdfY;
  const bottom = pdfY - percentToPoints(element.height, pdfHeight);
  // The note stays on the page when the box touches its right or bottom edge.
  const noteX = Math.min(right, pdfWidth - NOTE_SIZE);
  const noteY = Math.max(top, NOTE_SIZE);
  const rect = boundsOf([toUser(noteX, noteY), toUser(noteX + NOTE_SIZE, noteY - NOTE_SIZE)]);
  const { context: pdfContext } = pdfDoc;
  const noteRef = pdfContext.register(pdfContext.obj({
    Type: 'Annot', Subtype: 'Text', Rect: rect, Name: 'Comment', Open: false, F: NO_ZOOM_NO_ROTATE,
    Contents: PDFHexString.fromText(text), NM: PDFHexString.fromText(element.id),
    M: pdfDate(element.commentedAt === undefined ? undefined : new Date(element.commentedAt)),
  }));
  page.node.addAnnot(noteRef);
  if (commentNumber !== undefined) addNumberBadge(context, noteRef, { left, right, top, bottom: Math.min(bottom, top - 11), rtl: false }, commentNumber);
}
