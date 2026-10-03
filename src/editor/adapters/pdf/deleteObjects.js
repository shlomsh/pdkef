import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef, PDFStream, decodePDFRawStream } from '@cantoo/pdf-lib';
import { extractPageObjects, getPageContentBytes } from './pdfObjects.js';
import { tokenize } from './contentStream.js';
import { dropUnreachable } from './reachability.js';
import { linksOverDeleted } from './linksOverDeleted.js';
import { reportError } from '../../../lib/errorReport.ts';

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
  const replacedForms = new Set(); // original Form refs (tags) that a per-page copy replaced
  const pageIndexes = [...byPage.keys()].sort((a, b) => a - b);
  for (const [step, pageIndex] of pageIndexes.entries()) {
    const page = doc.getPage(pageIndex);

    // Map each deletion to the object it removes, read before the rewrite
    // splices a stream and its byte offsets stop matching `start`/`end`. A
    // deletion inside a Form XObject only matches an object of the same form
    // path: the same offsets mean something else in the page's own stream.
    const { objects } = extractPageObjects(page, pageIndex);
    const spans = [];
    const deletedBoxes = [];
    for (const deletion of byPage.get(pageIndex)) {
      const key = formPathKey(deletion);
      const found = objects.find(
        (o) => o.start === deletion.start && o.end === deletion.end && formPathKey(o) === key,
      );
      const imageRef = deletion.imageRef ?? found?.imageRef;
      const bbox = found?.bbox ?? deletion.bbox;
      if (bbox) deletedBoxes.push(bbox);
      if (imageRef) deletedImageRefs.add(imageRef);
      for (const ref of found?.imageRefs ?? []) deletedImageRefs.add(ref); // a mark's images (RED-55)
      spans.push({ ...deletion, imageRef });
    }

    rewritePageContent(doc, page, spans, replacedForms);
    removeLinksOverDeleted(doc, page, deletedBoxes);

    onProgress?.((step + 1) / pageIndexes.length);
  }

  // Before RED-26's sweep, so a Form nothing draws any more stops counting
  // as drawing the image it lists.
  // One garbage-collection rule (RED-49): drop what nothing reaches, which
  // covers the replaced Forms and old /Contents streams (RED-48) and any
  // leftover the source already carried. Again after the image sweep, which
  // unhooks images from the resources the pages list them in.
  dropUnreachable(doc);
  removeUndrawnImages(doc, deletedImageRefs);
  dropUnreachable(doc);
  clearDocumentDetails(doc);

  const saved = await doc.save();
  return new Blob([saved], { type: 'application/pdf' });
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
      const names = drawnNames(getPageContentBytes(page));
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
 * Rewrites one page with the given byte spans cut out, in place on `doc`.
 * Shared by `deleteObjectsFromPdf` (the real export) and
 * `buildDeletePreviewPage` (an on-screen preview of the same page), so the
 * two can never drift: whatever the download writes is exactly what the
 * screen already showed.
 *
 * A span without a `formPath` is in the page's own content stream. A span
 * with one is in a Form XObject the page draws (RED-29): the forms along the
 * path are copied for this page and the copies edited, so a Form that other
 * pages share is never changed under them.
 *
 * @param {PDFDocument} doc the document `page` belongs to (owns the context
 *   that the rewritten streams are registered against)
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {Array<{start: number, end: number, formPath?: string[], imageRef?: string}>} spans
 * @param {Set<string>} [replacedForms] collects the ref tags of the original
 *   Forms a copy replaced and of the page's old `/Contents` streams, for
 *   `dropUnreachable` (RED-48)
 */
export function rewritePageContent(doc, page, spans, replacedForms = new Set()) {
  const pageSpans = spans.filter((span) => !span.formPath?.length);
  const formSpans = spans.filter((span) => span.formPath?.length);

  if (formSpans.length === 0 || pageSpans.length > 0) {
    const rewritten = spliceOut(getPageContentBytes(page), pageSpans);
    noteOldContents(doc.context, page, replacedForms);
    // One merged stream replaces however many the page had. Offsets were
    // computed against the merged buffer, so the two must agree.
    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(rewritten)));
  }
  if (formSpans.length > 0) rewriteFormContent(doc, page, formSpans, replacedForms);
}

