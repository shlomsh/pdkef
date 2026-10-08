// FORM-33 spike harness (not part of the test suite): FFDetr (RF-DETR on CommonForms, ONNX via onnxruntime-node) scored with the FORM-32 harness.
// Usage: node scripts/spike/form-33/scoreFfdetr.mjs --scratch33 DIR/form33/ffdetr --raster DIR/form32/raster [--int8] [--rows a,b]
// Arms: A production | F ffdetr alone (thresholds 0.3/0.5/0.7, every variant) | BF raster ink (FORM-32 arm B) + ffdetr last (0.5)
//       AF production vector sources + ffdetr on clean300 (0.5). Detections are cached in DIR/det/<row>-<variant>[-int8].json with ms.
// onnxruntime-node is loaded from DIR/ort (a throwaway npm project), never from the repo. Class names, preprocessing and outputs come from meta.json.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from '@cantoo/pdf-lib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { inkFromRaster } from '../../../src/tools/sign/fields/rasterInk.js';
import { DEFAULT_SOURCES, detectFormFields, pageGeometry, toPageTextRuns } from '../../../src/tools/sign/fields/detectFormFields.ts';
import { toPagePercentBox } from '../../../src/editor/geometry/coords.ts';
import { titleLineWritable } from '../../../src/tools/sign/fields/combTitleLine.js';
import { detectRegions } from '../../../src/tools/sign/fields/formGrid.js';
import { detectCellCandidates } from '../../../src/tools/sign/fields/formCells.js';
import { detectLineCandidates } from '../../../src/tools/sign/fields/formLines.js';
import { horizontalRules } from '../../../src/tools/sign/fields/inkEdges.js';
import { greedyMatch } from '../../../src/tools/sign/fields/corpus/scoring/match.js';
import { toCandidates } from '../../../src/tools/sign/fields/corpus/scoring/candidates.js';
import { loadTruth, IOU, scoreForm } from '../../../src/tools/sign/fields/corpus/scoring/score.js';
import { labelFieldCandidates } from '../../../src/editor/adapters/pdf/fieldLabels.js';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? null : process.argv[i + 1]; };
const S33 = arg('scratch33');
const RASTER_DIR = arg('raster');
if (!S33 || !RASTER_DIR) throw new Error('--scratch33 DIR and --raster DIR are required');
const INT8 = process.argv.includes('--int8');
const ROWS = arg('rows')?.split(',');
const DET_DIR = path.join(S33, '..', 'det');
fs.mkdirSync(DET_DIR, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const BASELINES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tools/sign/fields/corpus/scoring/baselines.json'), 'utf8'));
const ACROFORM = new Set(['irs-1040-2024', 'thai-lor-yor-01-2562']); // widget-derived or widget-explained truth: excluded from the summary
const NO_TEXT_LAYER = new Set(['irs-1040-1970']);
const MAX_CAPTIONED_BOX_POINTS = 45;
const pct = (a, b) => (b > 0 ? (a / b) * 100 : null);
const fmt = (v) => (v === null ? 'n/a' : v.toFixed(1));

// pdf.js text for one page, as score.js reads it (not exported there).
async function pdfText(bytes, pageIndex, geometry) {
  const require = createRequire(import.meta.url);
  const dir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: `${path.join(dir, 'standard_fonts')}${path.sep}`, cMapUrl: `${path.join(dir, 'cmaps')}${path.sep}`, wasmUrl: `${path.join(dir, 'wasm')}${path.sep}`, cMapPacked: true, useSystemFonts: false });
  try {
    const doc = await loading.promise;
    const { items } = await (await doc.getPage(pageIndex + 1)).getTextContent();
    return { runs: toPageTextRuns(items, geometry), labelRuns: items.flatMap((item) => toPageTextRuns([item], geometry).map((run) => ({ ...run, dir: item.dir }))) };
  } finally { await loading.destroy(); }
}

async function loadRaster(row, variant) {
  const meta = JSON.parse(fs.readFileSync(path.join(RASTER_DIR, `${row}-${variant}.json`), 'utf8'));
  const img = await loadImage(fs.readFileSync(path.join(RASTER_DIR, `${row}-${variant}.png`)));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
  const gray = new Uint8Array(img.width * img.height);
  for (let i = 0; i < gray.length; i += 1) gray[i] = rgba[i * 4];
  const t0 = performance.now();
  const ink = inkFromRaster({ data: gray, width: img.width, height: img.height }, { pageWidthPts: meta.pageWidthPts, pageHeightPts: meta.pageHeightPts });
  const inkMs = performance.now() - t0;
  // cropbox view offset, as scoreRaster does
  const [vx, vy] = meta.view;
  for (const v of ink.verticals) { v.x += vx; v.y0 += vy; v.y1 += vy; }
  for (const h of ink.horizontals) { h.y += vy; h.x0 += vx; h.x1 += vx; }
  for (const r of ink.rects) { r.x += vx; r.y += vy; }
  return { ink, meta, inkMs };
}

