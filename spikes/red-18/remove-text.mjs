// @ts-nocheck
// RED-18 spike: true redaction of TEXT ONLY. For every file and box in
// spikes/red-01/corpus/corpus.json, removes exactly the glyphs a box's core
// touches (RED-12's glyphCore/touches rule, glyph level not word level,
// invisible text included) and keeps every surviving glyph's original bytes
// and place, rewriting only the raw show ops that had a removed glyph.
//
// Positions come from the same replay as src/editor/adapters/pdf/pageGlyphs.ts
// (see spikes/red-12/run.mts for the Node/tsx pattern this follows), extended
// to keep every item (not just visible, non-vertical, unicode-bearing ones)
// tagged with its showText op index and position within that op, since this
// tool has to splice individual raw ops rather than place a text layer.
// Alignment (which op is which, and which raw op a pdf.js showText call is)
// reuses spikes/red-18/align.mjs's rawShowOps/pdfjsShowOps/align exactly, as
// the gate: a page that doesn't align by that check is not edited.
//
// Run from the repo root (imports two .ts modules, so via tsx):
//   npx tsx spikes/red-18/remove-text.mjs
// Writes spikes/red-18/out/text/<name>.pdf (gitignored) and
// spikes/red-18/results-text.md.
//
// Not part of the app; measures, does not touch src/.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRawStream, PDFRef, decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { rawShowOps, pdfjsShowOps, align, Tokenizer, decodeStreamBytes, pageContentBytes } from './align.mjs';
import {
  pageGeometryFromPdfJsPage,
  composeAffineTransforms,
  applyAffineTransform,
} from '../../src/editor/geometry/coords.ts';

const ROOT = process.cwd();
const CORPUS_DIR = path.join(ROOT, 'spikes/red-01/corpus');
const OUT_DIR = path.join(ROOT, 'spikes/red-18/out/text');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// glyphCore/touches, duplicated from src/editor/adapters/pdf/textLayer.ts
// (file-private there, not exported - same constants, same math). "Text" per
// RED-18's Approach bullet only; images/shapes/annotations are out of scope.
// ---------------------------------------------------------------------------
const CORE_BOTTOM_EM = -0.15;
const CORE_TOP_EM = 0.7;
const SIDE_INSET_EM = 0.15;
const SIDE_INSET_SHARE = 0.3;

function glyphCore(pdfToViewport, matrix, widthEm) {
  const toViewport = composeAffineTransforms(pdfToViewport, matrix);
  const w = Math.max(widthEm, 0);
  const inset = Math.min(SIDE_INSET_EM, SIDE_INSET_SHARE * w);
  const corners = [
    { x: inset, y: CORE_BOTTOM_EM },
    { x: w - inset, y: CORE_BOTTOM_EM },
    { x: inset, y: CORE_TOP_EM },
    { x: w - inset, y: CORE_TOP_EM },
  ].map((p) => applyAffineTransform(p, toViewport));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function touches(a, b) {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}
function percentToViewport(geometry, box) {
  const x0 = (box.left / 100) * geometry.width;
  const y0 = (box.top / 100) * geometry.height;
  return { x0, y0, x1: x0 + (box.width / 100) * geometry.width, y1: y0 + (box.height / 100) * geometry.height };
}

// ---------------------------------------------------------------------------
// The glyph replay: same state machine as pageGlyphs.ts's readPageGlyphs,
// but (a) keeps every item - invisible (render mode 3), vertical, and
// unicode-less glyphs included, since RED-18 needs every raw code accounted
// for to splice byte-exact - and (b) groups items per showText op (in
// operator-list order, one entry per pdf.js OPS.showText call) instead of
// flattening to one glyph list, since a splice target is one raw op.
// ---------------------------------------------------------------------------
const IDENTITY = [1, 0, 0, 1, 0, 0];
const DEFAULT_FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0];

function initialState() {
  return {
    ctm: IDENTITY, textMatrix: IDENTITY, x: 0, y: 0, lineX: 0, lineY: 0,
    charSpacing: 0, wordSpacing: 0, hScale: 1, leading: 0, rise: 0,
    fontSize: 0, fontDirection: 1, font: null, renderingMode: 0,
  };
}

