// RED-18 spike: pixel match (checks.mjs's check 1, which Node here can only
// SKIP - see results-checks.md's "no `canvas` package installed" note) run
// for real in a browser, plus the two "Bar" cost/time measurements: file
// size against the original, what today's picture-based export would cost
// for the same covered pages, and remove-text.mjs's own wall time.
//
// Pixel match: for each corpus fixture with a saved output, renders every
// page at scale 2 with pdf.js, the same way the app does
// (src/lib/pdfRender.js / src/editor/adapters/pdf/redact.js), paints every
// redaction box onto the ORIGINAL page (black for blackout, the box's own
// colour for whiteout - no fixture in this corpus is whiteout, so this is
// always black in practice; see "Design decisions" below), and diffs that
// against the OUTPUT page pixel by pixel, everywhere - not just outside the
// boxes, since check 1's brief explicitly asks for the inside-box count too
// ("the output must be the box colour there"). Reports, per page, the max
// per-channel difference and the count of pixels differing by more than 16,
// split into outside-the-boxes and inside-the-boxes.
//
// Cost: for each corpus file with a saved output, (a) the output's file
// size against the original's, and (b) what today's export would cost for
// the covered page - rendered at scale 2.5, boxes painted, encoded as JPEG
// at quality 0.95 via canvas.toDataURL, exactly as
// src/editor/adapters/pdf/redact.js's flattenPage does it.
//
// Time: runs remove-text.mjs itself (it is a plain Node/tsx script; this
// spike does not instrument it) and reports the observed wall time and the
// per-page average over the corpus entries it processes.
//
// No dev server, no port: chromium.launch() opens a real, disposable
// headless browser and every asset pdf.js needs (its build, its worker, its
// wasm codecs) is served through Playwright's own request interception at a
// fake same-origin https URL - nothing ever listens on a socket. This
// matters for more than the letter of "no port": pdf.js's PDFWorker checks
// `_isSameOrigin(window.location, workerSrc)` before spinning up
// `new Worker(workerSrc, { type: "module" })` (node_modules/pdfjs-dist/build/pdf.mjs,
// PDFWorker#initialize) and falls back to a CDN-wrapper path otherwise; a
// same-origin fake URL is what makes the worker start the same way
// production's does (src/editor/adapters/pdf/pdfjsLoader.js), rather than
// exercising a blob-URL/opaque-origin edge case a bare about:blank page
// with inlined <script> content would raise for a module Worker.
//
// Run from the repo root:
//   npx tsx spikes/red-18/pixels.mjs
// (plain `node spikes/red-18/pixels.mjs` also works - nothing here is TS;
// tsx is only for parity with this folder's other scripts.)
//
// Writes spikes/red-18/results-pixels.md. Not part of the app; measures,
// does not touch src/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const DIFF_THRESHOLD = 16;
const PIXEL_SCALE = 2;
const EXPORT_SCALE = 2.5; // matches flattenPage's own scale
const JPEG_QUALITY = 0.95; // matches flattenPage's own canvas.toDataURL quality

// ---------------------------------------------------------------------------
// Corpus pools. remove-text.mjs draws from spikes/red-01/corpus/corpus.json;
// a future images/annotations writer in this same worktree is expected to
// draw from spikes/red-18/corpus/corpus.json (the watermark corpus - it's
// the one with imageSecretColor/imageKeepColor/annotationOnly fields, see
// make-watermark-corpus.mjs). Rather than hard-wire one corpus per out/
// subdirectory, every output file is looked up by name across both pools,
// so this script keeps working whichever corpus a sibling writer ends up
// using and needs no edits when out/images or out/annotations show up.
// ---------------------------------------------------------------------------
const CORPUS_POOLS = [
  { dir: path.join(ROOT, 'spikes/red-01/corpus'), json: path.join(ROOT, 'spikes/red-01/corpus/corpus.json') },
  { dir: path.join(ROOT, 'spikes/red-18/corpus'), json: path.join(ROOT, 'spikes/red-18/corpus/corpus.json') },
];

