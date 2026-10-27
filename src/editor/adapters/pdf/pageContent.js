// @ts-check
import { PDFName, PDFArray, PDFStream, decodePDFRawStream } from '@cantoo/pdf-lib';

/** A page's content stream is damaged and will not decode (the person's file). */
export class ContentStreamDecodeError extends Error {
  /** @param {unknown} cause */
  constructor(cause) {
    super(`Content stream will not decode: ${cause instanceof Error ? cause.message : cause}`);
    this.name = 'ContentStreamDecodeError';
    this.cause = cause;
  }
}

/**
 * Concatenates a page's content streams into one buffer.
 *
 * A page may carry an array of streams that are logically joined; offsets we
 * report are into this joined buffer, and `applyDeletions` writes back a single
 * merged stream so the two stay consistent.

 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @returns {Uint8Array}
 */
export function getPageContentBytes(page) {
  const context = page.doc.context;
  const contents = context.lookup(page.node.get(PDFName.of('Contents')));

  /** @type {Array<import('@cantoo/pdf-lib').PDFStream>} */
  const streams = [];
  if (contents instanceof PDFStream) {
    streams.push(contents);
  } else if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      const entry = context.lookup(contents.get(i));
      if (entry instanceof PDFStream) streams.push(entry);
    }
  }

  const parts = streams.map((stream) => {
    try {
      return decodePDFRawStream(/** @type {import('@cantoo/pdf-lib').PDFRawStream} */ (stream)).decode();
    } catch (err) {
      throw new ContentStreamDecodeError(err);
    }
  });
  if (parts.length === 0) return new Uint8Array(0);
  if (parts.length === 1) return parts[0];

  // Streams are joined with a newline: the spec allows a lexical token to end
  // at a stream boundary, so butting them together could fuse two operators.
  const total = parts.reduce((sum, part) => sum + part.length + 1, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
    joined[offset] = 0x0a;
    offset += 1;
  }
  return joined;
}