function replayShowTextTimelines(operatorList, ops, fontInfo) {
  const timelines = [];
  const stack = [];
  let s = initialState();
  let showTextIndex = 0;

  const setFont = (name, size) => {
    s.font = fontInfo(name) ?? null;
    s.fontDirection = size < 0 ? -1 : 1;
    s.fontSize = Math.abs(size);
  };
  const moveText = (x, y) => {
    s.lineX += x; s.lineY += y; s.x = s.lineX; s.y = s.lineY;
  };

  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] ?? [];
    switch (fn) {
      case ops.save: stack.push({ ...s }); break;
      case ops.restore: s = stack.pop() ?? s; break;
      case ops.transform: s.ctm = composeAffineTransforms(s.ctm, args); break;
      case ops.paintFormXObjectBegin:
        stack.push({ ...s });
        if (Array.isArray(args[0]) && args[0].length === 6) s.ctm = composeAffineTransforms(s.ctm, args[0]);
        break;
      case ops.paintFormXObjectEnd: s = stack.pop() ?? s; break;
      case ops.beginText: s.textMatrix = IDENTITY; s.x = s.lineX = 0; s.y = s.lineY = 0; break;
      case ops.setCharSpacing: s.charSpacing = args[0]; break;
      case ops.setWordSpacing: s.wordSpacing = args[0]; break;
      case ops.setHScale: s.hScale = args[0] / 100; break;
      case ops.setLeading: s.leading = -args[0]; break;
      case ops.setLeadingMoveText: s.leading = args[1]; moveText(args[0], args[1]); break;
      case ops.setFont: setFont(args[0], args[1]); break;
      case ops.setGState:
        for (const [key, value] of args[0] ?? []) {
          if (key === 'Font' && Array.isArray(value)) setFont(value[0], value[1]);
        }
        break;
      case ops.setTextRenderingMode: s.renderingMode = args[0]; break;
      case ops.setTextRise: s.rise = args[0]; break;
      case ops.moveText: moveText(args[0], args[1]); break;
      case ops.setTextMatrix: s.textMatrix = args[0]; s.x = s.lineX = 0; s.y = s.lineY = 0; break;
      case ops.nextLine: moveText(0, s.leading); break;
      case ops.showText: {
        const items = args[0] ?? [];
        const font = s.font;
        const fontMatrix = font?.fontMatrix ?? DEFAULT_FONT_MATRIX;
        const scale = s.fontSize * fontMatrix[0];
        const hScale = s.hScale * s.fontDirection;
        const base = composeAffineTransforms(s.ctm, s.textMatrix);
        const timeline = {
          opIndex: showTextIndex, items: [], fontSize: s.fontSize, scale,
          charSpacing: s.charSpacing, wordSpacing: s.wordSpacing, hScale: s.hScale,
          fontDirection: s.fontDirection, renderingMode: s.renderingMode,
          vertical: Boolean(font?.vertical),
        };
        showTextIndex += 1;
        let x = 0;
        for (const item of items) {
          if (typeof item === 'number') {
            timeline.items.push({ type: 'num', value: item });
            x -= (item * s.fontSize) / 1000;
            continue;
          }
          const width = item.width ?? 0;
          const origin = s.x + x * hScale;
          const matrix = composeAffineTransforms(base, [s.fontSize * hScale, 0, 0, s.fontSize, origin, s.y + s.rise]);
          timeline.items.push({
            type: 'glyph',
            code: item.originalCharCode,
            unicode: typeof item.unicode === 'string' ? item.unicode : '',
            isSpace: Boolean(item.isSpace),
            w0: width,
            widthEm: width * fontMatrix[0],
            matrix,
            invisible: (s.renderingMode & 3) === 3,
          });
          const spacing = (item.isSpace ? s.wordSpacing : 0) + s.charSpacing;
          x += width * scale + spacing * s.fontDirection;
        }
        s.x += x * hScale;
        timelines.push(timeline);
        break;
      }
      default: break;
    }
  }
  return timelines;
}

function glyphDx(timeline, item) {
  const spacing = (item.isSpace ? timeline.wordSpacing : 0) + timeline.charSpacing;
  return item.w0 * timeline.scale + spacing * timeline.fontDirection;
}

// ---------------------------------------------------------------------------
// Per-op rewrite: walk a showText op's timeline in original order and split
// it into KEEP pieces (hex strings of the surviving codes' original bytes,
// unchanged order) and pen-move numbers that replace each removed stretch -
// including any original TJ kerning number that sits against a removed
// glyph, which is absorbed into that stretch's own pen move instead of
// being dropped or misattributed to a surviving neighbour.
// ---------------------------------------------------------------------------
function buildOutputPieces(timeline) {
  const out = [];
  let curCodes = [];
  let removedAccum = 0;
  let floatingDx = 0;
  let lastWasCode = false;
  let lastCodeRemoved = false;

  const numFor = (dx) => (timeline.fontSize ? (-1000 * dx) / timeline.fontSize : 0);
  const flushKeep = () => {
    if (curCodes.length) { out.push({ type: 'str', codes: curCodes }); curCodes = []; }
  };
  const flushRemoved = () => {
    const n = numFor(removedAccum);
    if (Math.abs(n) > 1e-6) out.push({ type: 'num', value: n });
    removedAccum = 0;
  };

  for (const item of timeline.items) {
    if (item.type === 'num') {
      floatingDx += -(item.value * timeline.fontSize) / 1000;
      continue;
    }
    if (item.remove) {
      flushKeep();
      removedAccum += floatingDx; floatingDx = 0;
      removedAccum += glyphDx(timeline, item);
    } else {
      if (lastWasCode && lastCodeRemoved) {
        removedAccum += floatingDx; floatingDx = 0;
        flushRemoved();
      } else if (floatingDx !== 0) {
        flushKeep();
        out.push({ type: 'num', value: numFor(floatingDx) });
        floatingDx = 0;
      }
      curCodes.push(item.code);
    }
    lastWasCode = true;
    lastCodeRemoved = item.remove;
  }
  if (lastCodeRemoved) {
    removedAccum += floatingDx; floatingDx = 0;
  } else if (floatingDx !== 0) {
    flushKeep();
    out.push({ type: 'num', value: numFor(floatingDx) });
    floatingDx = 0;
  }
  flushKeep();
  return { pieces: out, trailingRemovedAdvance: removedAccum };
}

