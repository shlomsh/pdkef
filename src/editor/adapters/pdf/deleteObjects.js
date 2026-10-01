import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef, PDFStream } from '@cantoo/pdf-lib';
import { extractPageObjects, getPageContentBytes } from './pdfObjects.js';
import { tokenize } from './contentStream.js';
import { linksOverDeleted } from './linksOverDeleted.js';

/**
 * Removes chosen drawing operations from a PDF by rewriting the affected page
 * content streams, leaving every other page byte-identical. An image whose
 * every draw was deleted, and which no page (or form, or annotation
 * appearance) still draws, is dropped from the file as well (RED-26), so a
 * watermark removed on every page is really gone and not just unreferenced.
 *
 * This is the counterpart to `redactPdf`, and deliberately unlike it. Redaction
 * paints over content and must then flatten the page to an image, because a
 * drawn rectangle does not remove what is underneath it. Deletion removes the
 * operation itself, so the page stays vector: text elsewhere on it is still
 * selectable, the file stays small, and nothing is re-encoded.
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array} file source PDF
 * @param {Array<{pageIndex: number, start: number, end: number}>} deletions
 *   byte spans as reported by `extractPageObjects` for that same page
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<Blob>}
 */
export async function deleteObjectsFromPdf(file, deletions, onProgress) {
  const bytes =
    file instanceof Uint8Array
      ? file
      : new Uint8Array(file instanceof ArrayBuffer ? file : await file.arrayBuffer());

  // updateMetadata: false so pdf-lib does not itself stamp a new
  // Producer/ModDate into the Info dict on save - clearDocumentDetails below
  // wants Info to end up with nothing, not pdf-lib's own something.
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });

  const byPage = new Map();
  for (const deletion of deletions) {
    if (!byPage.has(deletion.pageIndex)) byPage.set(deletion.pageIndex, []);
    byPage.get(deletion.pageIndex).push(deletion);
  }

  const deletedImageRefs = new Set();
  const pageIndexes = [...byPage.keys()].sort((a, b) => a - b);
  for (const [step, pageIndex] of pageIndexes.entries()) {
    const page = doc.getPage(pageIndex);
    const spans = byPage.get(pageIndex);

    // Map each deletion to the bbox of the object it removes, read before
    // the rewrite splices the content stream and its byte offsets stop
    // matching `start`/`end`.
    const { objects } = extractPageObjects(page, pageIndex);
    const deletedObjects = spans
      .map((span) => objects.find((o) => o.start === span.start && o.end === span.end))
      .filter(Boolean);
    const deletedBoxes = deletedObjects.map((o) => o.bbox);
    for (const o of deletedObjects) if (o.imageRef) deletedImageRefs.add(o.imageRef);

    rewritePageContent(doc, page, spans);
    removeLinksOverDeleted(doc, page, deletedBoxes);

    onProgress?.((step + 1) / pageIndexes.length);
  }

  removeUndrawnImages(doc, deletedImageRefs);
  clearDocumentDetails(doc);

  const saved = await doc.save();
  return new Blob([saved], { type: 'application/pdf' });
}

/**
 * Lists the page indexes that draw one image, for the "This image is on 12
 * pages" line (RED-26). Pure: it reads the `imageRef` that `extractPageObjects`
 * put on each image object, so it is exact (the same XObject), not a guess
 * from pixels or position.
 *
 * @param {Array<{kind: string, pageIndex: number, imageRef?: string}>} objects
 *   the result of `listDeletableObjects`
 * @param {string} imageRef an image object's `imageRef`, e.g. "12 0 R"
 * @returns {number[]} distinct page indexes, ascending
 */
export function pagesDrawingImage(objects, imageRef) {
  if (!imageRef) return [];
  const pages = new Set();
  for (const o of objects) {
    if (o.kind === 'image' && o.imageRef === imageRef) pages.add(o.pageIndex);
  }
  return [...pages].sort((a, b) => a - b);
}

/** The `/XObject` dict of a resources dict, if it has one. */
function xobjectDict(context, resources) {
  const found = context.lookup(resources?.get(PDFName.of('XObject')));
  return found instanceof PDFDict ? found : undefined;
}