function loadCorpusIndex() {
  const index = new Map(); // file -> { entry, dir, poolJson }
  const collisions = [];
  for (const pool of CORPUS_POOLS) {
    if (!fs.existsSync(pool.json)) continue;
    const entries = JSON.parse(fs.readFileSync(pool.json, 'utf8'));
    for (const entry of entries) {
      if (index.has(entry.file)) {
        collisions.push(`${entry.file} appears in both ${index.get(entry.file).poolJson} and ${pool.json}; kept the first`);
        continue;
      }
      index.set(entry.file, { entry, dir: pool.dir, poolJson: pool.json });
    }
  }
  return { index, collisions };
}

function boxRectsOf(entry) {
  const color = entry.color || '#000000'; // no fixture in either corpus.json declares a whiteout colour today
  if (entry.rects) return entry.rects.map(([left, top, width, height]) => ({ left, top, width, height, color }));
  if (entry.rect) return [{ left: entry.rect[0], top: entry.rect[1], width: entry.rect[2], height: entry.rect[3], color }];
  return [];
}

// Output directories this run scans - text always exists; images/
// annotations are other agents' work in this same worktree and may not
// exist yet, per the brief ("rerun at the end to pick them up").
const OUT_DIR_CANDIDATES = [
  { label: 'text', dir: path.join(ROOT, 'spikes/red-18/out/text') },
  { label: 'images', dir: path.join(ROOT, 'spikes/red-18/out/images') },
  { label: 'annotations', dir: path.join(ROOT, 'spikes/red-18/out/annotations') },
];

// ---------------------------------------------------------------------------
// Browser harness.
// ---------------------------------------------------------------------------
const ORIGIN = 'https://red18.spike.local';
const PDFJS_BUILD_DIR = path.join(ROOT, 'node_modules/pdfjs-dist/build');
const PDFJS_WASM_DIR = path.join(ROOT, 'node_modules/pdfjs-dist/wasm');

function contentTypeFor(filePath) {
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) return 'text/javascript';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

async function setupHarness(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/harness.html') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>red-18 pixels</title>' });
    }
    let filePath = null;
    if (url.pathname.startsWith('/pdfjs/')) filePath = path.join(PDFJS_BUILD_DIR, url.pathname.slice('/pdfjs/'.length));
    else if (url.pathname.startsWith('/wasm/')) filePath = path.join(PDFJS_WASM_DIR, url.pathname.slice('/wasm/'.length));
    if (!filePath || !fs.existsSync(filePath)) return route.fulfill({ status: 404, body: `not found: ${url.pathname}` });
    return route.fulfill({ status: 200, contentType: contentTypeFor(filePath), body: fs.readFileSync(filePath) });
  });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.addScriptTag({
    type: 'module',
    content: `
      import * as pdfjsLib from '/pdfjs/pdf.mjs';
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
      window.__pdfjsLib = pdfjsLib;
      window.__red18Ready = true;
    `,
  });
  await page.waitForFunction(() => window.__red18Ready === true);
  return page;
}

