// Dev-time generator for the snap corpus (SNG-09): page rasters and exact printed-rule truth.
// Usage: node scripts/snap-corpus/build-pages.mjs [--overlay-dir <dir>] [--probe]
//
// Not part of the test suite and never imported by product code. It shells out to pdftoppm (dev time
// only) to render each form's page 1 as a clean gray raster, reads the same page's vector ink with the
// product's own `collectPageInk`, converts it to the README frame (points, origin top-left, y down) and
// verifies the two line up. Idempotent and deterministic: the same inputs give byte-identical outputs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { collectPageInk, pageCropBox } from '../../src/tools/sign/fields/pageInk.js';
import { horizontalRules } from '../../src/tools/sign/fields/inkEdges.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SNAP = path.join(ROOT, 'src/tools/sign/fields/corpus/snap');
const FORMS = path.join(ROOT, 'src/tools/sign/fields/corpus/scoring/forms');
const PDFTOPPM = '/opt/homebrew/bin/pdftoppm';
const DPI = 200;
const PX_PER_POINT = DPI / 72;
const EXCLUDED = new Set(['irs-1040-1970.pdf']); // a true scan: no vector ink to be truth
const MIN_RULES = 15;
const MIN_LENGTH = 20; // points
const MAX_THICKNESS = 3; // points
const MERGE_TOLERANCE = 0.5; // points
const DARK = 128; // mean gray below this along a rule means the raster shows it
const MIN_ALIGNMENT = 0.8; // a form whose ink reader mostly disagrees with its raster (light ink) is skipped
const SIZE_BUDGET = 3 * 1024 * 1024;

const argv = process.argv.slice(2);
const probe = argv.includes('--probe');
const overlayDir = argv.includes('--overlay-dir') ? argv[argv.indexOf('--overlay-dir') + 1] : null;
const round = (n, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Binary PGM (P5, maxval 255) -> { width, height, data }. */
function parsePgm(buffer) {
  let pos = 0;
  const token = () => {
    while (buffer[pos] === 0x20 || buffer[pos] === 0x0a || buffer[pos] === 0x0d || buffer[pos] === 0x09) pos += 1;
    if (buffer[pos] === 0x23) { while (buffer[pos] !== 0x0a) pos += 1; return token(); }
    const start = pos;
    while (pos < buffer.length && ![0x20, 0x0a, 0x0d, 0x09].includes(buffer[pos])) pos += 1;
    return buffer.toString('latin1', start, pos);
  };
  if (token() !== 'P5') throw new Error('not a binary PGM');
  const width = Number(token());
  const height = Number(token());
  if (Number(token()) !== 255) throw new Error('expected maxval 255');
  pos += 1; // exactly one whitespace byte follows the header
  const data = buffer.subarray(pos, pos + width * height);
  if (data.length !== width * height) throw new Error('short PGM');
  return { width, height, data };
}

function rasterise(pdfPath, workDir, id) {
  const prefix = path.join(workDir, id);
  execFileSync(PDFTOPPM, ['-gray', '-r', String(DPI), '-f', '1', '-l', '1', '-cropbox', pdfPath, prefix]);
  const file = fs.readdirSync(workDir).find((name) => name.startsWith(`${id}-`) && name.endsWith('.pgm'));
  return parsePgm(fs.readFileSync(path.join(workDir, file)));
}

/** Merge collinear touching or overlapping segments at one y (within MERGE_TOLERANCE). */
function mergeRules(segments) {
  const sorted = segments.filter((s) => s.x1 > s.x0).sort((a, b) => a.y - b.y);
  const rows = [];
  for (const s of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(s.y - row.y0) <= MERGE_TOLERANCE) row.items.push(s);
    else rows.push({ y0: s.y, items: [s] });
  }
  const merged = [];
  for (const row of rows) {
    const items = row.items.sort((a, b) => a.x0 - b.x0);
    let cur = null;
    const flush = () => { if (cur) merged.push({ x0: cur.x0, x1: cur.x1, y: cur.ys.reduce((a, b) => a + b, 0) / cur.ys.length }); };
    for (const s of items) {
      if (cur && s.x0 <= cur.x1 + MERGE_TOLERANCE) { cur.x1 = Math.max(cur.x1, s.x1); cur.ys.push(s.y); }
      else { flush(); cur = { x0: s.x0, x1: s.x1, ys: [s.y] }; }
    }
    flush();
  }
  return merged;
}

const dark = (raster, x, y) => raster.data[y * raster.width + x] < 128;

/** Row-of-pixels index holding point-y (continuous pixel coordinate y*ppp lies inside row floor(y*ppp)). */
const rowOf = (y) => Math.floor(y * PX_PER_POINT);

