// FORM-06 spike harness (NOT part of the test suite or the build; nothing imports it).
//
// Measures Tesseract `heb` on page 1 of the two Hebrew evidence forms against the exact text and
// positions pdf.js already gives for the same page:
//   (a) whole page at 300 DPI, PSM 3 (auto) and PSM 11 (sparse), blocks output, scored per region;
//   (b) label-sized crops cut from the pdf.js text-item boxes, PSM 7 (line) and PSM 8 (word).
// Prints the tables that docs/form-06-ocr-spike.md quotes and writes the raw numbers as JSON.
//
// tesseract.js and heb.traineddata are NOT in this repo (no dependency was added). They live in a
// scratch directory that is a throwaway npm project:
//
//   SCRATCH=/some/dir/ocr
//   mkdir -p $SCRATCH && cd $SCRATCH
//   echo '{"name":"ocr-scratch","private":true,"type":"module"}' > package.json
//   npm install tesseract.js                       # 7.0.0 when this was run; brings tesseract.js-core
//   curl -fL -o heb.traineddata \
//     https://github.com/tesseract-ocr/tessdata_fast/raw/main/heb.traineddata   # 961404 bytes raw
//
// Then, from the repo root (needs the repo's own node_modules for pdfjs-dist and @napi-rs/canvas):
//
//   node scripts/spike/form-06/measureOcr.mjs --scratch $SCRATCH --out $SCRATCH/results.json
//   node scripts/spike/form-06/measureOcr.mjs --scratch $SCRATCH --form health --max-crops 40   # quick look
//
// Every path tesseract.js touches is local (corePath, langPath, workerPath; cacheMethod none), so it
// never fetches from a CDN at run time. Overlays for eyeballing a page: --overlay $SCRATCH/overlays.
//
// How things are normalised and scored is described next to the functions that do it, and in the
// record. In short: both sides go through `normalise()`; the headline metric compares letters and
// digits only (`core()`), with a strict variant that keeps punctuation.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { createCanvas } from '@napi-rs/canvas';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const SCRATCH = path.resolve(flag('scratch', process.env.OCR_SCRATCH ?? ''));
if (!flag('scratch', process.env.OCR_SCRATCH)) {
  console.error('pass --scratch <dir with node_modules/tesseract.js and heb.traineddata>');
  process.exit(1);
}
const ONLY = flag('form', null);
const MAX_CROPS = Number(flag('max-crops', 0)) || Infinity;
const OUT = flag('out', null);
const OVERLAY = flag('overlay', null);
const REPEATS = Number(flag('repeats', 3)) || 1; // whole-page runs per PSM; timing reports all of them, scoring uses the last

const DPI = Number(flag('dpi', 300)) || 300; // 300 for the record; 200 and 150 are the sensitivity rows (the PDF is re-rendered at that resolution)
const SCALE = DPI / 72;
const CROP_PAD = 6; // px, "a few px" around the pdf.js item box
const FORMS = [
  { id: 'health', title: 'Health declaration 2021', pdf: 'src/tools/sign/fields/corpus/scoring/forms/health-declaration-2021.pdf' },
  { id: 'itc101', title: 'Income-tax 101 (2024)', pdf: 'src/tools/sign/fields/corpus/scoring/forms/income-tax-101-2024.pdf' },
].filter((form) => !ONLY || form.id === ONLY);

const repoRequire = createRequire(path.resolve('package.json'));
const pdfjsDir = path.dirname(repoRequire.resolve('pdfjs-dist/package.json'));
const pdfjs = await import(path.join(pdfjsDir, 'legacy/build/pdf.mjs'));
const scratchRequire = createRequire(path.join(SCRATCH, 'package.json'));
const Tesseract = scratchRequire('tesseract.js');
const tesseractVersion = scratchRequire('tesseract.js/package.json').version;
const corePath = path.dirname(scratchRequire.resolve('tesseract.js-core/package.json'));

// ---------------------------------------------------------------- normalisation and edit distance

