// What is a PDF made of? A pure, synchronous read of an already-loaded pdf-lib
// document: its image streams (size, encoding, colour space, mask links) and
// whether any page or Form XObject draws text. The Compress island only reads
// the result, to say honestly whether there is anything to shrink (COMP-01).
import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';

const TEXT_SHOWING_OPERATORS = new Set(['Tj', 'TJ', "'", '"']);

const nameText = (obj) => (obj instanceof PDFName ? obj.decodeText() : null);

function numberValue(obj) {
  return obj instanceof PDFNumber ? obj.asNumber() : 0;
}

function subtypeName(stream) {
  return nameText(stream.dict.get(PDFName.of('Subtype')));
}

function filterNames(dict, context) {
  const filter = context.lookup(dict.get(PDFName.of('Filter')));
  if (filter instanceof PDFName) return [filter.decodeText()];
  if (filter instanceof PDFArray) {
    return filter
      .asArray()
      .map((item) => nameText(context.lookup(item)))
      .filter(Boolean);
  }
  return [];
}

function colorSpaceName(dict, context) {
  const cs = context.lookup(dict.get(PDFName.of('ColorSpace')));
  if (cs instanceof PDFName) return cs.decodeText();
  if (cs instanceof PDFArray && cs.size() > 0) {
    return nameText(context.lookup(cs.get(0))) ?? 'none';
  }
  return 'none';
}

function refTargets(dict, keys) {
  return keys
    .map((key) => dict.get(PDFName.of(key)))
    .filter((value) => value instanceof PDFRef)
    .map((ref) => ref.toString());
}

function describeImage(ref, stream, maskedRefs, context) {
  const { dict } = stream;
  const bpc = dict.get(PDFName.of('BitsPerComponent'));
  const imageMask = context.lookup(dict.get(PDFName.of('ImageMask')));
  return {
    ref: ref.toString(),
    width: numberValue(dict.get(PDFName.of('Width'))),
    height: numberValue(dict.get(PDFName.of('Height'))),
    bitsPerComponent: bpc instanceof PDFNumber ? bpc.asNumber() : null,
    colorSpace: colorSpaceName(dict, context),
    filters: filterNames(dict, context),
    bytes: stream.getContents().length,
    hasSMask: dict.has(PDFName.of('SMask')),
    isMask: maskedRefs.has(ref.toString()) || String(imageMask) === 'true',
  };
}

function collectImages(context) {
  const entries = context
    .enumerateIndirectObjects()
    .filter(([, obj]) => obj instanceof PDFRawStream && subtypeName(obj) === 'Image');
  const maskedRefs = new Set(entries.flatMap(([, obj]) => refTargets(obj.dict, ['SMask', 'Mask'])));
  return entries
    .map(([ref, obj]) => describeImage(ref, obj, maskedRefs, context))
    .sort((a, b) => objectNumber(a.ref) - objectNumber(b.ref));
}

const objectNumber = (refText) => parseInt(refText, 10);

// Removes string literals (with nesting and escapes), hex strings and comments.
function stripStringsAndComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '(') {
      let depth = 1;
      i += 1;
      while (i < source.length && depth > 0) {
        if (source[i] === '\\') i += 1;
        else if (source[i] === '(') depth += 1;
        else if (source[i] === ')') depth -= 1;
        i += 1;
      }
      out += ' ';
    } else if (ch === '<' && source[i + 1] !== '<') {
      const end = source.indexOf('>', i);
      i = end === -1 ? source.length : end + 1;
      out += ' ';
    } else if (ch === '%') {
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

export function contentShowsText(source) {
  const tokens = stripStringsAndComments(source).split(/[\s[\]<>/]+/);
  let inText = false;
  for (const token of tokens) {
    if (token === 'BT') inText = true;
    else if (token === 'ET') inText = false;
    else if (inText && TEXT_SHOWING_OPERATORS.has(token)) return true;
  }
  return false;
}

function decodeToString(stream) {
  try {
    const bytes = decodePDFRawStream(stream).decode();
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return text;
  } catch {
    // expected: a stream this file damaged or encoded oddly just has no readable text
    return null;
  }
}

function pageContentStreams(pdfDoc) {
  const { context } = pdfDoc;
  return pdfDoc.getPages().flatMap((page) => {
    const contents = context.lookup(page.node.get(PDFName.of('Contents')));
    const items = contents instanceof PDFArray ? contents.asArray() : [contents];
    return items.map((item) => context.lookup(item)).filter((obj) => obj instanceof PDFRawStream);
  });
}

function formStreams(context) {
  return context
    .enumerateIndirectObjects()
    .map(([, obj]) => obj)
    .filter((obj) => obj instanceof PDFRawStream && subtypeName(obj) === 'Form');
}

function detectText(pdfDoc) {
  const streams = [...pageContentStreams(pdfDoc), ...formStreams(pdfDoc.context)];
  return streams.some((stream) => {
    const source = decodeToString(stream);
    return source !== null && contentShowsText(source);
  });
}

/**
 * @param {import('@cantoo/pdf-lib').PDFDocument} pdfDoc  an already-loaded pdf-lib document
 * @param {{ totalBytes: number }} options                  the file's size on disk
 */
export function analyzePdf(pdfDoc, { totalBytes }) {
  const images = collectImages(pdfDoc.context);
  const imageBytes = images.reduce((sum, image) => sum + image.bytes, 0);
  const imageShare = totalBytes > 0 ? Math.min(1, Math.max(0, imageBytes / totalBytes)) : 0;
  return {
    pageCount: pdfDoc.getPageCount(),
    totalBytes,
    images,
    imageBytes,
    imageShare,
    hasText: detectText(pdfDoc),
  };
}