/** The darkest of the three rows around a rule: mean gray along x0..x1. */
function ruleDarkness(raster, rule) {
  const xa = Math.max(0, Math.floor(rule.x0 * PX_PER_POINT));
  const xb = Math.min(raster.width - 1, Math.ceil(rule.x1 * PX_PER_POINT) - 1);
  const r = rowOf(rule.y);
  let best = 255;
  for (const row of [r - 1, r, r + 1]) {
    if (row < 0 || row >= raster.height) continue;
    let sum = 0;
    for (let x = xa; x <= xb; x += 1) sum += raster.data[row * raster.width + x];
    best = Math.min(best, sum / Math.max(1, xb - xa + 1));
  }
  return best;
}

/** Thickness in points: the median dark vertical run through the rule's centre over the middle of its extent. */
function measureThickness(raster, rule) {
  const r = rowOf(rule.y);
  const xa = Math.floor(rule.x0 * PX_PER_POINT);
  const xb = Math.ceil(rule.x1 * PX_PER_POINT) - 1;
  const runs = [];
  const step = Math.max(1, Math.floor((xb - xa) / 40));
  for (let x = xa + 1; x < xb; x += step) {
    if (x < 0 || x >= raster.width) continue;
    // Find the dark row nearest the centre within +-1, then walk its run.
    let seed = null;
    for (const row of [r, r - 1, r + 1]) if (row >= 0 && row < raster.height && dark(raster, x, row)) { seed = row; break; }
    if (seed === null) continue;
    let top = seed;
    let bottom = seed;
    while (top > 0 && dark(raster, x, top - 1)) top -= 1;
    while (bottom < raster.height - 1 && dark(raster, x, bottom + 1)) bottom += 1;
    runs.push(bottom - top + 1);
  }
  if (!runs.length) return null;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)] / PX_PER_POINT;
}

async function readForm(file, workDir) {
  const id = file.replace(/\.pdf$/, '');
  const pdfPath = path.join(FORMS, file);
  const doc = await PDFDocument.load(fs.readFileSync(pdfPath), { ignoreEncryption: true });
  const page = doc.getPage(0);
  const rotation = page.getRotation().angle;
  const crop = pageCropBox(page);
  const info = { id, file, rotation, crop };
  if (rotation !== 0) return { ...info, skip: `page /Rotate ${rotation}` };
  if (crop.x !== 0 || crop.y !== 0) return { ...info, skip: `CropBox origin (${crop.x}, ${crop.y})` };
  const raster = rasterise(pdfPath, workDir, id);
  const pageWidthPts = crop.width;
  const pageHeightPts = crop.height;
  const ink = collectPageInk(page);
  // PDF user space is y up; the README frame is y down from the top of the visible box.
  // Lines, thin filled rects drawn as rules, and the top and bottom walls of stroked rectangles (a
  // filled-only rectangle has no printed wall, so it contributes only if it is thin enough to be a rule).
  const inkRules = [
    ...horizontalRules(ink),
    ...horizontalRules({ horizontals: [], rects: ink.rects.filter((r) => r.stroked) }, { includeRectSides: true }),
  ];
  const segments = inkRules.map((h) => ({ x0: h.x0 - crop.x, x1: h.x1 - crop.x, y: crop.y + crop.height - h.y }));
  const rules = [];
  let dropped = { short: 0, thick: 0, offPage: 0 };
  for (const m of mergeRules(segments)) {
    if (m.x1 - m.x0 < MIN_LENGTH) { dropped.short += 1; continue; }
    if (m.y < 0 || m.y > pageHeightPts || m.x0 < -1 || m.x1 > pageWidthPts + 1) { dropped.offPage += 1; continue; }
    const thickness = measureThickness(raster, m);
    if (thickness !== null && thickness > MAX_THICKNESS) { dropped.thick += 1; continue; }
    rules.push({ kind: 'rule', x0: round(Math.max(0, m.x0)), x1: round(Math.min(pageWidthPts, m.x1)), y: round(m.y), thickness: round(thickness ?? 0.5) });
  }
  rules.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  // Alignment check, on every rule the ink reader gave us: is the raster dark where the rule says it is?
  const withGray = rules.map((r) => ({ ...r, gray: ruleDarkness(raster, r) }));
  const alignment = withGray.length ? withGray.filter((r) => r.gray < DARK).length / withGray.length : 0;
  // Ink that paints nothing visible (white strokes, clipped paths) is not a printed rule. Dropped here, after
  // the share above is taken, and listed so a wrong conversion (which would drop nearly everything) shows.
  const invisible = withGray.filter((r) => r.gray >= DARK);
  const ordered = withGray.filter((r) => r.gray < DARK).map(({ kind, x0, x1, y, thickness }, i) => ({ id: `${id}-r${i + 1}`, kind, x0, x1, y, thickness }));
  return {
    ...info, raster, pageWidthPts, pageHeightPts, rules: ordered, dropped, alignment,
    notDark: invisible.map((r) => `y=${r.y} x=${r.x0}-${r.x1}(${r.gray.toFixed(0)})`),
  };
}

