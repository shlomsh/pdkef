// FORM-32 spike harness (NOT part of the test suite or the build; nothing imports it).
//
// For each of the 12 scored corpus rows (baselines.json -> truth file; row id = truth basename without
// .json) renders the scored page to a gray raster in several variants and OCRs the whole page, writing
// the two halves of the contract in backlog/tasks/FORM-32.md for scoreArms.mjs to read:
//   <scratch>/raster/<row>-<variant>.png + .json   {row, pdf, pageIndex, variant, dpi, widthPx, heightPx,
//                                                    pageWidthPts, pageHeightPts, view}
//   <scratch>/ocr/<row>-<variant>.json             {row, variant, langs, psm, ms, lines, words}
// Runs are {str, left, top, width, height, dir, conf} in percent of the rendered page VIEW (the cropbox,
// the same frame toPageTextRuns uses), top-left origin.
// Variants: clean300 (300 DPI), clean200, phone (200 DPI, 3x3 box blur, 2% salt-and-pepper, seed 32, no
// rotation); irs-1040-1970 uses its embedded scan as `native` (dpi recorded) instead.
// OCR: Tesseract PSM 3, language = the form's known language + eng (an oracle choice), blocks output.
//
// tesseract.js and the traineddata live in a scratch throwaway npm project, as in form-06/measureOcr.mjs:
//
//   SCRATCH=/some/dir/form32; mkdir -p $SCRATCH/ocr-lib && cd $SCRATCH/ocr-lib
//   echo '{"name":"ocr-scratch","private":true,"type":"module"}' > package.json
//   npm install tesseract.js@7.0.0
//   for l in heb tha eng; do curl -fL -o $l.traineddata \
//     https://github.com/tesseract-ocr/tessdata_fast/raw/main/$l.traineddata; done
//
// From the repo root:
//   node scripts/spike/form-32/renderAndOcr.mjs --scratch $SCRATCH
//   node scripts/spike/form-32/renderAndOcr.mjs --scratch $SCRATCH --row health-page1 --variant clean300 --check
//   flags: --row ID, --variant NAME, --skip-existing, --check (print a pdf.js position comparison)
// Every tesseract path is local (corePath, langPath, workerPath; cacheMethod none).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { createCanvas } from '@napi-rs/canvas';
import { extractPageImage, writeGrayPng } from '../form-07/extractImage.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
if (!flag('scratch')) {
  console.error('pass --scratch <dir containing ocr-lib/ and receiving raster/ and ocr/>');
  process.exit(1);
}
const SCRATCH = path.resolve(flag('scratch'));
const LIB = path.join(SCRATCH, 'ocr-lib');
const ROOT = path.resolve('.');
const RASTER = path.join(SCRATCH, 'raster');
const OCR = path.join(SCRATCH, 'ocr');
fs.mkdirSync(RASTER, { recursive: true });
fs.mkdirSync(OCR, { recursive: true });

const repoRequire = createRequire(path.join(ROOT, 'package.json'));
const pdfjsDir = path.dirname(repoRequire.resolve('pdfjs-dist/package.json'));
const pdfjs = await import(path.join(pdfjsDir, 'legacy/build/pdf.mjs'));
const libRequire = createRequire(path.join(LIB, 'package.json'));
const Tesseract = libRequire('tesseract.js');
const corePath = path.dirname(libRequire.resolve('tesseract.js-core/package.json'));

// ---------------------------------------------------------------- rows and languages

const baselines = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tools/sign/fields/corpus/scoring/baselines.json'), 'utf8'));
const rows = Object.values(baselines.forms).map((f) => {
  const truth = JSON.parse(fs.readFileSync(path.join(ROOT, f.truth), 'utf8'));
  const id = path.basename(f.truth, '.json');
  const lang = /health|itc101|btl|income-tax-101/.test(id + f.pdf) ? 'heb' : /thai/.test(id) ? 'tha' : 'eng';
  return { id, pdf: path.join(ROOT, f.pdf), pageIndex: truth.pageIndex ?? 0, lang, langs: lang === 'eng' ? 'eng' : `${lang}+eng`, native: /irs-1040-1970/.test(id) };
}).filter((r) => !flag('row') || r.id === flag('row'));
console.log('language mapping:');
for (const r of rows) console.log(`  ${r.id.padEnd(26)} ${r.langs}${r.native ? '  (native scan)' : ''}`);

