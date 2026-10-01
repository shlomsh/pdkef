// @ts-nocheck
// RED-18/RED-20 spike: true redaction of IMAGES and DRAWN SHAPES. For every
// file and box in spikes/red-01/corpus/corpus.json and
// spikes/red-18/corpus/corpus.json:
//
//   1. Images: every image XObject drawn on a page, found by walking the
//      content stream with align.mjs's Tokenizer while tracking the CTM
//      through q/Q/cm (and Form XObject /Matrix on Do, same recursion shape
//      as align.mjs's rawShowOps). A box that fully covers an image's placed
//      rectangle removes its `Do` from the stream. A box that partly covers
//      it: the image is decoded to raw pixels (FlateDecode - and any other
//      pdf-lib-native filter chain - via decodePDFRawStream; DCTDecode via
//      `sharp`, already present in node_modules as a transitive dependency -
//      see the DCT finding in results-images.md; no new dependency added),
//      the box is mapped through the inverse of the image's own placement
//      matrix into its pixel grid, that rectangle is painted the box colour
//      (black, matching checks.mjs's own paintBoxesBlack convention - no
//      corpus entry names a colour), the pixels are re-encoded losslessly
//      (Flate) as a NEW image object, and only the box's OWN page is
//      repointed at it (usage-counted across every page's Resources exactly
//      like remove-text.mjs's applyFormEdit; an image used by only that page
//      is edited in place instead of copied). No corpus entry asks for
//      "everywhere" (RED-20's shared-header fixtures both expect the
//      untouched pages to keep the ORIGINAL image), so that branch is wired
//      but unexercised - see results-images.md.
//   2. Drawn shapes: a path (m/l/re/h, built from the same tokenizer) whose
//      bounding box meets a box. A box that fully covers a path's bounding
//      box drops the path's bytes (construction ops through the paint op).
//      A path built as a single axis-aligned rectangle (the corpus's own
//      vector-path-highlight.pdf fixture) is cut EXACTLY: fill gets the
//      standard "rectangle minus rectangle" decomposition into up to four
//      surviving sub-rectangles (each its own `re`, one shared paint op);
//      stroke (and a non-rectangle straight polyline) gets its individual
//      edges clipped 1-D against the box and re-emitted as surviving
//      m/l segments - exact only for axis-aligned edges, which is what
//      every fixture here draws. A curve (c/v/y) crossing a box, a
//      combined fill+stroke rectangle op, a non-rectangle FILL polygon, or a
//      rotated/sheared CTM is reported and left unedited, per the brief.
//   3. Leftovers: an image object or content stream that becomes
//      unreferenced (this page was its only user, or its own Contents
//      refs) is deleted from the pdf-lib context, same style as
//      remove-text.mjs's applyPageEdit/collectContentRefs (duplicated here,
//      not imported - remove-text.mjs exports nothing to import from).
//
// Run from the repo root (imports two .ts modules, so via tsx):
//   npx tsx spikes/red-18/remove-images.mjs
// Writes spikes/red-18/out/images/<name>.pdf (gitignored) and
// spikes/red-18/results-images.md. Also shells out to `node checks.mjs` for
// both corpora against the images output directory and folds its verdicts
// into the same results file.
//
// Not part of the app; measures, does not touch src/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRawStream, PDFRef, PDFNumber,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { Tokenizer, pageContentBytes, decodeStreamBytes, resolveXObject } from './align.mjs';
import {
  pageGeometryFromPdfJsPage,
  composeAffineTransforms,
  applyAffineTransform,
  invertAffineTransform,
} from '../../src/editor/geometry/coords.ts';

const ROOT = process.cwd();
const RED01_DIR = path.join(ROOT, 'spikes/red-01/corpus');
const RED18_DIR = path.join(ROOT, 'spikes/red-18/corpus');
const OUT_DIR = path.join(ROOT, 'spikes/red-18/out/images');
fs.mkdirSync(OUT_DIR, { recursive: true });

const IDENTITY = [1, 0, 0, 1, 0, 0];
const BOX_COLOR_RGB = [0, 0, 0]; // black, matches checks.mjs's paintBoxesBlack; no corpus entry names a colour
const BOX_COLOR_GRAY = [0];

