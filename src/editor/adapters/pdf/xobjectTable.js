import { PDFName, PDFRef, PDFStream } from '@cantoo/pdf-lib';
import { lookupDict } from './dictReads.js';

export function buildXObjectTable(context, resources) {
  const table = new Map();
  const xobjects = lookupDict(context, resources?.get(PDFName.of('XObject')));
  if (!xobjects) return table;
  for (const [key, value] of xobjects.entries()) {
    const stream = context.lookup(value);
    if (!(stream instanceof PDFStream)) continue;
    const subtype = context.lookup(stream.dict.get(PDFName.of('Subtype')))?.asString?.();
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