/**
 * Both sides (pdf.js reference, Tesseract output) go through this and nothing else:
 *  - NFKC (folds Hebrew presentation forms, NBSP, full-width forms),
 *  - strip niqqud and cantillation (U+0591-05BD, 05BF, 05C1-05C2, 05C4-05C5, 05C7),
 *  - strip bidi and format marks (U+200B-200F, 202A-202E, 2066-2069, FEFF),
 *  - geresh/gershayim to ' and ", curly quotes to straight, every dash and maqaf to '-',
 *  - collapse whitespace to single spaces and trim.
 * The text stays in LOGICAL order on both sides (pdf.js emits logical order for these forms and
 * Tesseract emits logical order within a word), so no reversal is applied anywhere.
 */
export function normalise(text) {
  return text
    .normalize('NFKC')
    .replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/\u05F3|[\u2018\u2019\u201B]/g, "'")
    .replace(/\u05F4|[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u05BE\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
/** The headline comparison string: letters and digits only (no punctuation, no spaces). */
const core = (normalised) => normalised.replace(/[^\p{L}\p{N}]/gu, '');
const words = (normalised) => (normalised ? normalised.split(' ') : []);
const hasHebrew = (text) => /[\u05D0-\u05EA]/.test(text);
/** Diagnostic only: final mem and samekh folded together, on both sides (see the record). */
const foldMemSamekh = (text) => text.replace(/\u05DD/g, '\u05E1');
const GLYPH_FONT = /dingbat|wingding|symbol/i;

/** Levenshtein over code points. */
export function editDistance(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= y.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[y.length];
}

// ---------------------------------------------------------------- pdf.js: raster, reference runs

async function openPage(pdfPath) {
  const loading = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(pdfPath)),
    standardFontDataUrl: `${path.join(pdfjsDir, 'standard_fonts')}${path.sep}`,
    cMapUrl: `${path.join(pdfjsDir, 'cmaps')}${path.sep}`,
    wasmUrl: `${path.join(pdfjsDir, 'wasm')}${path.sep}`,
    cMapPacked: true,
    useSystemFonts: false,
  });
  const doc = await loading.promise;
  return { doc, loading, page: await doc.getPage(1) };
}

/**
 * Reference run box in raster pixels. pdf.js gives the baseline-left origin (transform e,f), the
 * advance `width` and the font-size-like `height`. Latin and Hebrew glyph ink sits between about
 * 0.8h above the baseline and 0.25h below it; the NOMINAL box uses 0.95h above and 0.30h below, which
 * is the box the crops are cut from. `inkFit()` then tightens it to the actual dark pixels.
 */
function runBox(viewport, item) {
  const [px, py] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
  const h = item.height * SCALE;
  return { x0: px, y0: py - 0.95 * h, x1: px + item.width * SCALE, y1: py + 0.3 * h, h };
}

function inkFit(gray, W, H, box) {
  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(W, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0));
  const y1 = Math.min(H, Math.ceil(box.y1));
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (gray[y * W + x] < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
}

async function rasterAndRuns(form) {
  const { doc, loading, page } = await openPage(form.pdf);
  try {
    const viewport = page.getViewport({ scale: SCALE });
    const W = Math.ceil(viewport.width);
    const H = Math.ceil(viewport.height);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const t0 = performance.now();
    await page.render({ canvasContext: ctx, canvas, viewport, background: 'rgb(255,255,255)' }).promise;
    const renderMs = performance.now() - t0;
    const rgba = ctx.getImageData(0, 0, W, H).data;
    const gray = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i += 1) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
    const { items } = await page.getTextContent();
    const runs = [];
    let glyphRuns = 0;
    for (const item of items) {
      if (Math.abs(item.transform[1]) > 0.01 || Math.abs(item.transform[2]) > 0.01) continue; // rotated text: none on these forms
      const text = normalise(item.str);
      if (!core(text)) continue; // no letter or digit: a bullet, a lone comma, a leader dot
      let fontName = '';
      try {
        fontName = page.commonObjs.get(item.fontName)?.name ?? '';
      } catch {
        // font object not resolved: treat as text
      }
      if (GLYPH_FONT.test(fontName)) {
        // A checkbox drawn from a symbol font: the text layer says "o" or "q", the paper shows a box.
        glyphRuns += 1;
        continue;
      }
      const box = runBox(viewport, item);
      runs.push({
        raw: item.str,
        text,
        core: core(text),
        words: words(text),
        dir: item.dir,
        hebrew: hasHebrew(text),
        box,
        ink: inkFit(gray, W, H, box),
      });
    }
    return { canvas, png: canvas.toBuffer('image/png'), gray, W, H, runs, renderMs, itemCount: items.length, glyphRuns };
  } finally {
    await loading.destroy();
  }
}