/** Whether the pen's horizontal position when this op ends still matters:
 * scans forward (in the same source's full op list) for the nearest of a
 * bare show op (needs it) or a reposition/line-break/ET (doesn't, since
 * those overwrite or end the pen position this op would have moved). */
function needsPenMoveAfter(allOps, afterEnd) {
  const startIdx = allOps.findIndex((o) => o.start >= afterEnd);
  if (startIdx < 0) return false;
  for (let i = startIdx; i < allOps.length; i += 1) {
    const op = allOps[i].op;
    if (op === 'Tj' || op === 'TJ') return true;
    if (op === "'" || op === '"' || op === 'Td' || op === 'TD' || op === 'Tm' || op === 'T*' || op === 'ET') return false;
  }
  return false;
}

const numStr = (n) => {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
};
const hexOf = (codes, bytesPerCode) => `<${codes.map((c) => (c >>> 0).toString(16).toUpperCase().padStart(bytesPerCode * 2, '0')).join('')}>`;

function serializeTJ(pieces, trailingAdvance, needsPenMove, bytesPerCode) {
  const all = pieces.slice();
  if (needsPenMove && Math.abs(trailingAdvance) > 1e-6) {
    const n = trailingAdvance; // already a TJ-number-space value from buildOutputPieces's caller
    all.push({ type: 'num', value: n });
  }
  if (all.length === 0) return '';
  const body = all.map((p) => (p.type === 'str' ? hexOf(p.codes, bytesPerCode) : numStr(p.value))).join(' ');
  return `[${body}] TJ`;
}

// ---------------------------------------------------------------------------
// Byte-range splice: copy every byte outside a touched op's [start,end)
// verbatim; only touched ops get new bytes.
// ---------------------------------------------------------------------------
function spliceSource(bytes, replacements) {
  const sorted = [...replacements].sort((a, b) => a.start - b.start);
  const encoder = new TextEncoder();
  const chunks = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.start > cursor) chunks.push(bytes.subarray(cursor, r.start));
    if (r.text) chunks.push(encoder.encode(r.text));
    cursor = r.end;
  }
  if (cursor < bytes.length) chunks.push(bytes.subarray(cursor, bytes.length));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ---------------------------------------------------------------------------
// pdf-lib side: applying the splice to a page's Contents, or to a Form
// XObject (copied first if used by another page, edited in place otherwise).
// ---------------------------------------------------------------------------
function dictLiteralExcept(dict, exclude) {
  const lit = {};
  for (const [key, value] of dict.entries()) {
    const k = key.decodeText();
    if (exclude.includes(k)) continue;
    lit[k] = value;
  }
  return lit;
}

function applyFormEdit(pdfDoc, pageNode, entry, edits) {
  const context = pdfDoc.context;
  const newBytes = spliceSource(entry.bytes, edits);
  const preserved = dictLiteralExcept(entry.dict, ['Length', 'Filter', 'DecodeParms']);
  const newStream = context.flateStream(newBytes, preserved);

  const allPages = pdfDoc.getPages();
  let usageCount = 0;
  for (const p of allPages) {
    const resources = p.node.Resources();
    const xobjDict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjDict) continue;
    const used = xobjDict.keys().some((name) => {
      try { return xobjDict.lookupMaybe(name, PDFStream) === entry.xobj; } catch { return false; }
    });
    if (used) usageCount += 1;
  }

  if (usageCount <= 1) {
    const ref = context.getObjectRef(entry.xobj);
    if (!ref) throw new Error('form xobject has no indirect ref; cannot edit in place');
    context.assign(ref, newStream);
    return { copied: false };
  }

  const newRef = context.register(newStream);
  const resources = pageNode.Resources();
  const clonedResources = resources.clone(context);
  const xobjDict = clonedResources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  const clonedXObjDict = xobjDict.clone(context);
  clonedResources.set(PDFName.of('XObject'), clonedXObjDict);
  for (const name of clonedXObjDict.keys()) {
    let matches = false;
    try { matches = xobjDict.lookupMaybe(name, PDFStream) === entry.xobj; } catch { matches = false; }
    if (matches) clonedXObjDict.set(name, newRef);
  }
  pageNode.set(PDFName.of('Resources'), clonedResources);
  return { copied: true };
}

/** Every indirect ref the page's own (raw, unresolved) /Contents value pins:
 * the value itself if it's a ref (a single stream OR - found on
 * real-world-uscis-i9-2025.pdf - an indirect ARRAY *object* of per-chunk
 * stream refs, one array ref pointing to 8 separate streams), plus that
 * array's own element refs once resolved. Missing the indirect-array case
 * left all 8 chunks (and the array object itself) as orphaned garbage in
 * the first pass: `contentsRaw instanceof PDFRef` was true for the array's
 * OWN ref, so it alone got queued for deletion while the 8 streams it
 * pointed to kept sitting in the context, unreferenced by anything. */
