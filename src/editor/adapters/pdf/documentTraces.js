/**
 * RED-59: what a PDF says about itself and holds hidden, read and stripped as
 * one list of trace kinds, so reading and stripping can never disagree. Pure
 * pdf-lib; no UI, no words. The words live in Redact's `check/describeTraces.ts`.
 *
 * Measured 2026-10-08 (backlog/tasks/RED-59.md, step 1 and the gate): a Delete
 * export kept attachments, scripts, page-level and object-level details and the
 * file ID; a flattened export stamped pdf-lib's name and the export time and
 * kept page-level details on untouched pages. Every export now runs
 * `stripDocumentTraces` right before its save.
 */
import {
  PDFArray, PDFDict, PDFHexString, PDFName, PDFRef, PDFStream, PDFString, decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { parsePdfDate } from './pdfDate.js';

/** @typedef {import('@cantoo/pdf-lib').PDFDocument} PDFDocument */

const N = PDFName.of;
const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'];
const MAX_FORM_DEPTH = 8;

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
    attachments,
    scripts: { document, pages: pages.flatMap((p, i) => (p.node.has(N('AA')) ? [i] : [])) },
    thumbnails: pages.flatMap((p, i) => (p.node.has(N('Thumb')) ? [i] : [])),
    pageDetails: pages.flatMap((p, i) =>
      hasDetail(p.node) || pageXObjects(doc, p.node).some(hasDetail) ? [i] : []),
  };
}

/**
 * Removes every trace kind from the document and gives it a fresh random file
 * ID, leaving nothing of the original's details, attachments, scripts,
 * thumbnails or page-level details. Field-level scripts are left alone. The
 * caller runs `dropUnreachable` afterwards and saves with `updateMetadata: false`.
 * @param {PDFDocument} doc
 * @param {{ keepAttachments?: readonly string[], randomBytes?: (n: number) => Uint8Array }} [options]
 *   `keepAttachments` names attached files the person chose to keep (RED-59, by
 *   name); `randomBytes` is for tests, default `crypto.getRandomValues`.
 */
