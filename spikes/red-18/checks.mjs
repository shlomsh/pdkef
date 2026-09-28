// RED-18 spike: four independent checks for "true" (content-level) redaction,
// each looking at the saved output from a different angle so a bug in one
// removal path can't hide from all of them at once:
//
//   1. pixels       - render original-with-boxes-painted vs. the output with
//                      pdf.js, and diff everywhere OUTSIDE the boxes (proves
//                      nothing unrelated moved or changed).
//   2. text         - pdf.js getTextContent() word multiset: output words
//                      must equal original words minus exactly the words
//                      whose own rendered box intersects a redaction box.
//   3. bytes        - decompress every stream pdf-lib finds in the output
//                      file (including objects the page tree no longer
//                      reaches - pdf-lib's loader keeps them once parsed),
//                      and look for the removed secret text (literal and
//                      hex-Tj forms) or the touched image's own pixel colors
//                      surviving where they shouldn't: in an object the
//                      current page tree can't reach at all (an orphaned
//                      leftover), or in an object the REDACTED page itself
//                      can still reach (the redaction simply missed).
//                      A shared object still reachable from an UN-boxed page
//                      (e.g. the watermark on pages 2-5 of a 5-page corpus
//                      entry) is not a leak - that's the correct "everywhere
//                      nobody drew a box, keep it exactly as it was".
//   4. annotations  - no annotation left on the box's page whose /Rect
//                      intersects a redaction box.
//
// corpus.json entries are a superset of spikes/red-01/corpus/corpus.json's
// shape:
//   file, page, rect ([left,top,width,height] in %, top-left origin, or
//     null for a "delete, not a box" fixture), removalMethod ("box" |
//     "delete"), secret, keepText, feature                        (RED-01)
//   rects/secrets (parallel arrays, RED-01's two-boxes-one-line.pdf)
//   annotationOnly, annotationSubtype  - secret lives only in an annotation,
//     never in getTextContent()
//   imageSecretColor, imageKeepColor, imageAssertions - per-page expected
//     color-pixel counts (supplementary to the 4 required checks, printed
//     separately), same convention as spikes/red-01/check-images.mjs
//   sharedAcrossPages - other pages using the SAME shared object/content
//     that must come through untouched
//   deleteTarget - human description for a removalMethod:"delete" entry
//
// Usage:
//   node checks.mjs <originalDir> <outputDir> <corpus.json> [fileName]
//
// <originalDir>/<file> is the untouched corpus fixture; <outputDir>/<file>
// is that same file after whatever redaction engine ran. With no
// [fileName], runs over every corpus entry that exists in both dirs.
import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PDFDocument,
  PDFRawStream,
  PDFDict,
  PDFArray,
  PDFRef,
  PDFName,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';

// ---------------------------------------------------------------------------
// pdf.js geometry helpers (top-left-origin %, same convention throughout
// this repo's redaction spikes: src/editor/geometry/coords.ts).
// ---------------------------------------------------------------------------
function applyMatrix([a, b, c, d, e, f], x, y) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function itemPdfSpaceBBox(item) {
  const [a, b, c, d, e, f] = item.transform;
  const abLen = Math.hypot(a, b) || 1;
  const cdLen = Math.hypot(c, d) || 1;
  const ux = a / abLen;
  const uy = b / abLen;
  const vx = c / cdLen;
  const vy = d / cdLen;
  const w = item.width;
  const h = item.height || cdLen || 1;
  const corner = (u, v) => ({ x: e + ux * u + vx * v, y: f + uy * u + vy * v });
  const corners = [corner(0, 0), corner(w, 0), corner(0, h), corner(w, h)];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function pdfBBoxToPercent(bbox, viewport) {
  const [a, b, c, d, e, f] = viewport.transform;
  const corners = [
    applyMatrix([a, b, c, d, e, f], bbox.minX, bbox.minY),
    applyMatrix([a, b, c, d, e, f], bbox.maxX, bbox.minY),
    applyMatrix([a, b, c, d, e, f], bbox.minX, bbox.maxY),
    applyMatrix([a, b, c, d, e, f], bbox.maxX, bbox.maxY),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const left = clamp(Math.min(...xs), 0, viewport.width);
  const top = clamp(Math.min(...ys), 0, viewport.height);
  const right = clamp(Math.max(...xs), 0, viewport.width);
  const bottom = clamp(Math.max(...ys), 0, viewport.height);
  return {
    left: (left / viewport.width) * 100,
    top: (top / viewport.height) * 100,
    width: ((right - left) / viewport.width) * 100,
    height: ((bottom - top) / viewport.height) * 100,
  };
}

function rectsIntersect(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

async function loadPdf(bytes) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false });
  return loadingTask.promise;
}