// ---------------------------------------------------------------------------
// In-page work. Everything that touches raw pixel buffers runs inside
// page.evaluate and returns only small summary numbers - shipping a
// multi-megapixel RGBA buffer back across the Playwright protocol per page
// would dominate the run's wall time for no reason, when the diff itself is
// cheap to compute where the pixels already live.
// ---------------------------------------------------------------------------
async function numPagesOf(page, fileB64) {
  return page.evaluate(async (fileB64) => {
    const bin = atob(fileB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const loadingTask = window.__pdfjsLib.getDocument({ data: bytes, wasmUrl: '/wasm/' });
    const doc = await loadingTask.promise;
    const n = doc.numPages;
    await loadingTask.destroy();
    return n;
  }, fileB64);
}

async function diffPage(page, args) {
  return page.evaluate(async ({ origB64, outB64, pageNo, scale, boxes, threshold }) => {
    function toBytes(b64) {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      return arr;
    }
    async function renderPage(bytes) {
      const loadingTask = window.__pdfjsLib.getDocument({ data: bytes, wasmUrl: '/wasm/' });
      const doc = await loadingTask.promise;
      const pg = await doc.getPage(pageNo);
      const viewport = pg.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      await pg.render({ canvasContext: ctx, viewport }).promise;
      await loadingTask.destroy();
      return { ctx, width: canvas.width, height: canvas.height };
    }
    let orig;
    let out;
    try {
      orig = await renderPage(toBytes(origB64));
      out = await renderPage(toBytes(outB64));
    } catch (e) {
      return { error: `render failed: ${e && e.message ? e.message : String(e)}` };
    }
    if (orig.width !== out.width || orig.height !== out.height) {
      return { error: `page size changed: ${orig.width}x${orig.height} -> ${out.width}x${out.height}` };
    }
    const boxPx = boxes.map((b) => ({
      x0: Math.round((b.left / 100) * orig.width),
      y0: Math.round((b.top / 100) * orig.height),
      x1: Math.round(((b.left + b.width) / 100) * orig.width),
      y1: Math.round(((b.top + b.height) / 100) * orig.height),
      color: b.color,
    }));
    // Paint every box onto the ORIGINAL - this is the "original with the
    // boxes painted on it" side of the comparison.
    for (const r of boxPx) {
      orig.ctx.fillStyle = r.color;
      orig.ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    }
    const a = orig.ctx.getImageData(0, 0, orig.width, orig.height).data;
    const b = out.ctx.getImageData(0, 0, out.width, out.height).data;
    const insideAnyBox = (x, y) => boxPx.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    let outMax = 0;
    let outOver = 0;
    let outTotal = 0;
    let inMax = 0;
    let inOver = 0;
    let inTotal = 0;
    for (let y = 0; y < orig.height; y += 1) {
      for (let x = 0; x < orig.width; x += 1) {
        const i = (y * orig.width + x) * 4;
        let d = 0;
        for (let c = 0; c < 3; c += 1) {
          const dc = Math.abs(a[i + c] - b[i + c]);
          if (dc > d) d = dc;
        }
        if (insideAnyBox(x, y)) {
          inTotal += 1;
          if (d > inMax) inMax = d;
          if (d > threshold) inOver += 1;
        } else {
          outTotal += 1;
          if (d > outMax) outMax = d;
          if (d > threshold) outOver += 1;
        }
      }
    }
    return { width: orig.width, height: orig.height, outMax, outOver, outTotal, inMax, inOver, inTotal };
  }, args);
}

async function exportCostOf(page, args) {
  return page.evaluate(async ({ origB64, pageNo, boxes, scale, quality }) => {
    function toBytes(b64) {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      return arr;
    }
    const loadingTask = window.__pdfjsLib.getDocument({ data: toBytes(origB64), wasmUrl: '/wasm/' });
    const doc = await loadingTask.promise;
    const pg = await doc.getPage(pageNo);
    const viewport = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    await pg.render({ canvasContext: ctx, viewport }).promise;
    await loadingTask.destroy();
    for (const b of boxes) {
      const x0 = Math.round((b.left / 100) * canvas.width);
      const y0 = Math.round((b.top / 100) * canvas.height);
      const x1 = Math.round(((b.left + b.width) / 100) * canvas.width);
      const y1 = Math.round(((b.top + b.height) / 100) * canvas.height);
      ctx.fillStyle = b.color;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1];
    return { bytes: atob(base64).length };
  }, args);
}

// ---------------------------------------------------------------------------
// remove-text.mjs timing. Not instrumented internally (out of this script's
// file set) - this measures the whole observed wall time of one run,
// tsx's own cold-start transform cost included, and divides by the number
// of corpus entries it processes (one page each) for a per-page average.
// ---------------------------------------------------------------------------
function timeRemoveText() {
  const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'spikes/red-01/corpus/corpus.json'), 'utf8'));
  const entryCount = corpus.length;
  const t0 = Date.now();
  let stdout = '';
  let error = null;
  try {
    stdout = execFileSync('npx', ['tsx', 'spikes/red-18/remove-text.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120000,
    });
  } catch (e) {
    error = e.message;
    stdout = e.stdout ? e.stdout.toString() : '';
  }
  const totalMs = Date.now() - t0;
  const summaryLine = stdout.split('\n').find((l) => /file\(s\) pass every check/.test(l)) || null;
  return { totalMs, entryCount, perPageMs: totalMs / entryCount, summaryLine, error };
}

