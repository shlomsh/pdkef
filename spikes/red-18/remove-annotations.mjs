// @ts-nocheck
// RED-18 spike (RED-21 groundwork): true redaction of what a box covers
// OTHER than the visible content-stream text remove-text.mjs already
// handles - annotations, form-field values/appearances, and text drawn by a
// Form XObject shared across pages. Three independent steps, run per box:
//
//   1. Annotation removal: a non-Widget annotation (FreeText, Watermark,
//      Text/comment, Link, ...) whose /Rect intersects a box is dropped from
//      the page's /Annots, and its object (and appearance streams) deleted
//      once nothing else in the document still points at them.
//   2. Form fields: a Widget annotation whose /Rect intersects a box loses
//      its field's /V (and /DV, when /DV held the same value) and that
//      widget's own /AP + /AS. If the field has other widgets that are NOT
//      under a box, the value is field-wide (shared) and disappears for them
//      too - reported, not silently done.
//   3. A Form XObject shared across pages (a text watermark drawn from one
//      object on every page) is copied before editing when a box on ONE
//      page's invocation removes a glyph, so the other pages' invocations
//      keep pointing at the original, untouched stream. remove-text.mjs
//      already does exactly this per-glyph splice, but exports nothing to
//      import (only align.mjs does) and is hardcoded to the RED-01 corpus
//      directory - so this step is a faithful, separately-scoped copy of
//      its glyph-timeline/splice engine (see the header above that section),
//      run here as its own stage on this spike's own corpus.
//
// Geometry throughout is the SAME glyphCore/touches percent-box rule
// RED-12's editor and remove-text.mjs use (src/editor/geometry/coords.ts's
// pdfToViewport), applied to annotation /Rect corners instead of glyph
// corners for steps 1-2.
//
// Run from the repo root (imports two .ts modules, so via tsx):
//   npx tsx spikes/red-18/remove-annotations.mjs
// Writes spikes/red-18/out/annotations/<name>.pdf (gitignored),
// spikes/red-18/corpus-annot/mixed-fields.pdf (a built fixture, committed),
// and spikes/red-18/results-annotations.md.
//
// Not part of the app; measures, does not touch src/.
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRef, PDFNumber, PDFString, StandardFonts,
} from '@cantoo/pdf-lib';
import { rawShowOps, pdfjsShowOps, align, Tokenizer, decodeStreamBytes } from './align.mjs';
import {
  pageGeometryFromPdfJsPage,
  composeAffineTransforms,
  applyAffineTransform,
} from '../../src/editor/geometry/coords.ts';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'spikes/red-18/out/annotations');
const FIXTURE_DIR = path.join(ROOT, 'spikes/red-18/corpus-annot');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(FIXTURE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Shared geometry: percent box <-> viewport, and a PDF /Rect (default user
// space, unaffected by /Rotate per spec - same as content-stream space) <->
// viewport, both via pageGeometryFromPdfJsPage's pdfToViewport. Duplicated
// from remove-text.mjs's glyphCore/touches/percentToViewport (not exported;
// same constants would apply to a glyph box, but a whole-/Rect box has no
// em-relative core inset, so only touches()/percentToViewport are reused as
// logic - glyphCore itself is redefined below only for step 3's glyphs).
// ---------------------------------------------------------------------------
function touches(a, b) {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}
function percentToViewport(geometry, box) {
  const x0 = (box.left / 100) * geometry.width;
  const y0 = (box.top / 100) * geometry.height;
  return { x0, y0, x1: x0 + (box.width / 100) * geometry.width, y1: y0 + (box.height / 100) * geometry.height };
}
function pdfRectToViewport(geometry, rect) {
  const [rx0, ry0, rx1, ry1] = rect;
  const x0 = Math.min(rx0, rx1), x1 = Math.max(rx0, rx1);
  const y0 = Math.min(ry0, ry1), y1 = Math.max(ry0, ry1);
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => applyAffineTransform({ x, y }, geometry.pdfToViewport));
  const xs = corners.map((c) => c.x); const ys = corners.map((c) => c.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
/** A percent box (left/top/width/height, like corpus.json's `rect`) that
 * covers `pdfRect` with a small margin, computed from the page's own
 * geometry - so a case can target "whatever this widget's Rect is" without
 * a hand-computed, easy-to-typo percent literal. */
function boxPercentFromPdfRect(geometry, pdfRect, marginPct = 0.4) {
  const vp = pdfRectToViewport(geometry, pdfRect);
  const left = (vp.x0 / geometry.width) * 100 - marginPct;
  const top = (vp.y0 / geometry.height) * 100 - marginPct;
  const width = ((vp.x1 - vp.x0) / geometry.width) * 100 + 2 * marginPct;
  const height = ((vp.y1 - vp.y0) / geometry.height) * 100 + 2 * marginPct;
  return { left, top, width, height };
}

// ---------------------------------------------------------------------------
// Generic "delete only if nothing else in the live document points at it"
// helper, shared by steps 1 and 2. Mirrors remove-text.mjs's applyFormEdit
// usage-count check, generalised: collect every PDFRef reachable through the
// STRUCTURE (dict/array/stream-dict values) of every remaining indirect
// object - never following a ref once found, so a shared resource (a font,
// a color space) referenced from inside a stream we keep is never mistaken
// for reachable-from-the-thing-we're-deleting. A ref not in that set after
// detaching it from its parent is safe to delete.
// ---------------------------------------------------------------------------
function collectStructuralRefs(value, out) {
  if (value instanceof PDFRef) { out.add(value); return; }
  if (value instanceof PDFArray) { for (let i = 0; i < value.size(); i += 1) collectStructuralRefs(value.get(i), out); return; }
  if (value instanceof PDFStream) { collectStructuralRefs(value.dict, out); return; }
  if (value instanceof PDFDict) { for (const v of value.values()) collectStructuralRefs(v, out); return; }
}
function allLiveReferencedRefs(context) {
  const out = new Set();
  for (const [, obj] of context.enumerateIndirectObjects()) collectStructuralRefs(obj, out);
  return out;
}
function deleteUnreferenced(context, candidateRefs) {
  const live = allLiveReferencedRefs(context);
  const deleted = []; const kept = [];
  for (const ref of candidateRefs) {
    if (!(ref instanceof PDFRef)) continue;
    if (live.has(ref)) { kept.push(ref); continue; }
    context.delete(ref);
    deleted.push(ref);
  }
  return { deleted, kept };
}
/** Every stream ref an annotation's /AP can hold: /N, /D, /R directly, or
 * (checkbox/radio) a sub-dictionary of appearance-state name -> stream ref.
 * Stops at the stream boundary - never descends into a kept stream's own
 * /Resources, which can legitimately be shared (fonts, color spaces). */
function collectApStreamRefs(context, annotDict) {
  const refs = [];
  const apVal = annotDict.get(PDFName.of('AP'));
  if (apVal === undefined) return refs;
  let apDict = apVal;
  if (apVal instanceof PDFRef) { refs.push(apVal); apDict = context.lookup(apVal); }
  if (!(apDict instanceof PDFDict)) return refs;
  for (const key of ['N', 'D', 'R']) {
    const entry = apDict.get(PDFName.of(key));
    if (entry === undefined) continue;
    if (entry instanceof PDFRef) {
      refs.push(entry);
      const resolved = context.lookup(entry);
      if (resolved instanceof PDFDict && !(resolved instanceof PDFStream)) {
        for (const v of resolved.values()) if (v instanceof PDFRef) refs.push(v);
      }
    } else if (entry instanceof PDFDict && !(entry instanceof PDFStream)) {
      for (const v of entry.values()) if (v instanceof PDFRef) refs.push(v);
    }
  }
  return refs;
}
function rectOf(context, dict) {
  const arr = dict.lookupMaybe(PDFName.of('Rect'), PDFArray);
  if (!arr || arr.size() !== 4) return null;
  return [0, 1, 2, 3].map((i) => arr.lookup(i, PDFNumber).asNumber());
}

// ---------------------------------------------------------------------------
// Step 1: non-Widget annotations (FreeText, Watermark, Text/comment, Link)
// whose /Rect intersects a box.
// ---------------------------------------------------------------------------
async function removeAnnotationsUnderBoxes(pdfDoc, bytes, pageNo, boxes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const geometry = pageGeometryFromPdfJsPage(page);
  const covers = boxes.map((b) => percentToViewport(geometry, b));

  const context = pdfDoc.context;
  const pageNode = pdfDoc.getPages()[pageNo - 1].node;
  const annots = pageNode.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) return { removed: [] };

  const kept = [];
  const toDetach = [];
  for (let i = 0; i < annots.size(); i += 1) {
    const ref = annots.get(i);
    if (!(ref instanceof PDFRef)) { kept.push(ref); continue; }
    const a = context.lookup(ref, PDFDict);
    const subtype = a.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
    if (subtype === '/Widget') { kept.push(ref); continue; } // step 2's job
    const rect = rectOf(context, a);
    if (!rect) { kept.push(ref); continue; }
    const vp = pdfRectToViewport(geometry, rect);
    if (covers.some((c) => touches(vp, c))) toDetach.push({ ref, dict: a, subtype, rect });
    else kept.push(ref);
  }
  if (!toDetach.length) return { removed: [] };

  pageNode.set(PDFName.of('Annots'), context.obj(kept));

  const { deleted: deletedAnnots, kept: keptAnnots } = deleteUnreferenced(context, toDetach.map((d) => d.ref));
  const apCandidates = toDetach.filter((d) => deletedAnnots.includes(d.ref)).flatMap((d) => collectApStreamRefs(context, d.dict));
  const { deleted: deletedAp } = deleteUnreferenced(context, apCandidates);

  return {
    removed: toDetach.map((d) => ({
      subtype: d.subtype, rect: d.rect,
      objectDeleted: deletedAnnots.includes(d.ref),
      objectKeptReason: keptAnnots.includes(d.ref) ? 'still referenced elsewhere (e.g. a tag tree) - detached from Annots but object kept' : null,
    })),
    deletedApStreamCount: deletedAp.length,
  };
}

// ---------------------------------------------------------------------------
// Step 2: form fields. A widget whose /Rect intersects a box strips its
// field's /V (+/DV if equal) and that widget's own /AP + /AS.
// ---------------------------------------------------------------------------
function findTerminalField(context, widgetDict) {
  let node = widgetDict;
  for (let guard = 0; guard < 32; guard += 1) {
    if (node.has(PDFName.of('FT'))) return node;
    const parentRef = node.get(PDFName.of('Parent'));
    if (parentRef === undefined) return node; // no /FT anywhere; fall back to the widget itself
    node = context.lookup(parentRef, PDFDict);
  }
  return node;
}
function pdfValuesEqual(a, b) {
  if (a === undefined || b === undefined) return a === b;
  return a.toString() === b.toString();
}
function fieldName(dict) {
  const t = dict.get(PDFName.of('T'));
  if (t && typeof t.decodeText === 'function') { try { return t.decodeText(); } catch { /* fall through */ } }
  return '(unnamed)';
}

async function stripFieldsUnderBoxes(pdfDoc, bytes, pageNo, boxes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const geometry = pageGeometryFromPdfJsPage(page);
  const covers = boxes.map((b) => percentToViewport(geometry, b));

  const context = pdfDoc.context;
  const pageNode = pdfDoc.getPages()[pageNo - 1].node;
  const annots = pageNode.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) return { fields: [] };

  const widgetHits = [];
  for (let i = 0; i < annots.size(); i += 1) {
    const ref = annots.get(i);
    if (!(ref instanceof PDFRef)) continue;
    const a = context.lookup(ref, PDFDict);
    if (a.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() !== '/Widget') continue;
    const rect = rectOf(context, a);
    if (!rect) continue;
    const vp = pdfRectToViewport(geometry, rect);
    if (!covers.some((c) => touches(vp, c))) continue;
    widgetHits.push({ widgetRef: ref, widgetDict: a, fieldDict: findTerminalField(context, a) });
  }
  if (!widgetHits.length) return { fields: [] };

  const byFieldRef = new Map();
  for (const hit of widgetHits) {
    const fieldRef = context.getObjectRef(hit.fieldDict) ?? hit.widgetRef;
    if (!byFieldRef.has(fieldRef)) byFieldRef.set(fieldRef, { fieldDict: hit.fieldDict, widgets: [] });
    byFieldRef.get(fieldRef).widgets.push(hit);
  }

  const apCandidates = [];
  const fieldReports = [];
  for (const [fieldRef, { fieldDict, widgets }] of byFieldRef) {
    const name = fieldName(fieldDict);
    const vKey = PDFName.of('V'); const dvKey = PDFName.of('DV');
    const v = fieldDict.get(vKey); const dv = fieldDict.get(dvKey);
    const hadValue = v !== undefined;
    if (hadValue) fieldDict.delete(vKey);
    const dvRemoved = dv !== undefined && hadValue && pdfValuesEqual(dv, v);
    if (dvRemoved) fieldDict.delete(dvKey);

    for (const w of widgets) {
      apCandidates.push(...collectApStreamRefs(context, w.widgetDict));
      w.widgetDict.delete(PDFName.of('AP'));
      w.widgetDict.delete(PDFName.of('AS'));
    }

    const kids = fieldDict.lookupMaybe(PDFName.of('Kids'), PDFArray);
    const allWidgetRefs = kids ? Array.from({ length: kids.size() }, (_, k) => kids.get(k)) : [fieldRef];
    const underBoxRefs = new Set(widgets.map((w) => w.widgetRef));
    const otherWidgetCount = allWidgetRefs.filter((r) => !underBoxRefs.has(r)).length;

    fieldReports.push({
      field: name, hadValue, dvRemoved, widgetsStrippedHere: widgets.length,
      sharedWithOtherWidgets: otherWidgetCount > 0, otherWidgetCount,
    });
  }
  const { deleted: deletedAp } = deleteUnreferenced(context, apCandidates);
  return { fields: fieldReports, deletedApStreamCount: deletedAp.length };
}

// ---------------------------------------------------------------------------
// Step 3: text drawn by a Form XObject shared across pages. A faithful copy
// of remove-text.mjs's per-glyph splice engine (replayShowTextTimelines,
// buildOutputPieces, spliceSource, the form copy-on-write in applyFormEdit),
// since that file exports nothing (only align.mjs does) and is hardcoded to
// the RED-01 corpus directory - see this file's own header. Scoped here to
// ONLY the form-XObject case (no page-Contents editing path): a removed
// glyph on the page's own Contents, not inside a form, falls back rather
// than silently mis-handling a case step 3 was never asked to cover.
// ---------------------------------------------------------------------------
const IDENTITY = [1, 0, 0, 1, 0, 0];
const DEFAULT_FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0];
const CORE_BOTTOM_EM = -0.15; const CORE_TOP_EM = 0.7;
const SIDE_INSET_EM = 0.15; const SIDE_INSET_SHARE = 0.3;
function glyphCore(pdfToViewport, matrix, widthEm) {
  const toViewport = composeAffineTransforms(pdfToViewport, matrix);
  const w = Math.max(widthEm, 0);
  const inset = Math.min(SIDE_INSET_EM, SIDE_INSET_SHARE * w);
  const corners = [
    { x: inset, y: CORE_BOTTOM_EM }, { x: w - inset, y: CORE_BOTTOM_EM },
    { x: inset, y: CORE_TOP_EM }, { x: w - inset, y: CORE_TOP_EM },
  ].map((p) => applyAffineTransform(p, toViewport));
  const xs = corners.map((c) => c.x); const ys = corners.map((c) => c.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function initialState() {
  return {
    ctm: IDENTITY, textMatrix: IDENTITY, x: 0, y: 0, lineX: 0, lineY: 0,
    charSpacing: 0, wordSpacing: 0, hScale: 1, leading: 0, rise: 0,
    fontSize: 0, fontDirection: 1, font: null, renderingMode: 0,
  };
}
function replayShowTextTimelines(operatorList, ops, fontInfo) {
  const timelines = []; const stack = []; let s = initialState(); let showTextIndex = 0;
  const setFont = (name, size) => { s.font = fontInfo(name) ?? null; s.fontDirection = size < 0 ? -1 : 1; s.fontSize = Math.abs(size); };
  const moveText = (x, y) => { s.lineX += x; s.lineY += y; s.x = s.lineX; s.y = s.lineY; };
  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    const fn = operatorList.fnArray[i]; const args = operatorList.argsArray[i] ?? [];
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
        for (const [key, value] of args[0] ?? []) if (key === 'Font' && Array.isArray(value)) setFont(value[0], value[1]);
        break;
      case ops.setTextRenderingMode: s.renderingMode = args[0]; break;
      case ops.setTextRise: s.rise = args[0]; break;
      case ops.moveText: moveText(args[0], args[1]); break;
      case ops.setTextMatrix: s.textMatrix = args[0]; s.x = s.lineX = 0; s.y = s.lineY = 0; break;
      case ops.nextLine: moveText(0, s.leading); break;
      case ops.showText: {
        const items = args[0] ?? []; const font = s.font;
        const fontMatrix = font?.fontMatrix ?? DEFAULT_FONT_MATRIX;
        const scale = s.fontSize * fontMatrix[0]; const hScale = s.hScale * s.fontDirection;
        const base = composeAffineTransforms(s.ctm, s.textMatrix);
        const timeline = {
          opIndex: showTextIndex, items: [], fontSize: s.fontSize, scale,
          charSpacing: s.charSpacing, wordSpacing: s.wordSpacing, hScale: s.hScale,
          fontDirection: s.fontDirection, renderingMode: s.renderingMode, vertical: Boolean(font?.vertical),
        };
        showTextIndex += 1; let x = 0;
        for (const item of items) {
          if (typeof item === 'number') { timeline.items.push({ type: 'num', value: item }); x -= (item * s.fontSize) / 1000; continue; }
          const width = item.width ?? 0; const origin = s.x + x * hScale;
          const matrix = composeAffineTransforms(base, [s.fontSize * hScale, 0, 0, s.fontSize, origin, s.y + s.rise]);
          timeline.items.push({
            type: 'glyph', code: item.originalCharCode, unicode: typeof item.unicode === 'string' ? item.unicode : '',
            isSpace: Boolean(item.isSpace), w0: width, widthEm: width * fontMatrix[0], matrix,
            invisible: (s.renderingMode & 3) === 3,
          });
          const spacing = (item.isSpace ? s.wordSpacing : 0) + s.charSpacing;
          x += width * scale + spacing * s.fontDirection;
        }
        s.x += x * hScale; timelines.push(timeline);
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
function buildOutputPieces(timeline) {
  const out = []; let curCodes = []; let removedAccum = 0; let floatingDx = 0; let lastWasCode = false; let lastCodeRemoved = false;
  const numFor = (dx) => (timeline.fontSize ? (-1000 * dx) / timeline.fontSize : 0);
  const flushKeep = () => { if (curCodes.length) { out.push({ type: 'str', codes: curCodes }); curCodes = []; } };
  const flushRemoved = () => { const n = numFor(removedAccum); if (Math.abs(n) > 1e-6) out.push({ type: 'num', value: n }); removedAccum = 0; };
  for (const item of timeline.items) {
    if (item.type === 'num') { floatingDx += -(item.value * timeline.fontSize) / 1000; continue; }
    if (item.remove) {
      flushKeep(); removedAccum += floatingDx; floatingDx = 0; removedAccum += glyphDx(timeline, item);
    } else {
      if (lastWasCode && lastCodeRemoved) { removedAccum += floatingDx; floatingDx = 0; flushRemoved(); }
      else if (floatingDx !== 0) { flushKeep(); out.push({ type: 'num', value: numFor(floatingDx) }); floatingDx = 0; }
      curCodes.push(item.code);
    }
    lastWasCode = true; lastCodeRemoved = item.remove;
  }
  if (lastCodeRemoved) { removedAccum += floatingDx; floatingDx = 0; }
  else if (floatingDx !== 0) { flushKeep(); out.push({ type: 'num', value: numFor(floatingDx) }); floatingDx = 0; }
  flushKeep();
  return { pieces: out, trailingRemovedAdvance: removedAccum };
}
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
const numStr = (n) => { if (!Number.isFinite(n)) return '0'; const r = Math.round(n * 1000) / 1000; return (Object.is(r, -0) ? 0 : r).toString(); };
const hexOf = (codes, bpc) => `<${codes.map((c) => (c >>> 0).toString(16).toUpperCase().padStart(bpc * 2, '0')).join('')}>`;
function serializeTJ(pieces, trailingAdvance, needsPenMove, bytesPerCode) {
  const all = pieces.slice();
  if (needsPenMove && Math.abs(trailingAdvance) > 1e-6) all.push({ type: 'num', value: trailingAdvance });
  if (all.length === 0) return '';
  const body = all.map((p) => (p.type === 'str' ? hexOf(p.codes, bytesPerCode) : numStr(p.value))).join(' ');
  return `[${body}] TJ`;
}
function spliceSource(bytes, replacements) {
  const sorted = [...replacements].sort((a, b) => a.start - b.start);
  const encoder = new TextEncoder(); const chunks = []; let cursor = 0;
  for (const r of sorted) {
    if (r.start > cursor) chunks.push(bytes.subarray(cursor, r.start));
    if (r.text) chunks.push(encoder.encode(r.text));
    cursor = r.end;
  }
  if (cursor < bytes.length) chunks.push(bytes.subarray(cursor, bytes.length));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total); let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
function dictLiteralExcept(dict, exclude) {
  const lit = {};
  for (const [key, value] of dict.entries()) { const k = key.decodeText(); if (exclude.includes(k)) continue; lit[k] = value; }
  return lit;
}
/** Copy-on-write, exactly remove-text.mjs's applyFormEdit: edit the form's
 * stream in place if this page's own invocation is the only user across the
 * whole document; otherwise register a new stream and repoint ONLY this
 * page's own (cloned) Resources/XObject entry at it, leaving every other
 * page's Resources - and the original stream object - untouched. */
function applyFormEditScoped(pdfDoc, pageNode, entry, edits) {
  const context = pdfDoc.context;
  const newBytes = spliceSource(entry.bytes, edits);
  const preserved = dictLiteralExcept(entry.dict, ['Length', 'Filter', 'DecodeParms']);
  const newStream = context.flateStream(newBytes, preserved);

  let usageCount = 0;
  for (const p of pdfDoc.getPages()) {
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
  return { copied: true, newRef };
}

async function redactFormXObjectOnPage(pdfDoc, bytes, pageNo, boxes) {
  const pageNode = pdfDoc.getPages()[pageNo - 1].node;
  const raw = rawShowOps(pageNode);
  let pdfjsOps;
  try { pdfjsOps = await pdfjsShowOps(bytes, pageNo); } catch (e) { return { fallback: `pdf.js failed: ${e.message}` }; }
  const alignment = align(raw.ops, pdfjsOps);
  if (!alignment.aligned) return { fallback: `not aligned: ${JSON.stringify(alignment.firstMismatch)}` };

  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const opList = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const timelines = replayShowTextTimelines(opList, pdfjs.OPS, (name) => page.commonObjs.get(name));
  if (timelines.length !== raw.ops.length) return { fallback: `internal: ${timelines.length} timelines vs ${raw.ops.length} raw ops` };

  const geometry = pageGeometryFromPdfJsPage(page);
  const covers = boxes.map((b) => percentToViewport(geometry, b));

  let removedGlyphCount = 0;
  for (let k = 0; k < timelines.length; k += 1) {
    for (const item of timelines[k].items) {
      if (item.type !== 'glyph') continue;
      const core = glyphCore(geometry.pdfToViewport, item.matrix, item.widthEm);
      item.remove = covers.some((c) => touches(core, c));
      if (item.remove) removedGlyphCount += 1;
    }
  }
  if (removedGlyphCount === 0) return { fallback: null, edited: false };

  const formsById = new Map();
  for (const entry of raw.formSources.values()) formsById.set(entry.formId, entry);
  const allOpsCache = new Map();
  const getAllOps = (key, srcBytes) => { if (!allOpsCache.has(key)) allOpsCache.set(key, new Tokenizer(srcBytes).readOperators()); return allOpsCache.get(key); };

  const editsBySource = new Map();
  for (let k = 0; k < timelines.length; k += 1) {
    const timeline = timelines[k];
    if (!timeline.items.some((i) => i.type === 'glyph' && i.remove)) continue;
    const rop = raw.ops[k];
    if (rop.op !== 'Tj' && rop.op !== 'TJ') return { fallback: `op ${rop.op} with a removed glyph is not modeled by this step` };
    if (rop.source.kind !== 'form') return { fallback: 'a removed glyph sits on the page\'s own Contents, not the shared form - not modeled by this step' };
    const bytesPerCode = rop.cls?.isType0 ? 2 : 1;
    const { pieces, trailingRemovedAdvance } = buildOutputPieces(timeline);
    const sourceKey = `form:${rop.source.formId}`;
    const sourceBytes = formsById.get(rop.source.formId).bytes;
    const allOps = getAllOps(sourceKey, sourceBytes);
    const needsPenMove = needsPenMoveAfter(allOps, rop.end);
    const trailingNum = timeline.fontSize ? (-1000 * trailingRemovedAdvance) / timeline.fontSize : 0;
    const text = serializeTJ(pieces, trailingNum, needsPenMove, bytesPerCode);
    if (!editsBySource.has(sourceKey)) editsBySource.set(sourceKey, []);
    editsBySource.get(sourceKey).push({ start: rop.start, end: rop.end, text });
  }

  const copiedForms = [];
  for (const [key, edits] of editsBySource) {
    const formId = Number(key.slice('form:'.length));
    const entry = formsById.get(formId);
    const result = applyFormEditScoped(pdfDoc, pageNode, entry, edits);
    copiedForms.push({ formId, ...result });
  }
  return { fallback: null, edited: true, removedGlyphCount, copiedForms };
}

// ---------------------------------------------------------------------------
// Fixture: a filled text field (single widget, under the box), a checkbox
// (single widget, not under the box), a text field with two widgets sharing
// one value (one under the box, one not - the "report it, remove anyway"
// case), a comment and a link annotation under the box, and a second link
// left untouched for contrast. Built once with pdf-lib; committed so the
// case is inspectable without re-running this file.
// ---------------------------------------------------------------------------
async function buildFixtureIfMissing() {
  const outPath = path.join(FIXTURE_DIR, 'mixed-fields.pdf');
  if (fs.existsSync(outPath)) return outPath;

  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('RED-21 fixture: form fields + annotations', { x: 20, y: 285, size: 9, font });
  page.drawText('Upper band is under the redaction box; lower band is not.', { x: 20, y: 20, size: 7, font });

  const form = doc.getForm();

  // Under the box (upper band, PDF y roughly 190-280; the box covers 180-285).
  const sole = form.createTextField('SoleTextField');
  sole.setText('SOLE-VALUE');
  sole.addToPage(page, { x: 40, y: 230, width: 140, height: 20, font });
  sole.acroField.dict.set(PDFName.of('DV'), sole.acroField.dict.get(PDFName.of('V'))); // DV === V: both should be removed

  const shared = form.createTextField('SharedField');
  shared.setText('SHARED-VALUE');
  shared.addToPage(page, { x: 200, y: 230, width: 140, height: 20, font }); // widget #1: under the box

  page.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [40, 195, 60, 215],
    Contents: PDFString.of('A reviewer comment, under the box'), Open: false, Name: 'Comment',
  })));
  page.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [70, 195, 190, 215], Border: [0, 0, 0],
  })));

  // Not under the box (lower band, PDF y roughly 40-110; well below the box's y=180 floor).
  const checkbox = form.createCheckBox('AgreeCheckbox');
  checkbox.addToPage(page, { x: 40, y: 60, width: 16, height: 16 });
  checkbox.check();

  shared.addToPage(page, { x: 200, y: 60, width: 140, height: 20, font }); // widget #2: NOT under the box, same field/value

  page.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [40, 90, 160, 110], Border: [0, 0, 0],
  })));

  form.updateFieldAppearances(font);
  const bytes = await doc.save();
  fs.writeFileSync(outPath, bytes);
  return outPath;
}
// Box covering the upper band: PDF y in [180,285] on a 300-tall page, most
// of the 400-wide page (see percentToViewport: top-down percent of a page
// whose viewport height/width equal the (unrotated) page's own).
const FIXTURE_BOX = { left: 5, top: 5, width: 90, height: 35 };