function collectContentRefs(context, contentsRaw) {
  const refs = [];
  const fromArray = (arr) => {
    for (let i = 0; i < arr.size(); i += 1) {
      const el = arr.get(i);
      if (el instanceof PDFRef) refs.push(el);
    }
  };
  if (contentsRaw instanceof PDFRef) {
    refs.push(contentsRaw);
    const resolved = context.lookup(contentsRaw);
    if (resolved instanceof PDFArray) fromArray(resolved);
  } else if (contentsRaw instanceof PDFArray) {
    fromArray(contentsRaw);
  }
  return refs;
}

function applyPageEdit(pdfDoc, pageNode, pageBytes, edits) {
  const context = pdfDoc.context;
  const newBytes = spliceSource(pageBytes, edits);
  const contentsRaw = pageNode.get(PDFName.of('Contents'));
  const oldRefs = collectContentRefs(context, contentsRaw);
  const newRef = context.register(context.flateStream(newBytes));
  pageNode.set(PDFName.of('Contents'), context.obj([newRef]));
  for (const ref of oldRefs) context.delete(ref);
}

// ---------------------------------------------------------------------------
// One page: align, replay, mark removed glyphs, build per-source edits.
// Returns { fallback: reason } or { edited: bool, removedRuns, survivorCount }.
// ---------------------------------------------------------------------------
async function processPage(pdfDoc, bytes, pageNo, boxes) {
  const pageNode = pdfDoc.getPages()[pageNo - 1].node;
  const raw = rawShowOps(pageNode);
  let pdfjsOps;
  try {
    pdfjsOps = await pdfjsShowOps(bytes, pageNo);
  } catch (e) {
    return { fallback: `pdf.js failed: ${e.message}` };
  }
  const alignment = align(raw.ops, pdfjsOps);
  if (!alignment.aligned) return { fallback: `not aligned: ${JSON.stringify(alignment.firstMismatch)}` };

  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const opList = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const timelines = replayShowTextTimelines(opList, pdfjs.OPS, (name) => page.commonObjs.get(name));

  if (timelines.length !== raw.ops.length) return { fallback: `internal: ${timelines.length} timelines vs ${raw.ops.length} raw ops` };
  for (let k = 0; k < timelines.length; k += 1) {
    const tCodes = timelines[k].items.filter((i) => i.type === 'glyph').map((i) => i.code);
    const rCodes = raw.ops[k].codes ?? [];
    if (tCodes.length !== rCodes.length || tCodes.some((c, i) => c !== rCodes[i])) {
      return { fallback: `internal: replay/raw code mismatch at op ${k}` };
    }
  }

  const geometry = pageGeometryFromPdfJsPage(page);
  const covers = boxes.map((b) => percentToViewport(geometry, b));

  let anyVerticalRemoved = false;
  let removedGlyphCount = 0;
  let survivorGlyphCount = 0;
  const removedRunsByteSeqs = []; // for the leak scan: raw bytes of each contiguous removed run
  for (let k = 0; k < timelines.length; k += 1) {
    const timeline = timelines[k];
    const bytesPerCode = raw.ops[k].cls?.isType0 ? 2 : 1;
    let run = [];
    const flushRun = () => {
      if (run.length) {
        const bytes2 = new Uint8Array(run.length * bytesPerCode);
        run.forEach((code, i) => {
          if (bytesPerCode === 2) { bytes2[i * 2] = (code >>> 8) & 0xff; bytes2[i * 2 + 1] = code & 0xff; }
          else bytes2[i] = code & 0xff;
        });
        removedRunsByteSeqs.push(bytes2);
        run = [];
      }
    };
    for (const item of timeline.items) {
      if (item.type === 'num') { flushRun(); continue; } // a TJ number is an original piece boundary - never search across it, see decodedTextByteBlobs
      const core = glyphCore(geometry.pdfToViewport, item.matrix, item.widthEm);
      item.remove = covers.some((c) => touches(core, c));
      if (item.remove) {
        removedGlyphCount += 1;
        if (timeline.vertical) anyVerticalRemoved = true;
        run.push(item.code);
      } else {
        survivorGlyphCount += 1;
        flushRun();
      }
    }
    flushRun();
  }
  if (anyVerticalRemoved) return { fallback: 'vertical-font glyph under a box, not modeled' };
  if (removedGlyphCount === 0) return { fallback: null, edited: false, removedGlyphCount: 0, survivorGlyphCount, removedRunsByteSeqs: [] };

  const formsById = new Map();
  for (const entry of raw.formSources.values()) formsById.set(entry.formId, entry);
  const allOpsCache = new Map();
  const getAllOps = (key, srcBytes) => {
    if (!allOpsCache.has(key)) allOpsCache.set(key, new Tokenizer(srcBytes).readOperators());
    return allOpsCache.get(key);
  };

  const editsBySource = new Map();
  for (let k = 0; k < timelines.length; k += 1) {
    const timeline = timelines[k];
    const anyRemoved = timeline.items.some((i) => i.type === 'glyph' && i.remove);
    if (!anyRemoved) continue;
    const rop = raw.ops[k];
    if (rop.op !== 'Tj' && rop.op !== 'TJ') {
      return { fallback: `op ${rop.op} with a removed glyph is not modeled (only Tj/TJ; a page using '/" would already have failed alignment above)` };
    }
    const bytesPerCode = rop.cls?.isType0 ? 2 : 1;
    const { pieces, trailingRemovedAdvance } = buildOutputPieces(timeline);
    const sourceKey = rop.source.kind === 'page' ? 'page' : `form:${rop.source.formId}`;
    const sourceBytes = rop.source.kind === 'page' ? raw.pageBytes : formsById.get(rop.source.formId).bytes;
    const allOps = getAllOps(sourceKey, sourceBytes);
    const needsPenMove = needsPenMoveAfter(allOps, rop.end);
    const trailingNum = timeline.fontSize ? (-1000 * trailingRemovedAdvance) / timeline.fontSize : 0;
    const text = serializeTJ(pieces, trailingNum, needsPenMove, bytesPerCode);
    if (!editsBySource.has(sourceKey)) editsBySource.set(sourceKey, []);
    editsBySource.get(sourceKey).push({ start: rop.start, end: rop.end, text });
  }

  // Apply forms first (repoint/copy), then the page's own Contents.
  for (const [key, edits] of editsBySource) {
    if (key === 'page') continue;
    const formId = Number(key.slice('form:'.length));
    const entry = formsById.get(formId);
    if (!entry) return { fallback: `internal: no form source for ${key}` };
    applyFormEdit(pdfDoc, pageNode, entry, edits);
  }
  if (editsBySource.has('page')) {
    applyPageEdit(pdfDoc, pageNode, raw.pageBytes, editsBySource.get('page'));
  }

  return { fallback: null, edited: true, removedGlyphCount, survivorGlyphCount, removedRunsByteSeqs };
}