async function pageWords(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent();
  const items = content.items.map((it) => ({ str: it.str, rect: pdfBBoxToPercent(itemPdfSpaceBBox(it), viewport) }));
  return items;
}

function tokenize(str) {
  return str.split(/\s+/).filter(Boolean);
}

function multiset(words) {
  const m = new Map();
  for (const w of words) m.set(w, (m.get(w) || 0) + 1);
  return m;
}

function subtractMultiset(a, b) {
  const out = new Map();
  for (const [w, c] of a) {
    const rem = c - (b.get(w) || 0);
    if (rem > 0) out.set(w, rem);
  }
  return out;
}

function fmtMultiset(m) {
  return [...m.entries()].map(([w, c]) => (c > 1 ? `${w} x${c}` : w)).join(', ');
}

// ---------------------------------------------------------------------------
// Check 2: text. Per page, "words under the box" = the tokens of that box's
// OWN declared secret (corpus.json's `secret`/`secrets`, already exact by
// construction: every fixture's box is built to cover precisely that
// string - see make-corpus.mjs/make-watermark-corpus.mjs). Expected =
// original words minus exactly those; every other page (and every page of a
// "delete" entry, which has no box) expects its words fully unchanged.
//
// This is corpus ground truth, not box GEOMETRY, deliberately: pdf.js's
// getTextContent() gives one bbox per ITEM, and adjacent same-style Tj/TJ
// runs get merged into a single item (every "mid-run" fixture's whole point
// is that the secret sits INSIDE one such item, not in its own). A first
// version of this check estimated each word's own sub-rect by prorating the
// item's bbox by character count and tested THAT against the box; it was
// close but wrong often enough to matter (proportional fonts don't have
// equal-width characters, so a tight, true-glyph-metric box could land a
// few percent off from the character-count estimate, right at a word
// boundary) - it both missed real leaks and flagged correct survivors as
// "extras" on exactly the fixtures (mid-run-*, partial-overlap-word.pdf,
// two-boxes-one-line.pdf) this repo's own real glyph reader
// (src/editor/adapters/pdf/pageGlyphs.ts) exists to get right. A checker
// re-deriving that same hard geometry problem from scratch, approximately,
// isn't a stronger check than trusting the corpus it built.
// ---------------------------------------------------------------------------
async function checkText(originalPdf, outputPdf, pageNumber, boxPage, boxes) {
  const originalItems = await pageWords(originalPdf, pageNumber);
  const outputItems = await pageWords(outputPdf, pageNumber);
  const originalWords = originalItems.flatMap((it) => tokenize(it.str));

  const removedWords = pageNumber === boxPage ? boxes.flatMap((b) => (b.secret ? tokenize(b.secret) : [])) : [];

  const expected = subtractMultiset(multiset(originalWords), multiset(removedWords));
  const actual = multiset(outputItems.flatMap((it) => tokenize(it.str)));
  const missing = subtractMultiset(expected, actual); // should have survived, didn't
  const extras = subtractMultiset(actual, expected); // shouldn't be there, is
  const pass = missing.size === 0 && extras.size === 0;
  return { verdict: pass ? 'PASS' : 'FAIL', missing: fmtMultiset(missing), extras: fmtMultiset(extras) };
}

// ---------------------------------------------------------------------------
// Check 4: annotations. No annotation on the box page whose rect intersects
// a redaction box (no shrink: the annotation's own /Rect is the box drawn
// for it, not glyph geometry that might merely graze an edge).
// ---------------------------------------------------------------------------
async function checkAnnotations(outputPdf, pageNumber, boxRects) {
  if (boxRects.length === 0) return { verdict: 'N/A', offending: [] };
  const page = await outputPdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const annots = await page.getAnnotations({ intent: 'any' });
  const offending = [];
  for (const a of annots) {
    const [x0, y0, x1, y1] = a.rect;
    const bbox = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1) };
    const rect = pdfBBoxToPercent(bbox, viewport);
    if (boxRects.some((b) => rectsIntersect(rect, { left: b[0], top: b[1], width: b[2], height: b[3] }))) {
      offending.push(`${a.subtype}${a.contentsObj && a.contentsObj.str ? `("${a.contentsObj.str}")` : ''}`);
    }
  }
  return { verdict: offending.length === 0 ? 'PASS' : 'FAIL', offending };
}

