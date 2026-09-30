/**
 * Structural assertions on a finished fixture. Each check throws with a specific message; on
 * success `verifyFixture` returns the list of assertions that held, for the run log.
 */
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString, decodePDFRawStream } from '@cantoo/pdf-lib';
import { extractTextItems } from './pdfjs.mjs';

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

/** Items joined with a newline: each drawn line is one item, so an expected line may not span two. */
const joinItems = (items) => items.join('\n');

/**
 * Bracket direction is erased before comparing with pdf.js output. A correctly painted RTL line
 * shows logical "(" with the ")" glyph, whose ToUnicode is ")"; pdf.js reverses RTL text back to
 * logical order but neither mirrors it back nor reads /ActualText, so it reports ")...(" for a page
 * that looks right. Letters, order and digits are still compared exactly here, and bracket direction
 * is checked strictly on the /ActualText spans below.
 */
const BRACKETS = /[()[\]{}<>]/g;
const withoutBracketDirection = (text) => text.replace(BRACKETS, '|');

const ACTUAL_TEXT_SPAN = /\/ActualText\s*(<[0-9A-Fa-f]*>)/g;

/**
 * The /ActualText strings of page 1's marked-content spans. pdf.js ignores them, but extractors
 * that honour them (and accessibility tools) read them as the line's text, so they are checked too.
 */
function actualTexts(doc) {
  const contents = doc.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  const source = streams.map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')).join('\n');
  return Array.from(source.matchAll(ACTUAL_TEXT_SPAN), ([, hex]) => PDFHexString.of(hex.slice(1, -1)).decodeText());
}

const isImage = (xObjects, key) => xObjects.lookup(key).dict.get(PDFName.of('Subtype')) === PDFName.of('Image');

/**
 * @param {'flat'|'scan'} variant
 * @param {string[]} expectedTexts logical strings a flat fixture must yield when extracted (ignored for scans)
 */
export async function verifyFixture(bytes, variant, expectedTexts = []) {
  const doc = await PDFDocument.load(bytes);
  const { annots, fonts, xObjects } = pageParts(doc);
  const items = await extractTextItems(bytes);
  const textItems = items.length;
  const held = [`pages = ${doc.getPageCount()}`];
  assert(doc.getPageCount() === 1, 'expected exactly one page');
  assert(!doc.catalog.has(PDFName.of('AcroForm')), 'catalog has an /AcroForm');
  assert(!annots || annots.size() === 0, 'page has /Annots');
  held.push('no /AcroForm', 'no /Annots');
  if (variant === 'flat') {
    assert(textItems > 0, 'flat fixture has no extractable text');
    held.push(`pdf.js text items = ${textItems} (> 0)`);
    const extracted = withoutBracketDirection(joinItems(items));
    const missing = expectedTexts.filter((expected) => !extracted.includes(withoutBracketDirection(expected)));
    assert(missing.length === 0, `pdf.js text is missing the logical string(s) ${missing.map((text) => JSON.stringify(text)).join(', ')}`);
    held.push(`pdf.js extracts all ${expectedTexts.length} expected logical strings (bracket direction aside)`);
    const spans = new Set(actualTexts(doc));
    const unmarked = expectedTexts.filter((expected) => !spans.has(expected));
    assert(unmarked.length === 0, `no /ActualText span equals the logical string(s) ${unmarked.map((text) => JSON.stringify(text)).join(', ')}`);
    held.push('every expected string is also a logical /ActualText span');
  } else {
    const imageKeys = xObjects ? xObjects.keys().filter((key) => isImage(xObjects, key)) : [];
    assert(textItems === 0, `scan exposes ${textItems} pdf.js text items`);
    assert(!fonts || fonts.keys().length === 0, 'scan page resources have /Font');
    assert(xObjects && xObjects.keys().length === 1 && imageKeys.length === 1, 'scan must have exactly one image XObject');
    held.push('pdf.js text items = 0', 'no /Font in page resources', 'exactly 1 image XObject (and no other XObject)');
  }
  return held;
}