// ---------------------------------------------------------------------------
// Verification, independent of the writer above: re-reads the SAVED file
// with the same pdf.js + replay pipeline (a fresh parse of fresh bytes) and
// checks it three ways.
// ---------------------------------------------------------------------------
async function flatWordsOfPage(bytes, pageNo) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();
  // pdf.js already puts a space in `str` for a same-line gap; a line's own
  // end (hasEOL) needs an explicit break, or the last word of one line and
  // the first of the next glue into one token (this bit me: joining with ''
  // read "...1234" + "This..." as one "word").
  const text = content.items
    .filter((i) => typeof i.str === 'string')
    .map((i) => i.str + (i.hasEOL ? '\n' : ''))
    .join('');
  return text.split(/\s+/).filter(Boolean);
}

function multisetDiff(a, b) {
  const count = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1); return m; };
  const ma = count(a); const mb = count(b);
  const onlyInA = []; const onlyInB = [];
  for (const [k, v] of ma) { const d = v - (mb.get(k) ?? 0); for (let i = 0; i < d; i += 1) onlyInA.push(k); }
  for (const [k, v] of mb) { const d = v - (ma.get(k) ?? 0); for (let i = 0; i < d; i += 1) onlyInB.push(k); }
  return { onlyInA, onlyInB };
}

/** Every surviving glyph's (code, matrix) for a page, flattened in content
 * order, via the exact same replay used to write the file. */
async function flatGlyphsOfPage(bytes, pageNo) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const opList = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const timelines = replayShowTextTimelines(opList, pdfjs.OPS, (name) => page.commonObjs.get(name));
  const geometry = pageGeometryFromPdfJsPage(page);
  const glyphs = [];
  for (const t of timelines) for (const item of t.items) if (item.type === 'glyph') glyphs.push(item);
  return { glyphs, geometry };
}

async function decompressAllStreams(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream) {
      try { out.push(decodeStreamBytes(obj)); } catch { /* skip an unreadable stream */ }
    }
  }
  return out;
}

function countOccurrences(haystackU8, needleU8) {
  if (needleU8.length === 0) return 0;
  const hay = Buffer.from(haystackU8.buffer, haystackU8.byteOffset, haystackU8.byteLength);
  const nee = Buffer.from(needleU8.buffer, needleU8.byteOffset, needleU8.byteLength);
  let count = 0;
  let idx = 0;
  for (;;) {
    const found = hay.indexOf(nee, idx);
    if (found === -1) break;
    count += 1;
    idx = found + nee.length;
  }
  return count;
}

/** Total occurrences of `needle` across every decompressed stream plus the
 * raw file bytes (so a compressed cross-reference stream or an object
 * stream's own packed bytes count too, not just what's visible unzipped). */
function countAcross(streams, rawFile, needle) {
  let total = 0;
  for (const s of streams) total += countOccurrences(s, needle);
  total += countOccurrences(rawFile, needle);
  return total;
}