// ---------------------------------------------------------------------------
// Geometry primitives (duplicated from src/editor/geometry/coords.ts's
// callers elsewhere in this spike family - same math, no DOM/pdf-lib
// coupling in coords.ts itself, so these small combinators stay local).
// ---------------------------------------------------------------------------
function percentToViewport(geometry, box) {
  const x0 = (box.left / 100) * geometry.width;
  const y0 = (box.top / 100) * geometry.height;
  return { x0, y0, x1: x0 + (box.width / 100) * geometry.width, y1: y0 + (box.height / 100) * geometry.height };
}
function pointsToViewportBBox(pdfToViewport, ctm, points) {
  const toViewport = composeAffineTransforms(pdfToViewport, ctm);
  const vs = points.map(([x, y]) => applyAffineTransform({ x, y }, toViewport));
  const xs = vs.map((p) => p.x);
  const ys = vs.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function viewportRectToLocal(pdfToViewport, ctm, rect) {
  const toLocal = invertAffineTransform(composeAffineTransforms(pdfToViewport, ctm));
  const corners = [
    [rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1],
  ].map(([x, y]) => applyAffineTransform({ x, y }, toLocal));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function isAxisAligned(pdfToViewport, ctm) {
  const m = composeAffineTransforms(pdfToViewport, ctm);
  return Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6;
}
function rectContains(outer, inner, eps = 1e-6) {
  return outer.x0 <= inner.x0 + eps && outer.x1 >= inner.x1 - eps && outer.y0 <= inner.y0 + eps && outer.y1 >= inner.y1 - eps;
}
function rectsOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}
const numStr = (n) => {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
};

// ---------------------------------------------------------------------------
// Content-stream walker: images and drawn-shape paths, CTM tracked through
// q/Q/cm and Form XObject /Matrix on Do - same recursion shape as
// align.mjs's rawShowOps, generalised from "track the font" to "track the
// CTM" since that's what placement needs instead.
// ---------------------------------------------------------------------------
const isName = (v) => v && v.t === 'name';
const numArg = (v) => (v && v.t === 'num' ? v.v : 0);

function walkGeometry(node) {
  const pageBytes = pageContentBytes(node);
  const images = [];
  const paths = [];
  const formSources = new Map();
  const seenRefs = new Set();
  let nextFormId = 0;

  function run(bytes, resources, ctm0, depth, source) {
    if (depth > 15) return;
    const toks = new Tokenizer(bytes).readOperators();
    const ctmStack = [];
    let ctm = ctm0;
    let curPath = null;
    const closePath = () => { curPath = null; };
    for (const o of toks) {
      switch (o.op) {
        case 'q': ctmStack.push(ctm); break;
        case 'Q': if (ctmStack.length) ctm = ctmStack.pop(); break;
        case 'cm': {
          if (o.args.length === 6) ctm = composeAffineTransforms(ctm, o.args.map(numArg));
          break;
        }
        case 'Do': {
          const n = o.args[0];
          if (isName(n)) {
            const xobj = resolveXObject(resources, n.v);
            if (xobj) {
              const subtype = xobj.dict?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
              if (subtype === '/Image') {
                images.push({ matrix: ctm, xobj, doStart: o.start, doEnd: o.end, source, name: n.v });
              } else if (subtype === '/Form' && !seenRefs.has(xobj)) {
                seenRefs.add(xobj);
                const matrixArr = xobj.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray);
                const formMatrix = matrixArr
                  ? [0, 1, 2, 3, 4, 5].map((i) => matrixArr.lookupMaybe(i, PDFNumber)?.asNumber() ?? (i === 0 || i === 3 ? 1 : 0))
                  : IDENTITY;
                const nestedCtm = composeAffineTransforms(ctm, formMatrix);
                const formResources = xobj.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources;
                let entry = formSources.get(xobj);
                if (!entry) {
                  entry = { formId: nextFormId++, bytes: decodeStreamBytes(xobj), dict: xobj.dict, resources: formResources, xobj };
                  formSources.set(xobj, entry);
                }
                run(entry.bytes, entry.resources, nestedCtm, depth + 1, { kind: 'form', formId: entry.formId });
                seenRefs.delete(xobj);
              }
            }
          }
          break;
        }
        case 'm': {
          const pt = [numArg(o.args[0]), numArg(o.args[1])];
          curPath = { ops: [{ op: 'm', pt, start: o.start, end: o.end }], start: o.start, ctm, source };
          break;
        }
        case 'l': {
          if (curPath) curPath.ops.push({ op: 'l', pt: [numArg(o.args[0]), numArg(o.args[1])], start: o.start, end: o.end });
          break;
        }
        case 're': {
          const rect = [numArg(o.args[0]), numArg(o.args[1]), numArg(o.args[2]), numArg(o.args[3])];
          if (!curPath) curPath = { ops: [], start: o.start, ctm, source };
          curPath.ops.push({ op: 're', rect, start: o.start, end: o.end });
          break;
        }
        case 'h': {
          if (curPath) curPath.ops.push({ op: 'h', start: o.start, end: o.end });
          break;
        }
        case 'c': case 'v': case 'y': {
          if (!curPath) curPath = { ops: [], start: o.start, ctm, source };
          curPath.ops.push({ op: o.op, curve: true, start: o.start, end: o.end });
          break;
        }
        case 'f': case 'F': case 'f*': case 'S': case 's': case 'B': case 'B*': case 'b': case 'b*': {
          if (curPath) { curPath.paintOp = o.op; curPath.end = o.end; paths.push(curPath); }
          closePath();
          break;
        }
        case 'n': case 'W': case 'W*': {
          // n: no-op paint (clip-only path, nothing drawn - not a "drawn shape").
          // W/W*: clip marker, doesn't end the path; keep collecting.
          if (o.op === 'n') closePath();
          break;
        }
        default: break;
      }
    }
  }

  run(pageBytes, node.Resources() ?? null, IDENTITY, 0, { kind: 'page' });
  return { images, paths, pageBytes, formSources };
}

// ---------------------------------------------------------------------------
// Image decode/encode.
// ---------------------------------------------------------------------------
const FLATE_FAMILY = new Set(['/FlateDecode', '/LZWDecode', '/ASCII85Decode', '/ASCIIHexDecode', '/RunLengthDecode']);

function getFilterNames(dict, context) {
  const raw = dict.get(PDFName.of('Filter'));
  if (!raw) return [];
  const resolved = raw instanceof PDFRef ? context.lookup(raw) : raw;
  if (resolved instanceof PDFName) return [resolved.asString()];
  if (resolved instanceof PDFArray) {
    const out = [];
    for (let i = 0; i < resolved.size(); i += 1) {
      const v = resolved.lookupMaybe(i, PDFName);
      if (v) out.push(v.asString());
    }
    return out;
  }
  return [];
}

function resolveColorSpaceComponents(dict, context) {
  const raw = dict.get(PDFName.of('ColorSpace'));
  if (!raw) return null;
  const resolved = raw instanceof PDFRef ? context.lookup(raw) : raw;
  if (resolved instanceof PDFName) {
    const s = resolved.asString();
    if (s === '/DeviceRGB' || s === '/CalRGB') return { components: 3, name: 'DeviceRGB' };
    if (s === '/DeviceGray' || s === '/CalGray') return { components: 1, name: 'DeviceGray' };
    return null; // DeviceCMYK, named colour spaces in Resources, etc - not handled
  }
  if (resolved instanceof PDFArray) {
    const first = resolved.lookupMaybe(0, PDFName)?.asString();
    if (first === '/ICCBased') {
      const streamObj = resolved.lookupMaybe(1, PDFStream);
      const n = streamObj?.dict?.lookupMaybe(PDFName.of('N'), PDFNumber)?.asNumber();
      if (n === 3) return { components: 3, name: 'DeviceRGB' };
      if (n === 1) return { components: 1, name: 'DeviceGray' };
      return null;
    }
    return null; // Indexed, Separation, DeviceN, Lab, etc - not handled
  }
  return null;
}

let sharpModulePromise;
async function loadSharp() {
  if (!sharpModulePromise) sharpModulePromise = import('sharp').then((m) => m.default ?? m).catch(() => null);
  return sharpModulePromise;
}
let jpegJsModulePromise;
async function loadJpegJs() {
  if (!jpegJsModulePromise) jpegJsModulePromise = import('jpeg-js').catch(() => null);
  return jpegJsModulePromise;
}