// ---------------------------------------------------------------------------
// Verification: independent re-open of the SAVED output with pdf.js
// (getAnnotations - which resolves a widget's field value as `fieldValue`
// directly; getFieldObjects returned {} for these fixtures in this pdf.js
// build, so it isn't used) plus a byte/string scan of every decompressed
// stream and every PDFString/PDFHexString in the pdf-lib object graph.
//
// A marker's occurrence count is compared before vs after (must strictly
// decrease when it was present), not checked for bare absence - RED-18's
// own text spike (results-text.md) found real recurrences elsewhere in a
// real-world file that a naive "found anywhere -> fail" misreports as a
// leak. The same pattern shows up by design here: a shared field's OTHER
// widget (not under any box) keeps its own, separately-generated appearance
// stream even after the field's /V is gone, and an untouched page's own
// Watermark annotation legitimately carries the same text as the one that
// WAS removed on page 1. Both are asserted explicitly, per case below, as
// "still there, and that's correct" - not swept into the leak check.
// ---------------------------------------------------------------------------
function collectPdfStrings(context) {
  const out = [];
  const visit = (v) => {
    if (v === undefined || v === null) return;
    if (typeof v.decodeText === 'function' && (v.constructor?.name === 'PDFString' || v.constructor?.name === 'PDFHexString')) {
      try { out.push(v.decodeText()); } catch { /* skip */ }
      return;
    }
    if (v instanceof PDFArray) { for (let i = 0; i < v.size(); i += 1) visit(v.get(i)); return; }
    if (v instanceof PDFStream) { visit(v.dict); return; }
    if (v instanceof PDFDict) { for (const val of v.values()) visit(val); return; }
  };
  for (const [, obj] of context.enumerateIndirectObjects()) visit(obj);
  return out;
}
async function decompressAllStreams(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream) { try { out.push(decodeStreamBytes(obj)); } catch { /* skip an unreadable stream */ } }
  }
  return out;
}
function countOccurrences(haystackU8, needleU8) {
  if (needleU8.length === 0) return 0;
  const hay = Buffer.from(haystackU8.buffer, haystackU8.byteOffset, haystackU8.byteLength);
  const nee = Buffer.from(needleU8.buffer, needleU8.byteOffset, needleU8.byteLength);
  let count = 0; let idx = 0;
  for (;;) { const found = hay.indexOf(nee, idx); if (found === -1) break; count += 1; idx = found + nee.length; }
  return count;
}
function countAcross(streams, needle) { return streams.reduce((n, s) => n + countOccurrences(s, needle), 0); }
/** Tj/TJ/'/" string OPERANDS, already hex-or-literal-decoded, out of a
 * content-ish stream - exactly remove-text.mjs's own decodedTextByteBlobs
 * (results-text.md's own lesson: a plain field-appearance stream writes its
 * text as a HEX STRING, e.g. `<534F4C452D56414C5545> Tj`, whose raw on-disk
 * bytes are the ASCII hex DIGITS, not the text's own bytes - a naive
 * decompressed-stream byte scan for "SOLE-VALUE" never matches that at all,
 * decoded or not; only tokenizing the operand finds it. Safe on any stream,
 * content or not: an unparseable one just yields no ops, never a throw. */
