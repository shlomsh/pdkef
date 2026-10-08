// FORM-32 spike harness (not part of the test suite): raster ink x OCR / pdf.js text -> the production detectors -> the corpus scorer.
// Usage: node scripts/spike/form-32/scoreArms.mjs --scratch DIR [--stub] [--rows a,b]
// Arms: A production (once per row) | B raster ink, no text | C raster + OCR lines | Cw raster + OCR words
//       E raster + pdf.js text (upper bound for C) | D vector ink + OCR lines (clean300 OCR).
// Raster arms run the production sources minus `widgets` (a scan has no widgets; keeping them would hand AcroForm rows their answers).
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
const SCRATCH = arg('scratch');
if (!SCRATCH) throw new Error('--scratch DIR is required');
const STUB = process.argv.includes('--stub');
const ROWS = arg('rows')?.split(',');
const RASTER_DIR = path.join(SCRATCH, STUB ? 'stub/raster' : 'raster');
const OCR_DIR = path.join(SCRATCH, STUB ? 'stub/ocr' : 'ocr');
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

// OCR runs: `conf` stripped; `dir` kept only on the label copy.
const ocrRuns = (list) => ({
  runs: list.map(({ str, left, top, width, height }) => ({ str, left, top, width, height })),
  labelRuns: list.map(({ str, left, top, width, height, dir }) => ({ str, left, top, width, height, dir })),
});

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

const results = { scratch: SCRATCH, stub: STUB, rows: {} };
const table = [];
const record = (row, variant, arm, r, extra = {}) => {
  (results.rows[row] ??= {})[`${variant}/${arm}`] = { ...r, recall: pct(r.matched, r.targets), precision: pct(r.matched, r.candidates), ...extra };
  table.push({ row, variant, arm, ...r });
};
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

  // Arm A: the production path through score.js itself (checked against baselines), and through this harness's runArm (must agree).
  const prod = await scoreForm({ pdf: pdfPath, truth: truthPath, pageIndex });
  const base = form;
  const ok = prod.targets === base.targets && prod.candidates === base.candidates && prod.matched === base.matched;
  const mine = await runArm({ doc, truth, pageIndex, text: pdfjsText, sources: DEFAULT_SOURCES });
  const agree = mine.matched === prod.matched && mine.candidates === prod.candidates;
  if (!ok || !agree) baselineOk = false;
  console.error(`A ${key.padEnd(22)} baseline ${ok ? 'OK' : `MISMATCH (got ${prod.matched}/${prod.candidates}/${prod.targets}, want ${base.matched}/${base.candidates}/${base.targets})`}; harness ${agree ? 'OK' : `MISMATCH (${mine.matched}/${mine.candidates})`}`);
  if (!noText) record(row, 'vector', 'A', mine, { key, baselineOk: ok });

  const ocrFile = (v) => path.join(OCR_DIR, `${row}-${v}.json`);
  const variants = (noText ? ['native'] : ['clean300', 'clean200', 'phone']).filter((v) => fs.existsSync(ocrFile(v)) && fs.existsSync(path.join(RASTER_DIR, `${row}-${v}.png`)));
  for (const variant of variants) {
    const { ink, inkMs } = await loadRaster(row, variant);
    const ocr = JSON.parse(fs.readFileSync(ocrFile(variant), 'utf8'));
    const sources = [rasterSource(ink, pageIndex), ...nonInk];
    const arms = {
      B: { runs: [], labelRuns: [] },
      C: ocrRuns(ocr.lines),
      Cw: ocrRuns(ocr.words),
      ...(noText ? {} : { E: pdfjsText }),
    };
    for (const [arm, text] of Object.entries(arms)) record(row, variant, arm, await runArm({ doc, truth, pageIndex, text, sources }), { inkMs: +inkMs.toFixed(0), ocrMs: ocr.ms });
    if (variant === 'clean300' && !noText) record(row, variant, 'D', await runArm({ doc, truth, pageIndex, text: ocrRuns(ocr.lines), sources: DEFAULT_SOURCES }), { ocrMs: ocr.ms });
  }
}

const ARM_ORDER = ['A', 'B', 'C', 'Cw', 'E', 'D'];
table.sort((a, b) => a.row.localeCompare(b.row) || a.variant.localeCompare(b.variant) || ARM_ORDER.indexOf(a.arm) - ARM_ORDER.indexOf(b.arm));
console.log(['row'.padEnd(28), 'variant'.padEnd(9), 'arm'.padEnd(3), 'targets', 'cands', 'recall%', 'prec%'].join(' '));
for (const t of table) console.log([t.row.padEnd(28), t.variant.padEnd(9), t.arm.padEnd(3), String(t.targets).padStart(7), String(t.candidates).padStart(5), fmt(pct(t.matched, t.targets)).padStart(7), fmt(pct(t.matched, t.candidates)).padStart(5)].join(' '));

// Summary: micro-averaged over the flat rows (AcroForm rows reported above, excluded here), per arm and variant.
const flat = (t) => !ACROFORM.has(Object.entries(BASELINES.forms).find(([, f]) => path.basename(f.truth, '.json') === t.row)?.[0]);
results.summary = {};
console.log('\nSummary (micro-averaged over flat rows, AcroForm rows excluded)');
const groups = new Map();
for (const t of table.filter(flat)) { const k = `${t.arm}|${t.arm === 'A' ? 'vector' : t.variant}`; groups.set(k, [...(groups.get(k) ?? []), t]); }
for (const arm of ARM_ORDER) for (const [k, ts] of groups) {
  if (!k.startsWith(`${arm}|`)) continue;
  const sum = (f) => ts.reduce((s, t) => s + t[f], 0);
  const r = { rows: ts.length, targets: sum('targets'), candidates: sum('candidates'), matched: sum('matched') };
  results.summary[k] = { ...r, recall: pct(r.matched, r.targets), precision: pct(r.matched, r.candidates) };
  console.log(`${k.replace('|', ' ').padEnd(16)} rows ${String(r.rows).padStart(2)}  targets ${String(r.targets).padStart(4)}  cands ${String(r.candidates).padStart(4)}  recall ${fmt(pct(r.matched, r.targets))}%  precision ${fmt(pct(r.matched, r.candidates))}%`);
}
fs.writeFileSync(path.join(SCRATCH, 'results.json'), JSON.stringify(results, null, 2));
console.error(baselineOk ? 'arm A: all rows reproduce baselines.json' : 'arm A: MISMATCH against baselines.json');