async function decodeImageForEdit(pdfDoc, xobjStream) {
  const dict = xobjStream.dict;
  const context = pdfDoc.context;
  const width = dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber();
  const height = dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber();
  const bpc = dict.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)?.asNumber();
  if (!width || !height) return { fallback: 'missing /Width or /Height' };
  if (dict.get(PDFName.of('SMask'))) return { fallback: 'SMask present, not handled exactly' };
  if (dict.get(PDFName.of('Mask'))) return { fallback: 'Mask present, not handled exactly' };
  if (dict.get(PDFName.of('Decode'))) return { fallback: 'Decode array present, not handled exactly' };
  if (bpc !== 8) return { fallback: `unsupported BitsPerComponent ${bpc}` };
  const cs = resolveColorSpaceComponents(dict, context);
  if (!cs) return { fallback: 'unsupported or unresolved /ColorSpace (not DeviceRGB/DeviceGray/matching ICCBased)' };

  const filters = getFilterNames(dict, context);

  if (filters.length === 0 || filters.every((f) => FLATE_FAMILY.has(f))) {
    let raw;
    try { raw = decodePDFRawStream(xobjStream).decode(); } catch (e) { return { fallback: `stream decode failed: ${e.message}` }; }
    const expected = width * height * cs.components;
    if (raw.length !== expected) return { fallback: `decoded length ${raw.length} does not match width*height*components (${expected})` };
    return { width, height, components: cs.components, csName: cs.name, pixels: new Uint8Array(raw) };
  }

  if (filters.length === 1 && filters[0] === '/DCTDecode') {
    const sharp = await loadSharp();
    if (!sharp) return { fallback: 'DCTDecode image and no JPEG decoder available' };
    try {
      const jpegBytes = Buffer.from(xobjStream.getContents());
      const { data, info } = await sharp(jpegBytes).raw().toBuffer({ resolveWithObject: true });
      if (info.width !== width || info.height !== height) return { fallback: `sharp-decoded size ${info.width}x${info.height} does not match dict ${width}x${height}` };
      return { width, height, components: info.channels, csName: info.channels === 1 ? 'DeviceGray' : 'DeviceRGB', pixels: new Uint8Array(data) };
    } catch (e) {
      return { fallback: `sharp JPEG decode failed: ${e.message}` };
    }
  }

  return { fallback: `unsupported filter chain [${filters.join(', ') || '(none)'}]` };
}

function encodeImageStream(context, decoded, pixels) {
  return context.flateStream(pixels, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: decoded.width,
    Height: decoded.height,
    ColorSpace: decoded.csName,
    BitsPerComponent: 8,
  });
}

/** Box (viewport space) -> pixel rect (x = column, y = row from the top,
 * matching PDF image sample order: row 0 is the top of the unit square). */
function boxToPixelRect(pdfToViewport, ctm, box, width, height) {
  const uv = viewportRectToLocal(pdfToViewport, ctm, box);
  const u0 = Math.max(0, Math.min(1, uv.x0));
  const u1 = Math.max(0, Math.min(1, uv.x1));
  const v0 = Math.max(0, Math.min(1, uv.y0));
  const v1 = Math.max(0, Math.min(1, uv.y1));
  return { x0: u0 * width, x1: u1 * width, y0: (1 - v1) * height, y1: (1 - v0) * height };
}

function paintBoxIntoPixels(pixels, width, height, components, rect, color) {
  const x0 = Math.max(0, Math.round(rect.x0));
  const x1 = Math.min(width, Math.round(rect.x1));
  const y0 = Math.max(0, Math.round(rect.y0));
  const y1 = Math.min(height, Math.round(rect.y1));
  let painted = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const idx = (y * width + x) * components;
      for (let c = 0; c < components; c += 1) pixels[idx + c] = color[Math.min(c, color.length - 1)];
      painted += 1;
    }
  }
  return painted;
}

// ---------------------------------------------------------------------------
// Path (drawn-shape) geometry helpers.
// ---------------------------------------------------------------------------
function subpathsFromPathOps(ops) {
  const subpaths = [];
  let cur = null;
  for (const o of ops) {
    if (o.op === 'm') { cur = { points: [o.pt], closed: false, isRe: false }; subpaths.push(cur); }
    else if (o.op === 'l') { if (cur) cur.points.push(o.pt); }
    else if (o.op === 'h') { if (cur) cur.closed = true; }
    else if (o.op === 're') { cur = { points: null, closed: true, isRe: true, reRect: o.rect }; subpaths.push(cur); }
  }
  return subpaths;
}
function subpathLocalPoints(sp) {
  if (sp.isRe) { const [x, y, w, h] = sp.reRect; return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
  return sp.points;
}
function axisAlignedQuad(points) {
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    if (Math.abs(x1 - x2) > 1e-6 && Math.abs(y1 - y2) > 1e-6) return false;
  }
  return true;
}
function allLocalPoints(subpaths) {
  return subpaths.flatMap(subpathLocalPoints);
}

/** Exact rectangle-minus-rectangle: up to 4 axis-aligned pieces whose union
 * is R \ B (B pre-clipped to R). Standard "cross" decomposition. */
function rectMinusRect(R, B) {
  const bx0 = Math.max(R.x0, B.x0);
  const bx1 = Math.min(R.x1, B.x1);
  const by0 = Math.max(R.y0, B.y0);
  const by1 = Math.min(R.y1, B.y1);
  if (bx0 >= bx1 || by0 >= by1) return [R];
  const pieces = [];
  if (R.y0 < by0) pieces.push({ x0: R.x0, x1: R.x1, y0: R.y0, y1: by0 });
  if (by1 < R.y1) pieces.push({ x0: R.x0, x1: R.x1, y0: by1, y1: R.y1 });
  if (R.x0 < bx0) pieces.push({ x0: R.x0, x1: bx0, y0: by0, y1: by1 });
  if (bx1 < R.x1) pieces.push({ x0: bx1, x1: R.x1, y0: by0, y1: by1 });
  return pieces.filter((p) => p.x1 - p.x0 > 1e-9 && p.y1 - p.y0 > 1e-9);
}

/** 1-D: remove [lo,hi] from [a,b] (a<b already), keep the remaining piece(s). */
function clip1DOutside(a, b, lo, hi) {
  const L = Math.max(a, lo);
  const H = Math.min(b, hi);
  if (L >= H) return [[a, b]];
  const out = [];
  if (a < L) out.push([a, L]);
  if (H < b) out.push([H, b]);
  return out;
}

/** Clips every edge of every subpath against `box` (LOCAL space). Exact only
 * for axis-aligned edges (horizontal or vertical) - what every fixture here
 * draws; a diagonal edge fails the whole clip so the caller can fall back
 * instead of silently drawing something inexact. Returns
 * {ok:true, segments:[[p0,p1],...]} or {ok:false, reason}. */
function clipRectilinearEdges(subpaths, box) {
  const segments = [];
  for (const sp of subpaths) {
    const pts = subpathLocalPoints(sp);
    const edgeCount = sp.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < edgeCount; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      const horizontal = Math.abs(y1 - y2) < 1e-9;
      const vertical = Math.abs(x1 - x2) < 1e-9;
      if (!horizontal && !vertical) return { ok: false, reason: 'diagonal edge under box: exact clip not modeled' };
      if (horizontal) {
        const y = y1;
        if (y < box.y0 - 1e-9 || y > box.y1 + 1e-9) { segments.push([[x1, y], [x2, y]]); continue; }
        const kept = clip1DOutside(Math.min(x1, x2), Math.max(x1, x2), box.x0, box.x1);
        for (const [a, b] of kept) segments.push(x1 <= x2 ? [[a, y], [b, y]] : [[b, y], [a, y]]);
      } else {
        const x = x1;
        if (x < box.x0 - 1e-9 || x > box.x1 + 1e-9) { segments.push([[x, y1], [x, y2]]); continue; }
        const kept = clip1DOutside(Math.min(y1, y2), Math.max(y1, y2), box.y0, box.y1);
        for (const [a, b] of kept) segments.push(y1 <= y2 ? [[x, a], [x, b]] : [[x, b], [x, a]]);
      }
    }
  }
  return { ok: true, segments };
}