function decodedTextByteBlobs(streamBytes) {
  let ops;
  try { ops = new Tokenizer(streamBytes).readOperators(); } catch { return []; }
  const blobs = [];
  for (const o of ops) {
    let pieces = [];
    if (o.op === 'Tj' || o.op === "'") { const s = o.args[o.args.length - 1]; if (s && s.t === 'str') pieces = [s.v]; }
    else if (o.op === '"') { const s = o.args[2]; if (s && s.t === 'str') pieces = [s.v]; }
    else if (o.op === 'TJ') { const arr = o.args[0]; if (arr && arr.t === 'arr') pieces = arr.v.filter((v) => v && v.t === 'str').map((v) => v.v); }
    for (const p of pieces) blobs.push(p);
  }
  return blobs;
}
async function countMarkerOccurrences(bytes, marker) {
  const streams = await decompressAllStreams(bytes);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const strings = collectPdfStrings(doc.context);
  const decodedBlobs = streams.flatMap((s) => decodedTextByteBlobs(s));
  const forms = [new TextEncoder().encode(marker), new Uint8Array(Buffer.from(marker, 'utf16le').swap16())];
  const streamCount = forms.reduce((n, needle) => n + countAcross(streams, needle), 0);
  const decodedCount = forms.reduce((n, needle) => n + countAcross(decodedBlobs, needle), 0);
  const stringCount = strings.filter((s) => s.includes(marker)).length;
  return streamCount + decodedCount + stringCount;
}
/** before/after occurrence counts, and whether the count strictly dropped
 * (or was already 0 - nothing to check). */