/** Every Tj/TJ/'/" string operand's DECODED bytes in one content-stream-ish
 * buffer, concatenated per op the way align.mjs's rawShowOps does (ignoring
 * font/encoding - this corpus's own writer proved every stream here is
 * hex-string-encoded even for simple 1-byte fonts, so a naive scan of the
 * FILE's raw bytes for the removed run's DECODED byte values never matches
 * anything: the hex digits '5','0','4','C' are what's actually on disk, not
 * byte 0x50. Tokenizing first and reading each string operand's already
 * hex-or-literal-decoded bytes (the tokenizer resolves both) is what makes
 * the leak scan see the same bytes align.mjs itself compares against. Safe
 * to run over every stream in the file, including non-content-stream binary
 * (a font program, an image): the tokenizer just produces no recognised
 * show op for those, an empty result, never a throw or a false match. */
function decodedTextByteBlobs(streamBytes) {
  let ops;
  try { ops = new Tokenizer(streamBytes).readOperators(); } catch { return []; }
  const blobs = [];
  for (const o of ops) {
    let pieces = [];
    if (o.op === 'Tj' || o.op === "'") {
      const s = o.args[o.args.length - 1];
      if (s && s.t === 'str') pieces = [s.v];
    } else if (o.op === '"') {
      const s = o.args[2];
      if (s && s.t === 'str') pieces = [s.v];
    } else if (o.op === 'TJ') {
      const arr = o.args[0];
      // Each string operand is its own blob - NOT concatenated across a
      // number. A TJ number is exactly what this spike's own writer inserts
      // in place of a removed run, so joining two kept pieces across one
      // would recreate an adjacency the page never actually has (bit me on
      // real-world-uscis-i9-2025.pdf: "US" + "CIS " from either side of a
      // removed middle read back as "USCIS " that was never really there).
      if (arr && arr.t === 'arr') pieces = arr.v.filter((v) => v && v.t === 'str').map((v) => v.v);
    }
    for (const p of pieces) blobs.push(p);
  }
  return blobs;
}

async function decodedTextBlobsOfFile(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const blobs = [];
  // A page's own Contents can be several stream objects that a viewer (and
  // this spike's own writer, via pageContentBytes) treats as one logically
  // continuous stream. Scanning each stream object in isolation missed that
  // - and, worse, false-flagged a leak: real-world-uscis-i9-2025.pdf's page
  // had "USCIS" straddling two of its ORIGINAL content streams (invisible
  // to a per-object scan), while this spike's writer always emits ONE
  // merged stream, so the SAME untouched glyphs suddenly became visible to
  // a per-object scan post-edit - a false increase with nothing to do with
  // what was actually removed. Scan each page's streams concatenated, the
  // same way the writer reads and writes them, and scan everything else
  // (Form XObjects, whatever else carries a stream) separately.
  const contentStreamRefs = new Set();
  for (const page of doc.getPages()) {
    const raw = page.node.get(PDFName.of('Contents'));
    if (raw instanceof PDFRef) contentStreamRefs.add(raw);
    else if (raw instanceof PDFArray) {
      for (let i = 0; i < raw.size(); i += 1) {
        const v = raw.get(i);
        if (v instanceof PDFRef) contentStreamRefs.add(v);
      }
    }
    blobs.push(...decodedTextByteBlobs(pageContentBytes(page.node)));
  }
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (contentStreamRefs.has(ref)) continue;
    if (obj instanceof PDFStream) {
      let raw2;
      try { raw2 = decodeStreamBytes(obj); } catch { continue; }
      blobs.push(...decodedTextByteBlobs(raw2));
    }
  }
  return blobs;
}

function countAcrossBlobs(blobs, needle) {
  let total = 0;
  for (const b of blobs) total += countOccurrences(b, needle);
  return total;
}