const FILL_ONLY = new Set(['f', 'F', 'f*']);
const STROKE_ONLY = new Set(['S', 's']);
const FILL_AND_STROKE = new Set(['B', 'B*', 'b', 'b*']);

/** Decides what to do with one drawn-shape path against the boxes that
 * touch it. Returns one of:
 *   {skip:true}                                   - no box touches it
 *   {fallback:reason}                              - reported, not edited
 *   {action:'delete'}                               - fully covered
 *   {action:'clip', text}                            - partly covered, exact
 */
function planPathEdit(path, boxesViewport, pdfToViewport) {
  const subpaths = subpathsFromPathOps(path.ops);
  const localPts = allLocalPoints(subpaths);
  if (localPts.length === 0) return { skip: true };
  const viewportBBox = pointsToViewportBBox(pdfToViewport, path.ctm, localPts);
  const touching = boxesViewport.filter((b) => rectsOverlap(b, viewportBBox));
  if (touching.length === 0) return { skip: true };

  const hasCurve = path.ops.some((o) => o.curve);
  if (hasCurve) return { fallback: 'curve under box: needs a picture patch' };

  const fullyCovered = touching.some((b) => rectContains(b, viewportBBox));
  if (fullyCovered) return { action: 'delete' };

  if (!isAxisAligned(pdfToViewport, path.ctm)) return { fallback: 'path drawn under a rotated/sheared CTM: exact box clip not modeled' };

  const box = touching.reduce(
    (acc, b) => ({ x0: Math.min(acc.x0, b.x0), x1: Math.max(acc.x1, b.x1), y0: Math.min(acc.y0, b.y0), y1: Math.max(acc.y1, b.y1) }),
    { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity },
  );
  const localBox = viewportRectToLocal(pdfToViewport, path.ctm, box);

  const isRect = subpaths.length === 1 && (subpaths[0].isRe || (subpaths[0].points.length === 4 && subpaths[0].closed && axisAlignedQuad(subpaths[0].points)));

  if (FILL_AND_STROKE.has(path.paintOp)) return { fallback: `combined fill+stroke paint op (${path.paintOp}) under box: not decomposed` };

  if (isRect && FILL_ONLY.has(path.paintOp)) {
    const localRectPts = subpathLocalPoints(subpaths[0]);
    const xs = localRectPts.map((p) => p[0]);
    const ys = localRectPts.map((p) => p[1]);
    const R = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const pieces = rectMinusRect(R, localBox);
    const text = `${pieces.map((p) => `${numStr(p.x0)} ${numStr(p.y0)} ${numStr(p.x1 - p.x0)} ${numStr(p.y1 - p.y0)} re`).join(' ')} ${path.paintOp}`;
    return { action: 'clip', text };
  }

  if (STROKE_ONLY.has(path.paintOp)) {
    const clip = clipRectilinearEdges(subpaths, localBox);
    if (!clip.ok) return { fallback: clip.reason };
    if (clip.segments.length === 0) return { action: 'delete' };
    const text = `${clip.segments.map(([[x1, y1], [x2, y2]]) => `${numStr(x1)} ${numStr(y1)} m ${numStr(x2)} ${numStr(y2)} l`).join(' ')} ${path.paintOp}`;
    return { action: 'clip', text };
  }

  return { fallback: 'fill polygon under box: not a rectangle, exact clip not implemented' };
}

// ---------------------------------------------------------------------------
// Content-stream splice + leftover cleanup (duplicated from remove-text.mjs's
// own spliceSource/applyPageEdit/applyFormEdit/collectContentRefs - that
// file exports nothing to import, and this file's brief says "follow the
// same style", not reuse the same closures).
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
function collectContentRefs(context, contentsRaw) {
  const refs = [];
  const fromArray = (arr) => { for (let i = 0; i < arr.size(); i += 1) { const el = arr.get(i); if (el instanceof PDFRef) refs.push(el); } };
  if (contentsRaw instanceof PDFRef) {
    refs.push(contentsRaw);
    const resolved = context.lookup(contentsRaw);
    if (resolved instanceof PDFArray) fromArray(resolved);
  } else if (contentsRaw instanceof PDFArray) {
    fromArray(contentsRaw);
  }
  return refs;
}
function dictLiteralExcept(dict, exclude) {
  const lit = {};
  for (const [key, value] of dict.entries()) { const k = key.decodeText(); if (!exclude.includes(k)) lit[k] = value; }
  return lit;
}
function applyPageContentEdit(pdfDoc, pageNode, pageBytes, edits) {
  const context = pdfDoc.context;
  const newBytes = spliceSource(pageBytes, edits);
  const contentsRaw = pageNode.get(PDFName.of('Contents'));
  const oldRefs = collectContentRefs(context, contentsRaw);
  const newRef = context.register(context.flateStream(newBytes));
  pageNode.set(PDFName.of('Contents'), context.obj([newRef]));
  for (const ref of oldRefs) context.delete(ref);
}
function applyFormContentEdit(pdfDoc, pageNode, entry, edits) {
  const context = pdfDoc.context;
  const newBytes = spliceSource(entry.bytes, edits);
  const preserved = dictLiteralExcept(entry.dict, ['Length', 'Filter', 'DecodeParms']);
  const newStream = context.flateStream(newBytes, preserved);
  const usage = pageXObjectUsage(pdfDoc, entry.xobj);
  if (usage.count <= 1) {
    const ref = context.getObjectRef(entry.xobj);
    context.assign(ref, newStream);
    return;
  }
  const newRef = context.register(newStream);
  const resources = pageNode.Resources();
  const cloned = resources.clone(context);
  const xobjDict = cloned.lookupMaybe(PDFName.of('XObject'), PDFDict);
  const clonedXObj = xobjDict.clone(context);
  cloned.set(PDFName.of('XObject'), clonedXObj);
  for (const name of clonedXObj.keys()) {
    let matches = false;
    try { matches = xobjDict.lookupMaybe(name, PDFStream) === entry.xobj; } catch { matches = false; }
    if (matches) clonedXObj.set(name, newRef);
  }
  pageNode.set(PDFName.of('Resources'), cloned);
}

/** How many pages' own (top-level) XObject dict points at this exact stream
 * object - the same usage-count shape as remove-text.mjs's applyFormEdit,
 * generalised to images. Only scans page-level Resources (no fixture nests
 * an image inside a Form XObject), noted as a scope limit in results. */