async function markerDropped(origBytes, outBytes, marker) {
  const before = await countMarkerOccurrences(origBytes, marker);
  const after = await countMarkerOccurrences(outBytes, marker);
  return { before, after, dropped: before === 0 || after < before };
}
async function reopenPage(bytes, pageNo) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const geometry = pageGeometryFromPdfJsPage(page);
  const annots = await page.getAnnotations({ intent: 'any' });
  return { geometry, annots };
}
function underBox(annots, geometry, boxes, { onlyType, excludeType } = {}) {
  const covers = boxes.map((b) => percentToViewport(geometry, b));
  return annots.filter((a) => {
    if (onlyType !== undefined && a.annotationType !== onlyType) return false;
    if (excludeType !== undefined && a.annotationType === excludeType) return false;
    if (!Array.isArray(a.rect) || a.rect.length !== 4) return false;
    const vp = pdfRectToViewport(geometry, a.rect);
    return covers.some((c) => touches(vp, c));
  });
}
const WIDGET = 20; // pdfjs.AnnotationType.WIDGET

// ---------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------
const reportLines = [];
const summary = [];

/** Runs steps 1 and 2 together on one box set, exactly as a real per-box
 * redaction pass would, saves once, and returns what each case's own
 * bespoke checks below need. */
async function runAnnotationsAndFields(label, filePath, pageNo, boxes) {
  reportLines.push(`## ${label}`, '');
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  const rAnnot = await removeAnnotationsUnderBoxes(pdfDoc, bytes, pageNo, boxes);
  const rField = await stripFieldsUnderBoxes(pdfDoc, bytes, pageNo, boxes);
  reportLines.push(`- Non-Widget annotations removed: ${rAnnot.removed.length}${rAnnot.removed.length ? ` (${rAnnot.removed.map((r) => r.subtype).join(', ')})` : ''}.`);
  for (const r of rAnnot.removed) reportLines.push(`  - ${r.subtype} at ${JSON.stringify(r.rect.map((n) => Math.round(n * 100) / 100))}: object ${r.objectDeleted ? 'deleted' : `kept (${r.objectKeptReason})`}.`);
  if (rAnnot.deletedApStreamCount) reportLines.push(`- Annotation appearance-stream objects deleted: ${rAnnot.deletedApStreamCount}.`);
  reportLines.push(`- Widget fields touched: ${rField.fields.length}.`);
  for (const f of rField.fields) {
    reportLines.push(`  - "${f.field}": had a value: ${f.hadValue}, DV removed: ${f.dvRemoved}, widgets stripped here: ${f.widgetsStrippedHere}${f.sharedWithOtherWidgets ? `, SHARED - ${f.otherWidgetCount} other widget(s) of this field are not under a box; their value is gone too` : ''}.`);
  }
  if (rField.deletedApStreamCount) reportLines.push(`- Widget appearance-stream objects deleted: ${rField.deletedApStreamCount}.`);

  const outBytes = await pdfDoc.save();
  fs.writeFileSync(path.join(OUT_DIR, path.basename(filePath)), outBytes);
  return { origBytes: bytes, outBytes, rAnnot, rField };
}