// ---------------------------------------------------------------------------
// Check 1: pixels. Needs a raster of each PDF page. pdfjs-dist's legacy Node
// build can only rasterize through a CanvasFactory backed by the `canvas`
// npm package - spikes/red-01 hit the same wall (see its results-summary.md)
// and never added the dependency. We don't either: try `canvas` if it is
// already installed, otherwise report the check as skipped, once, with the
// reason, rather than adding a dependency for a spike.
// ---------------------------------------------------------------------------
let canvasModulePromise;
async function tryLoadCanvas() {
  if (!canvasModulePromise) {
    canvasModulePromise = import('canvas').catch(() => null);
  }
  return canvasModulePromise;
}

class NodeCanvasFactory {
  constructor(Canvas) {
    this.Canvas = Canvas;
  }
  create(width, height) {
    const canvas = this.Canvas.createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function renderPage(Canvas, bytes, pageNumber) {
  const canvasFactory = new NodeCanvasFactory(Canvas);
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), canvasFactory, useWorkerFetch: false, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const canvasAndContext = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvasAndContext.context, viewport, canvasFactory }).promise;
  const imgData = canvasAndContext.context.getImageData(0, 0, canvasAndContext.canvas.width, canvasAndContext.canvas.height);
  return { data: imgData.data, width: canvasAndContext.canvas.width, height: canvasAndContext.canvas.height };
}

function paintBoxesBlack(pixels, boxRects) {
  const { data, width, height } = pixels;
  for (const [left, top, w, h] of boxRects) {
    const x0 = Math.round((left / 100) * width);
    const y0 = Math.round((top / 100) * height);
    const x1 = Math.round(((left + w) / 100) * width);
    const y1 = Math.round(((top + h) / 100) * height);
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
        const i = (y * width + x) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  }
}

async function checkPixels(originalBytes, outputBytes, pageNumber, boxRects) {
  const Canvas = await tryLoadCanvas();
  if (!Canvas) return { verdict: 'SKIP', reason: 'no `canvas` package installed; cannot rasterize a PDF page in Node without adding a dependency' };
  const original = await renderPage(Canvas, originalBytes, pageNumber);
  const output = await renderPage(Canvas, outputBytes, pageNumber);
  if (original.width !== output.width || original.height !== output.height) {
    return { verdict: 'FAIL', reason: `page size changed: ${original.width}x${original.height} -> ${output.width}x${output.height}` };
  }
  paintBoxesBlack(original, boxRects);
  const { data: a, width, height } = original;
  const { data: b } = output;
  const boxPx = boxRects.map(([left, top, w, h]) => ({
    x0: Math.round((left / 100) * width),
    y0: Math.round((top / 100) * height),
    x1: Math.round(((left + w) / 100) * width),
    y1: Math.round(((top + h) / 100) * height),
  }));
  const insideAnyBox = (x, y) => boxPx.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
  let maxDiff = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (insideAnyBox(x, y)) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        maxDiff = Math.max(maxDiff, Math.abs(a[i + c] - b[i + c]));
      }
    }
  }
  return { verdict: maxDiff === 0 ? 'PASS' : 'FAIL', maxDiffOutsideBoxes: maxDiff };
}

// ---------------------------------------------------------------------------
// Check 3: bytes. Reachability-aware leftover/leak search over pdf-lib's
// parsed object graph.
// ---------------------------------------------------------------------------
function keyName(pdfName) {
  const s = pdfName.toString();
  return s.startsWith('/') ? s.slice(1) : s;
}

/** BFS over the pdf-lib object graph from `roots` (refs or dicts/streams),
 * returning the set of indirect-object ref strings visited. `skipKeys`
 * lets a per-page walk avoid climbing back up through /Parent into the
 * rest of the page tree (which would make everything look "reachable from
 * every page"). */