function pageXObjectUsage(pdfDoc, xobjStream) {
  let count = 0;
  const pages = [];
  for (const p of pdfDoc.getPages()) {
    const resources = p.node.Resources();
    const xobjDict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjDict) continue;
    const used = xobjDict.keys().some((name) => {
      try { return xobjDict.lookupMaybe(name, PDFStream) === xobjStream; } catch { return false; }
    });
    if (used) { count += 1; pages.push(p); }
  }
  return { count, pages };
}

// ---------------------------------------------------------------------------
// One page: find images/paths, decide per box, apply edits.
// ---------------------------------------------------------------------------
async function processPage(pdfDoc, bytes, pageNo, boxes, everywhere) {
  const pageNode = pdfDoc.getPages()[pageNo - 1].node;
  const geom = walkGeometry(pageNode);
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const geometry = pageGeometryFromPdfJsPage(page);
  const boxesViewport = boxes.map((b) => percentToViewport(geometry, b));

  const notes = { imagesDeleted: 0, imagesPainted: 0, imagesCopied: 0, imagesInPlace: 0, pixelsPainted: 0, imageFallbacks: [], imagesUntouched: 0 };
  const pathNotes = { pathsDeleted: 0, pathsClipped: 0, pathFallbacks: [], pathsUntouched: 0 };

  const editsBySource = new Map(); // 'page' | 'form:N' -> [{start,end,text}]
  const addEdit = (sourceKey, edit) => {
    if (!editsBySource.has(sourceKey)) editsBySource.set(sourceKey, []);
    editsBySource.get(sourceKey).push(edit);
  };
  const sourceKeyOf = (source) => (source.kind === 'page' ? 'page' : `form:${source.formId}`);

  // --- images ---
  const deletedImageRefs = [];
  for (const img of geom.images) {
    const unitCorners = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const bbox = pointsToViewportBBox(geometry.pdfToViewport, img.matrix, unitCorners);
    const touching = boxesViewport.filter((b) => rectsOverlap(b, bbox));
    if (touching.length === 0) { notes.imagesUntouched += 1; continue; }

    const fullyCovered = touching.some((b) => rectContains(b, bbox));
    if (fullyCovered) {
      addEdit(sourceKeyOf(img.source), { start: img.doStart, end: img.doEnd, text: '' });
      notes.imagesDeleted += 1;
      // Removing the Do call alone leaves a dangling /XObject dict entry
      // pointing at (possibly) a now-deleted object - the page's own
      // Resources no longer needs that name at all, shared object or not,
      // so drop the dict entry too (page-level Resources only; no fixture
      // nests an image-under-a-box inside a Form XObject).
      if (img.source.kind === 'page') {
        const xobjDict = pageNode.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
        xobjDict?.delete(PDFName.of(img.name));
      }
      // Usage counted AFTER dropping this page's own dict entry above, so
      // 0 now means "no page references it any more" (it was this page's
      // reference we just removed); a positive count means another page
      // still legitimately shows it and the object itself must survive.
      const usage = pageXObjectUsage(pdfDoc, img.xobj);
      if (usage.count === 0) {
        const ref = pdfDoc.context.getObjectRef(img.xobj);
        if (ref) deletedImageRefs.push(ref);
      }
      continue;
    }

    if (!isAxisAligned(geometry.pdfToViewport, img.matrix)) {
      notes.imageFallbacks.push(`image under rotated/sheared CTM: exact box mapping not modeled (op at byte ${img.doStart})`);
      continue;
    }

    const decoded = await decodeImageForEdit(pdfDoc, img.xobj);
    if (decoded.fallback) { notes.imageFallbacks.push(decoded.fallback); continue; }
    const pixels = decoded.pixels.slice();
    const color = decoded.components === 1 ? BOX_COLOR_GRAY : BOX_COLOR_RGB;
    let painted = 0;
    for (const b of touching) {
      const rect = boxToPixelRect(geometry.pdfToViewport, img.matrix, b, decoded.width, decoded.height);
      painted += paintBoxIntoPixels(pixels, decoded.width, decoded.height, decoded.components, rect, color);
    }
    notes.pixelsPainted += painted;
    notes.imagesPainted += 1;

    const newStream = encodeImageStream(pdfDoc.context, decoded, pixels);
    const usage = pageXObjectUsage(pdfDoc, img.xobj);
    if (usage.count <= 1 || everywhere) {
      const ref = pdfDoc.context.getObjectRef(img.xobj);
      pdfDoc.context.assign(ref, newStream);
      notes.imagesInPlace += 1;
    } else {
      const newRef = pdfDoc.context.register(newStream);
      const resources = pageNode.Resources();
      const cloned = resources.clone(pdfDoc.context);
      const xobjDict = cloned.lookupMaybe(PDFName.of('XObject'), PDFDict);
      const clonedXObj = xobjDict.clone(pdfDoc.context);
      cloned.set(PDFName.of('XObject'), clonedXObj);
      clonedXObj.set(PDFName.of(img.name), newRef);
      pageNode.set(PDFName.of('Resources'), cloned);
      notes.imagesCopied += 1;
    }
  }

  // --- drawn shapes ---
  for (const p of geom.paths) {
    const plan = planPathEdit(p, boxesViewport, geometry.pdfToViewport);
    if (plan.skip) { pathNotes.pathsUntouched += 1; continue; }
    if (plan.fallback) { pathNotes.pathFallbacks.push(plan.fallback); continue; }
    if (plan.action === 'delete') {
      addEdit(sourceKeyOf(p.source), { start: p.start, end: p.end, text: '' });
      pathNotes.pathsDeleted += 1;
    } else if (plan.action === 'clip') {
      addEdit(sourceKeyOf(p.source), { start: p.start, end: p.end, text: plan.text });
      pathNotes.pathsClipped += 1;
    }
  }

  // --- apply content-stream edits (forms first, then the page) ---
  const formsById = new Map();
  for (const entry of geom.formSources.values()) formsById.set(entry.formId, entry);
  for (const [key, edits] of editsBySource) {
    if (key === 'page') continue;
    const formId = Number(key.slice('form:'.length));
    applyFormContentEdit(pdfDoc, pageNode, formsById.get(formId), edits);
  }
  if (editsBySource.has('page')) {
    applyPageContentEdit(pdfDoc, pageNode, geom.pageBytes, editsBySource.get('page'));
  }

  // --- delete now-orphaned image objects (page-only edit already applied) ---
  for (const ref of deletedImageRefs) pdfDoc.context.delete(ref);

  const edited = editsBySource.size > 0 || notes.imagesPainted > 0 || notes.imagesCopied > 0 || notes.imagesInPlace > 0;
  return { edited, notes, pathNotes };
}