// ---------------------------------------------------------------- rasters

async function openPdf(file) {
  const loading = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    standardFontDataUrl: `${path.join(pdfjsDir, 'standard_fonts')}${path.sep}`,
    cMapUrl: `${path.join(pdfjsDir, 'cmaps')}${path.sep}`,
    wasmUrl: `${path.join(pdfjsDir, 'wasm')}${path.sep}`,
    cMapPacked: true,
    useSystemFonts: false,
  });
  return { loading, doc: await loading.promise };
}

/** Renders the page view (cropbox) at `dpi` to 8-bit gray. */
async function renderGray(row, dpi) {
  const { loading, doc } = await openPdf(row.pdf);
  try {
    const page = await doc.getPage(row.pageIndex + 1);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const W = Math.ceil(viewport.width);
    const H = Math.ceil(viewport.height);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, canvas, viewport, background: 'rgb(255,255,255)' }).promise;
    const rgba = ctx.getImageData(0, 0, W, H).data;
    const gray = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i += 1) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
    return { gray, W, H, view: page.view, pageWidthPts: page.view[2] - page.view[0], pageHeightPts: page.view[3] - page.view[1] };
  } finally {
    await loading.destroy();
  }
}

/** 3x3 box blur, edge pixels clamped. */
function boxBlur(gray, W, H) {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = Math.min(H - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) sum += gray[yy * W + Math.min(W - 1, Math.max(0, x + dx))];
      }
      out[y * W + x] = Math.round(sum / 9);
    }
  }
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2% of pixels flipped, half to black, half to white. */
function saltPepper(gray, rate, seed) {
  const rand = mulberry32(seed);
  const out = Uint8Array.from(gray);
  for (let i = 0; i < out.length; i += 1) if (rand() < rate) out[i] = rand() < 0.5 ? 0 : 255;
  return out;
}

async function makeRaster(row, variant) {
  if (variant === 'native') {
    const img = await extractPageImage(row.pdf, row.pageIndex);
    const dpi = img.width / (img.pageWidthPts / 72);
    return { gray: img.gray, W: img.width, H: img.height, dpi, view: img.view, pageWidthPts: img.pageWidthPts, pageHeightPts: img.pageHeightPts };
  }
  const dpi = variant === 'clean300' ? 300 : 200;
  const r = await renderGray(row, dpi);
  const gray = variant === 'phone' ? saltPepper(boxBlur(r.gray, r.W, r.H), 0.02, 32) : r.gray;
  return { ...r, gray, dpi };
}

// ---------------------------------------------------------------- OCR

const RTL = /[֐-׿؀-ۿݐ-ݿ]/;
const toRun = (str, bb, W, H, conf) => ({
  str,
  left: (bb.x0 / W) * 100,
  top: (bb.y0 / H) * 100,
  width: ((bb.x1 - bb.x0) / W) * 100,
  height: ((bb.y1 - bb.y0) / H) * 100,
  dir: RTL.test(str) ? 'rtl' : 'ltr',
  conf,
});

function collect(blocks, W, H) {
  const lines = [];
  const words = [];
  for (const block of blocks ?? []) for (const para of block.paragraphs ?? []) for (const line of para.lines ?? []) {
    const text = (line.text ?? '').replace(/\s+/g, ' ').trim();
    if (text) lines.push(toRun(text, line.bbox, W, H, line.confidence));
    for (const word of line.words ?? []) {
      const t = (word.text ?? '').trim();
      if (t) words.push(toRun(t, word.bbox, W, H, word.confidence));
    }
  }
  return { lines, words };
}

// ---------------------------------------------------------------- pdf.js position check

/** pdf.js text items as percent boxes of the view (same convention as toPageTextRuns). */
async function pdfjsRuns(row, view) {
  const { loading, doc } = await openPdf(row.pdf);
  try {
    const { items } = await (await doc.getPage(row.pageIndex + 1)).getTextContent();
    const w = view[2] - view[0];
    const h = view[3] - view[1];
    return items.filter((i) => i.str.trim()).map((i) => ({
      str: i.str,
      left: ((i.transform[4] - view[0]) / w) * 100,
      top: ((view[3] - (i.transform[5] + i.height)) / h) * 100,
      width: (i.width / w) * 100,
      height: (i.height / h) * 100,
    }));
  } finally {
    await loading.destroy();
  }
}