function collectRefs(context, roots, skipKeys = new Set()) {
  const visitedRefs = new Set();
  const visitedNodes = new Set();
  const stack = [...roots];
  while (stack.length) {
    const node = stack.pop();
    if (node == null) continue;
    if (node instanceof PDFRef) {
      const key = node.toString();
      if (visitedRefs.has(key)) continue;
      visitedRefs.add(key);
      stack.push(context.lookup(node));
      continue;
    }
    const dict = node instanceof PDFDict ? node : node && node.dict instanceof PDFDict ? node.dict : null;
    if (dict) {
      if (visitedNodes.has(dict)) continue;
      visitedNodes.add(dict);
      for (const [k, v] of dict.entries()) {
        if (skipKeys.has(keyName(k))) continue;
        stack.push(v);
      }
      continue;
    }
    if (node instanceof PDFArray) {
      if (visitedNodes.has(node)) continue;
      visitedNodes.add(node);
      for (let i = 0; i < node.size(); i++) stack.push(node.get(i));
      continue;
    }
  }
  return visitedRefs;
}

function decodeStreamSafe(obj) {
  try {
    return Buffer.from(decodePDFRawStream(obj).decode());
  } catch {
    return null;
  }
}

function textPatterns(secret) {
  if (!secret) return [];
  const patterns = [Buffer.from(secret, 'latin1')];
  const hex = Buffer.from(secret, 'latin1').toString('hex');
  patterns.push(Buffer.from(hex.toUpperCase(), 'ascii'));
  patterns.push(Buffer.from(hex.toLowerCase(), 'ascii'));
  return patterns;
}

function colorRunPattern(color, bpp = 3, repeat = 6) {
  const buf = Buffer.alloc(repeat * bpp);
  for (let i = 0; i < repeat; i++) {
    buf[i * bpp] = color[0];
    buf[i * bpp + 1] = color[1];
    buf[i * bpp + 2] = color[2];
  }
  return buf;
}

function bufferContainsAny(haystack, patterns) {
  return patterns.some((p) => p.length > 0 && haystack.includes(p));
}

async function checkBytes(outputBytes, entry, boxes) {
  const patterns = boxes.flatMap((b) => textPatterns(b.secret));
  if (entry.imageSecretColor) patterns.push(colorRunPattern(entry.imageSecretColor));

  if (patterns.length === 0) {
    return { verdict: 'N/A', orphanLeaks: [], boxPageLeaks: [] };
  }

  const doc = await PDFDocument.load(outputBytes, { updateMetadata: false, ignoreEncryption: true });
  const context = doc.context;
  const allRefs = new Set([...context.enumerateIndirectObjects()].map(([ref]) => ref.toString()));
  const reachableFromRoot = collectRefs(context, [context.trailerInfo.Root]);
  const orphanRefs = [...allRefs].filter((r) => !reachableFromRoot.has(r));

  const pages = doc.getPages();
  const boxPageRef = pages[entry.page - 1] && pages[entry.page - 1].ref;
  const reachableFromBoxPage = boxPageRef ? collectRefs(context, [boxPageRef], new Set(['Parent'])) : new Set();

  const orphanLeaks = [];
  const boxPageLeaks = [];
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    // /ObjStm and /XRef streams are structural containers pdf-lib's loader
    // decomposes into their own individual indirect objects on parse (each
    // one already walks this same loop under its own ref) - they are never
    // pointed to by an object reference themselves (only by the file's
    // byte-offset xref table), so they always look "unreachable from Root"
    // by ref-graph traversal alone. Scanning their raw, still-compressed
    // bytes on top of that is both redundant (their contents are covered
    // individually already) and a source of false "orphan leak" positives.
    const typeName = obj.dict.get(PDFName.of('Type'));
    if (typeName && (typeName.toString() === '/ObjStm' || typeName.toString() === '/XRef')) continue;
    const decoded = decodeStreamSafe(obj);
    if (!decoded) continue;
    if (!bufferContainsAny(decoded, patterns)) continue;
    const key = ref.toString();
    if (orphanRefs.includes(key)) orphanLeaks.push(key);
    if (reachableFromBoxPage.has(key)) boxPageLeaks.push(key);
  }

  const pass = orphanLeaks.length === 0 && boxPageLeaks.length === 0;
  return { verdict: pass ? 'PASS' : 'FAIL', orphanLeaks, boxPageLeaks };
}