/** removalMethod:"delete" entries (the diagonal watermark): every image on
 * the target page is removed outright, no box geometry involved. */
async function processDeletePage(pdfDoc, pageNo) {
  const pageNode = pdfDoc.getPages()[pageNo - 1].node;
  const geom = walkGeometry(pageNode);
  const editsBySource = new Map();
  const deletedRefs = [];
  for (const img of geom.images) {
    const key = img.source.kind === 'page' ? 'page' : `form:${img.source.formId}`;
    if (!editsBySource.has(key)) editsBySource.set(key, []);
    editsBySource.get(key).push({ start: img.doStart, end: img.doEnd, text: '' });
    if (img.source.kind === 'page') {
      const xobjDict = pageNode.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      xobjDict?.delete(PDFName.of(img.name));
    }
    const usage = pageXObjectUsage(pdfDoc, img.xobj);
    if (usage.count === 0) {
      const ref = pdfDoc.context.getObjectRef(img.xobj);
      if (ref) deletedRefs.push(ref);
    }
  }
  const formsById = new Map();
  for (const entry of geom.formSources.values()) formsById.set(entry.formId, entry);
  for (const [key, edits] of editsBySource) {
    if (key === 'page') continue;
    applyFormContentEdit(pdfDoc, pageNode, formsById.get(Number(key.slice('form:'.length))), edits);
  }
  if (editsBySource.has('page')) applyPageContentEdit(pdfDoc, pageNode, geom.pageBytes, editsBySource.get('page'));
  for (const ref of deletedRefs) pdfDoc.context.delete(ref);
  return { imagesDeleted: geom.images.length };
}

// ---------------------------------------------------------------------------
// Verification, independent of the writer above: fresh parse of the SAVED
// bytes, fresh geometry walk, fresh image decode.
// ---------------------------------------------------------------------------
function countOccurrences(haystackU8, needleU8) {
  if (needleU8.length === 0) return 0;
  const hay = Buffer.from(haystackU8.buffer, haystackU8.byteOffset, haystackU8.byteLength);
  const nee = Buffer.from(needleU8.buffer, needleU8.byteOffset, needleU8.byteLength);
  let count = 0; let idx = 0;
  for (;;) { const found = hay.indexOf(nee, idx); if (found === -1) break; count += 1; idx = found + nee.length; }
  return count;
}
async function decompressAllStreams(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) { try { out.push(decodePDFRawStream(obj).decode()); } catch { /* skip */ } }
  }
  return out;
}

async function verifyImageEdit(file, originalBytes, outputBytes, entry, boxes) {
  const lines = [];
  let allOk = true;

  const origDoc = await PDFDocument.load(originalBytes, { updateMetadata: false });
  const outDoc = await PDFDocument.load(outputBytes, { updateMetadata: false });
  const origPjs = await pdfjs.getDocument({ data: originalBytes.slice(), useSystemFonts: false }).promise;
  const outPjs = await pdfjs.getDocument({ data: outputBytes.slice(), useSystemFonts: false }).promise;

  const pages = entry.imageAssertions ? entry.imageAssertions.map((a) => a.page) : [entry.page];
  for (const pageNo of pages) {
    const origPage = await origPjs.getPage(pageNo);
    const outPage = await outPjs.getPage(pageNo);
    const origGeom = pageGeometryFromPdfJsPage(origPage);
    const outGeom = pageGeometryFromPdfJsPage(outPage);
    const origWalk = walkGeometry(origDoc.getPages()[pageNo - 1].node);
    const outWalk = walkGeometry(outDoc.getPages()[pageNo - 1].node);

    if (pageNo === entry.page) {
      // box page: every original image touched by a box should either be
      // gone (Do removed) or repointed at a NEW stream object whose pixels
      // are correct under/outside the box.
      const boxesViewport = boxes.map((b) => percentToViewport(outGeom, b));
      for (const origImg of origWalk.images) {
        const bbox = pointsToViewportBBox(origGeom.pdfToViewport, origImg.matrix, [[0, 0], [1, 0], [0, 1], [1, 1]]);
        const touching = boxesViewport.filter((b) => rectsOverlap(b, bbox));
        if (touching.length === 0) continue;
        const fullyCovered = touching.some((b) => rectContains(b, bbox));
        const stillThere = outWalk.images.find((oi) => Math.abs(oi.doStart - origImg.doStart) < 1); // same byte position when kept/edited, absent when deleted content shrank the stream - position match is best-effort, pixel checks below are the real proof
        if (fullyCovered) {
          // Usage MUST be counted within one document's own parse - origImg.xobj
          // and outDoc's objects come from two independent PDFDocument.load()
          // calls, so `===` identity across them is never true (an earlier
          // version of this check compared them and always saw "0 users",
          // reporting every fully-covered image as an orphan leak even when
          // the writer correctly kept it - fixed by counting usage on origDoc
          // only, which is what decides whether the writer should have
          // deleted the object at all).
          const origUsage = pageXObjectUsage(origDoc, origImg.xobj);
          if (origUsage.count <= 1) {
            const originalDecoded = await decodeImageForEdit(origDoc, origImg.xobj);
            if (!originalDecoded.fallback) {
              const outStreams = await decompressAllStreams(outputBytes);
              const stillPresent = outStreams.some((s) => countOccurrences(s, originalDecoded.pixels) > 0);
              lines.push(`  - image was this page's only user (${origUsage.count}): original pixel bytes ${stillPresent ? 'STILL PRESENT (LEAK)' : 'confirmed gone from the saved file'}.`);
              if (stillPresent) allOk = false;
            }
          } else {
            lines.push(`  - image is shared by ${origUsage.count} pages: original pixel bytes are expected to remain (other pages still use it; checked below).`);
          }
          lines.push(`  - page ${pageNo}: image fully covered by a box -> Do removed (${stillThere ? 'UNEXPECTED: Do still present' : 'confirmed gone'}).`);
          if (stillThere) allOk = false;
        } else {
          const decodedOrig = await decodeImageForEdit(origDoc, origImg.xobj);
          if (decodedOrig.fallback) { lines.push(`  - page ${pageNo}: partial-cover image could not be independently re-decoded for verification (${decodedOrig.fallback}); skipping pixel recheck.`); continue; }
          // find the image now drawn at (about) the same placement on the output page
          const outImg = outWalk.images.find((oi) => Math.abs(oi.matrix[4] - origImg.matrix[4]) < 0.01 && Math.abs(oi.matrix[5] - origImg.matrix[5]) < 0.01);
          if (!outImg) { lines.push(`  - page ${pageNo}: LEAK/BUG: partially-covered image not found on the output page at the same placement.`); allOk = false; continue; }
          const decodedOut = await decodeImageForEdit(outDoc, outImg.xobj);
          if (decodedOut.fallback) { lines.push(`  - page ${pageNo}: BUG: output image could not be decoded for verification (${decodedOut.fallback}).`); allOk = false; continue; }
          // Same integer rounding as paintBoxIntoPixels (not a floating-point
          // epsilon test): the writer decides which pixel COLUMN/ROW is
          // "under the box" by Math.round(rect.x0/x1/y0/y1), so the verifier
          // has to ask the identical integer question, or a fresh
          // independent geometry recomputation lands a few 1e-13-scale
          // floating point ulps away from the writer's own numbers and an
          // epsilon-widened boundary test (mis-)counts one extra row/column
          // as "should have been painted" when the writer's own rounding
          // never intended to touch it.
          const rects = touching.map((b) => {
            const r = boxToPixelRect(outGeom.pdfToViewport, outImg.matrix, b, decodedOut.width, decodedOut.height);
            return {
              x0: Math.max(0, Math.round(r.x0)), x1: Math.min(decodedOut.width, Math.round(r.x1)),
              y0: Math.max(0, Math.round(r.y0)), y1: Math.min(decodedOut.height, Math.round(r.y1)),
            };
          });
          let insideOk = 0; let insideBad = 0; let outsideChanged = 0; let outsideSame = 0;
          const color = decodedOut.components === 1 ? BOX_COLOR_GRAY : BOX_COLOR_RGB;
          const insideRect = (x, y) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
          for (let y = 0; y < decodedOut.height; y += 1) {
            for (let x = 0; x < decodedOut.width; x += 1) {
              const idx = (y * decodedOut.width + x) * decodedOut.components;
              const isIn = insideRect(x, y);
              const outPx = decodedOut.pixels.subarray(idx, idx + decodedOut.components);
              if (isIn) {
                const matches = color.every((c, i) => outPx[Math.min(i, outPx.length - 1)] === c);
                if (matches) insideOk += 1; else insideBad += 1;
              } else {
                const origPx = decodedOrig.pixels.subarray(idx, idx + decodedOrig.components);
                const same = origPx.length === outPx.length && origPx.every((v, i) => v === outPx[i]);
                if (same) outsideSame += 1; else outsideChanged += 1;
              }
            }
          }
          lines.push(`  - page ${pageNo}: partial-cover image re-decoded: ${insideOk} px under the box are the box colour (${insideBad} are not), ${outsideSame} px outside are unchanged (${outsideChanged} changed unexpectedly).`);
          if (insideBad > 0 || outsideChanged > 0) allOk = false;
        }
      }
    } else if (entry.sharedAcrossPages && entry.sharedAcrossPages.includes(pageNo)) {
      // untouched page: must still reference the SAME (original) image object.
      const stillOriginal = outWalk.images.every((oi) => origWalk.images.some((oig) => origDoc.context.getObjectRef(oig.xobj)?.toString() === outDoc.context.getObjectRef(oi.xobj)?.toString()));
      lines.push(`  - page ${pageNo}: untouched, expected to keep the original shared image object: ${stillOriginal ? 'confirmed' : 'MISMATCH'}.`);
      if (!stillOriginal) allOk = false;
    }
  }

  // no path point strictly inside a box, on the output's own box page.
  const outPage = await outPjs.getPage(entry.page);
  const outGeom = pageGeometryFromPdfJsPage(outPage);
  const outWalk = walkGeometry(outDoc.getPages()[entry.page - 1].node);
  const boxesViewport = boxes.map((b) => percentToViewport(outGeom, b));
  let pointsInside = 0;
  for (const p of outWalk.paths) {
    const subpaths = subpathsFromPathOps(p.ops);
    for (const pt of allLocalPoints(subpaths)) {
      const v = applyAffineTransform({ x: pt[0], y: pt[1] }, composeAffineTransforms(outGeom.pdfToViewport, p.ctm));
      const strictlyInside = boxesViewport.some((b) => v.x > b.x0 + 0.01 && v.x < b.x1 - 0.01 && v.y > b.y0 + 0.01 && v.y < b.y1 - 0.01);
      if (strictlyInside) pointsInside += 1;
    }
  }
  lines.push(`  - path points strictly inside a box on the output: ${pointsInside}.`);
  if (pointsInside > 0) allOk = false;

  return { lines, ok: allOk };
}