const norm = (s) => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
async function positionCheck(row, raster, ocr) {
  const refs = await pdfjsRuns(row, raster.view);
  const picks = ocr.lines.filter((l) => norm(l.str).length >= 12).filter((l) => refs.some((r) => norm(r.str).length >= 14 && norm(l.str).includes(norm(r.str)))).slice(0, 3);
  console.log(`\nposition check ${row.id} (percent of view; OCR line box vs pdf.js item inside it):`);
  for (const l of picks) {
    const r = refs.find((x) => norm(x.str).length >= 8 && norm(l.str).includes(norm(x.str)));
    const f = (n) => n.toFixed(2).padStart(6);
    console.log(`  "${l.str.slice(0, 40)}" ocr L${f(l.left)} T${f(l.top)} W${f(l.width)} H${f(l.height)} | pdfjs "${r.str.slice(0, 24)}" L${f(r.left)} T${f(r.top)} W${f(r.width)} H${f(r.height)}`);
    console.log(`     ocr centre y ${f(l.top + l.height / 2)} vs pdfjs ${f(r.top + r.height / 2)}; ocr x-span ${f(l.left)}..${f(l.left + l.width)} contains pdfjs ${f(r.left)}..${f(r.left + r.width)}`);
  }
  if (!picks.length) console.log('  no OCR line contained a pdf.js item of >= 14 chars');
}

// ---------------------------------------------------------------- main

const workers = new Map();
async function workerFor(langs) {
  if (!workers.has(langs)) {
    workers.set(langs, await Tesseract.createWorker(langs.split('+'), 1, { corePath, langPath: LIB, gzip: false, cacheMethod: 'none', logger: () => {} }));
  }
  return workers.get(langs);
}

const times = {};
let written = 0;
for (const row of rows) {
  const variants = row.native ? ['native'] : ['clean300', 'clean200', 'phone'];
  for (const variant of variants.filter((v) => !flag('variant') || v === flag('variant'))) {
    const base = `${row.id}-${variant}`;
    const ocrFile = path.join(OCR, `${base}.json`);
    if (has('skip-existing') && fs.existsSync(ocrFile) && fs.existsSync(path.join(RASTER, `${base}.json`))) continue;
    const raster = await makeRaster(row, variant);
    const pngFile = path.join(RASTER, `${base}.png`);
    writeGrayPng(pngFile, raster.gray, raster.W, raster.H);
    fs.writeFileSync(path.join(RASTER, `${base}.json`), JSON.stringify({
      row: row.id, pdf: path.relative(ROOT, row.pdf), pageIndex: row.pageIndex, variant, dpi: raster.dpi,
      widthPx: raster.W, heightPx: raster.H, pageWidthPts: raster.pageWidthPts, pageHeightPts: raster.pageHeightPts, view: raster.view,
    }, null, 1));
    const worker = await workerFor(row.langs);
    await worker.setParameters({ tessedit_pageseg_mode: '3', user_defined_dpi: String(Math.round(raster.dpi)) });
    const t0 = performance.now();
    const { data } = await worker.recognize(fs.readFileSync(pngFile), {}, { blocks: true });
    const ms = performance.now() - t0;
    const { lines, words } = collect(data.blocks, raster.W, raster.H);
    const ocr = { row: row.id, variant, langs: row.langs, psm: 3, ms: Math.round(ms), lines, words };
    fs.writeFileSync(ocrFile, JSON.stringify(ocr));
    written += 1;
    (times[row.id] ??= {})[variant] = Math.round(ms);
    console.log(`${base.padEnd(40)} ${raster.W}x${raster.H} @ ${raster.dpi.toFixed(0)} dpi  ${String(Math.round(ms)).padStart(6)} ms  ${lines.length} lines ${words.length} words`);
    if (has('check') && !row.native) await positionCheck(row, raster, ocr);
  }
}
for (const w of workers.values()) await w.terminate();
console.log(`\nwrote ${written} raster+ocr pairs under ${SCRATCH}`);
console.log(JSON.stringify(times));