/**
 * Adds to `drawn` every image XObject reachable from a Form XObject's (or an
 * annotation appearance's) own resources. Deliberately generous: it counts
 * everything the form lists, not only what its content draws, because wrongly
 * keeping an image costs bytes while wrongly deleting one breaks a page.
 *
 * @param {import('@cantoo/pdf-lib').PDFContext} context
 * @param {PDFStream} form
 * @param {PDFDict|undefined} fallbackResources the page's, for a form with none
 * @param {Set<string>} drawn image ref tags
 * @param {Set<PDFStream>} seen forms already walked (they may nest or loop)
 */
function collectFormImages(context, form, fallbackResources, drawn, seen) {
  if (seen.has(form)) return;
  seen.add(form);
  const own = context.lookup(form.dict.get(PDFName.of('Resources')));
  const resources = own instanceof PDFDict ? own : fallbackResources;
  const xobjects = xobjectDict(context, resources);
  if (!xobjects) return;
  for (const [, value] of xobjects.entries()) noteXObject(context, value, resources, drawn, seen);
}

function noteXObject(context, value, resources, drawn, seen) {
  const target = context.lookup(value);
  if (!(target instanceof PDFStream)) return;
  const subtype = context.lookup(target.dict.get(PDFName.of('Subtype')))?.asString?.();
  if (subtype === '/Image') {
    if (value instanceof PDFRef) drawn.add(value.tag);
  } else if (subtype === '/Form') {
    collectFormImages(context, target, resources, drawn, seen);
  }
}

/**
 * Every image XObject (as a ref tag) that something in the document still
 * draws: a `Do` in a page's current content, a Form XObject that lists it, or
 * an annotation appearance that lists it. Called after the pages were
 * rewritten, so a draw that was just deleted no longer counts.
 *
 * @param {PDFDocument} doc
 * @returns {Set<string>}
 */
function stillDrawnImages(doc) {
  const context = doc.context;
  const drawn = new Set();
  const seen = new Set();

  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    const xobjects = xobjectDict(context, resources);
    if (xobjects) {
      const names = new Set();
      let previous = null;
      for (const token of tokenize(getPageContentBytes(page))) {
        if (token.type === 'operator') {
          if (token.value === 'Do' && previous?.type === 'name') names.add(previous.value);
          previous = null;
        } else {
          previous = token;
        }
      }
      for (const name of names) {
        const value = xobjects.get(PDFName.of(name));
        if (value) noteXObject(context, value, resources, drawn, seen);
      }
    }

    const annots = context.lookup(page.node.get(PDFName.of('Annots')));
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i += 1) {
      const annot = context.lookup(annots.get(i));
      const ap = annot instanceof PDFDict ? context.lookup(annot.get(PDFName.of('AP'))) : undefined;
      if (!(ap instanceof PDFDict)) continue;
      for (const [, state] of ap.entries()) {
        const entry = context.lookup(state);
        // /N, /R, /D are a stream or a dict of streams keyed by state name.
        const streams = entry instanceof PDFDict ? [...entry.entries()].map(([, v]) => context.lookup(v)) : [entry];
        for (const stream of streams) {
          if (stream instanceof PDFStream) collectFormImages(context, stream, resources, drawn, seen);
        }
      }
    }
  }
  return drawn;
}

/**
 * Removes from the file every image whose draw was deleted and that nothing
 * still draws (RED-26): its name is dropped from each page's `/XObject`
 * resources and the stream itself, plus any indirect `/SMask` or `/Mask` that
 * only it used, leaves the document so `save` no longer writes it. An image
 * that another page, form or annotation still draws is left alone.
 *
 * @param {PDFDocument} doc
 * @param {Set<string>} deletedImageRefs ref tags ("12 0 R") of images that
 *   had a draw deleted
 */