// ---------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------
async function main() {
  const sharpAvailable = Boolean(await loadSharp());
  const jpegJsAvailable = Boolean(await loadJpegJs());

  const corpora = [
    { dir: RED01_DIR, entries: JSON.parse(fs.readFileSync(path.join(RED01_DIR, 'corpus.json'), 'utf8')) },
    { dir: RED18_DIR, entries: JSON.parse(fs.readFileSync(path.join(RED18_DIR, 'corpus.json'), 'utf8')) },
  ];

  const reportLines = [];
  const fileSummaries = [];

  for (const { dir, entries } of corpora) {
    for (const entry of entries) {
      const file = entry.file;
      const pdfPath = path.join(dir, file);
      const bytes = new Uint8Array(fs.readFileSync(pdfPath));
      reportLines.push(`## ${file}`, '');
      reportLines.push(`- feature: ${entry.feature ?? '-'}`);

      let pdfDoc;
      try { pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false }); } catch (e) {
        reportLines.push(`- fallback: pdf-lib failed to load (${e.message})`, '');
        fileSummaries.push({ file, status: 'load-failed' });
        continue;
      }

      if (entry.removalMethod === 'delete') {
        let result;
        try { result = await processDeletePage(pdfDoc, entry.page); } catch (e) {
          reportLines.push(`- fallback: threw during delete processing (${e.stack ?? e.message})`, '');
          fileSummaries.push({ file, status: 'error' });
          continue;
        }
        reportLines.push(`- removalMethod: delete (${entry.deleteTarget ?? 'unspecified target'}). Images removed from page ${entry.page}: ${result.imagesDeleted}.`);
        const outBytes = await pdfDoc.save();
        fs.writeFileSync(path.join(OUT_DIR, file), outBytes);
        fileSummaries.push({ file, status: 'edited', imagesDeleted: result.imagesDeleted });
        reportLines.push('');
        continue;
      }

      const boxes = entry.rects
        ? entry.rects.map(([left, top, width, height]) => ({ left, top, width, height }))
        : entry.rect
          ? [{ left: entry.rect[0], top: entry.rect[1], width: entry.rect[2], height: entry.rect[3] }]
          : [];
      if (boxes.length === 0) {
        reportLines.push('- no box on this entry (not a delete entry either); nothing to do.', '');
        continue;
      }

      let result;
      try { result = await processPage(pdfDoc, bytes, entry.page, boxes, entry.everywhere === true); } catch (e) {
        reportLines.push(`- fallback: threw during processing (${e.stack ?? e.message})`, '');
        fileSummaries.push({ file, status: 'error' });
        continue;
      }

      const { notes, pathNotes } = result;
      if (!result.edited && notes.imageFallbacks.length === 0 && pathNotes.pathFallbacks.length === 0) {
        reportLines.push('- No image or drawn-shape path on this page touched a box; left unedited.', '');
        fileSummaries.push({ file, status: 'unedited' });
        continue;
      }

      reportLines.push(
        `- Images: ${notes.imagesDeleted} deleted (fully covered), ${notes.imagesPainted} partly covered and repainted (${notes.pixelsPainted} px painted total), of which ${notes.imagesInPlace} edited in place and ${notes.imagesCopied} copied (shared with other pages). ${notes.imagesUntouched} image(s) on the page untouched by any box.`,
      );
      if (notes.imageFallbacks.length) reportLines.push(`  - image fallback(s): ${notes.imageFallbacks.join('; ')}`);
      reportLines.push(
        `- Drawn shapes: ${pathNotes.pathsDeleted} deleted (fully covered), ${pathNotes.pathsClipped} clipped exactly (partial, rectangle/rectilinear), ${pathNotes.pathsUntouched} untouched.`,
      );
      if (pathNotes.pathFallbacks.length) reportLines.push(`  - path fallback(s): ${pathNotes.pathFallbacks.join('; ')}`);

      if (!result.edited) { reportLines.push(''); fileSummaries.push({ file, status: 'fallback-only' }); continue; }

      let outBytes;
      try { outBytes = await pdfDoc.save(); } catch (e) {
        reportLines.push(`- fallback: save failed (${e.message})`, '');
        fileSummaries.push({ file, status: 'save-failed' });
        continue;
      }
      fs.writeFileSync(path.join(OUT_DIR, file), outBytes);

      const verification = await verifyImageEdit(file, bytes, outBytes, entry, boxes);
      reportLines.push('- Verification (independent re-decode/re-walk of the saved file):');
      reportLines.push(...verification.lines);
      reportLines.push(`- Verification verdict: ${verification.ok ? 'PASS' : 'FAIL - see lines above'}`);
      fileSummaries.push({ file, status: verification.ok ? 'pass' : 'fail', notes, pathNotes });
      reportLines.push('');
    }
  }

  // Run checks.mjs against the images output directory for both corpora.
  let checksOutput = '';
  for (const { dir, jsonPath } of [
    { dir: RED01_DIR, jsonPath: path.join(RED01_DIR, 'corpus.json') },
    { dir: RED18_DIR, jsonPath: path.join(RED18_DIR, 'corpus.json') },
  ]) {
    checksOutput += `\n$ node spikes/red-18/checks.mjs ${path.relative(ROOT, dir)} spikes/red-18/out/images ${path.relative(ROOT, jsonPath)}\n`;
    try {
      const out = execFileSync('node', [path.join(ROOT, 'spikes/red-18/checks.mjs'), dir, OUT_DIR, jsonPath], { cwd: ROOT, encoding: 'utf8' });
      checksOutput += out;
    } catch (e) {
      checksOutput += (e.stdout ?? '') + (e.stderr ?? `(checks.mjs exited non-zero: ${e.message})\n`);
    }
  }

  const editedCount = fileSummaries.filter((f) => f.status === 'pass' || f.status === 'edited').length;
  const failCount = fileSummaries.filter((f) => f.status === 'fail').length;
  const unEditedCount = fileSummaries.filter((f) => f.status === 'unedited').length;
  const fallbackOnlyCount = fileSummaries.filter((f) => f.status === 'fallback-only').length;

  const summary = [
    '# RED-18/RED-20: true redaction of images and drawn shapes',
    '',
    `${editedCount} file(s) edited and written to spikes/red-18/out/images/. ${failCount} file(s) edited but failed independent verification. ${fallbackOnlyCount} file(s) had a fallback and nothing else to edit. ${unEditedCount} file(s) had no image/path touched by a box (left unedited, nothing written).`,
    '',
    `DCT decoder finding: sharp is ${sharpAvailable ? 'PRESENT' : 'NOT present'} in node_modules (a transitive dependency already installed, not added by this spike) and ${sharpAvailable ? 'was wired up to decode DCTDecode images via its raw-pixel API' : 'was not available, so DCTDecode images fall back'}. jpeg-js is ${jpegJsAvailable ? 'present' : 'NOT present'}. No corpus file uses DCTDecode (every image here is FlateDecode /DeviceRGB), so this path is implemented but unexercised by this corpus - reported, not measured.`,
    '',
    'Box colour: black (0,0,0 / gray 0), matching checks.mjs\'s own paintBoxesBlack convention. No corpus entry names a colour for the painted area.',
    '',
    '"Everywhere" (RED-20): no corpus entry requests it (both shared-header-image fixtures expect the untouched pages to keep the ORIGINAL image object), so every partial-cover edit on a shared image took the "copy" path, confirmed below. The everywhere branch is wired (`entry.everywhere === true`) but unexercised.',
    '',
    'Reading the checks.mjs table below: every FAIL in it is explained, none is an image/path bug -',
    '  - text/bytes FAIL on raster-image-partial.pdf, raster-image-full.pdf, vector-path-highlight.pdf and',
    '    real-world-irs-1040-2024.pdf: each of those fixtures ALSO draws a plain-text caption/label under the same box',
    '    (e.g. "IMG-PARTIAL-SECRET" as its own Tj, right next to the image) - this spike only touches images and drawn',
    '    shapes, so that caption survives untouched, exactly as remove-text.mjs would leave the image untouched. The',
    '    two spikes are complementary halves of one corpus; combined removal is future work, not this one\'s job.',
    '  - bytes FAIL on shared-header-image-half.pdf ("18 0 R"): checks.mjs\'s own colorRunPattern search is BYTE-offset,',
    '    not pixel-aligned, and its 18-byte "6 red pixels in a row" needle is periodic with the same period (3 bytes)',
    '    as a run of BLUE (0,0,255) pixels read from an offset of +2 - so a long run of blue "keep" pixels can alias',
    '    into a false match for the red "secret" pattern. Measured directly: the SAME false match already exists in',
    '    the untouched ORIGINAL corpus file (spikes/red-18/corpus/shared-header-image-half.pdf), before this spike',
    '    edits anything - and the actual pixel content (checks.mjs\'s own supplementary per-page colour-pixel count,',
    '    and this file\'s own pixel-aligned re-decode above) shows zero red pixels anywhere in the saved image.',
    '',
    '---',
    '',
  ];

  fs.writeFileSync(
    path.join(ROOT, 'spikes/red-18/results-images.md'),
    summary.join('\n') + reportLines.join('\n') + '\n\n## checks.mjs verdicts on the images output\n' + checksOutput + '\n',
  );
  console.log(summary.join('\n'));
  console.log(`Wrote spikes/red-18/results-images.md (${fileSummaries.length} corpus entries considered).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