async function runSharedFormCase(label, filePath) {
  reportLines.push(`## ${label}`, '');
  const corpusEntry = JSON.parse(fs.readFileSync(path.join(ROOT, 'spikes/red-18/corpus/corpus.json'), 'utf8'))
    .find((e) => e.file === path.basename(filePath));
  const box = { left: corpusEntry.rect[0], top: corpusEntry.rect[1], width: corpusEntry.rect[2], height: corpusEntry.rect[3] };
  const secret = corpusEntry.secret;
  const sharedPages = corpusEntry.sharedAcrossPages;

  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  const result = await redactFormXObjectOnPage(pdfDoc, bytes, 1, [box]);
  if (result.fallback) { reportLines.push(`- fallback: ${result.fallback}`, ''); summary.push({ label, pass: false }); return; }
  reportLines.push(`- Glyphs removed from the form on page 1: ${result.removedGlyphCount}.`);
  for (const c of result.copiedForms) reportLines.push(`  - form ${c.formId}: ${c.copied ? 'copied (page 1 now points at a new stream object)' : 'edited in place (only page 1 used it)'}.`);

  const outBytes = await pdfDoc.save();
  const outPath = path.join(OUT_DIR, path.basename(filePath));
  fs.writeFileSync(outPath, outBytes);

  // Independent re-check: page 1 has no more "CONFIDENTIAL" in its text or
  // its form's decoded bytes; every shared page still does, byte-for-byte
  // the same count as the original (proving the other pages' copy of the
  // form XObject - and their Resources - were never touched).
  const outDoc = await pdfjs.getDocument({ data: outBytes.slice(), useSystemFonts: false }).promise;
  const origDoc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const wordsOf = async (doc, pageNo) => {
    const p = await doc.getPage(pageNo);
    const content = await p.getTextContent();
    return content.items.filter((i) => typeof i.str === 'string').map((i) => i.str).join(' ');
  };
  let ok = true;
  const page1Text = await wordsOf(outDoc, 1);
  if (page1Text.includes(secret)) { ok = false; reportLines.push(`- LEAK: page 1 text still contains "${secret}".`); }
  else reportLines.push(`- Page 1 text no longer contains "${secret}".`);

  for (const pn of sharedPages) {
    const origText = await wordsOf(origDoc, pn);
    const newText = await wordsOf(outDoc, pn);
    const origHas = origText.includes(secret);
    const newHas = newText.includes(secret);
    reportLines.push(`- Page ${pn} still draws "${secret}": ${newHas} (originally: ${origHas}).`);
    if (origHas && !newHas) { ok = false; reportLines.push(`  - REGRESSION: page ${pn} originally had "${secret}" and no longer does.`); }
  }

  // Object-identity check: page 1's XObject entry ref differs from the
  // shared pages' (proving a copy was made); the shared pages all still
  // point at the SAME ref as each other (and as the original file).
  const readXObjRef = async (bytesForDoc, pageIndex) => {
    const d = await PDFDocument.load(bytesForDoc, { updateMetadata: false });
    const node = d.getPages()[pageIndex].node;
    const resources = node.Resources();
    const xobjDict = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    const key = xobjDict.keys().find((k) => xobjDict.get(k) !== undefined);
    return xobjDict.get(key)?.toString();
  };
  const origPage1Ref = await readXObjRef(bytes, 0);
  const outPage1Ref = await readXObjRef(outBytes, 0);
  const outPage2Ref = await readXObjRef(outBytes, 1);
  const origPage2Ref = await readXObjRef(bytes, 1);
  reportLines.push(`- XObject ref: original page 1 = ${origPage1Ref}, output page 1 = ${outPage1Ref} (${outPage1Ref !== origPage1Ref ? 'different - a copy was made' : 'SAME - no copy, unexpected if the form was shared'}).`);
  reportLines.push(`- XObject ref: output page 2 = ${outPage2Ref}, original page 2 = ${origPage2Ref} (${outPage2Ref === origPage2Ref ? 'unchanged' : 'CHANGED - unexpected'}).`);
  if (outPage1Ref === origPage1Ref || outPage2Ref !== origPage2Ref) ok = false;

  reportLines.push('');
  summary.push({ label, pass: ok });
}