export function stripDocumentTraces(doc, options = {}) {
  const ctx = doc.context;
  const keep = new Set(options.keepAttachments ?? []);
  const randomBytes = options.randomBytes ?? ((n) => crypto.getRandomValues(new Uint8Array(n)));

  const info = infoDict(doc);
  if (info) for (const key of [...info.keys()]) info.delete(key);
  doc.catalog.delete(N('Metadata'));

  // Attachments: drop each entry not kept, from the name tree, /AF and comments.
  const names = asDict(ctx, doc.catalog.get(N('Names')));
  if (names) {
    const tree = names.get(N('EmbeddedFiles'));
    const drops = [];
    walkNameTree(ctx, tree, (pairs, i) => {
      if (!keep.has(fileName(ctx, pairs.get(i + 1), textOf(pairs.get(i)) ?? 'attachment'))) drops.push([pairs, i]);
    });
    for (const [pairs, i] of drops.reverse()) {
      // Reverse order keeps earlier indexes valid within one array.
      pairs.remove(i + 1);
      pairs.remove(i);
    }
    let left = false;
    walkNameTree(ctx, tree, () => { left = true; });
    if (!left) names.delete(N('EmbeddedFiles'));
    names.delete(N('JavaScript'));
    if (names.keys().length === 0) doc.catalog.delete(N('Names'));
  }
  const af = resolve(ctx, doc.catalog.get(N('AF')));
  if (af instanceof PDFArray) {
    for (let i = af.size() - 1; i >= 0; i--) {
      if (!keep.has(fileName(ctx, af.get(i), 'attachment'))) af.remove(i);
    }
    if (af.size() === 0) doc.catalog.delete(N('AF'));
  } else {
    doc.catalog.delete(N('AF'));
  }
  const annotDrops = fileAttachmentAnnots(doc).filter((a) => !keep.has(a.name));
  for (const a of annotDrops.reverse()) a.annots.remove(a.index);

  // Scripts.
  doc.catalog.delete(N('AA'));
  if (isJavaScriptAction(ctx, doc.catalog.get(N('OpenAction')))) doc.catalog.delete(N('OpenAction'));

  for (const page of doc.getPages()) {
    for (const key of ['AA', 'Thumb', 'Metadata', 'PieceInfo']) page.node.delete(N(key));
    for (const xo of pageXObjects(doc, page.node)) {
      xo.delete(N('Metadata'));
      xo.delete(N('PieceInfo'));
    }
  }

  const id = () => PDFHexString.of(
    [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(),
  );
  ctx.trailerInfo.ID = ctx.obj([id(), id()]);
}

/**
 * Copies the named attached files from `sourceDoc` (its EmbeddedFiles name tree
 * and catalog `/AF`) into `targetDoc`, bytes, name, type, description and dates,
 * for an export that builds a new document instead of editing the source. A name
 * found twice is copied once; a name not found is skipped.
 * @param {PDFDocument} sourceDoc
 * @param {PDFDocument} targetDoc
 * @param {readonly string[] | undefined} names
 */
export function copyKeptAttachments(sourceDoc, targetDoc, names) {
  const keep = new Set(names ?? []);
  if (keep.size === 0) return;
  const ctx = sourceDoc.context;
  const specs = [];
  const sourceNames = asDict(ctx, sourceDoc.catalog.get(N('Names')));
  if (sourceNames) {
    walkNameTree(ctx, sourceNames.get(N('EmbeddedFiles')), (pairs, i) => {
      specs.push([fileName(ctx, pairs.get(i + 1), textOf(pairs.get(i)) ?? 'attachment'), pairs.get(i + 1)]);
    });
  }
  const af = resolve(ctx, sourceDoc.catalog.get(N('AF')));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) specs.push([fileName(ctx, af.get(i), 'attachment'), af.get(i)]);
  }
  const done = new Set();
  for (const [name, spec] of specs) {
    if (!keep.has(name) || done.has(name)) continue;
    const ef = asDict(ctx, asDict(ctx, spec)?.get(N('EF')));
    const stream = ef && (resolve(ctx, ef.get(N('UF'))) ?? resolve(ctx, ef.get(N('F'))));
    if (!(stream instanceof PDFStream)) continue;
    const bytes = safe(() => (stream.dict.has(N('Filter')) ? decodePDFRawStream(stream).decode() : stream.getContents()));
    if (!bytes) continue;
    done.add(name);
    const params = asDict(ctx, stream.dict.get(N('Params')));
    const date = (key) => {
      const t = params && textOf(resolve(ctx, params.get(N(key))));
      const m = t && /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(t);
      return m ? new Date(Date.UTC(+m[1], (+m[2] || 1) - 1, +m[3] || 1, +m[4] || 0, +m[5] || 0, +m[6] || 0)) : undefined;
    };
    const subtype = stream.dict.get(N('Subtype'));
    const description = asDict(ctx, spec)?.get(N('Desc'));
    targetDoc.attach(bytes, name, {
      mimeType: subtype instanceof PDFName ? subtype.decodeText().replace(/#2F/gi, '/') : undefined,
      description: textOf(description) ?? undefined,
      creationDate: date('CreationDate'),
      modificationDate: date('ModDate'),
    });
  }
}

/** True when nothing in `traces` is set: no detail, nothing attached or hidden. */
export function hasNoTraces(traces) {
  return (
    INFO_KEYS.every((k) => traces[k.toLowerCase()] === null) &&
    traces.creationDate === null &&
    traces.modDate === null &&
    traces.otherInfoKeys.length === 0 &&
    !traces.xmp.present &&
    traces.attachments.length === 0 &&
    !traces.scripts.document &&
    traces.scripts.pages.length === 0 &&
    traces.thumbnails.length === 0 &&
    traces.pageDetails.length === 0
  );
}