// ---------------------------------------------------------------- scoring helpers

const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
function inter(a, b) {
  return area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
}
const iou = (a, b) => {
  const i = inter(a, b);
  return i / (area(a) + area(b) - i || 1);
};
const union = (boxes) => ({
  x0: Math.min(...boxes.map((b) => b.x0)),
  y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)),
  y1: Math.max(...boxes.map((b) => b.y1)),
});
const bucketOf = (run) => (run.words.length <= 2 ? '1-2 words' : run.words.length <= 5 ? '3-5 words' : '6+ words');
const BUCKETS = ['1-2 words', '3-5 words', '6+ words'];
/** The slice closest to what a field label is: Hebrew, at least three letters (drops 1-2 letter kerning fragments pdf.js splits words into). */
const isLabelLike = (run) => run.hebrew && (run.core.match(/\p{L}/gu) ?? []).length >= 3;
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const quantile = (xs, q) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null;
};

/** Multiset of reference words found among the OCR words (letters and digits only, as `core`). */
function wordHits(refWords, ocrWords) {
  const pool = new Map();
  for (const w of ocrWords.map(core).filter(Boolean)) pool.set(w, (pool.get(w) ?? 0) + 1);
  let hits = 0;
  for (const w of refWords.map(core).filter(Boolean)) {
    if ((pool.get(w) ?? 0) > 0) {
      pool.set(w, pool.get(w) - 1);
      hits += 1;
    }
  }
  return hits;
}

/**
 * One reference run against the OCR words assigned to it: edit distance over letters-and-digits
 * (headline) and over the strict normalised string (punctuation kept, spaces collapsed).
 */
function scoreRun(run, ocrWords) {
  const ocrText = normalise(ocrWords.join(' '));
  const refCore = run.core;
  const ocrCore = core(ocrText);
  const coreEdits = editDistance(refCore, ocrCore);
  const strictEdits = editDistance(run.text, ocrText);
  const foldRef = foldMemSamekh(refCore);
  const foldOcr = foldMemSamekh(ocrCore);
  return {
    foldEdits: editDistance(foldRef, foldOcr),
    foldExact: foldRef === foldOcr,
    refLen: Array.from(refCore).length,
    coreEdits,
    strictRefLen: Array.from(run.text).length,
    strictEdits,
    exact: refCore === ocrCore,
    strictExact: run.text === ocrText,
    wordRefs: run.words.length,
    wordHits: wordHits(run.words, ocrText ? ocrText.split(' ') : []),
    ocrText,
  };
}

function aggregate(rows) {
  const refLen = rows.reduce((s, r) => s + r.refLen, 0);
  const strictRefLen = rows.reduce((s, r) => s + r.strictRefLen, 0);
  const wordRefs = rows.reduce((s, r) => s + r.wordRefs, 0);
  return {
    n: rows.length,
    cer: refLen ? rows.reduce((s, r) => s + r.coreEdits, 0) / refLen : null,
    cerMacro: mean(rows.map((r) => Math.min(1, r.coreEdits / (r.refLen || 1)))),
    strictCer: strictRefLen ? rows.reduce((s, r) => s + r.strictEdits, 0) / strictRefLen : null,
    foldCer: refLen ? rows.reduce((s, r) => s + r.foldEdits, 0) / refLen : null,
    foldExact: rows.length ? rows.filter((r) => r.foldExact).length / rows.length : null,
    exact: rows.length ? rows.filter((r) => r.exact).length / rows.length : null,
    near1: rows.length ? rows.filter((r) => r.coreEdits <= 1).length / rows.length : null,
    strictExact: rows.length ? rows.filter((r) => r.strictExact).length / rows.length : null,
    wordRecall: wordRefs ? rows.reduce((s, r) => s + r.wordHits, 0) / wordRefs : null,
  };
}