function removeUndrawnImages(doc, deletedImageRefs) {
  if (deletedImageRefs.size === 0) return;
  const context = doc.context;
  const drawn = stillDrawnImages(doc);
  const removable = [...deletedImageRefs].filter((tag) => !drawn.has(tag));
  if (removable.length === 0) return;
  const removableSet = new Set(removable);

  for (const page of doc.getPages()) {
    const xobjects = xobjectDict(context, page.node.Resources());
    if (!xobjects) continue;
    const names = [];
    for (const [key, value] of xobjects.entries()) {
      if (value instanceof PDFRef && removableSet.has(value.tag)) names.push(key);
    }
    for (const key of names) xobjects.delete(key);
  }

  const maskRefs = new Map();
  for (const tag of removable) {
    const [objectNumber, generationNumber] = tag.split(' ').map(Number);
    const ref = PDFRef.of(objectNumber, generationNumber);
    const image = context.lookup(ref);
    if (image instanceof PDFStream) {
      for (const key of ['SMask', 'Mask']) {
        const mask = image.dict.get(PDFName.of(key));
        if (mask instanceof PDFRef) maskRefs.set(mask.tag, mask);
      }
    }
    context.delete(ref);
  }

  // A mask another surviving image also points at stays.
  for (const [, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFStream)) continue;
    for (const key of ['SMask', 'Mask']) {
      const mask = object.dict.get(PDFName.of(key));
      if (mask instanceof PDFRef) maskRefs.delete(mask.tag);
    }
  }
  for (const ref of maskRefs.values()) context.delete(ref);
}

/**
 * Drops any `/Link` annotation on `page` that sat over one of the objects
 * just deleted (RED-27: CamScanner's footer image and its Link to
 * camscanner.com share the same rectangle). Deliberately any deleted object,
 * text as well as images: a link mostly over something the person removed
 * points at nothing they can see, so keeping it would leave a clickable blank.
 * Never touches `/Widget` or any other annotation subtype.
 *
 * The removed annotation dict and its `/A` action dict are also deleted from
 * the document's context when they are indirect objects: pdf-lib's `save`
 * writes every object still registered there, so leaving them in would keep
 * the tracking URI in the saved bytes even after the annotation reference is
 * gone from `/Annots`.
 *
 * @param {PDFDocument} doc
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {Array<{x: number, y: number, width: number, height: number}>} deletedBoxes
 */
function removeLinksOverDeleted(doc, page, deletedBoxes) {
  if (deletedBoxes.length === 0) return;

  const context = doc.context;
  const annotsRef = page.node.get(PDFName.of('Annots'));
  const annots = context.lookup(annotsRef);
  if (!(annots instanceof PDFArray)) return;

  const links = []; // { index, rect, ref }
  for (let index = 0; index < annots.size(); index += 1) {
    const ref = annots.get(index);
    const annot = context.lookup(ref);
    if (!(annot instanceof PDFDict)) continue;
    if (context.lookup(annot.get(PDFName.of('Subtype')))?.asString?.() !== '/Link') continue;
    const rect = context.lookup(annot.get(PDFName.of('Rect')))?.asRectangle?.();
    if (!rect) continue;
    links.push({ index, rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height], ref, annot });
  }
  if (links.length === 0) return;

  const dropped = linksOverDeleted(
    links.map((link) => link.rect),
    deletedBoxes,
  );
  if (dropped.length === 0) return;

  const droppedIndexes = new Set(dropped.map((i) => links[i].index));
  const survivors = [];
  for (let index = 0; index < annots.size(); index += 1) {
    if (!droppedIndexes.has(index)) survivors.push(annots.get(index));
  }

  if (survivors.length === 0) {
    page.node.delete(PDFName.of('Annots'));
  } else {
    const newAnnots = context.obj(survivors);
    page.node.set(PDFName.of('Annots'), newAnnots);
  }
  if (annotsRef instanceof PDFRef) context.delete(annotsRef);

  for (const dropIndex of dropped) {
    const { ref, annot } = links[dropIndex];
    const actionRef = annot.get(PDFName.of('A'));
    if (actionRef instanceof PDFRef) context.delete(actionRef);
    if (ref instanceof PDFRef) context.delete(ref);
  }
}

/**
 * Clears every detail of the source document from an exported Delete
 * download: Info dict entries (title, author, subject, keywords, creator,
 * producer, dates) and the catalog's XMP `/Metadata` stream. Redact's
 * companion export already starts this clean because a page saved as a
 * picture is a brand-new document with none of the original's details; a
 * Delete download edits the original document in place, so it has to clear
 * them itself to match (RED-27, found on a CamScanner scan whose Info still
 * carried the app name, device and the exact scan time).
 *
 * @param {PDFDocument} doc
 */