async function verifyFile(file, originalBytes, outputBytes, pageNo, boxes, secrets, keptSurvivorGlyphs, removedRunsByteSeqs) {
  const lines = [];

  // (a) text diff: word multiset, original minus removed.
  const origWords = await flatWordsOfPage(originalBytes, pageNo);
  const outWords = await flatWordsOfPage(outputBytes, pageNo);
  const { onlyInA: missingFromOutput, onlyInB: addedInOutput } = multisetDiff(origWords, outWords);
  lines.push(`- Text diff: ${missingFromOutput.length} word(s) missing from the output (expected: the secret's words), ${addedInOutput.length} word(s) added.`);
  if (missingFromOutput.length) lines.push(`  - missing: ${missingFromOutput.map((w) => JSON.stringify(w)).join(', ')}`);
  if (addedInOutput.length) lines.push(`  - ADDED (unexpected): ${addedInOutput.map((w) => JSON.stringify(w)).join(', ')}`);

  // (b) survivor positions: flatten the output's own glyphs, compare in
  // order against the glyphs the writer decided to keep, and confirm none
  // of the output's glyphs sit under a box (drawn fresh from the output's
  // own geometry, independent of what the writer thought it removed).
  const { glyphs: outGlyphs, geometry: outGeometry } = await flatGlyphsOfPage(outputBytes, pageNo);
  let maxOffset = 0;
  let comparedCount = 0;
  const n = Math.min(outGlyphs.length, keptSurvivorGlyphs.length);
  for (let i = 0; i < n; i += 1) {
    const a = keptSurvivorGlyphs[i].matrix;
    const b = outGlyphs[i].matrix;
    const dx = a[4] - b[4];
    const dy = a[5] - b[5];
    const offset = Math.hypot(dx, dy);
    maxOffset = Math.max(maxOffset, offset);
    comparedCount += 1;
  }
  const countMismatch = outGlyphs.length !== keptSurvivorGlyphs.length;
  lines.push(`- Survivor positions: ${comparedCount} compared, max offset ${maxOffset.toFixed(4)}pt${countMismatch ? ` (COUNT MISMATCH: output has ${outGlyphs.length}, writer kept ${keptSurvivorGlyphs.length})` : ''}.`);
  const positionsOk = !countMismatch && maxOffset < 0.01;

  const covers = boxes.map((b) => percentToViewport(outGeometry, b));
  const underBox = outGlyphs.filter((g) => covers.some((c) => touches(glyphCore(outGeometry.pdfToViewport, g.matrix, g.widthEm), c)));
  lines.push(`- Survivors under a box: ${underBox.length}.`);
  const noneUnderBox = underBox.length === 0;

  // (c) byte scan. A real-world form repeats plain words (a page header, an
  // AcroForm field name, a StructTree ActualText mirror, XMP metadata) in
  // spots this content-stream-only edit never touches and was never asked
  // to - "USCIS" recurs on every page of the I-9 form regardless of this
  // box. Counting occurrences rather than checking presence tells the two
  // apart: our edit can only ever REMOVE bytes, never add the secret
  // anywhere, so a genuine miss shows as the output's count failing to drop
  // below the original's; a same count elsewhere is a pre-existing,
  // unrelated recurrence, not a leak of what we just deleted.
  const outBlobs = await decodedTextBlobsOfFile(outputBytes);
  const origBlobs = await decodedTextBlobsOfFile(originalBytes);
  let leakFound = false;
  const leakDetails = [];
  const infoNotes = [];
  for (const seq of removedRunsByteSeqs) {
    const before = countAcrossBlobs(origBlobs, seq);
    const after = countAcrossBlobs(outBlobs, seq);
    if (!(after < before)) { leakFound = true; leakDetails.push(`removed-run bytes [${Array.from(seq).join(',')}] did not drop (before ${before}, after ${after})`); }
  }
  const outStreams = await decompressAllStreams(outputBytes);
  const origStreams = await decompressAllStreams(originalBytes);
  for (const secret of secrets) {
    const forms = [
      { label: 'plain/utf8', bytes: new TextEncoder().encode(secret) },
      { label: 'utf16be', bytes: new Uint8Array(Buffer.from(secret, 'utf16le').swap16()) },
    ];
    for (const { label, bytes: needle } of forms) {
      const before = countAcross(origStreams, originalBytes, needle);
      const after = countAcross(outStreams, outputBytes, needle);
      if (before === 0) continue;
      if (after < before) continue; // dropped: our occurrence went away
      // Same or more after editing: either this exact secret was never a
      // literal content-stream run (e.g. it's CID-encoded, so the plain-text
      // scan never matched to begin with in a different way) or it persists
      // elsewhere (metadata/other pages) outside this spike's content-stream
      // scope. Report it plainly either way rather than guessing which.
      infoNotes.push(`secret text ${JSON.stringify(secret)} (${label}): before ${before}, after ${after} - unchanged by this edit (elsewhere in the file: metadata, other pages, or tagged content, not this box's content-stream run)`);
    }
  }
  lines.push(`- Byte scan, removed-run bytes (must strictly decrease): ${leakFound ? `LEAKED - ${leakDetails.join('; ')}` : 'every removed run\'s occurrence count dropped'}.`);
  if (infoNotes.length) lines.push(`- Byte scan, secret text elsewhere in the file (informational, not this spike's content-stream scope): ${infoNotes.join('; ')}.`);

  // An ADDED word is only a real problem if it's not just a fragment of a
  // MISSING word or of the secret itself - glyph-level removal is allowed
  // to split a word at a box edge (partial-overlap-word.pdf's whole point),
  // and pdf.js's own text-content extraction re-groups a now-two-piece TJ
  // array's Hebrew run differently than the original one-piece run even
  // when every glyph is verified byte-identical and in place (mid-run-hebrew.pdf).
  // Both are read directly off the SAME positions/bytes already checked
  // clean above, so this is a real check, not a rubber stamp: an added word
  // that ISN'T explained by a missing/secret superstring still fails.
  const explains = (added) => missingFromOutput.some((m) => m.includes(added)) || secrets.some((s) => s.includes(added));
  const unexplainedAdded = addedInOutput.filter((a) => !explains(a));
  if (unexplainedAdded.length) lines.push(`  - UNEXPLAINED added word(s) (not a fragment of a missing word or the secret): ${unexplainedAdded.map((w) => JSON.stringify(w)).join(', ')}`);
  else if (addedInOutput.length) lines.push(`  - (every added word above is a fragment of a missing word or the secret - expected from glyph-level, not word-level, removal)`);

  const pass = positionsOk && noneUnderBox && !leakFound && unexplainedAdded.length === 0;
  return { lines, pass, missingCount: missingFromOutput.length, addedCount: addedInOutput.length, unexplainedAddedCount: unexplainedAdded.length, maxOffset, underBoxCount: underBox.length, leakFound };
}