/**
 * Adds the ref tags of the page's current `/Contents` (a ref to a stream, to an
 * array, or a direct array of refs) to `candidates`, before the rewrite
 * replaces them: pdf-lib saves every registered object, so an old stream left
 * behind would still carry the deleted text (RED-48).
 */
function noteOldContents(context, page, candidates) {
  const contents = page.node.get(PDFName.of('Contents'));
  if (contents instanceof PDFRef) candidates.add(contents.tag);
  const array = context.lookup(contents);
  if (array instanceof PDFArray) collectRefs(array, candidates);
}

const formPathKey = (item) => (item.formPath ?? []).join('>');

function refFromTag(tag) {
  const [objectNumber, generationNumber] = tag.split(' ').map(Number);
  return PDFRef.of(objectNumber, generationNumber);
}

/** A direct copy of a dict's entries, so editing it never touches the original. */
function cloneDict(context, dict, skip = []) {
  const copy = PDFDict.withContext(context);
  for (const [key, value] of dict?.entries() ?? []) {
    if (!skip.includes(key.asString())) copy.set(key, value);
  }
  return copy;
}

/**
 * Gives an editing level its own `/Resources` and `/XObject` dicts, cloned
 * from the effective ones: the originals may be inherited from the Pages tree
 * or shared with other pages and forms.
 */
function openResources(context, effective) {
  const resources = cloneDict(context, effective);
  const xobjects = cloneDict(context, xobjectDict(context, effective));
  resources.set(PDFName.of('XObject'), xobjects);
  return { resources, xobjects };
}

/**
 * Cuts the spans that sit inside Form XObjects out of copies of those forms
 * (RED-29). Never edits a form in place: each form along a path is copied once
 * per page, the parent (the page, or the previous copy) is repointed at the
 * copy, and only the copy's content loses the span.
 */
function rewriteFormContent(doc, page, spans, replacedForms) {
  const { context } = doc;
  const root = openResources(context, page.node.Resources());
  page.node.set(PDFName.of('Resources'), root.resources);

  const copies = new Map(); // path prefix -> editing level
  const groups = new Map(); // full path -> its spans
  for (const span of spans) {
    const key = formPathKey(span);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(span);
  }

  const owners = [];
  for (const [, group] of groups) {
    const path = group[0].formPath;
    let level = root;
    for (let i = 0; i < path.length && level; i += 1) {
      const prefix = path.slice(0, i + 1).join('>');
      if (!copies.has(prefix)) copies.set(prefix, copyForm(context, level, path[i], replacedForms));
      level = copies.get(prefix);
    }
    // A path that does not resolve in this document offers nothing to delete.
    if (level && level !== root) owners.push({ level, group });
  }

  for (const { level, group } of owners) {
    level.spans.push(...group);
    level.bytes = spliceOut(level.bytes, group);
  }
  for (const level of copies.values()) {
    if (!level) continue;
    const stream = context.flateStream(level.bytes);
    for (const [key, value] of level.dict.entries()) stream.dict.set(key, value);
    context.assign(level.ref, stream);
    dropUndrawnNames(level);
  }
}

/**
 * Copies the form that `parent` draws as `tag` into a new object (decoded
 * content, the original's dict without its filters) and repoints every name in
 * the parent that held the old ref. Returns undefined when nothing in the
 * parent names that form.
 */
function copyForm(context, parent, tag, replacedForms) {
  const names = [];
  for (const [key, value] of parent.xobjects.entries()) {
    if (value instanceof PDFRef && value.tag === tag) names.push(key);
  }
  const original = context.lookup(refFromTag(tag));
  if (names.length === 0 || !(original instanceof PDFStream)) return undefined;

  const dict = cloneDict(context, original.dict, ['/Filter', '/DecodeParms', '/Length', '/Resources']);
  const own = context.lookup(original.dict.get(PDFName.of('Resources')));
  // A form with no resources of its own draws with its parent's.
  const { resources, xobjects } = openResources(context, own instanceof PDFDict ? own : parent.resources);
  dict.set(PDFName.of('Resources'), resources);

  const ref = context.nextRef();
  for (const key of names) parent.xobjects.set(key, ref);
  replacedForms.add(tag);
  return { ref, dict, xobjects, bytes: decodePDFRawStream(original).decode(), spans: [] };
}