// --- tiny PNG encoder for the overlays ---
function png(width, height, rgb) {
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function writeOverlay(form, dir) {
  const { raster, rules } = form;
  const rgb = Buffer.alloc(raster.width * raster.height * 3);
  for (let i = 0; i < raster.data.length; i += 1) { const g = raster.data[i]; rgb[i * 3] = g; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = g; }
  for (const r of rules) {
    const y = rowOf(r.y);
    const xa = Math.max(0, Math.floor(r.x0 * PX_PER_POINT));
    const xb = Math.min(raster.width - 1, Math.ceil(r.x1 * PX_PER_POINT));
    for (const row of [y - 1, y, y + 1]) {
      if (row < 0 || row >= raster.height) continue;
      for (let x = xa; x <= xb; x += 1) { const o = (row * raster.width + x) * 3; rgb[o] = 255; rgb[o + 1] = 0; rgb[o + 2] = 0; }
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `overlay-${form.id}.png`), png(raster.width, raster.height, rgb));
}

// --- main ---
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-pages-'));
const forms = [];
const skipped = [];
for (const file of fs.readdirSync(FORMS).filter((f) => f.endsWith('.pdf') && !EXCLUDED.has(f)).sort()) {
  const form = await readForm(file, workDir);
  if (form.skip) { skipped.push({ id: form.id, why: form.skip }); continue; }
  if (form.alignment < MIN_ALIGNMENT) { skipped.push({ id: form.id, why: `only ${(form.alignment * 100).toFixed(1)}% of its ink rules are dark in the raster (light-coloured rules)` }); continue; }
  if (form.rules.length < MIN_RULES) { skipped.push({ id: form.id, why: `only ${form.rules.length} rules >= ${MIN_LENGTH} pt` }); continue; }
  forms.push(form);
}
fs.rmSync(workDir, { recursive: true, force: true });

const gz = (form) => {
  const { width, height, data } = form.raster;
  const head = Buffer.alloc(8); head.writeUInt32LE(width, 0); head.writeUInt32LE(height, 4);
  return zlib.gzipSync(Buffer.concat([head, data]), { level: 9 });
};

for (const form of forms) {
  const size = gz(form).length;
  console.log(`${form.id}: ${form.raster.width}x${form.raster.height}px, ${form.pageWidthPts}x${form.pageHeightPts}pt, rules ${form.rules.length}, aligned ${(form.alignment * 100).toFixed(1)}%, gz ${(size / 1024).toFixed(0)} KB, dropped ${JSON.stringify(form.dropped)}`);
  if (form.notDark.length) console.log(`  not dark: ${form.notDark.join(' ')}`);
}
for (const s of skipped) console.log(`skipped ${s.id}: ${s.why}`);

if (probe) process.exit(0);

// Size budget: drop the largest forms until the pages fit.
let kept = forms;
let total = kept.reduce((n, f) => n + gz(f).length, 0);
while (total > SIZE_BUDGET && kept.length > 1) {
  const largest = kept.reduce((a, b) => (gz(a).length >= gz(b).length ? a : b));
  console.log(`over budget (${total} B): dropping ${largest.id}`);
  skipped.push({ id: largest.id, why: 'over the 3 MB size budget' });
  kept = kept.filter((f) => f !== largest);
  total = kept.reduce((n, f) => n + gz(f).length, 0);
}

const pagesDir = path.join(SNAP, 'pages');
const truthDir = path.join(SNAP, 'truth');
fs.rmSync(pagesDir, { recursive: true, force: true });
fs.rmSync(truthDir, { recursive: true, force: true });
fs.mkdirSync(pagesDir, { recursive: true });
fs.mkdirSync(truthDir, { recursive: true });
const manifest = [];
for (const form of kept) {
  fs.writeFileSync(path.join(pagesDir, `${form.id}.gray.gz`), gz(form));
  fs.writeFileSync(path.join(truthDir, `${form.id}.json`), `${JSON.stringify({ id: form.id, pageWidthPts: form.pageWidthPts, pageHeightPts: form.pageHeightPts, rules: form.rules }, null, 1)}\n`);
  manifest.push({ id: form.id, form: form.file, page: 1, width: form.raster.width, height: form.raster.height, pxPerPoint: PX_PER_POINT, pageWidthPts: form.pageWidthPts, pageHeightPts: form.pageHeightPts });
}
fs.writeFileSync(path.join(pagesDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`kept ${kept.length} forms, pages/ total ${(total / 1024).toFixed(0)} KB`);

if (overlayDir) {
  const ranked = [...kept].sort((a, b) => a.alignment - b.alignment);
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];
  writeOverlay(best, overlayDir);
  if (worst !== best) writeOverlay(worst, overlayDir);
  console.log(`overlays: best ${best.id}, worst ${worst.id} -> ${overlayDir}`);
}
