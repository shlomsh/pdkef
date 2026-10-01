// FORM-07 spike harness (not part of the test suite): raster ink -> the existing detectors -> scored against truth.
// Usage: node src/tmpspike/scoreRaster.mjs [pdf] [truth] [--dump]
import fs from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { extractPageImage } from './extractImage.mjs';
import { inkFromRaster } from '../tools/sign/fields/rasterInk.js';
import { detectFormFields } from '../tools/sign/fields/detectFormFields.ts';
import { toPagePercentBox } from '../editor/geometry/coords.ts';
import { titleLineWritable } from '../tools/sign/fields/combTitleLine.js';
import { pageGeometry } from '../tools/sign/fields/detectFormFields.ts';
import { detectRegions } from '../tools/sign/fields/formGrid.js';
import { detectCellCandidates } from '../tools/sign/fields/formCells.js';
import { detectLineCandidates } from '../tools/sign/fields/formLines.js';
import { horizontalRules } from '../tools/sign/fields/inkEdges.js';
import { greedyMatch } from '../tools/sign/fields/corpus/scoring/match.js';
import { toCandidates } from '../tools/sign/fields/corpus/scoring/candidates.js';
import { loadTruth, IOU } from '../tools/sign/fields/corpus/scoring/score.js';

const ROOT = 'src/tools/sign/fields/corpus/scoring/';
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const pdf = pos[0] ?? `${ROOT}forms/irs-1040-1970.pdf`;
const truthPath = pos[1] ?? `${ROOT}ground-truth/irs-1040-1970-page1.json`;
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : 'n/a');

const img = await extractPageImage(pdf);
const flag = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? Number(hit.split('=')[1]) : fallback; };
// Robustness perturbations on the real scan: --downscale=N (box filter, DPI / N), --rotate=deg (extra skew; the truth then
// sits in a rotated frame, so read recall as relative), --noise=p (salt and pepper, fraction of pixels).
{
  const N = flag('downscale', 1), rot = flag('rotate', 0), noise = flag('noise', 0);
  if (N > 1) {
    const w = Math.floor(img.width / N), h = Math.floor(img.height / N), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { let sum = 0; for (let dy = 0; dy < N; dy += 1) for (let dx = 0; dx < N; dx += 1) sum += img.gray[(y * N + dy) * img.width + x * N + dx]; out[y * w + x] = sum / (N * N); }
    img.gray = out; img.width = w; img.height = h;
  }
  if (rot) {
    const { width: w, height: h } = img, out = new Uint8Array(w * h).fill(255), r = (rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r), cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const sx = Math.round(cx + (x - cx) * cos + (y - cy) * sin), sy = Math.round(cy - (x - cx) * sin + (y - cy) * cos); if (sx >= 0 && sy >= 0 && sx < w && sy < h) out[y * w + x] = img.gray[sy * w + sx]; }
    img.gray = out;
  }
  if (noise) { let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); for (let i = 0; i < img.gray.length; i += 1) if (rnd() < noise) img.gray[i] = rnd() < 0.5 ? 0 : 255; }
}
const t0 = performance.now();
const ink = inkFromRaster({ data: img.gray, width: img.width, height: img.height }, { pageWidthPts: img.pageWidthPts, pageHeightPts: img.pageHeightPts });
const ms = performance.now() - t0;
// view origin (cropbox) offset
for (const v of ink.verticals) { v.x += img.view[0]; v.y0 += img.view[1]; v.y1 += img.view[1]; }
for (const h of ink.horizontals) { h.y += img.view[1]; h.x0 += img.view[0]; h.x1 += img.view[0]; }
for (const r of ink.rects) { r.x += img.view[0]; r.y += img.view[1]; }

console.log(`image ${img.width}x${img.height}, ${(img.width / (img.pageWidthPts / 72)).toFixed(0)} dpi, kind ${img.kind}`);
console.log(`skew ${ink.skewDegrees.toFixed(3)} deg; inkFromRaster ${ms.toFixed(0)} ms`);
console.log(`ink: ${ink.verticals.length} verticals, ${ink.horizontals.length} horizontals, ${ink.rects.length} rects`);

const doc = await PDFDocument.load(fs.readFileSync(pdf), { ignoreEncryption: true });
// The product's inkSource (detectFormFields.ts), with the ink coming from the raster instead of collectPageInk.
const MAX_CAPTIONED_BOX_POINTS = 45;
const rasterSource = {
  name: 'ink',
  async detect(page, { geometry, pageIndex, textRuns }) {
    if (pageIndex !== 0) return { combs: [], checkboxes: [], cells: [] };
    const { combs, checkboxes } = detectRegions(ink, geometry, pageIndex);
    const cells = detectCellCandidates(ink, geometry, pageIndex, textRuns);
    const lines = detectLineCandidates(ink, geometry, pageIndex, textRuns, [...combs, ...checkboxes, ...cells]);
    const rules = horizontalRules(ink, { includeRectSides: true }).map((r) => toPagePercentBox(geometry, { x0: r.x0, y0: r.y, x1: r.x1, y1: r.y }));
    const maxHeight = toPagePercentBox(geometry, { x0: 0, y0: 0, x1: 1, y1: MAX_CAPTIONED_BOX_POINTS }).height;
    return { combs: titleLineWritable(combs, { cells: [...cells, ...lines], checkboxes, textRuns, rules, maxHeight }), checkboxes, cells: [...cells, ...lines] };
  },
};
// --oracle-captions: an upper bound, NOT a product path. It hands the detectors a perfect caption under every
// signature/date target (what a flawless OCR would give), to see whether the raster ink then drives formLines.
const truthForOracle = loadTruth(truthPath);
const oracleRuns = process.argv.includes('--oracle-captions')
  ? truthForOracle.targets.filter((t) => t.kind === 'signature' || t.kind === 'date').map((t) => ({
    str: t.kind === 'date' ? 'Date' : 'Signature', left: t.bounds.x * 100, top: (t.bounds.y + t.bounds.height + 0.002) * 100, width: Math.min(t.bounds.width, 0.08) * 100, height: 0.01 * 100,
  }))
  : [];