// ---------------------------------------------------------------------------
// Driver over the whole corpus.
// ---------------------------------------------------------------------------
const corpus = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, 'corpus.json'), 'utf8'));
const reportLines = [];
let passCount = 0;
let fallbackCount = 0;
let failCount = 0;
const notableFiles = ['real-world-irs-1040-2024.pdf', 'real-world-uscis-i9-2025.pdf', 'real-world-health-declaration-2021.pdf', 'hebrew-rtl-line.pdf', 'mid-run-hebrew.pdf'];
const notableResults = [];

for (const entry of corpus) {
  const file = entry.file;
  const pageNo = entry.page;
  const boxes = entry.rects
    ? entry.rects.map(([left, top, width, height]) => ({ left, top, width, height }))
    : [{ left: entry.rect[0], top: entry.rect[1], width: entry.rect[2], height: entry.rect[3] }];
  const secrets = entry.secrets ?? [entry.secret];

  const bytes = new Uint8Array(fs.readFileSync(path.join(CORPUS_DIR, file)));
  reportLines.push(`## ${file}`, '');
  reportLines.push(`- Boxes: ${boxes.length}, secrets: ${secrets.map((s) => JSON.stringify(s)).join(', ')}, feature: ${entry.feature ?? '-'}`);

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    reportLines.push(`- fallback: pdf-lib failed to load (${e.message})`, '');
    fallbackCount += 1;
    continue;
  }

  let result;
  try {
    result = await processPage(pdfDoc, bytes, pageNo, boxes);
  } catch (e) {
    result = { fallback: `threw: ${e.stack ?? e.message}` };
  }

  if (result.fallback) {
    reportLines.push(`- fallback: ${result.fallback}`, '');
    fallbackCount += 1;
    if (notableFiles.includes(file)) notableResults.push({ file, ok: false, why: result.fallback });
    continue;
  }
  if (!result.edited) {
    reportLines.push('- No glyph on this page touched a box (nothing to remove); left unedited.', '');
    continue;
  }

  reportLines.push(`- Glyphs removed: ${result.removedGlyphCount}, survivors on the page: ${result.survivorGlyphCount}.`);

  let outBytes;
  try {
    outBytes = await pdfDoc.save();
  } catch (e) {
    reportLines.push(`- fallback: save failed (${e.message})`, '');
    fallbackCount += 1;
    continue;
  }
  const outPath = path.join(OUT_DIR, file);
  fs.writeFileSync(outPath, outBytes);

  // Recompute the writer's own surviving-glyph list (in order) for the
  // position check, from the ORIGINAL page's timelines/marks - re-derive
  // cheaply by re-running processPage's early stages read-only would be
  // wasteful; instead replay the original bytes once more here, purely for
  // verification input (independent of what got written).
  const origDoc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const origPage = await origDoc.getPage(pageNo);
  const origOpList = await origPage.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const origTimelines = replayShowTextTimelines(origOpList, pdfjs.OPS, (name) => origPage.commonObjs.get(name));
  const origGeometry = pageGeometryFromPdfJsPage(origPage);
  const origCovers = boxes.map((b) => percentToViewport(origGeometry, b));
  const keptSurvivorGlyphs = [];
  for (const t of origTimelines) {
    for (const item of t.items) {
      if (item.type !== 'glyph') continue;
      const core = glyphCore(origGeometry.pdfToViewport, item.matrix, item.widthEm);
      const removed = origCovers.some((c) => touches(core, c));
      if (!removed) keptSurvivorGlyphs.push(item);
    }
  }

  const verification = await verifyFile(file, bytes, outBytes, pageNo, boxes, secrets, keptSurvivorGlyphs, result.removedRunsByteSeqs);
  reportLines.push(...verification.lines, '');
  if (verification.pass) passCount += 1; else failCount += 1;
  if (notableFiles.includes(file)) notableResults.push({ file, ok: verification.pass, why: verification.pass ? 'pass' : JSON.stringify({ missing: verification.missingCount, added: verification.addedCount, maxOffset: verification.maxOffset, underBox: verification.underBoxCount, leak: verification.leakFound }) });
}

const summary = [
  '# RED-18: true redaction of text',
  '',
  `${passCount} file(s) pass every check with no fallback. ${fallbackCount} file(s) fell back (not edited). ${failCount} file(s) were edited but failed a check.`,
  '',
  'Real-world forms and Hebrew cases:',
  ...notableResults.map((r) => `- ${r.file}: ${r.ok ? 'PASS' : 'FAIL/FALLBACK'} (${r.why})`),
  '',
  '---',
  '',
];

fs.writeFileSync(path.join(ROOT, 'spikes/red-18/results-text.md'), summary.join('\n') + reportLines.join('\n') + '\n');
console.log(summary.join('\n'));