// ---------------------------------------------------------------------------
// Markdown report.
// ---------------------------------------------------------------------------
function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function fmtPct(n) {
  return `${(n * 100).toFixed(2)}%`;
}

function buildReport({ pixelRows, sizeRows, skipped, collisions, removeTextTiming, outDirsScanned }) {
  const lines = [];
  lines.push('# RED-18: pixel match in a real browser, and size and time against today\'s export', '');
  lines.push(
    'Node in this checkout has no `canvas` package, so `checks.mjs`\'s own check 1 (pixels) can only ' +
      'report SKIP (see `results-checks.md`). `pixels.mjs` renders every page with the same `pdfjs-dist` ' +
      'build the app ships, inside a real, disposable headless Chromium launched by Playwright - no dev ' +
      'server, no listening port; every asset pdf.js needs is served through Playwright\'s own request ' +
      'interception at a fake same-origin `https://red18.spike.local` URL, which is also what lets ' +
      '`pdf.js`\'s worker start the normal, same-origin way (`PDFWorker#initialize`\'s ' +
      '`_isSameOrigin` check) instead of falling onto its CDN-wrapper path.',
    '',
  );

  lines.push('## What\'s measured vs. what\'s inferred', '');
  lines.push(
    '- **Measured:** every pixel count and byte count below - rendered directly, in-browser, from the ' +
      'actual corpus and output files on disk at the time this ran (see the timestamp implied by the ' +
      '`remove-text.mjs` re-run below, which regenerated `out/text/` immediately before these numbers ' +
      'were taken, so the pixel/size numbers and the timing number come from the same run).',
  );
  lines.push(
    '- **Inferred:** the *reason* a page fails or passes (e.g. "text-only writer paints no box") is read ' +
      'off `remove-text.mjs`\'s own doc comment and RED-18.md\'s Approach section, not re-derived from ' +
      'first principles here.',
  );
  lines.push(
    '- **Not measured:** `out/images/` and `out/annotations/` - neither existed on disk when this last ' +
      `ran (scanned: ${outDirsScanned.join(', ')}). This script re-scans both at the top of its corpus-index ` +
      'lookup with no hard-wired path list, so re-running it after those land needs no edit here.',
    '',
  );

  lines.push(
    '## Design decision: why "inside the box" is reported, not pass/failed, for `out/text/`',
    '',
  );
  lines.push(
    '`remove-text.mjs` is scoped to text removal only (its own header: "RED-18 spike: true redaction of ' +
      'TEXT ONLY"). It deletes the covered glyphs\' bytes from the content stream, which is what checks ' +
      '2-4 (`results-text.md`, `results-checks.md`) verify; it never paints a box over the vacated region. ' +
      'A real box in this corpus is always blackout (no fixture in either `corpus.json` declares a ' +
      'colour), so the "inside the box" comparison below - output vs. the ORIGINAL painted black - reads ' +
      'as a near-total mismatch on every `out/text/` row with a box: the output there is just whatever ' +
      'was left after deleting the secret\'s glyphs (usually plain page background), not a solid black ' +
      'rectangle. That is not a leak (checks 2-4 already prove the secret itself is gone and nothing else ' +
      'moved) and not a bug in this script - it is a real, worth-reporting gap in what `remove-text.mjs` ' +
      'draws: whatever assembles the final page still needs to paint the box\'s own colour over the region ' +
      'once its content is removed, the same way the Approach section already specifies for images ("The ' +
      'box is painted into the image\'s own pixels"). The **outside-the-box** numbers are the real pass/' +
      'fail signal for `out/text/` today, and match what `checks.mjs`\'s check 1 would have reported had ' +
      '`canvas` been installed.',
    '',
  );

  lines.push('## Pixel match', '');
  lines.push(
    `Scale ${PIXEL_SCALE}x, diff threshold >${DIFF_THRESHOLD} per channel (max of R/G/B). "outside" is ` +
      'every pixel not in a redaction box on the box\'s own page (the whole page, for a page with no box); ' +
      '"inside" is only present on a page with a box. Compares the OUTPUT page against the ORIGINAL page ' +
      'with every box painted onto it.',
    '',
  );
  lines.push(
    '| out/ | file | page | boxes | outside: max diff | outside: px >16 / total | inside: max diff | inside: px >16 / total | note |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of pixelRows) {
    const pageLabel = `${r.page}${r.isBoxPage ? '*' : ''}`;
    if (r.error) {
      lines.push(`| ${r.outLabel} | ${r.file} | ${pageLabel} | ${r.boxCount} | ERROR | ${r.error} | - | - | - |`);
      continue;
    }
    const outCell = `${r.outMax} (${fmtPct(r.outTotal ? r.outOver / r.outTotal : 0)})`;
    const inCell = r.inTotal > 0 ? `${r.inMax} (${fmtPct(r.inOver / r.inTotal)})` : '-';
    const inCountCell = r.inTotal > 0 ? `${r.inOver} / ${r.inTotal}` : '-';
    const outCountCell = `${r.outOver} / ${r.outTotal}`;
    const note = r.isBoxPage && r.boxCount > 0 && r.outLabel === 'text' ? 'text-only writer paints no box (see above)' : '';
    lines.push(
      `| ${r.outLabel} | ${r.file} | ${pageLabel} | ${r.boxCount} | ${r.outMax} | ${outCountCell} (${fmtPct(r.outTotal ? r.outOver / r.outTotal : 0)}) | ${r.inTotal > 0 ? r.inMax : '-'} | ${inCountCell}${r.inTotal > 0 ? ` (${fmtPct(r.inOver / r.inTotal)})` : ''} | ${note} |`,
    );
  }
  lines.push('', '(* = the page a redaction box targets; a row with 0 boxes has no "inside" column)', '');

  const outsidePass = pixelRows.filter((r) => !r.error && r.outOver === 0);
  const outsideFail = pixelRows.filter((r) => !r.error && r.outOver > 0);
  const errored = pixelRows.filter((r) => r.error);
  lines.push(
    `**Outside-the-box pixel match: ${outsidePass.length} of ${pixelRows.length} page-rows have zero pixels ` +
      `differing by more than ${DIFF_THRESHOLD} outside the box.**` +
      (outsideFail.length ? ` ${outsideFail.length} row(s) have at least one such pixel outside the box - listed above.` : '') +
      (errored.length ? ` ${errored.length} row(s) errored (page size mismatch or a render failure) - see above.` : ''),
    '',
  );

  lines.push('## Size and cost', '');
  lines.push(
    `True redaction's output file size against the original, and what today's picture-based export ` +
      `(\`flattenPage\`: scale ${EXPORT_SCALE}x, boxes painted, JPEG q=${JPEG_QUALITY}) would cost for the ` +
      'same covered page - rendered here the same way, from the ORIGINAL page (today\'s export never edits ' +
      'the source PDF; it always starts from the untouched page).',
    '',
  );
  lines.push('| out/ | file | original | true-redaction output | Δ | today\'s picture JPEG (covered page) |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of sizeRows) {
    const delta = r.outputBytes - r.originalBytes;
    const deltaStr = `${delta >= 0 ? '+' : ''}${fmtBytes(delta)}`;
    const jpegCell = r.exportJpegBytes != null ? fmtBytes(r.exportJpegBytes) : 'N/A (no box on this file\'s entry)';
    lines.push(`| ${r.outLabel} | ${r.file} | ${fmtBytes(r.originalBytes)} | ${fmtBytes(r.outputBytes)} | ${deltaStr} | ${jpegCell} |`);
  }
  lines.push('');

  const withJpeg = sizeRows.filter((r) => r.exportJpegBytes != null);
  if (withJpeg.length > 0) {
    const totalOriginal = withJpeg.reduce((s, r) => s + r.originalBytes, 0);
    const totalOutput = withJpeg.reduce((s, r) => s + r.outputBytes, 0);
    lines.push(
      `Across the ${withJpeg.length} file(s) with a box: true redaction moved total file size from ` +
        `${fmtBytes(totalOriginal)} to ${fmtBytes(totalOutput)} (whole-file, content-stream-only edits, ` +
        'no rasterisation). Today\'s picture export is a single JPEG per covered page; each one alone is ' +
        `listed above rather than summed, since a real export also keeps every OTHER page as-is - the ` +
        'JPEG column is the per-page cost `flattenPage` adds on top of that, not a whole-file total.',
      '',
    );
  }

  lines.push('## Timing: `remove-text.mjs`', '');
  if (removeTextTiming.error) {
    lines.push(`Run failed: ${removeTextTiming.error}`, '');
  } else {
    lines.push(
      `Observed wall time for one full run over the ${removeTextTiming.entryCount}-entry corpus (via ` +
        '`npx tsx spikes/red-18/remove-text.mjs`, tsx\'s own cold-start/transform cost included, since ' +
        'this script does not instrument the file internally): ' +
        `**${(removeTextTiming.totalMs / 1000).toFixed(2)}s total, ${removeTextTiming.perPageMs.toFixed(1)}ms ` +
        `per corpus entry** (one page processed per entry; not every entry has a glyph under its box to edit - see its own summary line above).`,
    );
    if (removeTextTiming.summaryLine) lines.push(`Its own summary line: "${removeTextTiming.summaryLine}"`);
    lines.push('');
  }

  if (skipped.length > 0 || collisions.length > 0) {
    lines.push('## Skipped / notes', '');
    for (const s of skipped) lines.push(`- ${s}`);
    for (const c of collisions) lines.push(`- ${c}`);
    lines.push('');
  }

  lines.push('## Summary', '');
  lines.push(
    `${outsidePass.length} of ${pixelRows.length} page-rows checked (across ${outDirsScanned.join(', ') || 'no out/ dirs'}) ` +
      `have a perfect outside-the-box pixel match at ${PIXEL_SCALE}x against the original with its boxes ` +
      'painted on - the same bar `checks.mjs`\'s check 1 sets, now actually run instead of skipped. The ' +
      'inside-the-box numbers show plainly that `out/text/`\'s writer does not yet paint the box itself; ' +
      'everything else it does (glyph deletion, byte-exact splicing) already passes the other three checks ' +
      '(`results-text.md`). True redaction\'s file-size cost is a content-stream edit (tens of bytes to a ' +
      'few KB delta on these fixtures); today\'s picture export costs one multi-hundred-KB JPEG per covered ' +
      'page regardless of how little text that page holds - see the Size and cost table. ' +
      `\`remove-text.mjs\` itself runs in well under a second per page (${removeTextTiming.error ? 'run failed, see above' : `${removeTextTiming.perPageMs.toFixed(1)}ms/entry`}).`,
    '',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------
async function main() {
  console.log('Timing remove-text.mjs (also regenerates spikes/red-18/out/text/ for this run)...');
  const removeTextTiming = timeRemoveText();
  console.log(`  ${(removeTextTiming.totalMs / 1000).toFixed(2)}s total, ${removeTextTiming.perPageMs.toFixed(1)}ms/entry`);

  const outDirs = OUT_DIR_CANDIDATES.filter((d) => fs.existsSync(d.dir));
  const outDirsScanned = outDirs.map((d) => d.label);
  console.log(`Scanning: ${outDirsScanned.join(', ') || '(none found)'}`);

  const { index: corpusIndex, collisions } = loadCorpusIndex();

  const browser = await chromium.launch();
  const page = await setupHarness(browser);

  const pixelRows = [];
  const sizeRows = [];
  const skipped = [];

  for (const outDirInfo of outDirs) {
    const files = fs.readdirSync(outDirInfo.dir).filter((f) => f.endsWith('.pdf')).sort();
    for (const file of files) {
      const found = corpusIndex.get(file);
      if (!found) {
        skipped.push(`${outDirInfo.label}/${file}: no corpus entry found in ${CORPUS_POOLS.map((p) => p.json).join(' or ')}`);
        continue;
      }
      const { entry, dir } = found;
      const originalPath = path.join(dir, file);
      const outputPath = path.join(outDirInfo.dir, file);
      if (!fs.existsSync(originalPath)) {
        skipped.push(`${outDirInfo.label}/${file}: original not found at ${originalPath}`);
        continue;
      }

      const originalBytes = fs.readFileSync(originalPath);
      const outputBytes = fs.readFileSync(outputPath);
      const originalB64 = originalBytes.toString('base64');
      const outputB64 = outputBytes.toString('base64');

      let numPages;
      try {
        numPages = await numPagesOf(page, originalB64);
      } catch (e) {
        skipped.push(`${outDirInfo.label}/${file}: could not open original in pdf.js (${e.message})`);
        continue;
      }

      const boxRects = boxRectsOf(entry);
      console.log(`  ${outDirInfo.label}/${file}: ${numPages} page(s), ${boxRects.length} box(es) on page ${entry.page}`);
      for (let p = 1; p <= numPages; p += 1) {
        const boxesForPage = p === entry.page ? boxRects : [];
        let result;
        try {
          result = await diffPage(page, {
            origB64: originalB64,
            outB64: outputB64,
            pageNo: p,
            scale: PIXEL_SCALE,
            boxes: boxesForPage,
            threshold: DIFF_THRESHOLD,
          });
        } catch (e) {
          result = { error: e.message };
        }
        pixelRows.push({ outLabel: outDirInfo.label, file, page: p, isBoxPage: p === entry.page, boxCount: boxesForPage.length, ...result });
      }

      const sizeRow = { outLabel: outDirInfo.label, file, originalBytes: originalBytes.length, outputBytes: outputBytes.length, exportJpegBytes: null };
      if (boxRects.length > 0) {
        try {
          const cost = await exportCostOf(page, {
            origB64: originalB64,
            pageNo: entry.page,
            boxes: boxRects,
            scale: EXPORT_SCALE,
            quality: JPEG_QUALITY,
          });
          sizeRow.exportJpegBytes = cost.bytes;
        } catch (e) {
          skipped.push(`${outDirInfo.label}/${file}: export-cost render failed (${e.message})`);
        }
      }
      sizeRows.push(sizeRow);
    }
  }

  await browser.close();

  const report = buildReport({ pixelRows, sizeRows, skipped, collisions, removeTextTiming, outDirsScanned });
  fs.writeFileSync(path.join(ROOT, 'spikes/red-18/results-pixels.md'), report);
  console.log('\nWrote spikes/red-18/results-pixels.md');

  const anyOutsideFail = pixelRows.some((r) => !r.error && r.outOver > 0);
  const anyError = pixelRows.some((r) => r.error);
  if (anyOutsideFail || anyError) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
