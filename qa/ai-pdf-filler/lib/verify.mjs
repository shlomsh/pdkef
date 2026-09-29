/**
 * Structural assertions on a finished fixture. Each check throws with a specific message; on
 * success `verifyFixture` returns the list of assertions that held, for the run log.
 */
import { PDFDocument, PDFName, PDFDict } from '@cantoo/pdf-lib';
import { countTextItems } from './pdfjs.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`fixture verification failed: ${message}`);
}

function pageParts(doc) {
  const page = doc.getPage(0);
  const resources = page.node.Resources();
  return {
    annots: page.node.Annots(),
    fonts: resources?.lookupMaybe(PDFName.of('Font'), PDFDict),
    xObjects: resources?.lookupMaybe(PDFName.of('XObject'), PDFDict),
  };
}

const isImage = (xObjects, key) => xObjects.lookup(key).dict.get(PDFName.of('Subtype')) === PDFName.of('Image');

/** @param {'flat'|'scan'} variant */
export async function verifyFixture(bytes, variant) {
  const doc = await PDFDocument.load(bytes);
  const { annots, fonts, xObjects } = pageParts(doc);
  const textItems = await countTextItems(bytes);
  const held = [`pages = ${doc.getPageCount()}`];
  assert(doc.getPageCount() === 1, 'expected exactly one page');
  assert(!doc.catalog.has(PDFName.of('AcroForm')), 'catalog has an /AcroForm');
  assert(!annots || annots.size() === 0, 'page has /Annots');
  held.push('no /AcroForm', 'no /Annots');
  if (variant === 'flat') {
    assert(textItems > 0, 'flat fixture has no extractable text');
    held.push(`pdf.js text items = ${textItems} (> 0)`);
  } else {
    const imageKeys = xObjects ? xObjects.keys().filter((key) => isImage(xObjects, key)) : [];
    assert(textItems === 0, `scan exposes ${textItems} pdf.js text items`);
    assert(!fonts || fonts.keys().length === 0, 'scan page resources have /Font');
    assert(xObjects && xObjects.keys().length === 1 && imageKeys.length === 1, 'scan must have exactly one image XObject');
    held.push('pdf.js text items = 0', 'no /Font in page resources', 'exactly 1 image XObject (and no other XObject)');
  }
  return held;
}