export function clearDocumentDetails(doc) {
  const info = doc.getInfoDict();
  for (const key of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate']) {
    info.delete(PDFName.of(key));
  }

  const context = doc.context;
  const metadataRef = doc.catalog.get(PDFName.of('Metadata'));
  if (metadataRef !== undefined) {
    doc.catalog.delete(PDFName.of('Metadata'));
    if (metadataRef instanceof PDFRef) context.delete(metadataRef);
  }
}

/**
 * Rewrites one page's content stream with the given byte spans cut out, in
 * place on `doc`. Shared by `deleteObjectsFromPdf` (the real export) and
 * `buildDeletePreviewPage` (an on-screen preview of the same page), so the
 * two can never drift: whatever the download writes is exactly what the
 * screen already showed.
 *
 * @param {PDFDocument} doc the document `page` belongs to (owns the context
 *   that the rewritten stream is registered against)
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {Array<{start: number, end: number}>} spans
 */
export function rewritePageContent(doc, page, spans) {
  const original = getPageContentBytes(page);
  const rewritten = spliceOut(original, spans);

  // One merged stream replaces however many the page had. Offsets were
  // computed against the merged buffer, so the two must agree.
  const stream = doc.context.flateStream(rewritten);
  page.node.set(PDFName.of('Contents'), doc.context.register(stream));
}

/**
 * Builds a standalone, single-page PDF that previews what one page will look
 * like once the given spans are deleted, for the on-screen canvas to render
 * before the user downloads anything (RED-13: "what you see is what you
 * save"). Copies just that page into a fresh document rather than rewriting
 * the whole source, so a many-page file's preview stays cheap to rebuild as
 * marks are added or undone.
 *
 * @param {PDFDocument} sourceDoc an already loaded source document (callers
 *   load it once per file and reuse it across pages/rebuilds)
 * @param {number} pageIndex
 * @param {Array<{start: number, end: number}>} spans
 * @returns {Promise<Uint8Array>}
 */
export async function buildDeletePreviewPage(sourceDoc, pageIndex, spans) {
  const previewDoc = await PDFDocument.create();
  const [copiedPage] = await previewDoc.copyPages(sourceDoc, [pageIndex]);
  previewDoc.addPage(copiedPage);
  rewritePageContent(previewDoc, copiedPage, spans);
  return previewDoc.save();
}

/**
 * Cuts byte ranges out of a content stream.
 *
 * Ranges are applied back to front so earlier offsets stay valid, and each cut
 * leaves a newline behind: the removed span sat between two tokens, and butting
 * its neighbours together could fuse them into one.
 *
 * @param {Uint8Array} bytes
 * @param {Array<{start: number, end: number}>} ranges
 * @returns {Uint8Array}
 */
export function spliceOut(bytes, ranges) {
  const ordered = [...ranges].sort((a, b) => a.start - b.start);

  // Merge overlaps so a doubly-selected span is not cut twice.
  const merged = [];
  for (const range of ordered) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }

  const pieces = [];
  let cursor = 0;
  for (const range of merged) {
    const start = Math.max(0, Math.min(range.start, bytes.length));
    const end = Math.max(start, Math.min(range.end, bytes.length));
    pieces.push(bytes.subarray(cursor, start));
    pieces.push(new Uint8Array([0x0a]));
    cursor = end;
  }
  pieces.push(bytes.subarray(cursor));

  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}

/**
 * Lists the deletable objects on every page, for the UI's hover targets.
 *
 * A page whose content stream this lexer cannot fully model (an unusual
 * operator sequence, a font it can't read metrics from) is skipped rather than
 * failing the whole file: it simply offers nothing to click, which matches the
 * "what you see is what you get, no highlight means no delete" rule the rest
 * of this feature follows.
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array} file
 * @returns {Promise<Array>} objects carrying `rect` in page percentages
 */
export async function listDeletableObjects(file) {
  const bytes =
    file instanceof Uint8Array
      ? file
      : new Uint8Array(file instanceof ArrayBuffer ? file : await file.arrayBuffer());

  const doc = await PDFDocument.load(bytes);
  const all = [];
  for (let i = 0; i < doc.getPageCount(); i += 1) {
    try {
      const { objects } = extractPageObjects(doc.getPage(i), i);
      all.push(...objects);
    } catch (err) {
      console.error(`Could not read deletable objects on page ${i + 1}`, err);
    }
  }
  return all;
}