// The production inkSource, with the ink coming from the raster, on the row's page only.
const rasterSource = (ink, scoredPage) => ({
  name: 'ink',
  async detect(page, { geometry, pageIndex, textRuns }) {
    if (pageIndex !== scoredPage) return { combs: [], checkboxes: [], cells: [] };
    const { combs, checkboxes } = detectRegions(ink, geometry, pageIndex);
    const cells = detectCellCandidates(ink, geometry, pageIndex, textRuns);
    const lines = detectLineCandidates(ink, geometry, pageIndex, textRuns, [...combs, ...checkboxes, ...cells]);
    const rules = horizontalRules(ink, { includeRectSides: true }).map((r) => toPagePercentBox(geometry, { x0: r.x0, y0: r.y, x1: r.x1, y1: r.y }));
    const maxHeight = toPagePercentBox(geometry, { x0: 0, y0: 0, x1: 1, y1: MAX_CAPTIONED_BOX_POINTS }).height;
    return { combs: titleLineWritable(combs, { cells: [...cells, ...lines], checkboxes, textRuns, rules, maxHeight }), checkboxes, cells: [...cells, ...lines] };
  },
});

// ---- FFDetr ----
const META = JSON.parse(fs.readFileSync(path.join(S33, 'meta.json'), 'utf8'));
const KIND = (name) => (/signature/i.test(name) ? 'signature' : /choice|button|check/i.test(name) ? 'checkbox' : /text/i.test(name) ? 'text' : null);
const ort = createRequire(path.join(S33, 'ort', 'package.json'))('onnxruntime-node');
const act = (x) => (META.scoreActivation === 'softmax' ? x : 1 / (1 + Math.exp(-x)));
let session = null;
const int8File = ['model.int8.onnx', 'model.int8.failed-parity.onnx'].find((f) => fs.existsSync(path.join(S33, f)));
const modelPath = path.join(S33, INT8 ? int8File : 'model.onnx'); // the failed-parity int8 file is used only when asked for, and reported as such
if (INT8) console.error(`int8 model: ${int8File}`);

// Bilinear, align_corners=false, no antialias: torch F.interpolate, which the model was exported against (canvas drawImage antialiases and drifts).
async function loadImageRgba(file, size) {
  const img = await loadImage(fs.readFileSync(file));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, img.width, img.height).data;
  const out = new Float32Array(size * size * 4);
  const sx = img.width / size; const sy = img.height / size;
  for (let y = 0; y < size; y += 1) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5); const y0 = Math.min(img.height - 1, Math.floor(fy)); const y1 = Math.min(img.height - 1, y0 + 1); const wy = fy - y0;
    for (let x = 0; x < size; x += 1) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5); const x0 = Math.min(img.width - 1, Math.floor(fx)); const x1 = Math.min(img.width - 1, x0 + 1); const wx = fx - x0;
      for (let c = 0; c < 3; c += 1) {
        const p = (yy, xx) => src[(yy * img.width + xx) * 4 + c];
        out[(y * size + x) * 4 + c] = (p(y0, x0) * (1 - wx) + p(y0, x1) * wx) * (1 - wy) + (p(y1, x0) * (1 - wx) + p(y1, x1) * wx) * wy;
      }
    }
  }
  return out;
}