async function main() {
  // Case 1a: FreeText annotation (RED-01 corpus; no /AP, /Contents-only).
  {
    const file = path.join(ROOT, 'spikes/red-01/corpus/freetext-annotation.pdf');
    const entry = JSON.parse(fs.readFileSync(path.join(ROOT, 'spikes/red-01/corpus/corpus.json'), 'utf8')).find((e) => e.file === 'freetext-annotation.pdf');
    const box = { left: entry.rect[0], top: entry.rect[1], width: entry.rect[2], height: entry.rect[3] };
    const { origBytes, outBytes, rAnnot } = await runAnnotationsAndFields('FreeText annotation (freetext-annotation.pdf)', file, entry.page, [box]);
    const { annots, geometry } = await reopenPage(outBytes, entry.page);
    const leftover = underBox(annots, geometry, [box]);
    const marker = await markerDropped(origBytes, outBytes, entry.secret);
    const outDoc = await pdfjs.getDocument({ data: outBytes.slice(), useSystemFonts: false }).promise;
    const outPage = await outDoc.getPage(entry.page);
    const text = (await outPage.getTextContent()).items.filter((i) => typeof i.str === 'string').map((i) => i.str).join(' ');
    const keepTextPresent = text.includes(entry.keepText);
    reportLines.push(`- Independent re-open: ${leftover.length} annotation(s) still intersect the box (expect 0).`);
    reportLines.push(`- Marker "${entry.secret}": before ${marker.before}, after ${marker.after} (${marker.dropped ? 'dropped' : 'LEAK'}).`);
    reportLines.push(`- Body text "${entry.keepText}" still present: ${keepTextPresent}.`);
    reportLines.push('');
    summary.push({ label: 'FreeText annotation (freetext-annotation.pdf)', pass: rAnnot.removed.length > 0 && leftover.length === 0 && marker.dropped && keepTextPresent });
  }

  // Case 1b: Watermark annotation, page 1 only; pages 2-5 have their own
  // independent Watermark objects (same text, not shared) and must survive.
  {
    const file = path.join(ROOT, 'spikes/red-18/corpus/watermark-annotation.pdf');
    const entry = JSON.parse(fs.readFileSync(path.join(ROOT, 'spikes/red-18/corpus/corpus.json'), 'utf8')).find((e) => e.file === 'watermark-annotation.pdf');
    const box = { left: entry.rect[0], top: entry.rect[1], width: entry.rect[2], height: entry.rect[3] };
    const { outBytes, rAnnot } = await runAnnotationsAndFields('Watermark annotation (watermark-annotation.pdf) - page 1 only, pages 2-5 independent', file, 1, [box]);
    const { annots, geometry } = await reopenPage(outBytes, 1);
    const leftover = underBox(annots, geometry, [box]);
    reportLines.push(`- Independent re-open, page 1: ${leftover.length} annotation(s) still intersect the box (expect 0).`);
    const page1HasSecretInContents = annots.some((a) => typeof a.contentsObj?.str === 'string' && a.contentsObj.str.includes(entry.secret));
    reportLines.push(`- Page 1's own annotation set no longer carries "${entry.secret}": ${!page1HasSecretInContents}.`);
    let othersOk = true; let sharedStillHave = true;
    for (const pn of entry.sharedAcrossPages) {
      const other = await reopenPage(outBytes, pn);
      const has = other.annots.length > 0;
      const hasSecret = other.annots.some((a) => typeof a.contentsObj?.str === 'string' && a.contentsObj.str.includes(entry.secret));
      if (!has) othersOk = false;
      if (!hasSecret) sharedStillHave = false;
      reportLines.push(`- Page ${pn}: ${other.annots.length} annotation(s) remain (its own, independent Watermark object), still carries "${entry.secret}": ${hasSecret} - ${has ? 'OK' : 'REGRESSION'}.`);
    }
    reportLines.push('');
    summary.push({ label: 'Watermark annotation (watermark-annotation.pdf)', pass: rAnnot.removed.length > 0 && leftover.length === 0 && othersOk && sharedStillHave && !page1HasSecretInContents });
  }

  // Case 2: form fields + annotations, built fixture (sole field, checkbox,
  // a field shared across two widgets, a comment, and two links).
  {
    const file = await buildFixtureIfMissing();
    const { origBytes, outBytes, rAnnot, rField } = await runAnnotationsAndFields('Form fields fixture (mixed-fields.pdf)', file, 1, [FIXTURE_BOX]);
    const { annots, geometry } = await reopenPage(outBytes, 1);
    const nonWidgetLeftover = underBox(annots, geometry, [FIXTURE_BOX], { excludeType: WIDGET });
    const widgetsUnderBox = underBox(annots, geometry, [FIXTURE_BOX], { onlyType: WIDGET });
    const widgetsStillHaveValue = widgetsUnderBox.filter((a) => a.fieldValue);
    reportLines.push(`- Independent re-open: ${nonWidgetLeftover.length} non-widget annotation(s) still intersect the box (expect 0).`);
    reportLines.push(`- Independent re-open: ${widgetsUnderBox.length} widget(s) remain under the box (expected - the widget itself stays), ${widgetsStillHaveValue.length} of them still report a field value (expect 0).`);

    const soleDropped = await markerDropped(origBytes, outBytes, 'SOLE-VALUE');
    reportLines.push(`- Marker "SOLE-VALUE" (single-widget field, fully removed): before ${soleDropped.before}, after ${soleDropped.after} (${soleDropped.dropped ? 'dropped' : 'LEAK'}).`);

    // SHARED-VALUE is expected to still exist once (the untouched widget's
    // own, separately-generated appearance stream) even though the field's
    // /V is gone everywhere - the documented "remove it anyway, saying so" case.
    const sharedBefore = await countMarkerOccurrences(origBytes, 'SHARED-VALUE');
    const sharedAfter = await countMarkerOccurrences(outBytes, 'SHARED-VALUE');
    reportLines.push(`- Marker "SHARED-VALUE" (shared field, one widget under the box): before ${sharedBefore}, after ${sharedAfter} (dropped, but not to 0 - the OTHER widget's own appearance stream still shows it, though the field's /V is gone everywhere).`);

    const otherSharedWidget = annots.find((a) => a.fieldName === 'SharedField' && !widgetsUnderBox.includes(a));
    reportLines.push(`- The other SharedField widget (not under a box): fieldValue = ${JSON.stringify(otherSharedWidget?.fieldValue)} (expected empty - /V is field-wide, gone for both widgets); its own appearance stream still visually shows "SHARED-VALUE" though (see the marker count above) - the documented, un-cleaned-up side effect of a shared value.`);

    const linkCount = annots.filter((a) => a.annotationType === pdfjs.AnnotationType.LINK).length;
    const checkbox = annots.find((a) => a.fieldName === 'AgreeCheckbox');
    reportLines.push(`- Untouched link annotation remains: ${linkCount === 1 ? 'yes' : `NO (${linkCount})`}.`);
    reportLines.push(`- Untouched checkbox ("AgreeCheckbox", not under any box) value: ${JSON.stringify(checkbox?.fieldValue)} (expected "Yes").`);
    reportLines.push('');

    const pass = rAnnot.removed.length === 2 && rField.fields.length === 2
      && nonWidgetLeftover.length === 0 && widgetsStillHaveValue.length === 0
      && soleDropped.dropped && sharedAfter < sharedBefore
      && !otherSharedWidget?.fieldValue
      && linkCount === 1 && checkbox?.fieldValue === 'Yes';
    summary.push({ label: 'Form fields fixture (mixed-fields.pdf)', pass });
  }

  // Case 3: a widget (and a Link) on the real, 125-field USCIS I-9 form.
  // None of its 128 fields carry a value (confirmed: a fresh, unfilled
  // government template) - so this case proves the detection/removal path
  // runs correctly on a large real-world AcroForm, not value redaction.
  {
    const file = path.join(ROOT, 'spikes/red-01/corpus/real-world-uscis-i9-2025.pdf');
    const bytes0 = new Uint8Array(fs.readFileSync(file));
    const pdfDoc0 = await PDFDocument.load(bytes0, { updateMetadata: false });
    const pageNode0 = pdfDoc0.getPages()[0].node;
    const annots0 = pageNode0.lookupMaybe(PDFName.of('Annots'), PDFArray);
    const widget0 = pdfDoc0.context.lookup(annots0.get(0), PDFDict); // a /Tx widget, unfilled
    const link54 = pdfDoc0.context.lookup(annots0.get(54), PDFDict); // a /Link
    const doc0 = await pdfjs.getDocument({ data: bytes0.slice(), useSystemFonts: false }).promise;
    const page0 = await doc0.getPage(1);
    const geometry0 = pageGeometryFromPdfJsPage(page0);
    const boxA = boxPercentFromPdfRect(geometry0, rectOf(pdfDoc0.context, widget0));
    const boxB = boxPercentFromPdfRect(geometry0, rectOf(pdfDoc0.context, link54));

    const { outBytes, rAnnot, rField } = await runAnnotationsAndFields(
      'Real-world USCIS I-9 form (real-world-uscis-i9-2025.pdf) - unfilled, 125 AcroForm fields, 55 annotations on page 1',
      file, 1, [boxA, boxB],
    );
    const { annots, geometry } = await reopenPage(outBytes, 1);
    const nonWidgetLeftover = underBox(annots, geometry, [boxA, boxB], { excludeType: WIDGET });
    const widgetsUnderBox = underBox(annots, geometry, [boxA, boxB], { onlyType: WIDGET });
    reportLines.push(`- Independent re-open: ${nonWidgetLeftover.length} non-widget annotation(s) still intersect a box (expect 0).`);
    reportLines.push(`- Independent re-open: ${widgetsUnderBox.length} widget(s) remain under a box (expected - kept), all unfilled so had no value to lose: ${widgetsUnderBox.every((a) => !a.fieldValue)}.`);
    reportLines.push(`- Total annotations on page 1: 55 originally, ${rAnnot.removed.length} removed, ${annots.length} remain.`);
    reportLines.push('');
    const pass = rAnnot.removed.length === 1 && rField.fields.length === 1 && nonWidgetLeftover.length === 0 && widgetsUnderBox.length === 1 && widgetsUnderBox.every((a) => !a.fieldValue);
    summary.push({ label: 'Real-world USCIS I-9: widget + link removal on a 55-annotation page', pass });
  }

  // Case 4: a Form XObject shared across 5 pages, box on page 1 only.
  await runSharedFormCase('Shared Form XObject watermark (text-watermark-form.pdf)', path.join(ROOT, 'spikes/red-18/corpus/text-watermark-form.pdf'));

  const passCount = summary.filter((s) => s.pass).length;
  const header = [
    '# RED-18/RED-21: removing annotations, form-field values, and a shared form XObject under a box',
    '',
    `${passCount} of ${summary.length} case(s) pass.`,
    '',
    ...summary.map((s) => `- ${s.label}: ${s.pass ? 'PASS' : 'FAIL'}`),
    '',
    'Measured vs inferred:',
    '- Measured, independently of the writer, for every case: pdf.js re-opens the SAVED output fresh',
    '  (getAnnotations, not the in-memory pdf-lib state) and confirms nothing under a box remains; a',
    '  marker\'s occurrence count (raw stream bytes, decoded Tj/TJ string operands, and pdf-lib dict',
    '  strings, each counted separately - see the "Verification" section in the source) is compared',
    '  before vs after the edit, strictly dropping wherever the marker was present, never checked for',
    '  bare absence (RED-18\'s own text spike found real, unrelated recurrences elsewhere in a',
    '  real-world file that a bare-absence check would misreport as a leak).',
    '- Inferred, not proven by this corpus: that "delete only if nothing else in the live document',
    '  references it" (this file\'s deleteUnreferenced) is correct in general, beyond the one case that',
    '  actually exercised it (the I-9 form\'s Link annotation, kept because a StructTree element and a',
    '  ParentTree array both still reference it - confirmed by a direct scan, not assumed). No fixture',
    '  here has TWO annotations legitimately sharing one appearance-stream object, so that path is',
    '  exercised by the general algorithm but not by a dedicated case.',
    '- Inferred: the untouched SharedField widget\'s own appearance stream still visually renders the',
    '  now-deleted value (documented, not fixed - matches the brief\'s "remove it anyway, saying so").',
    '  A real Redact UX would need to decide whether to also blank every OTHER widget\'s appearance when',
    '  a shared field\'s value is removed; this spike only reports the gap.',
    '- Not exercised: a radio-button group (multiple widgets, one field, each with its own /AS naming a',
    '  DIFFERENT export value) - the field-value-removal logic doesn\'t special-case it, but no fixture',
    '  here has one to confirm against.',
    '',
    '---',
    '',
  ];
  fs.writeFileSync(path.join(ROOT, 'spikes/red-18/results-annotations.md'), header.join('\n') + reportLines.join('\n') + '\n');
  console.log(header.join('\n'));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
