import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream } from '@cantoo/pdf-lib';

// RED-49: what a PDF's own structure still reaches. A viewer starts at the
// trailer (Root, Info, Encrypt) and follows references; anything it never
// reaches is invisible but still written to the file by pdf-lib's save: an
// old revision an incremental save left behind, or a stream a rewrite
// replaced (RED-48). The export drops these parts and the saved-file check
// looks inside them, through this one walk, so the two never disagree.

/** Every reference reachable from `obj`, added to `seen`. */
function walk(context, obj, seen) {
  const stack = [obj];
  while (stack.length) {
    const value = stack.pop();
    if (value instanceof PDFRef) {
      if (seen.has(value.tag)) continue;
      seen.add(value.tag);
      const target = context.lookup(value);
      if (target !== undefined) stack.push(target);
    } else if (value instanceof PDFDict) {
      for (const [, entry] of value.entries()) stack.push(entry);
    } else if (value instanceof PDFArray) {
      for (let i = 0; i < value.size(); i += 1) stack.push(value.get(i));
    } else if (value instanceof PDFStream) {
      stack.push(value.dict);
    }
  }
}

/** An object stream or cross-reference stream: the file's own packaging,
 * which pdf-lib keeps after a load and rebuilds on every save (verified: a
 * title cleared after loading a file that packs it in an object stream is
 * gone from the next save). Not a part anyone could hide something in. */
function isPackaging(obj) {
  if (!(obj instanceof PDFStream)) return false;
  const type = obj.dict.get(PDFName.of('Type'));
  return type === PDFName.of('ObjStm') || type === PDFName.of('XRef');
}

/**
 * The indirect objects nothing reaches from the trailer, leaving out the
 * file's packaging streams (see `isPackaging`).
 *
 * @param {import('@cantoo/pdf-lib').PDFDocument} doc
 * @returns {import('@cantoo/pdf-lib').PDFRef[]}
 */
export function unreachableRefs(doc) {
  const { context } = doc;
  const seen = new Set();
  const { Root, Info, Encrypt } = context.trailerInfo;
  for (const start of [Root, Info, Encrypt]) if (start) walk(context, start, seen);
  return context.enumerateIndirectObjects()
    .filter(([ref, obj]) => !seen.has(ref.tag) && !isPackaging(obj))
    .map(([ref]) => ref);
}

/**
 * Deletes every object nothing reaches, so a save carries none of them.
 *
 * @param {import('@cantoo/pdf-lib').PDFDocument} doc
 * @returns {number} how many objects were dropped
 */
export function dropUnreachable(doc) {
  const refs = unreachableRefs(doc);
  for (const ref of refs) doc.context.delete(ref);
  return refs.length;
}