// ---------------------------------------------------------------------------
// Supplementary (not one of the required 4): per-page image color-pixel
// counts against corpus.json's imageAssertions, same technique as
// spikes/red-01/check-images.mjs. Reported alongside the 4 checks for the
// shared-image entries, since it's the only thing that actually proves a
// "case A / case B" box did what it should to the logo's own pixels.
// ---------------------------------------------------------------------------
async function paintedImageColorCounts(pdf, pageNumber, colors) {
  const page = await pdf.getPage(pageNumber);
  const opList = await page.getOperatorList();
  const objIds = new Set();
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] === pdfjs.OPS.paintImageXObject) objIds.add(opList.argsArray[i][0]);
  }
  const counts = colors.map(() => 0);
  for (const objId of objIds) {
    // An image XObject painted from the SAME underlying object on more than
    // one page (exactly the shared-header-image fixtures) gets a "g_"
    // (global) id and is decoded into the document-wide `commonObjs` cache,
    // not the page-local `page.objs` - only the first page to paint it uses
    // a plain local id. Asking the wrong cache for a "g_" id never calls
    // back at all (no error, no resolve), which hangs this Promise forever.
    const cache = objId.startsWith('g_') ? page.commonObjs : page.objs;
    const imgData = await new Promise((resolve, reject) => {
      try {
        cache.get(objId, resolve);
      } catch (err) {
        reject(err);
      }
    });
    const bpp = imgData.data.length / (imgData.width * imgData.height);
    if (!Number.isFinite(bpp) || bpp < 3) continue;
    const { data } = imgData;
    for (let i = 0; i + 2 < data.length; i += bpp) {
      colors.forEach(([r, g, b], ci) => {
        if (data[i] === r && data[i + 1] === g && data[i + 2] === b) counts[ci]++;
      });
    }
  }
  return counts;
}

function assertionHolds(actual, expected) {
  if (expected === '>0') return actual > 0;
  return actual === expected;
}

