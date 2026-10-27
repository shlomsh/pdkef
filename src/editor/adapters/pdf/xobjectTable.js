// @ts-check
import { PDFName, PDFRef, PDFStream } from '@cantoo/pdf-lib';
import { lookupDict, nameOf } from './dictReads.js';

/**
 * @typedef {object} XObjectEntry
 * @property {boolean} isImage
 * @property {{ ref: import('@cantoo/pdf-lib').PDFRef, stream: import('@cantoo/pdf-lib').PDFStream } | undefined} form an indirect Form XObject
 * @property {string | undefined} imageRef the indirect reference as "12 0 R"
 */

/**
 * @param {import('@cantoo/pdf-lib').PDFContext} context
 * @param {import('@cantoo/pdf-lib').PDFDict | undefined} resources
 * @returns {Map<string, XObjectEntry>} keyed `/Name`
 */
export function buildXObjectTable(context, resources) {
  /** @type {Map<string, XObjectEntry>} */
  const table = new Map();
  const xobjects = lookupDict(context, resources?.get(PDFName.of('XObject')));
  if (!xobjects) return table;
  for (const [key, value] of xobjects.entries()) {
    const stream = context.lookup(value);
    if (!(stream instanceof PDFStream)) continue;
    const subtype = nameOf(context.lookup(stream.dict.get(PDFName.of('Subtype'))));
    table.set(key.asString(), {
      isImage: subtype === '/Image',
      // A Form XObject is walked in place (RED-29). Only an indirect one can
      // be named in a `formPath`, and a direct stream is not legal PDF anyway.
      form: subtype === '/Form' && value instanceof PDFRef ? { ref: value, stream } : undefined,
      // The indirect reference as "12 0 R", the same on every page that draws
      // this one image (RED-26). Absent for a direct (inline-in-dict) stream.
      imageRef: value instanceof PDFRef ? value.tag : undefined,
    });
  }
  return table;
}
