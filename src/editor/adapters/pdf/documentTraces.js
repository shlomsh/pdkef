/**
 * RED-59: what a PDF says about itself and holds hidden, read as one list of
 * trace kinds and edited by detail id (kept as it came, altered or deleted by
 * the person). Pure pdf-lib; no UI, no words. The words live in Redact's
 * `details/describeDetails.ts`.
 *
 * An export keeps every detail unless the person edits it; the one thing that
 * always goes is `/Thumb`, a cached picture of the page from before the marks.
 */
import {
  PDFArray, PDFDict, PDFHexString, PDFName, PDFObjectCopier, PDFRef, PDFStream, PDFString, decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { parsePdfDate } from './pdfDate.js';

/** @typedef {import('@cantoo/pdf-lib').PDFDocument} PDFDocument */

const N = PDFName.of;
const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'];
const MAX_FORM_DEPTH = 8;

/** Detail ids that accept delete or alter. */
export const TEXT_DETAIL_IDS = ['title', 'author', 'subject', 'keywords', 'made'];
/** Detail ids that accept delete only, like attachments, 'scripts' and 'hidden'. */
export const DATE_DETAIL_IDS = ['created', 'changed'];
/** The detail id of an attached file: `attachment:<pageIndex or empty>:<name>`. */
export const attachmentDetailId = (file) => `attachment:${file.pageIndex ?? ''}:${file.name}`;

/** @typedef {{ action: 'delete' } | { action: 'alter', value: string }} DetailEdit */
/** @typedef {Record<string, DetailEdit>} DetailEdits Keyed by detail id. */

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

/**
 * Adds `hidden: delete` when a text or date detail is edited, because the XMP
 * packet is a second copy of the same details and would keep the old value.
 * Pure; returns the input unchanged when nothing needs adding.
 * @param {DetailEdits} edits
 * @returns {DetailEdits}
 */
export function expandDetailEdits(edits) {
  const touched = [...TEXT_DETAIL_IDS, ...DATE_DETAIL_IDS].some((id) => edits[id]);
  return touched && !edits.hidden ? { ...edits, hidden: { action: 'delete' } } : edits;
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
 * For an export that builds a new document (the flattened path): copies every
 * Info key, the catalog XMP and `/PieceInfo`, document scripts (`/Names
 * /JavaScript`, `/OpenAction`, catalog `/AA`) and every document-level
 * attachment from `sourceDoc` into `targetDoc`. Page-level items stay behind:
 * a flattened page is a picture and those belong to the old page.
 * @param {PDFDocument} sourceDoc
 * @param {PDFDocument} targetDoc
 */
export function copyDocumentDetails(sourceDoc, targetDoc) {
  const ctx = sourceDoc.context;
  const copier = PDFObjectCopier.for(ctx, targetDoc.context);

  const info = infoDict(sourceDoc);
  if (info) {
    const targetInfo = targetDoc.getInfoDict();
    for (const [key, value] of info.entries()) targetInfo.set(key, copier.copy(resolve(ctx, value)));
  }
  for (const key of ['Metadata', 'PieceInfo', 'OpenAction', 'AA']) {
    const value = sourceDoc.catalog.get(N(key));
    if (value !== undefined) targetDoc.catalog.set(N(key), copier.copy(resolve(ctx, value)));
  }
  const sourceNames = asDict(ctx, sourceDoc.catalog.get(N('Names')));
  const js = sourceNames?.get(N('JavaScript'));
  if (js !== undefined) {
    const targetNames = asDict(targetDoc.context, targetDoc.catalog.get(N('Names')))
      ?? targetDoc.context.obj({});
    targetNames.set(N('JavaScript'), copier.copy(resolve(ctx, js)));
    targetDoc.catalog.set(N('Names'), targetNames);
  }

  // File specifications are copied as they are, bytes included. pdf-lib's own
  // `attach()` embeds lazily at save, after the edits would have run.
  const tctx = targetDoc.context;
  const copySpec = (spec) => {
    const copied = copier.copy(spec);
    return copied instanceof PDFRef ? copied : tctx.register(copied);
  };
  const entries = [];
  if (sourceNames) {
    walkNameTree(ctx, sourceNames.get(N('EmbeddedFiles')), (pairs, i) => {
      entries.push(PDFString.of(textOf(pairs.get(i)) ?? 'attachment'), copySpec(pairs.get(i + 1)));
    });
  }
  if (entries.length > 0) {
    const targetNames = asDict(tctx, targetDoc.catalog.get(N('Names'))) ?? tctx.obj({});
    targetNames.set(N('EmbeddedFiles'), tctx.obj({ Names: entries }));
    targetDoc.catalog.set(N('Names'), targetNames);
  }
  const af = resolve(ctx, sourceDoc.catalog.get(N('AF')));
  if (af instanceof PDFArray && af.size() > 0) {
    const copies = [];
    for (let i = 0; i < af.size(); i++) copies.push(copySpec(af.get(i)));
    targetDoc.catalog.set(N('AF'), tctx.obj(copies));
  }
}