// One raw ONNX pass on a PNG -> boxes in percent of the image, every class's best score kept above 0.05 (thresholds applied later).
async function runOnnx(file) {
  session ??= await ort.InferenceSession.create(modelPath);
  const size = Array.isArray(META.inputSize) ? META.inputSize[0] : META.inputSize;
  const rgba = await loadImageRgba(file, size);
  const plane = size * size;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) for (let c = 0; c < 3; c += 1) data[c * plane + i] = (rgba[i * 4 + c] / 255 - META.mean[c]) / META.std[c];
  const input = new ort.Tensor('float32', data, [1, 3, size, size]);
  const t0 = performance.now();
  const out = await session.run({ [session.inputNames[0]]: input });
  const ms = performance.now() - t0;
  const boxes = out[META.outputs.find((o) => o.shape.at(-1) === 4).name].data;
  const logits = out[META.outputs.find((o) => o.shape.at(-1) !== 4).name].data;
  const Q = META.numQueries; const C = logits.length / Q; const off = 0; // only channels 0..classes.length-1 are trained; the rest are unused COCO-head leftovers
  const dets = [];
  for (let q = 0; q < Q; q += 1) {
    for (let k = 0; k < META.classes.length; k += 1) {
      const score = act(logits[q * C + off + k]);
      if (score < 0.05) continue;
      const [cx, cy, w, h] = META.boxFormat === 'xyxy' ? (() => { const [x0, y0, x1, y1] = [...boxes.slice(q * 4, q * 4 + 4)]; return [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0]; })() : [...boxes.slice(q * 4, q * 4 + 4)];
      dets.push({ cls: META.classes[k], score, left: (cx - w / 2) * 100, top: (cy - h / 2) * 100, width: w * 100, height: h * 100 });
    }
  }
  return { ms, boxes: dets };
}

