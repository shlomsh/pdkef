/**
 * RED-49: the text of "a part of the file no page shows". The objects come
 * from `reachability.js` (the same walk the export uses to drop them, so the
 * check and the export never disagree about what is unused); the reading of
 * their strings and content streams is the pure `unusedText.ts`.
 *
 * Shared by `readSavedFile.ts` (what the check shows) and `placeLocator.ts`
 * (what Remove it edits), so the two cannot list different text.
 */
import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  decodePDFRawStream,
  type PDFDocument,
  type PDFObject,
} from '@cantoo/pdf-lib';
import { unreachableRefs } from '../../../editor/adapters/pdf/reachability.js';
import { isNonBlank } from './placeText.ts';
import { contentStreamTexts } from './unusedText.ts';

/** Streams whose bytes are not text operators: a picture, a font program, an embedded file. */
function isBinaryStream(stream: PDFStream): boolean {
  const { dict } = stream;
  return (
    dict.get(PDFName.of('Subtype')) === PDFName.of('Image') ||
    dict.get(PDFName.of('Type')) === PDFName.of('EmbeddedFile') ||
    dict.has(PDFName.of('Length1')) ||
    dict.has(PDFName.of('Length2'))
  );
}

function streamBytes(stream: PDFStream): Uint8Array | undefined {
  try {
    return stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
  } catch {
    // A filter we can't undo (a picture codec, a damaged stream): nothing to read.
    return undefined;
  }
}

/** Every string value inside an object's dictionaries and arrays, decoded. */
function stringValues(root: PDFObject, out: string[]): void {
  const stack: PDFObject[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value instanceof PDFString || value instanceof PDFHexString) out.push(value.decodeText());
    else if (value instanceof PDFDict) for (const [, entry] of value.entries()) stack.push(entry);
    else if (value instanceof PDFArray) for (let i = 0; i < value.size(); i += 1) stack.push(value.get(i));
  }
}

/**
 * Everything readable in the file's unreachable objects, one piece per line:
 * string values in dictionaries and arrays (also those of a stream's own
 * dictionary), and the text a content stream shows. Empty when there is none.
 */
export function unusedPartsText(doc: PDFDocument): string {
  const pieces: string[] = [];
  for (const ref of unreachableRefs(doc)) {
    const obj = doc.context.lookup(ref);
    if (obj === undefined) continue;
    if (obj instanceof PDFStream) {
      stringValues(obj.dict, pieces);
      if (!isBinaryStream(obj)) {
        const bytes = streamBytes(obj);
        if (bytes) pieces.push(...contentStreamTexts(bytes));
      }
    } else {
      stringValues(obj, pieces);
    }
  }
  return pieces.filter(isNonBlank).join('\n');
}