// ---------------------------------------------------------------- whole-page scoring

function flattenWords(blocks) {
  const out = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (word.text.trim()) out.push({ text: word.text, conf: word.confidence, box: { x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 } });
        }
      }
    }
  }
  return out;
}

/**
 * Whole-page scoring. An OCR word belongs to the reference run whose nominal box covers at least
 * half of the word's own area (best overlap wins); a run's OCR text is its assigned words in
 * reading order (right to left for an `rtl` run, left to right otherwise) - geometry decides which
 * words belong, so the page's own reading order is not scored here, only whether the right
 * characters are found in the right place. A run with no assigned word scores as fully missed.
 * Words assigned to no run are `unassigned` (ruled-line noise or hallucinations).
 */
function scorePage(runs, ocrWords) {
  const assigned = runs.map(() => []);
  const unassigned = [];
  for (const word of ocrWords) {
    let best = -1;
    let bestShare = 0;
    runs.forEach((run, index) => {
      const share = inter(word.box, run.box) / (area(word.box) || 1);
      if (share > bestShare) {
        bestShare = share;
        best = index;
      }
    });
    if (best >= 0 && bestShare >= 0.5) assigned[best].push(word);
    else unassigned.push(word);
  }
  const rows = runs.map((run, index) => {
    const sorted = [...assigned[index]].sort((a, b) => (run.dir === 'rtl' ? b.box.x0 - a.box.x0 : a.box.x0 - b.box.x0));
    const score = scoreRun(run, sorted.map((w) => w.text));
    const found = sorted.length > 0;
    const ocrBox = found ? union(sorted.map((w) => w.box)) : null;
    return {
      ...score,
      bucket: bucketOf(run),
      found,
      iouNominal: found ? iou(ocrBox, run.box) : 0,
      iouInk: found && run.ink ? iou(ocrBox, run.ink) : null,
      conf: found ? mean(sorted.map((w) => w.conf)) : null,
      ref: run.text,
    };
  });
  const group = (subset) => {
    const agg = aggregate(subset);
    const inked = subset.filter((r) => r.iouInk != null);
    return {
      ...agg,
      found: subset.length ? subset.filter((r) => r.found).length / subset.length : null,
      iouNominalMean: mean(subset.map((r) => r.iouNominal)),
      iouNominalHit50: subset.length ? subset.filter((r) => r.iouNominal >= 0.5).length / subset.length : null,
      iouInkMean: mean(inked.map((r) => r.iouInk)),
      iouInkHit50: inked.length ? inked.filter((r) => r.iouInk >= 0.5).length / inked.length : null,
    };
  };
  const hebrewRows = rows.filter((_, i) => runs[i].hebrew);
  const labelRows = rows.filter((_, i) => isLabelLike(runs[i]));
  return {
    ocrWordCount: ocrWords.length,
    unassigned: unassigned.length,
    unassignedShare: ocrWords.length ? unassigned.length / ocrWords.length : null,
    unassignedSample: unassigned.slice(0, 15).map((w) => w.text),
    pageWide: group(rows),
    hebrewRuns: group(hebrewRows),
    labelLike: group(labelRows),
    byBucket: Object.fromEntries(BUCKETS.map((bucket) => [bucket, group(rows.filter((r) => r.bucket === bucket))])),
    rows,
  };
}

// ---------------------------------------------------------------- tesseract driver

async function recognize(worker, image, output = { blocks: true }) {
  const t0 = performance.now();
  const { data } = await worker.recognize(image, {}, output);
  return { data, ms: performance.now() - t0 };
}

function cropPng(canvas, W, H, box) {
  const x0 = Math.max(0, Math.floor(box.x0 - CROP_PAD));
  const y0 = Math.max(0, Math.floor(box.y0 - CROP_PAD));
  const x1 = Math.min(W, Math.ceil(box.x1 + CROP_PAD));
  const y1 = Math.min(H, Math.ceil(box.y1 + CROP_PAD));
  const crop = createCanvas(x1 - x0, y1 - y0);
  crop.getContext('2d').drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  return crop.toBuffer('image/png');
}

