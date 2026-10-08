/**
 * RED-59: what a PDF says about itself and holds hidden, read as one list of
 * trace kinds and edited by detail id (kept as it came, altered or deleted by
 * the person). Pure pdf-lib; no UI, no words. The words live in Redact's
 * `details/describeDetails.ts`.
 *
 * An export keeps every detail unless the person edits it; what always goes is
 * app data that can hold a copy of the page from before the marks: `/Thumb`,
 * every `/PieceInfo`, and the thumbnails inside a kept XMP packet.
 */
import {
  PDFArray, PDFDict, PDFHexString, PDFName, PDFObjectCopier, PDFRef, PDFStream, PDFString, decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { parsePdfDate } from './pdfDate.js';
import { expandDetailEdits } from './detailEdits.js';

/** @typedef {import('@cantoo/pdf-lib').PDFDocument} PDFDocument */

const N = PDFName.of;
const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'];
const MAX_FORM_DEPTH = 8;

/** @typedef {import('./detailEdits.js').DetailEdit} DetailEdit */
/** @typedef {import('./detailEdits.js').DetailEdits} DetailEdits */

const asDict = (ctx, o) => {
  const v = o instanceof PDFRef ? ctx.lookup(o) : o;
  return v instanceof PDFDict ? v : v instanceof PDFStream ? v.dict : undefined;
};
const resolve = (ctx, o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
const textOf = (o) => (o instanceof PDFString || o instanceof PDFHexString ? safe(() => o.decodeText()) : null);
function safe(fn) {
  try {
    return fn();
  } catch {
    // expected: a value that will not decode is read as absent
    return null;
  }
}

function infoDict(doc) {
  const info = doc.context.trailerInfo.Info;
  return info ? asDict(doc.context, info) : undefined;
}

/** The streams this page node draws as XObjects, nested form resources to a depth of 8, each once. */
function pageXObjects(doc, pageNode) {
  const ctx = doc.context;
  const out = [];
  const seen = new Set();
  const visit = (resources, depth) => {
    const xo = resources && asDict(ctx, resources.get(N('XObject')));
    if (!xo) return;
    for (const [, value] of xo.entries()) {
      const key = value instanceof PDFRef ? value.tag : null;
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const stream = resolve(ctx, value);
      if (!(stream instanceof PDFStream)) continue;
      out.push(stream.dict);
      if (depth < MAX_FORM_DEPTH && stream.dict.get(N('Subtype')) === N('Form')) {
        visit(asDict(ctx, stream.dict.get(N('Resources'))), depth + 1);
      }
    }
  };
  visit(safe(() => pageNode.Resources()) ?? undefined, 1);
  return out;
}

const hasDetail = (dict) => dict.has(N('Metadata')) || dict.has(N('PieceInfo'));

/** A file specification's name: /UF, then /F, else the given fallback. */
function fileName(ctx, spec, fallback) {
  const d = asDict(ctx, spec);
  return (d && (textOf(d.get(N('UF'))) ?? textOf(d.get(N('F'))))) || fallback;
}

/**
 * Walks an EmbeddedFiles name tree. `visit(node, namesArray, index)` is called for each name/value pair.
 */
function walkNameTree(ctx, root, visit, seen = new Set()) {
  const node = asDict(ctx, root);
  if (!node || seen.has(node)) return;
  seen.add(node);
  const pairs = resolve(ctx, node.get(N('Names')));
  if (pairs instanceof PDFArray) {
    for (let i = 0; i + 1 < pairs.size(); i += 2) visit(pairs, i);
  }
  const kids = resolve(ctx, node.get(N('Kids')));
  if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walkNameTree(ctx, kids.get(i), visit, seen);
}

function fileAttachmentAnnots(doc) {
  const ctx = doc.context;
  const found = [];
  doc.getPages().forEach((page, pageIndex) => {
    const annots = resolve(ctx, page.node.get(N('Annots')));
    if (!(annots instanceof PDFArray)) return;
    for (let i = 0; i < annots.size(); i++) {
      const a = asDict(ctx, annots.get(i));
      if (a && a.get(N('Subtype')) === N('FileAttachment')) {
        found.push({ annots, index: i, pageIndex, name: fileName(ctx, a.get(N('FS')), 'attachment') });
      }
    }
  });
  return found;
}

function isJavaScriptAction(ctx, o) {
  const d = asDict(ctx, o);
  return !!d && d.get(N('S')) === N('JavaScript');
}

function xmpState(doc) {
  const m = resolve(doc.context, doc.catalog.get(N('Metadata')));
  if (!(m instanceof PDFStream)) return { present: false, hasHistory: false };
  const text = safe(() => {
    const bytes = m.dict.has(N('Filter')) ? decodePDFRawStream(m).decode() : m.getContents();
    return new TextDecoder('latin1').decode(bytes);
  });
  return { present: true, hasHistory: !!text && text.includes('xmpMM:History') };
}


/**
 * @typedef {object} PdfDate A date as the file recorded it, wall clock plus offset.
 * @property {string} iso The wall time as `YYYY-MM-DDTHH:mm:ss` (no zone), as the device's clock said.
 * @property {number | null} offsetMinutes The recorded offset from UTC, or null when the file gave none.
 */

/**
 * @typedef {object} DocumentTraces
 * @property {string | null} title
 * @property {string | null} author
 * @property {string | null} subject
 * @property {string | null} keywords
 * @property {string | null} creator
 * @property {string | null} producer
 * @property {PdfDate | null} creationDate
 * @property {PdfDate | null} modDate
 * @property {string[]} otherInfoKeys Any further Info entry's key name (a company, `SourceModified`), never its value.
 * @property {{ present: boolean, hasHistory: boolean } } xmp The catalog's XMP stream; `hasHistory` when it holds an `xmpMM:History`.
 * @property {Array<{ name: string, pageIndex?: number }>} attachments Files attached anywhere: the EmbeddedFiles name tree, catalog `/AF`, a FileAttachment comment (with its page).
 * @property {{ document: boolean, pages: number[] }} scripts Document scripts (`/Names /JavaScript`, an `/OpenAction` or catalog `/AA` script) and pages carrying `/AA` scripts.
 * @property {number[]} thumbnails Pages carrying a `/Thumb` picture of themselves. Sorted, zero-based.
 * @property {boolean} pieceInfo The catalog carries a `/PieceInfo` (an application's private data).
 * @property {number[]} pageDetails Pages carrying `/Metadata` or `/PieceInfo`, on the page or on an image or form it draws. Sorted, zero-based.
 */

/**
 * Reads every trace kind from a loaded document. Never throws on a malformed
 * entry: a value that will not decode is left null.
 * @param {PDFDocument} doc
 * @returns {DocumentTraces}
 */
export function readDocumentTraces(doc) {
  const ctx = doc.context;
  const info = infoDict(doc);
  const text = (key) => (info ? textOf(resolve(ctx, info.get(N(key)))) : null);
  const date = (key) => parsePdfDate(text(key));
  const standard = new Set([...INFO_KEYS, 'CreationDate', 'ModDate']);
  const otherInfoKeys = info
    ? [...info.keys()].map((k) => k.asString().slice(1)).filter((k) => !standard.has(k))
    : [];

  const attachments = [];
  const names = asDict(ctx, doc.catalog.get(N('Names')));
  if (names) {
    walkNameTree(ctx, names.get(N('EmbeddedFiles')), (pairs, i) => {
      attachments.push({ name: fileName(ctx, pairs.get(i + 1), textOf(pairs.get(i)) ?? 'attachment') });
    });
  }
  const af = resolve(ctx, doc.catalog.get(N('AF')));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) attachments.push({ name: fileName(ctx, af.get(i), 'attachment') });
  }
  for (const a of fileAttachmentAnnots(doc)) attachments.push({ name: a.name, pageIndex: a.pageIndex });
  // One file, one row: pdf-lib's `attach()` lists a file in both the name tree
  // and /AF, and the check counts files, not listings.
  const seenAttachment = new Set();
  const uniqueAttachments = attachments.filter((a) => {
    const key = `${a.pageIndex ?? ''}:${a.name}`;
    if (seenAttachment.has(key)) return false;
    seenAttachment.add(key);
    return true;
  });

  let namedScripts = false;
  if (names) walkNameTree(ctx, names.get(N('JavaScript')), () => { namedScripts = true; });
  const document =
    namedScripts || isJavaScriptAction(ctx, doc.catalog.get(N('OpenAction'))) || doc.catalog.has(N('AA'));

  const pages = doc.getPages();
  return {
    title: text('Title'),
    author: text('Author'),
    subject: text('Subject'),
    keywords: text('Keywords'),
    creator: text('Creator'),
    producer: text('Producer'),
    creationDate: date('CreationDate'),
    modDate: date('ModDate'),
    otherInfoKeys,
    xmp: xmpState(doc),
    attachments: uniqueAttachments,
    scripts: { document, pages: pages.flatMap((p, i) => (p.node.has(N('AA')) ? [i] : [])) },
    pieceInfo: doc.catalog.has(N('PieceInfo')),
    thumbnails: pages.flatMap((p, i) => (p.node.has(N('Thumb')) ? [i] : [])),
    pageDetails: pages.flatMap((p, i) =>
      hasDetail(p.node) || pageXObjects(doc, p.node).some(hasDetail) ? [i] : []),
  };
}