async function detections(row, variant) {
  const cache = path.join(DET_DIR, `${row}-${variant}${INT8 ? '-int8' : ''}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const r = await runOnnx(path.join(RASTER_DIR, `${row}-${variant}.png`));
  fs.writeFileSync(cache, JSON.stringify(r));
  return r;
}

// --parity: the Node pass against reference/*.json (PyTorch), max delta over matched boxes.
if (process.argv.includes('--parity')) {
  for (const name of ['practice-form-page1-clean300', 'health-page1-clean300']) {
    const ref = JSON.parse(fs.readFileSync(path.join(S33, 'reference', `${name}.json`), 'utf8')).boxes;
    const mine = (await runOnnx(path.join(RASTER_DIR, `${name}.png`))).boxes.filter((d) => d.score >= 0.3);
    const iou = (a, b) => { const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left); const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top); const i = Math.max(0, w) * Math.max(0, h); return i / (a.width * a.height + b.width * b.height - i); };
    let maxBox = 0; let maxScore = 0; let missing = 0; const used = new Set();
    for (const r of ref) {
      let best = null;
      for (const m of mine) if (m.cls === r.cls && !used.has(m) && (!best || iou(r, m) > iou(r, best))) best = m;
      if (!best || iou(r, best) < 0.5) { missing += 1; continue; }
      used.add(best);
      maxBox = Math.max(maxBox, Math.abs(r.left - best.left), Math.abs(r.top - best.top), Math.abs(r.width - best.width), Math.abs(r.height - best.height));
      maxScore = Math.max(maxScore, Math.abs(r.score - best.score));
    }
    console.log(`${name}: ref ${ref.length}, node ${mine.length}, unmatched ref ${missing}, extra node ${mine.length - used.size}, max box delta ${maxBox.toFixed(3)} pct, max score delta ${maxScore.toFixed(4)}`);
  }
  process.exit(0);
}

// A FieldSource over cached detections for the scored page. Checkboxes are {left,top,width,height}; combs stay empty (FFDetr has no comb class).
const ffdetrSource = (det, scoredPage, threshold) => ({
  name: 'ffdetr',
  async detect(_page, { pageIndex }) {
    const cells = []; const checkboxes = [];
    if (pageIndex === scoredPage) {
      for (const d of det.boxes) {
        const kind = KIND(d.cls);
        if (!kind || d.score < threshold) continue;
        const box = { pageIndex, left: d.left, top: d.top, width: d.width, height: d.height };
        (kind === 'checkbox' ? checkboxes : cells).push(kind === 'checkbox' ? box : { ...box, kind });
      }
    }
    return { combs: [], checkboxes, cells };
  },
});

// score.js's scoreForm body, parameterised on sources and text. Returns the counts and per-kind buckets.
async function runArm({ doc, truth, pageIndex, text, sources }) {
  const textRuns = Array.from({ length: doc.getPageCount() }, (_, i) => (i === pageIndex ? text.runs : []));
  const found = await detectFormFields(doc, { textRuns, sources });
  const on = (r) => r.pageIndex === pageIndex;
  const d = { combs: found.combs.filter(on), cells: found.cells.filter(on), checkboxes: found.checkboxes.filter(on) };
  const labelled = {
    combs: labelFieldCandidates(d.combs.map((r) => ({ ...r, id: 'comb' })), text.labelRuns),
    cells: d.cells,
    checkboxes: labelFieldCandidates(d.checkboxes.map((r) => ({ ...r, id: 'checkbox' })), text.labelRuns),
  };
  const candidates = toCandidates(labelled, pageIndex);
  const { matches } = greedyMatch(truth.targets, candidates, IOU);
  const byKind = {};
  const bucket = (k) => (byKind[k] ??= { targets: 0, found: 0, candidates: 0, matchedCandidates: 0 });
  for (const t of truth.targets) bucket(t.kind).targets += 1;
  for (const c of candidates) bucket(c.kind).candidates += 1;
  for (const m of matches) { bucket(m.t.kind).found += 1; bucket(m.c.kind).matchedCandidates += 1; }
  return { targets: truth.targets.length, candidates: candidates.length, matched: matches.length, byKind };
}

const results = { scratch33: S33, int8: INT8, rows: {}, onnxMs: {} };
const table = [];
const record = (row, variant, arm, r, extra = {}) => {
  (results.rows[row] ??= {})[`${variant}/${arm}`] = { ...r, recall: pct(r.matched, r.targets), precision: pct(r.matched, r.candidates), ...extra };
  table.push({ row, variant, arm, ...r });
};
const kindTotals = {}; // F at 0.5, flat rows with text layers, all raster variants pooled per variant
let baselineOk = true;

for (const [key, form] of Object.entries(BASELINES.forms)) {
  const truthPath = path.join(ROOT, form.truth);
  const row = path.basename(truthPath, '.json');
  if (ROWS && !ROWS.includes(row)) continue;
  const truth = loadTruth(truthPath);
  const pageIndex = truth.pageIndex ?? 0;
  const pdfPath = path.join(ROOT, form.pdf);
  const bytes = fs.readFileSync(pdfPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const geometry = pageGeometry(doc.getPage(pageIndex));
  const noText = NO_TEXT_LAYER.has(key);
  const pdfjsText = noText ? { runs: [], labelRuns: [] } : await pdfText(bytes, pageIndex, geometry);
  const nonInk = DEFAULT_SOURCES.filter((s) => s.name !== 'ink' && s.name !== 'widgets');
  const empty = { runs: [], labelRuns: [] };

  // Arm A: the production path through score.js itself (checked against baselines), and through this harness's runArm (must agree).
  const prod = await scoreForm({ pdf: pdfPath, truth: truthPath, pageIndex });
  const ok = prod.targets === form.targets && prod.candidates === form.candidates && prod.matched === form.matched;
  const mine = await runArm({ doc, truth, pageIndex, text: pdfjsText, sources: DEFAULT_SOURCES });
  const agree = mine.matched === prod.matched && mine.candidates === prod.candidates;
  if (!ok || !agree) baselineOk = false;
  console.error(`A ${key.padEnd(22)} baseline ${ok ? 'OK' : `MISMATCH (got ${prod.matched}/${prod.candidates}/${prod.targets}, want ${form.matched}/${form.candidates}/${form.targets})`}; harness ${agree ? 'OK' : `MISMATCH (${mine.matched}/${mine.candidates})`}`);
  if (!noText) record(row, 'vector', 'A', mine, { key, baselineOk: ok });

  const variants = (noText ? ['native'] : ['clean300', 'clean200', 'phone']).filter((v) => fs.existsSync(path.join(RASTER_DIR, `${row}-${v}.png`)));
  for (const variant of variants) {
    const det = await detections(row, variant);
    (results.onnxMs[variant] ??= []).push(+det.ms.toFixed(0));
    for (const th of [0.3, 0.5, 0.7]) {
      const r = await runArm({ doc, truth, pageIndex, text: empty, sources: [ffdetrSource(det, pageIndex, th)] });
      record(row, variant, `F${th}`, r, { onnxMs: +det.ms.toFixed(0) });
      if (th === 0.5 && !ACROFORM.has(key) && !noText) {
        const t = (kindTotals[variant] ??= {});
        for (const [k, b] of Object.entries(r.byKind)) { const x = (t[k] ??= { targets: 0, found: 0, candidates: 0, matchedCandidates: 0 }); for (const f of Object.keys(x)) x[f] += b[f]; }
      }
    }
    const { ink, inkMs } = await loadRaster(row, variant);
    record(row, variant, 'BF', await runArm({ doc, truth, pageIndex, text: empty, sources: [rasterSource(ink, pageIndex), ...nonInk, ffdetrSource(det, pageIndex, 0.5)] }), { inkMs: +inkMs.toFixed(0) });
    if (variant === 'clean300' && !noText) record(row, variant, 'AF', await runArm({ doc, truth, pageIndex, text: pdfjsText, sources: [...DEFAULT_SOURCES, ffdetrSource(det, pageIndex, 0.5)] }));
  }
}

const ARM_ORDER = ['A', 'F0.3', 'F0.5', 'F0.7', 'BF', 'AF'];
table.sort((a, b) => a.row.localeCompare(b.row) || a.variant.localeCompare(b.variant) || ARM_ORDER.indexOf(a.arm) - ARM_ORDER.indexOf(b.arm));
console.log(['row'.padEnd(28), 'variant'.padEnd(9), 'arm'.padEnd(5), 'targets', 'cands', 'recall%', 'prec%'].join(' '));
for (const t of table) console.log([t.row.padEnd(28), t.variant.padEnd(9), t.arm.padEnd(5), String(t.targets).padStart(7), String(t.candidates).padStart(5), fmt(pct(t.matched, t.targets)).padStart(7), fmt(pct(t.matched, t.candidates)).padStart(5)].join(' '));

// Summary: micro-averaged over the flat rows (AcroForm rows reported above, excluded here), per arm and variant. The native row is its own line.
const keyOf = (t) => Object.entries(BASELINES.forms).find(([, f]) => path.basename(f.truth, '.json') === t.row)?.[0];
const flat = (t) => !ACROFORM.has(keyOf(t)) && !NO_TEXT_LAYER.has(keyOf(t));
results.summary = {};
console.log('\nSummary (micro-averaged over flat rows, AcroForm rows excluded)');
const groups = new Map();
for (const t of table.filter(flat)) { const k = `${t.arm}|${t.arm === 'A' ? 'vector' : t.variant}`; groups.set(k, [...(groups.get(k) ?? []), t]); }
const line = (k, ts) => {
  const sum = (f) => ts.reduce((s, t) => s + t[f], 0);
  const r = { rows: ts.length, targets: sum('targets'), candidates: sum('candidates'), matched: sum('matched') };
  results.summary[k] = { ...r, recall: pct(r.matched, r.targets), precision: pct(r.matched, r.candidates) };
  console.log(`${k.replace('|', ' ').padEnd(18)} rows ${String(r.rows).padStart(2)}  targets ${String(r.targets).padStart(4)}  cands ${String(r.candidates).padStart(4)}  recall ${fmt(pct(r.matched, r.targets))}%  precision ${fmt(pct(r.matched, r.candidates))}%`);
};
for (const arm of ARM_ORDER) for (const [k, ts] of groups) if (k.startsWith(`${arm}|`)) line(k, ts);
console.log('\nNative row (irs-1040-1970)');
for (const t of table.filter((x) => NO_TEXT_LAYER.has(keyOf(x)))) console.log(`${t.arm.padEnd(5)} targets ${t.targets}  cands ${t.candidates}  recall ${fmt(pct(t.matched, t.targets))}%  precision ${fmt(pct(t.matched, t.candidates))}%`);

results.perKindF05 = {};
console.log('\nF@0.5 per kind (flat rows)');
for (const [variant, kinds] of Object.entries(kindTotals)) for (const [k, b] of Object.entries(kinds)) {
  results.perKindF05[`${variant}/${k}`] = { ...b, recall: pct(b.found, b.targets), precision: pct(b.matchedCandidates, b.candidates) };
  console.log(`${variant.padEnd(9)} ${k.padEnd(10)} targets ${String(b.targets).padStart(4)} recall ${fmt(pct(b.found, b.targets)).padStart(5)}%  cands ${String(b.candidates).padStart(4)} precision ${fmt(pct(b.matchedCandidates, b.candidates)).padStart(5)}%`);
}
console.log('\nONNX ms per page', INT8 ? '(int8)' : '(fp32)');
for (const [v, ms] of Object.entries(results.onnxMs)) { const sorted = [...ms].sort((a, b) => a - b); console.log(`${v.padEnd(9)} n ${ms.length}  median ${sorted[sorted.length >> 1]}  max ${sorted.at(-1)}  (cached runs keep their original ms)`); }
fs.writeFileSync(path.join(S33, '..', INT8 ? 'results.int8.json' : 'results.json'), JSON.stringify(results, null, 2));
console.error(baselineOk ? 'arm A: all rows reproduce baselines.json' : 'arm A: MISMATCH against baselines.json');