async function checkImageAssertions(outputPdf, entry) {
  if (!entry.imageAssertions) return null;
  const colors = [entry.imageSecretColor, entry.imageKeepColor].filter(Boolean);
  const results = [];
  for (const assertion of entry.imageAssertions) {
    const counts = await paintedImageColorCounts(outputPdf, assertion.page, colors);
    const secretOk = entry.imageSecretColor ? assertionHolds(counts[0], assertion.secretColorRemaining) : true;
    const keepOk =
      entry.imageKeepColor && assertion.keepColorRemaining !== undefined
        ? assertionHolds(counts[colors.length - 1], assertion.keepColorRemaining)
        : true;
    results.push({ page: assertion.page, pass: secretOk && keepOk, counts, assertion });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function runEntry(originalDir, outputDir, entry) {
  const originalPath = path.join(originalDir, entry.file);
  const outputPath = path.join(outputDir, entry.file);
  if (!fs.existsSync(originalPath) || !fs.existsSync(outputPath)) return null;

  const originalBytes = fs.readFileSync(originalPath);
  const outputBytes = fs.readFileSync(outputPath);
  const originalPdf = await loadPdf(originalBytes);
  const outputPdf = await loadPdf(outputBytes);
  const numPages = originalPdf.numPages;
  const boxRects = entry.rects || (entry.rect ? [entry.rect] : []);
  const boxes = boxRects.map((r, i) => ({ rect: r, secret: (entry.secrets || [entry.secret])[i] ?? null }));

  const bytesResult = await checkBytes(outputBytes, entry, boxes);
  const imageAssertions = await checkImageAssertions(outputPdf, entry);

  const pageRows = [];
  for (let p = 1; p <= numPages; p++) {
    const pixels = await checkPixels(originalBytes, outputBytes, p, p === entry.page ? boxRects : []);
    const text = await checkText(originalPdf, outputPdf, p, entry.page, boxes);
    const annotations = await checkAnnotations(outputPdf, p, p === entry.page ? boxRects : []);
    pageRows.push({
      file: entry.file,
      page: p,
      isBoxPage: p === entry.page,
      pixels,
      text,
      bytes: p === entry.page ? bytesResult : { verdict: '-' },
      annotations,
    });
  }
  return { entry, pageRows, imageAssertions };
}

function printTable(allRows) {
  const cols = ['file', 'page', 'pixels', 'text', 'bytes', 'annotations'];
  const cellFor = (r, c) => {
    if (c === 'file') return r.file;
    if (c === 'page') return String(r.page) + (r.isBoxPage ? '*' : '');
    return r[c].verdict;
  };
  const rows = allRows.map((r) => cols.map((c) => cellFor(r, c)));
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (let i = 0; i < rows.length; i++) {
    console.log(line(rows[i]));
    const r = allRows[i];
    if (r.text.verdict === 'FAIL') {
      if (r.text.missing) console.log(`    text missing: ${r.text.missing}`);
      if (r.text.extras) console.log(`    text extras: ${r.text.extras}`);
    }
    if (r.bytes.verdict === 'FAIL') {
      if (r.bytes.orphanLeaks.length) console.log(`    bytes orphan leak in: ${r.bytes.orphanLeaks.join(', ')}`);
      if (r.bytes.boxPageLeaks.length) console.log(`    bytes still reachable from box page in: ${r.bytes.boxPageLeaks.join(', ')}`);
    }
    if (r.annotations.verdict === 'FAIL') {
      console.log(`    annotation(s) under box: ${r.annotations.offending.join(', ')}`);
    }
    if (r.pixels.verdict === 'FAIL' && r.pixels.reason) {
      console.log(`    pixels: ${r.pixels.reason}`);
    }
  }
  console.log('(* = the page a redaction box targets; "-" = not applicable to that page)');
}

async function main() {
  const [, , originalDirArg, outputDirArg, corpusJsonPath, fileNameArg] = process.argv;
  if (!originalDirArg || !outputDirArg || !corpusJsonPath) {
    console.error('Usage: node checks.mjs <originalDir> <outputDir> <corpus.json> [fileName]');
    process.exit(2);
  }
  const corpus = JSON.parse(fs.readFileSync(corpusJsonPath, 'utf8'));
  const entries = fileNameArg ? corpus.filter((e) => e.file === fileNameArg) : corpus;

  const canvasAvailable = Boolean(await tryLoadCanvas());
  if (!canvasAvailable) {
    console.log(
      'Check 1 (pixels): no `canvas` package installed in this checkout, so pdfjs-dist cannot rasterize a page in Node. Skipping the pixel check rather than adding a dependency (spikes/red-01 hit the same wall - see its results-summary.md).\n',
    );
  }

  const allRows = [];
  const imageAssertionRows = [];
  let checked = 0;
  for (const entry of corpus) {
    if (fileNameArg && entry.file !== fileNameArg) continue;
    const result = await runEntry(originalDirArg, outputDirArg, entry);
    if (!result) continue;
    checked++;
    allRows.push(...result.pageRows);
    if (result.imageAssertions) {
      for (const a of result.imageAssertions) {
        imageAssertionRows.push({ file: entry.file, page: a.page, pass: a.pass, counts: a.counts, assertion: a.assertion });
      }
    }
  }

  if (checked === 0) {
    console.log('No corpus entries found in both directories.');
    process.exit(1);
  }

  printTable(allRows);

  if (imageAssertionRows.length > 0) {
    console.log('\nSupplementary: per-page image color-pixel counts (not one of the 4 required checks)');
    for (const r of imageAssertionRows) {
      console.log(
        `  ${r.file} page ${r.page}: ${r.pass ? 'OK' : 'MISMATCH'} (counts=${JSON.stringify(r.counts)}, expected secretColorRemaining=${r.assertion.secretColorRemaining}${
          r.assertion.keepColorRemaining !== undefined ? `, keepColorRemaining=${r.assertion.keepColorRemaining}` : ''
        })`,
      );
    }
  }

  const failing = allRows.filter((r) => ['FAIL'].includes(r.pixels.verdict) || r.text.verdict === 'FAIL' || r.bytes.verdict === 'FAIL' || r.annotations.verdict === 'FAIL');
  console.log(`\n${allRows.length - failing.length} of ${allRows.length} page-rows pass all applicable checks.`);
  if (failing.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