function overlayPng(canvas, W, H, runs, ocrWords, file) {
  const out = createCanvas(W, H);
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,0,0,0.9)';
  for (const run of runs) ctx.strokeRect(run.box.x0, run.box.y0, run.box.x1 - run.box.x0, run.box.y1 - run.box.y0);
  ctx.strokeStyle = 'rgba(0,160,0,0.9)';
  for (const word of ocrWords) ctx.strokeRect(word.box.x0, word.box.y0, word.box.x1 - word.box.x0, word.box.y1 - word.box.y0);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.toBuffer('image/png'));
}

// ---------------------------------------------------------------- main

const results = { tesseractVersion, node: process.version, dpi: DPI, cropPad: CROP_PAD, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, loadAvgAtStart: os.loadavg(), forms: {} };
const initStart = performance.now();
const worker = await Tesseract.createWorker('heb', 1, {
  corePath,
  langPath: SCRATCH,
  gzip: false,
  cacheMethod: 'none',
  logger: () => {},
});
results.initMs = performance.now() - initStart;
console.log(`tesseract.js ${tesseractVersion}, heb init (spawn worker + load wasm core + load traineddata + init): ${results.initMs.toFixed(0)} ms`);

for (const form of FORMS) {
  console.log(`\n=== ${form.title} ===`);
  const raster = await rasterAndRuns(form);
  const heb = raster.runs.filter((r) => r.hebrew).length;
  console.log(`raster ${raster.W}x${raster.H} @ ${DPI} DPI (pdf.js render ${raster.renderMs.toFixed(0)} ms); ${raster.itemCount} text items, ${raster.runs.length} with a letter or digit (${heb} with Hebrew); ${raster.glyphRuns} symbol-font items (checkbox glyphs) excluded`);
  const formResult = { glyphRunsExcluded: raster.glyphRuns, raster: { w: raster.W, h: raster.H, renderMs: raster.renderMs }, items: raster.itemCount, runs: raster.runs.length, hebrewRuns: heb, page: {}, crops: {} };
  results.forms[form.id] = formResult;

  // (a)-(d) whole page
  for (const psm of ['3', '11']) {
    await worker.setParameters({ tessedit_pageseg_mode: psm, user_defined_dpi: String(DPI) });
    const timed = [];
    let last;
    for (let i = 0; i < REPEATS; i += 1) {
      last = await recognize(worker, raster.png);
      timed.push(last.ms);
    }
    const ocrWords = flattenWords(last.data.blocks);
    const scored = scorePage(raster.runs, ocrWords);
    formResult.page[`psm${psm}`] = { ms: timed, pageConf: last.data.confidence, ...scored };
    console.log(`\nwhole page, PSM ${psm}: ${timed.map((t) => `${t.toFixed(0)}`).join(' / ')} ms over ${REPEATS} runs (load average ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cores); ${ocrWords.length} OCR words vs ${raster.runs.length} reference runs; ${scored.unassigned} OCR words fall in no run`);
    const line = (name, g) => console.log(`  ${name.padEnd(12)} n=${String(g.n).padStart(3)}  found ${pct(g.found).padStart(6)}  CER ${pct(g.cer).padStart(6)} (strict ${pct(g.strictCer).padStart(6)})  run exact ${pct(g.exact).padStart(6)} fold CER ${pct(g.foldCer).padStart(6)}  word recall ${pct(g.wordRecall).padStart(6)}  IoU>=.5 nominal ${pct(g.iouNominalHit50).padStart(6)} ink ${pct(g.iouInkHit50).padStart(6)}  mean IoU ${g.iouNominalMean?.toFixed(2)}/${g.iouInkMean?.toFixed(2)}`);
    line('page-wide', scored.pageWide);
    line('hebrew runs', scored.hebrewRuns);
    line('label-like', scored.labelLike);
    for (const bucket of BUCKETS) line(bucket, scored.byBucket[bucket]);
    if (OVERLAY && psm === '3') overlayPng(raster.canvas, raster.W, raster.H, raster.runs, ocrWords, path.join(OVERLAY, `${form.id}-${DPI}dpi-psm3.png`));
  }

  // (e) label crops
  const cropRuns = raster.runs.slice(0, Number.isFinite(MAX_CROPS) ? MAX_CROPS : undefined);
  for (const psm of ['7', '8']) {
    await worker.setParameters({ tessedit_pageseg_mode: psm, user_defined_dpi: String(DPI) });
    const rows = [];
    const times = [];
    const wall0 = performance.now();
    for (const run of cropRuns) {
      const png = cropPng(raster.canvas, raster.W, raster.H, run.box);
      const { data, ms } = await recognize(worker, png, { text: true });
      times.push(ms);
      const text = normalise(data.text ?? '');
      const score = scoreRun(run, text ? text.split(' ') : []);
      rows.push({ ...score, bucket: bucketOf(run), conf: data.confidence, ref: run.text, hebrew: run.hebrew, label: isLabelLike(run), ms });
    }
    const wallMs = performance.now() - wall0;
    const oneWord = rows.filter((r) => r.wordRefs === 1);
    const byBucket = Object.fromEntries(BUCKETS.map((b) => [b, aggregate(rows.filter((r) => r.bucket === b))]));
    const exactConf = mean(rows.filter((r) => r.exact).map((r) => r.conf));
    const wrongConf = mean(rows.filter((r) => !r.exact).map((r) => r.conf));
    formResult.crops[`psm${psm}`] = {
      n: rows.length,
      overall: aggregate(rows),
      hebrewOnly: aggregate(rows.filter((r) => r.hebrew)),
      labelLike: aggregate(rows.filter((r) => r.label)),
      nonHebrew: aggregate(rows.filter((r) => !r.hebrew)),
      byBucketLabel: Object.fromEntries(BUCKETS.map((b) => [b, aggregate(rows.filter((r) => r.label && r.bucket === b))])),
      oneWord: aggregate(oneWord),
      byBucket,
      timing: { meanMs: mean(times), medianMs: quantile(times, 0.5), p95Ms: quantile(times, 0.95), totalMs: wallMs },
      confExact: exactConf,
      confWrong: wrongConf,
      worst: [...rows].sort((a, b) => b.coreEdits / b.refLen - a.coreEdits / a.refLen).slice(0, 12).map((r) => ({ ref: r.ref, ocr: r.ocrText })),
      rows: rows.map(({ ref, ocrText, exact, coreEdits, refLen, conf, bucket, ms }) => ({ ref, ocr: ocrText, exact, coreEdits, refLen, conf, bucket, ms })),
    };
    const c = formResult.crops[`psm${psm}`];
    console.log(`\ncrops, PSM ${psm}: ${rows.length} crops, ${c.timing.meanMs.toFixed(0)} ms mean, ${c.timing.medianMs.toFixed(0)} median, ${c.timing.p95Ms.toFixed(0)} p95 per crop (${(wallMs / 1000).toFixed(1)} s total); mean confidence exact ${exactConf?.toFixed(0)} vs wrong ${wrongConf?.toFixed(0)}`);
    const line = (name, g) => console.log(`  ${name.padEnd(12)} n=${String(g.n).padStart(3)}  exact ${pct(g.exact).padStart(6)} (strict ${pct(g.strictExact).padStart(6)})  CER ${pct(g.cer).padStart(6)} (strict ${pct(g.strictCer).padStart(6)})  macro CER ${pct(g.cerMacro).padStart(6)}  within-1-edit ${pct(g.near1).padStart(6)}  fold(mem=samekh) exact ${pct(g.foldExact).padStart(6)} CER ${pct(g.foldCer).padStart(6)}`);
    line('all', c.overall);
    line('hebrew runs', c.hebrewOnly);
    line('label-like', c.labelLike);
    line('no hebrew', c.nonHebrew);
    line('1 word', c.oneWord);
    for (const bucket of BUCKETS) line(bucket, byBucket[bucket]);
    for (const bucket of BUCKETS) line(`lbl ${bucket}`, c.byBucketLabel[bucket]);
  }
}

await worker.terminate();
results.loadAvgAtEnd = os.loadavg();
if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(`\nwrote ${OUT}`);
}