const found = await detectFormFields(doc, { textRuns: Array.from({ length: doc.getPageCount() }, (_, i) => (i === 0 ? oracleRuns : [])), sources: [rasterSource] });
const { combs, checkboxes, cells } = found;
const lines = [];
const candidates = toCandidates(found, 0);
const truth = loadTruth(truthPath);
const { matches, misses, falsePositives } = greedyMatch(truth.targets, candidates, IOU);
console.log(`candidates ${candidates.length} (combs ${combs.length}, checkboxes ${checkboxes.length}, cells ${cells.length}, lines ${lines.length}); matched ${matches.length}/${truth.targets.length}`);
console.log(`recall ${pct(matches.length, truth.targets.length)}  precision ${pct(matches.length, candidates.length)}`);
const kinds = new Set([...truth.targets.map((t) => t.kind), ...candidates.map((c) => c.kind)]);
for (const kind of kinds) {
  const tg = truth.targets.filter((t) => t.kind === kind).length;
  const found = matches.filter((m) => m.t.kind === kind).length;
  const cd = candidates.filter((c) => c.kind === kind).length;
  const good = matches.filter((m) => m.c.kind === kind).length;
  console.log(`  ${kind.padEnd(11)} recall ${found}/${tg} ${pct(found, tg)}  precision ${good}/${cd} ${pct(good, cd)}`);
}
if (process.argv.includes('--dump')) {
  const f = (b) => `x${b.x.toFixed(3)} y${b.y.toFixed(3)} w${b.width.toFixed(3)} h${b.height.toFixed(3)}`;
  console.log('MISSES'); for (const t of misses) console.log(' ', t.id, t.kind, f(t.bounds), (t.label || '').slice(0, 30));
  console.log('FALSE POSITIVES'); for (const c of falsePositives) console.log(' ', c.id, c.kind, f(c.bounds));
}
if (process.argv.includes('--ink')) fs.writeFileSync(process.env.INK_OUT, JSON.stringify(ink));

// Ink adequacy diagnostic: for each target, is the rule under it (and a wall beside it) in the raster ink?
// This separates "the raster lost the ink" from "the detectors need something the ink cannot give" (text, an open side).
{
  const W = img.pageWidthPts, Hp = img.pageHeightPts;
  const rules = ink.horizontals.map((h) => ({ y: Hp - (h.y - img.view[1]), x0: h.x0, x1: h.x1 })); // top-down y
  const walls = ink.verticals.map((v) => ({ x: v.x, y0: Hp - (v.y1 - img.view[1]), y1: Hp - (v.y0 - img.view[1]) }));
  const cover = (y, x0, x1, tol) => {
    const parts = rules.filter((r) => Math.abs(r.y - y) <= tol).map((r) => [Math.max(r.x0, x0), Math.min(r.x1, x1)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let covered = 0, end = -Infinity;
    for (const [a, b] of parts) { const s0 = Math.max(a, end); if (b > s0) covered += b - s0; end = Math.max(end, b); }
    return covered / (x1 - x0);
  };
  const wall = (x, y0, y1, tol) => walls.some((v) => Math.abs(v.x - x) <= tol && Math.min(v.y1, y1) - Math.max(v.y0, y0) >= 0.6 * (y1 - y0));
  const rows = [];
  for (const t of truth.targets) {
    if (t.kind === 'checkbox') continue;
    const b = t.bounds; const x0 = b.x * W, x1 = (b.x + b.width) * W, y0 = b.y * Hp, y1 = (b.y + b.height) * Hp;
    const bottom = cover(y1, x0, x1, 3), top = cover(y0, x0, x1, 3);
    const left = wall(x0, y0, y1, 3), right = wall(x1, y0, y1, 3);
    rows.push({ id: t.id, kind: t.kind, bottom: +bottom.toFixed(2), top: +top.toFixed(2), left, right, hit: matches.some((m) => m.t.id === t.id) });
  }
  const bottomOk = rows.filter((r) => r.bottom >= 0.7);
  console.log(`ink adequacy (non-checkbox targets): bottom rule present for ${bottomOk.length}/${rows.length}; found by detectors ${rows.filter((r) => r.hit).length}`);
  if (process.argv.includes('--adequacy')) for (const r of rows) console.log(' ', JSON.stringify(r));
}
if (process.argv.includes('--cands')) {
  for (const c of candidates) console.log('cand', c.kind, `x${c.bounds.x.toFixed(3)} y${c.bounds.y.toFixed(3)} w${c.bounds.width.toFixed(3)} h${c.bounds.height.toFixed(3)}`);
}
