/**
 * Deterministic PDF documents: fixed dates and producer, and `updateFieldAppearances: false` so
 * `save()` does not quietly add an empty /AcroForm (same idiom as scripts/generate-practice-form.mjs).
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { PAGE } from '../forms.mjs';

const FIXED_DATE = new Date('2026-09-29T00:00:00Z');
const PRODUCER = 'PDkef AI-04 fixture generator';

export async function createDocument(title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  return doc;
}

export const addFixturePage = (doc) => doc.addPage([PAGE.width, PAGE.height]);

export const saveDocument = (doc) => doc.save({ updateFieldAppearances: false });