const isDelete = (edit) => edit?.action === 'delete';
const attachmentKey = (pageIndex, name) => `${pageIndex ?? ''}:${name}`;

/** Sets or removes an Info key as an edit says; `alter` needs a string value. */
function editInfoKey(info, key, edit) {
  if (!info || !edit) return;
  if (isDelete(edit)) info.delete(N(key));
  else if (edit.action === 'alter' && typeof edit.value === 'string') info.set(N(key), PDFHexString.fromText(edit.value));
}

/**
 * Applies the person's edits to the document, and always removes every page's
 * `/Thumb`. Everything else is left as it came, the trailer ID included.
 * `alter` is honoured on the text ids only. The caller runs `dropUnreachable`
 * afterwards and saves with `updateMetadata: false`.
 * @param {PDFDocument} doc
 * @param {DetailEdits} edits
 */
export function applyDetailEdits(doc, edits) {
  const ctx = doc.context;
  const all = expandDetailEdits(edits ?? {});
  const info = infoDict(doc);

  for (const page of doc.getPages()) page.node.delete(N('Thumb'));
  dropAppData(doc);

  for (const [id, key] of [['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['keywords', 'Keywords']]) {
    editInfoKey(info, key, all[id]);
  }
  if (info && all.made) {
    editInfoKey(info, 'Creator', all.made);
    info.delete(N('Producer'));
  }
  if (isDelete(all.created)) info?.delete(N('CreationDate'));
  if (isDelete(all.changed)) info?.delete(N('ModDate'));

  const dropped = new Set(
    Object.entries(all).filter(([id, e]) => id.startsWith('attachment:') && isDelete(e)).map(([id]) => id),
  );
  if (dropped.size > 0) removeAttachments(doc, dropped);

  if (isDelete(all.scripts)) {
    const names = asDict(ctx, doc.catalog.get(N('Names')));
    if (names) {
      names.delete(N('JavaScript'));
      if (names.keys().length === 0) doc.catalog.delete(N('Names'));
    }
    if (isJavaScriptAction(ctx, doc.catalog.get(N('OpenAction')))) doc.catalog.delete(N('OpenAction'));
    doc.catalog.delete(N('AA'));
    for (const page of doc.getPages()) page.node.delete(N('AA'));
  }

  if (isDelete(all.hidden)) {
    doc.catalog.delete(N('Metadata'));
    doc.catalog.delete(N('PieceInfo'));
    if (info) {
      const standard = new Set([...INFO_KEYS, 'CreationDate', 'ModDate']);
      for (const key of [...info.keys()]) if (!standard.has(key.asString().slice(1))) info.delete(key);
    }
    for (const page of doc.getPages()) {
      page.node.delete(N('Metadata'));
      page.node.delete(N('PieceInfo'));
      for (const xo of pageXObjects(doc, page.node)) {
        xo.delete(N('Metadata'));
        xo.delete(N('PieceInfo'));
      }
    }
  }
  stripXmpThumbnails(doc);
}

/** Removes every `/PieceInfo` (catalog, pages, page XObjects): an application's private data, which can hold the original artwork. */
function dropAppData(doc) {
  doc.catalog.delete(N('PieceInfo'));
  for (const page of doc.getPages()) {
    page.node.delete(N('PieceInfo'));
    for (const xo of pageXObjects(doc, page.node)) xo.delete(N('PieceInfo'));
  }
}

const THUMBNAIL_TAGS = ['xmp:Thumbnails', 'xap:Thumbnails', 'xmpGImg:image'];

/**
 * Cuts every `<tag>...</tag>` (or `<tag/>`) out of `text` in one linear pass:
 * an open tag with no close tag after it ends the scan, so a packet of
 * thousands of unclosed starts cannot make it slow.
 */
function removeElements(text, tag) {
  const open = `<${tag}`;
  const close = `</${tag}`;
  let out = '';
  let from = 0;
  let at = text.indexOf(open, from);
  while (at !== -1) {
    const after = text[at + open.length];
    if (after !== '>' && after !== '/' && !/\s/.test(after ?? '')) {
      at = text.indexOf(open, at + 1);
      continue;
    }
    const tagEnd = text.indexOf('>', at);
    if (tagEnd === -1) break;
    let end = tagEnd + 1;
    if (text[tagEnd - 1] !== '/') {
      const closeAt = text.indexOf(close, end);
      if (closeAt === -1) break;
      const closeEnd = text.indexOf('>', closeAt);
      if (closeEnd === -1) break;
      end = closeEnd + 1;
    }
    out += text.slice(from, at);
    from = end;
    at = text.indexOf(open, from);
  }
  return from === 0 ? text : out + text.slice(from);
}

/** `text` without its XMP thumbnails (`xmp:Thumbnails`, and `xmpGImg:image` such as in `xmpTPg` page info). */
export function removeXmpThumbnails(text) {
  let result = text;
  for (const tag of THUMBNAIL_TAGS) if (result.includes(`<${tag}`)) result = removeElements(result, tag);
  return result;
}

/** Decodes an XMP packet: UTF-16 by its byte order mark, otherwise UTF-8. Null when it is neither. */
function decodeXmp(bytes) {
  const label = bytes[0] === 0xFE && bytes[1] === 0xFF ? 'utf-16be' : bytes[0] === 0xFF && bytes[1] === 0xFE ? 'utf-16le' : 'utf-8';
  return safe(() => new TextDecoder(label, { fatal: true }).decode(bytes));
}

/**
 * Cuts the `xmp:Thumbnails` element (pictures of the page as it was) out of
 * every XMP packet that is kept, writing a fresh uncompressed stream.
 */
function stripXmpThumbnails(doc) {
  const ctx = doc.context;
  const holders = [doc.catalog];
  for (const page of doc.getPages()) {
    holders.push(page.node);
    for (const xo of pageXObjects(doc, page.node)) holders.push(xo);
  }
  for (const holder of holders) {
    const stream = resolve(ctx, holder.get(N('Metadata')));
    if (!(stream instanceof PDFStream)) continue;
    const bytes = safe(() => (stream.dict.has(N('Filter')) ? decodePDFRawStream(stream).decode() : stream.getContents()));
    const text = bytes && decodeXmp(bytes);
    if (!text || !/Thumbnails|xmpGImg/.test(text)) continue;
    const stripped = removeXmpThumbnails(text);
    if (stripped === text) continue;
    const fresh = ctx.stream(new TextEncoder().encode(stripped), { Type: 'Metadata', Subtype: 'XML' });
    holder.set(N('Metadata'), ctx.register(fresh));
  }
}

/** Removes the files whose detail ids are in `dropped` from the name tree, /AF and page comments. */
function removeAttachments(doc, dropped) {
  const ctx = doc.context;
  const goes = (pageIndex, name) => dropped.has(`attachment:${pageIndex ?? ''}:${name}`);

  const names = asDict(ctx, doc.catalog.get(N('Names')));
  if (names) {
    const tree = names.get(N('EmbeddedFiles'));
    const drops = [];
    walkNameTree(ctx, tree, (pairs, i) => {
      if (goes(undefined, fileName(ctx, pairs.get(i + 1), textOf(pairs.get(i)) ?? 'attachment'))) drops.push([pairs, i]);
    });
    for (const [pairs, i] of drops.reverse()) {
      // Reverse order keeps earlier indexes valid within one array.
      pairs.remove(i + 1);
      pairs.remove(i);
    }
    if (drops.length > 0) {
      let left = false;
      walkNameTree(ctx, tree, () => { left = true; });
      if (!left) names.delete(N('EmbeddedFiles'));
      if (names.keys().length === 0) doc.catalog.delete(N('Names'));
    }
  }
  const af = resolve(ctx, doc.catalog.get(N('AF')));
  if (af instanceof PDFArray) {
    for (let i = af.size() - 1; i >= 0; i--) {
      if (goes(undefined, fileName(ctx, af.get(i), 'attachment'))) af.remove(i);
    }
    if (af.size() === 0) doc.catalog.delete(N('AF'));
  }
  const annotDrops = fileAttachmentAnnots(doc).filter((a) => goes(a.pageIndex, a.name));
  for (const a of annotDrops.reverse()) a.annots.remove(a.index);
}

/**
 * True when an action is JavaScript and every action it chains to (`/Next`, a
 * dict or an array of dicts) is too. Anything else, a GoTo above all, can
 * reference a page, and a page of the source must never come along.
 */
function isJavaScriptOnly(ctx, o, seen = new Set()) {
  const d = asDict(ctx, o);
  if (!d || seen.has(d) || d.get(N('S')) !== N('JavaScript')) return false;
  seen.add(d);
  const next = resolve(ctx, d.get(N('Next')));
  if (next === undefined) return true;
  if (next instanceof PDFArray) {
    for (let i = 0; i < next.size(); i++) if (!isJavaScriptOnly(ctx, next.get(i), seen)) return false;
    return true;
  }
  return isJavaScriptOnly(ctx, next, seen);
}

/**
 * True when `value`, followed through every reference of the source, reaches a
 * page: a `/Type /Page` or `/Pages` dict, an annotation, the catalog, or a
 * page's content stream. Copying such a value would drag the original page,
 * marks and all, into a new document.
 * @param {import('@cantoo/pdf-lib').PDFContext} ctx
 * @param {*} value
 */
export function reachesPage(ctx, value) {
  return makePageReach(ctx)(value);
}

/**
 * The same check as `reachesPage`, with the source's page contents and root
 * worked out once: build it once per document and call it per value.
 * @param {import('@cantoo/pdf-lib').PDFContext} ctx
 * @returns {(value: *) => boolean}
 */
export function makePageReach(ctx) {
  const root = ctx.trailerInfo.Root && ctx.lookup(ctx.trailerInfo.Root);
  const contents = new Set();
  for (const [, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFDict) || o.get(N('Type')) !== N('Page')) continue;
    const c = o.get(N('Contents'));
    const list = resolve(ctx, c) instanceof PDFArray ? resolve(ctx, c) : null;
    for (const item of list ? Array.from({ length: list.size() }, (_, i) => list.get(i)) : [c]) {
      const target = resolve(ctx, item);
      if (target) contents.add(target);
    }
  }
  return (value) => {
    const seen = new Set();
    const stack = [value];
    while (stack.length) {
      const target = resolve(ctx, stack.pop());
      if (target === undefined || seen.has(target)) continue;
      seen.add(target);
      if (contents.has(target) || (root && target === root)) return true;
      if (target instanceof PDFArray) {
        for (let i = 0; i < target.size(); i++) stack.push(target.get(i));
        continue;
      }
      const dict = target instanceof PDFStream ? target.dict : target instanceof PDFDict ? target : null;
      if (!dict) continue;
      const type = dict.get(N('Type'));
      if (type === N('Page') || type === N('Pages') || type === N('Annot')) return true;
      if (dict.has(N('Subtype')) && dict.has(N('P'))) return true;
      for (const [, entry] of dict.entries()) stack.push(entry);
    }
    return false;
  };
}

/**
 * For an export that builds a new document (the flattened path): copies every
 * Info key, the catalog XMP, document scripts and every
 * document-level attachment from `sourceDoc` into `targetDoc` (never `/PieceInfo`; a value that reaches a page is skipped). Only
 * JavaScript-only actions are copied (`/OpenAction`, entries of catalog `/AA`,
 * `/Names /JavaScript`): any other action can point at a page of the source,
 * and copying it would drag the unredacted page along. Page-level items stay
 * behind (a flattened page is a picture), except a file attached in a comment
 * on a flattened page: the person kept it, so it moves to the document level.
 * @param {PDFDocument} sourceDoc
 * @param {PDFDocument} targetDoc
 * @param {{ flattened?: Iterable<number>, edits?: DetailEdits }} [options]
 *   `flattened`: source page indexes that were rebuilt as pictures. `edits`:
 *   the person's edits, so a comment attachment they deleted is not carried over.
 */
export function copyDocumentDetails(sourceDoc, targetDoc, options = {}) {
  const ctx = sourceDoc.context;
  const copier = PDFObjectCopier.for(ctx, targetDoc.context);

  const tctx = targetDoc.context;
  // Everything copied passes here: a value that reaches a page is skipped
  // whole, and a stream is registered so it is set as a reference.
  const reaches = makePageReach(ctx);
  const safeToCopy = (value) => resolve(ctx, value) !== undefined && !reaches(value);
  const copyValue = (value) => {
    const copied = copier.copy(resolve(ctx, value));
    return copied instanceof PDFStream ? tctx.register(copied) : copied;
  };

  const info = infoDict(sourceDoc);
  if (info) {
    const targetInfo = targetDoc.getInfoDict();
    for (const [key, value] of info.entries()) if (safeToCopy(value)) targetInfo.set(key, copyValue(value));
  }
  // /PieceInfo is never copied: it can hold the app's copy of the original artwork.
  const metadata = sourceDoc.catalog.get(N('Metadata'));
  if (safeToCopy(metadata)) targetDoc.catalog.set(N('Metadata'), copyValue(metadata));
  const open = sourceDoc.catalog.get(N('OpenAction'));
  if (open !== undefined && isJavaScriptOnly(ctx, open) && safeToCopy(open)) {
    targetDoc.catalog.set(N('OpenAction'), copyValue(open));
  }
  const sourceAA = asDict(ctx, sourceDoc.catalog.get(N('AA')));
  if (sourceAA) {
    const kept = targetDoc.context.obj({});
    for (const [key, value] of sourceAA.entries()) {
      if (isJavaScriptOnly(ctx, value) && safeToCopy(value)) kept.set(key, copyValue(value));
    }
    if (kept.keys().length > 0) targetDoc.catalog.set(N('AA'), kept);
  }

  const sourceNames = asDict(ctx, sourceDoc.catalog.get(N('Names')));
  const targetNames = () => {
    const existing = asDict(tctx, targetDoc.catalog.get(N('Names')));
    if (existing) return existing;
    const created = tctx.obj({});
    targetDoc.catalog.set(N('Names'), created);
    return created;
  };
  const scripts = [];
  if (sourceNames) {
    walkNameTree(ctx, sourceNames.get(N('JavaScript')), (pairs, i) => {
      const action = pairs.get(i + 1);
      if (isJavaScriptOnly(ctx, action) && safeToCopy(action)) {
        scripts.push(PDFString.of(textOf(pairs.get(i)) ?? 'script'), copyValue(action));
      }
    });
  }
  if (scripts.length > 0) targetNames().set(N('JavaScript'), tctx.obj({ Names: scripts }));

  // File specifications are copied as they are, bytes included. pdf-lib's own
  // `attach()` embeds lazily at save, after the edits would have run.
  // A spec that is missing, not a dict, or reaches a page is skipped (null).
  const copySpec = (spec) => {
    if (!asDict(ctx, spec) || reaches(spec)) return null;
    const copied = copier.copy(spec);
    return copied instanceof PDFRef ? copied : tctx.register(copied);
  };
  const entries = [];
  const specs = [];
  if (sourceNames) {
    walkNameTree(ctx, sourceNames.get(N('EmbeddedFiles')), (pairs, i) => {
      const spec = copySpec(pairs.get(i + 1));
      if (spec) entries.push(PDFString.of(textOf(pairs.get(i)) ?? 'attachment'), spec);
    });
  }
  const af = resolve(ctx, sourceDoc.catalog.get(N('AF')));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) {
      const spec = copySpec(af.get(i));
      if (spec) specs.push(spec);
    }
  }
  const flattened = new Set(options.flattened ?? []);
  if (flattened.size > 0) {
    for (const a of fileAttachmentAnnots(sourceDoc)) {
      if (!flattened.has(a.pageIndex) || isDelete(options.edits?.[`attachment:${a.pageIndex}:${a.name}`])) continue;
      const annot = asDict(ctx, a.annots.get(a.index));
      const spec = copySpec(annot.get(N('FS')));
      if (!spec) continue;
      entries.push(PDFString.of(a.name), spec);
      specs.push(spec);
    }
  }
  if (entries.length > 0) targetNames().set(N('EmbeddedFiles'), tctx.obj({ Names: entries }));
  if (specs.length > 0) targetDoc.catalog.set(N('AF'), tctx.obj(specs));
}