/**
 * Drops from an edited copy the names of images its content no longer draws,
 * so the whole-file sweep for undrawn images (RED-26) sees them as unused.
 */
function dropUndrawnNames(level) {
  const imageRefs = new Set(level.spans.map((span) => span.imageRef).filter(Boolean));
  if (imageRefs.size === 0) return;
  const drawn = drawnNames(level.bytes);
  const names = [];
  for (const [key, value] of level.xobjects.entries()) {
    if (value instanceof PDFRef && imageRefs.has(value.tag) && !drawn.has(key.decodeText())) names.push(key);
  }
  for (const key of names) level.xobjects.delete(key);
}

/** The XObject names a content stream draws with `Do`. */
function drawnNames(bytes) {
  const names = new Set();
  let previous = null;
  for (const token of tokenize(bytes)) {
    if (token.type === 'operator') {
      if (token.value === 'Do' && previous?.type === 'name') names.add(previous.value);
      previous = null;
    } else {
      previous = token;
    }
  }
  return names;
}

/** Every ref reachable from a direct object (dicts, arrays, stream dicts). */
function collectRefs(object, out) {
  if (object instanceof PDFRef) out.add(object.tag);
  else if (object instanceof PDFStream) collectRefs(object.dict, out);
  else if (object instanceof PDFDict) for (const [, value] of object.entries()) collectRefs(value, out);
  else if (object instanceof PDFArray) for (let i = 0; i < object.size(); i += 1) collectRefs(object.get(i), out);
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
 * @param {Array<{start: number, end: number, formPath?: string[]}>} spans
 *   a `formPath` names forms of `sourceDoc`; they are translated to the copy
 * @returns {Promise<Uint8Array>}
 */
export async function buildDeletePreviewPage(sourceDoc, pageIndex, spans) {
  const previewDoc = await PDFDocument.create();
  const [copiedPage] = await previewDoc.copyPages(sourceDoc, [pageIndex]);
  previewDoc.addPage(copiedPage);
  const replacedForms = new Set();
  const translated = translateFormPaths(sourceDoc, sourceDoc.getPage(pageIndex), previewDoc, copiedPage, spans);
  rewritePageContent(previewDoc, copiedPage, translated, replacedForms);
  dropUnreachable(previewDoc);
  return previewDoc.save();
}

/**
 * `copyPages` renumbers every object, so a `formPath` of the source's refs is
 * rewritten to the copied page's by walking both trees in step, matching forms
 * by the name the parent draws them under. A span whose path does not resolve
 * is dropped.
 */
function translateFormPaths(sourceDoc, sourcePage, previewDoc, copiedPage, spans) {
  const translated = [];
  for (const span of spans) {
    if (!span.formPath?.length) {
      translated.push(span);
      continue;
    }
    let sourceResources = sourcePage.node.Resources();
    let previewResources = copiedPage.node.Resources();
    const path = [];
    for (const tag of span.formPath) {
      const sourceXObjects = xobjectDict(sourceDoc.context, sourceResources);
      const previewXObjects = xobjectDict(previewDoc.context, previewResources);
      const key = [...(sourceXObjects?.entries() ?? [])].find(([, v]) => v instanceof PDFRef && v.tag === tag)?.[0];
      const copied = key && previewXObjects?.get(key);
      if (!(copied instanceof PDFRef)) {
        path.length = 0;
        break;
      }
      path.push(copied.tag);
      const sourceForm = sourceDoc.context.lookup(sourceXObjects.get(key));
      const previewForm = previewDoc.context.lookup(copied);
      const sourceOwn = sourceDoc.context.lookup(sourceForm?.dict?.get(PDFName.of('Resources')));
      const previewOwn = previewDoc.context.lookup(previewForm?.dict?.get(PDFName.of('Resources')));
      if (sourceOwn instanceof PDFDict) sourceResources = sourceOwn;
      if (previewOwn instanceof PDFDict) previewResources = previewOwn;
    }
    if (path.length === span.formPath.length) translated.push({ ...span, formPath: path });
  }
  return translated;
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
      reportError('redact', err, 'list_objects');
      console.error(`Could not read deletable objects on page ${i + 1}`, err);
    }
  }
  return all;
}
