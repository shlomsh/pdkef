// Dev-time generator for the layout corpus (READ-10): page rasters and their text-derived layout truth.
// Usage: node scripts/layout-corpus/build-pages.mjs [--cache <dir>] [--overlay-dir <dir>]
//
// Not part of the test suite and never imported by product code. For each page in PAGES it fetches the PDF
// (licence-clean sources only, pinned by sha256) or composes it (compose.mjs), renders it with pdftoppm as
// a clean gray raster at 200 dpi, and reads its truth from the PDF's own text: pdf.js text items give the
// rows (grouped by baseline), their size and direction; pdftotext's word boxes give the words inside them,
// because pdf.js often reports a justified line as one item. Columns, spanning rows and reading order are
// derived from those rows; the raster only tightens each row's ends to its first and last inked pixel.
// Idempotent and deterministic: the same inputs give byte-identical outputs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { composePage } from './compose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LAYOUT = path.join(ROOT, 'src/tools/sign/lib/fields/corpus/layout');
const PDFTOPPM = '/opt/homebrew/bin/pdftoppm';
const PDFTOTEXT = '/opt/homebrew/bin/pdftotext';
const DPI = 200;
const PX_PER_POINT = DPI / 72;
const INK = 128; // gray below this is ink when tightening a row's ends
const SIZE_BUDGET = 4 * 1024 * 1024;

const CC_BY = 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)';
const US_GOV = 'Public domain, a work of the US federal government (17 U.S.C. 105)';
const COMPOSED = 'Written and set for this corpus (MIT, as the repository); fonts Tinos and Alef, OFL, from public/fonts';

/**
 * The pages. `ignore` is a list of [x0, y0, x1, y1] rectangles in points (top-left origin) whose text is not
 * a line of reading: labels inside a figure, a table's stacked header. Rows there are neither expected nor
 * counted, and neither are rows with no ink (text drawn invisibly) or a drop cap (a letter, not a line).
 */
export const PAGES = [
  {
    id: 'arxiv-2610.39111-p1',
    url: 'https://arxiv.org/pdf/2610.39111v1',
    sha256: 'a3218a5b0c02e4b90441617585e5b3fcb5d3cc8978f6092b672a20ce7a1899ec',
    page: 1,
    title: 'Turning Multipath into Positioning Information: Persistent Electromagnetic-Twin DoA Localization (Wu, Zhang, Tian, So)',
    licence: CC_BY,
    has: ['two columns', 'spanning title and authors', 'a drop cap', 'footnotes', 'the arXiv stamp in the margin'],
  },
  {
    id: 'arxiv-2610.39533-p4',
    url: 'https://arxiv.org/pdf/2610.39533v1',
    sha256: 'b419ee4ec59c0dc483e6cc8fe0f8960e54f178060d54cd29d7724cbc6ea37ee7',
    page: 4,
    title: 'Beyond Diagonal RIS for Physical-Layer Security: Low-Complexity Solution in the Low-SNR Regime',
    licence: CC_BY,
    has: ['two columns', 'a table', 'figures', 'display equations'],
    ignore: [[316, 50, 563, 206], [316, 230, 563, 342]],
  },
  {
    id: 'arxiv-2610.39699-p3',
    url: 'https://arxiv.org/pdf/2610.39699v1',
    sha256: '72f7fdc5a47054ba25867a842af9c77b4d9387838d48d6c6568bf29a7d02b363',
    page: 3,
    title: 'Implementation and Validation of Mismatch-Tolerant High-Gain OTA with a Calibrated Negative Conductance Load',
    licence: CC_BY,
    has: ['two columns', 'figures with captions', 'display equations'],
    ignore: [[316, 40, 563, 240], [55, 540, 300, 678]],
  },
  {
    id: 'arxiv-2610.40607-p1',
    url: 'https://arxiv.org/pdf/2610.40607v1',
    sha256: '9161c4789b0eb215d249e1cf9f2cc4a37c9e9ce9344103a99d9dc83f918a8a6f',
    page: 1,
    title: 'Fight World Model: Customizable Combat through Visual Interaction Proxies',
    licence: CC_BY,
    has: ['two columns', 'a spanning teaser figure', 'an italic abstract', 'a footnote'],
    ignore: [[55, 190, 557, 345]],
  },
  {
    id: 'fr-2026-22353-p1',
    url: 'https://www.govinfo.gov/content/pkg/FR-2026-11-02/pdf/2026-22353.pdf',
    sha256: 'a65d6cc9eb24fc15f3f842ac830c21d0069b955e342574c0b4c628c02cc33995',
    page: 1,
    title: 'Federal Register 91 FR (2026-11-02), document 2026-22353',
    licence: US_GOV,
    has: ['three columns', 'a table', 'footnotes', 'a ruled running head'],
    ignore: [[40, 550, 570, 598]],
  },
  {
    id: 'fr-2026-22349-p2',
    url: 'https://www.govinfo.gov/content/pkg/FR-2026-11-02/pdf/2026-22349.pdf',
    sha256: '4a6c8d8d52287db8eb32180c66cd03b09d74f10c5bfc36d63f9296f76bf76bf6',
    page: 2,
    title: 'Federal Register 91 FR (2026-11-02), document 2026-22349',
    licence: US_GOV,
    has: ['three dense columns', 'footnotes'],
  },
  {
    id: 'composed-features',
    compose: 'features',
    page: 1,
    title: 'Where the Lines Are (composed)',
    licence: COMPOSED,
    has: ['two columns', 'a heading spanning both columns mid-page', 'a drop cap', 'a pull quote', 'a figure', 'a footnote'],
  },
  {
    id: 'composed-hebrew',
    compose: 'hebrew',
    page: 1,
    title: 'איפה השורות (composed, Hebrew)',
    licence: COMPOSED,
    has: ['two right-to-left columns', 'a spanning title', 'a spanning heading between two zones'],
  },
];

const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const cacheDir = arg('--cache') ?? path.join(os.tmpdir(), 'pdkef-layout-corpus');
const overlayDir = arg('--overlay-dir');
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const quantile = (values, q) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : 0;
};

async function sourcePdf(spec) {
  fs.mkdirSync(cacheDir, { recursive: true });
  if (spec.compose) return composePage(spec.compose, path.join(ROOT, 'public/fonts'), cacheDir);
  const file = path.join(cacheDir, `${spec.id.replace(/-p\d+$/, '')}.pdf`);
  if (!fs.existsSync(file)) {
    const response = await fetch(spec.url, { headers: { 'user-agent': 'pdkef-layout-corpus' } });
    if (!response.ok) throw new Error(`${spec.id}: ${response.status} from ${spec.url}`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (sha !== spec.sha256) throw new Error(`${spec.id}: sha256 ${sha} is not the pinned ${spec.sha256}; the source changed`);
  return file;
}

/** Binary PGM (P5, maxval 255) -> { width, height, data }. */
function parsePgm(buffer) {
  let pos = 0;
  const token = () => {
    while ([0x20, 0x0a, 0x0d, 0x09].includes(buffer[pos])) pos += 1;
    const start = pos;
    while (pos < buffer.length && ![0x20, 0x0a, 0x0d, 0x09].includes(buffer[pos])) pos += 1;
    return buffer.toString('latin1', start, pos);
  };
  if (token() !== 'P5') throw new Error('not a binary PGM');
  const width = Number(token());
  const height = Number(token());
  if (Number(token()) !== 255) throw new Error('expected maxval 255');
  pos += 1;
  return { width, height, data: buffer.subarray(pos, pos + width * height) };
}

function rasterise(pdf, page, workDir, id) {
  const prefix = path.join(workDir, id);
  execFileSync(PDFTOPPM, ['-gray', '-r', String(DPI), '-f', String(page), '-l', String(page), '-cropbox', '-singlefile', pdf, prefix], { stdio: ['ignore', 'ignore', 'ignore'] });
  return parsePgm(fs.readFileSync(`${prefix}.pgm`));
}

/** pdftotext word boxes, points, top-left origin of the crop box. */
function popplerWords(pdf, page) {
  const html = execFileSync(PDFTOTEXT, ['-f', String(page), '-l', String(page), '-bbox', '-cropbox', pdf, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  const words = [];
  for (const m of html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
    words.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: m[5] });
  }
  return words;
}

/** pdf.js text items as { x0, x1, baseline, size, dir, rotated }, points, top-left origin of the view box. */
async function textItems(pdf, pageNo) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdf)), verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = [];
  for (const item of content.items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform;
    const size = Math.hypot(c, d);
    const rotated = Math.abs(b) > 0.01 * Math.abs(a) || Math.abs(c) > 0.01 * Math.abs(d);
    const [x0, baseline] = viewport.convertToViewportPoint(e, f);
    const along = Math.hypot(a, b) || 1;
    const [x1, y1] = viewport.convertToViewportPoint(e + (a / along) * item.width, f + (b / along) * item.width);
    const extent = rotated ? { y0: Math.min(baseline, y1), y1: Math.max(baseline, y1) } : {};
    items.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), baseline, size, dir: item.dir, rotated, str: item.str, ...extent });
  }
  await task.destroy();
  return { items, width: viewport.width, height: viewport.height };
}

/** Joins a segment and an item (or two segments) that sit on one line. */
function joinable(seg, item) {
  const small = item.size < 0.85 * seg.size;
  // A drop cap sits on a line's baseline but is not part of it: a superscript is never as much as 1.8 times smaller.
  if (Math.max(seg.size, item.size) > 1.8 * Math.min(seg.size, item.size)) return false;
  const dy = Math.abs(item.baseline - seg.baseline);
  if (dy > (small ? 0.45 : 0.2) * seg.size) return false;
  const reach = 1.0 * Math.max(seg.size, item.size);
  return item.x0 <= seg.x1 + reach && item.x1 >= seg.x0 - reach;
}

/** Items into line segments: same baseline, no gap wider than about an em (a gutter is wider). */
function segmentsOf(items) {
  const segs = [...items].sort((a, b) => b.size - a.size || a.baseline - b.baseline || a.x0 - b.x0)
    .map((it) => ({ x0: it.x0, x1: it.x1, baseline: it.baseline, size: it.size, dirs: [it.dir], chars: it.str.length, parts: [{ x0: it.x0, x1: it.x1, str: it.str }] }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < segs.length && !changed; i += 1) {
      for (let j = i + 1; j < segs.length && !changed; j += 1) {
        const [big, small] = segs[i].size >= segs[j].size ? [segs[i], segs[j]] : [segs[j], segs[i]];
        if (!joinable(big, small)) continue;
        big.x0 = Math.min(big.x0, small.x0);
        big.x1 = Math.max(big.x1, small.x1);
        big.dirs.push(...small.dirs);
        big.chars += small.chars;
        big.parts.push(...small.parts);
        segs.splice(segs.indexOf(small), 1);
        changed = true;
      }
    }
  }
  return segs;
}

/** Columns from the body-size segments: clusters of their midpoints. */
function columnsOf(segs, bodySize, pageWidth) {
  const body = segs.filter((s) => Math.abs(s.size - bodySize) <= 0.12 * bodySize);
  const typical = median(body.map((s) => s.x1 - s.x0));
  // A full column line, not a spanning one: a caption or title across the page would chain the clusters.
  const full = body.filter((s) => s.x1 - s.x0 >= 0.4 * typical && s.x1 - s.x0 <= 1.15 * typical).sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1));
  const clusters = [];
  for (const s of full) {
    const mid = (s.x0 + s.x1) / 2;
    const last = clusters[clusters.length - 1];
    if (last && mid - last.mid <= 0.08 * pageWidth) {
      last.members.push(s);
      last.mid = mid;
    } else clusters.push({ mid, members: [s] });
  }
  return clusters.filter((c) => c.members.length >= 6).map((c) => ({
    x0: quantile(c.members.map((s) => s.x0), 0.1),
    x1: quantile(c.members.map((s) => s.x1), 0.9),
  }));
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** The first and last inked pixel columns of a row's x-height band, in points. */
function tightenEnds(raster, row) {
  const s = PX_PER_POINT;
  const yA = Math.max(0, Math.floor((row.baseline - 0.45 * row.size) * s));
  const yB = Math.min(raster.height, Math.ceil((row.baseline - 0.05 * row.size) * s));
  const xA = Math.max(0, Math.floor((row.x0 - 0.3 * row.size) * s));
  const xB = Math.min(raster.width, Math.ceil((row.x1 + 0.3 * row.size) * s));
  let first = -1;
  let last = -1;
  for (let x = xA; x < xB; x += 1) {
    let inked = false;
    for (let y = yA; y < yB && !inked; y += 1) inked = raster.data[y * raster.width + x] < INK;
    if (inked) {
      if (first < 0) first = x;
      last = x;
    }
  }
  return first < 0 ? null : { x0: first / s, x1: (last + 1) / s };
}

export function buildTruth(spec, { items, width, height }, words, raster) {
  const upright = items.filter((it) => !it.rotated);
  const weights = new Map();
  for (const it of upright) weights.set(round(it.size, 1), (weights.get(round(it.size, 1)) ?? 0) + it.str.length);
  const bodySize = [...weights.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const rtlChars = upright.filter((it) => it.dir === 'rtl').reduce((n, it) => n + it.str.length, 0);
  const direction = rtlChars > 0.5 * upright.reduce((n, it) => n + it.str.length, 0) ? 'rtl' : 'ltr';

  const ignore = [...(spec.ignore ?? [])];
  for (const it of items.filter((i) => i.rotated)) {
    // A rotated run (the arXiv stamp) is not a line of reading; its box, padded by its size, is ignored.
    ignore.push([it.x0 - it.size, it.y0 - it.size, it.x1 + it.size, it.y1 + it.size]);
  }
  const ignored = (r) => ignore.some(([x0, y0, x1, y1]) => (r.x0 + r.x1) / 2 >= x0 && (r.x0 + r.x1) / 2 <= x1 && r.baseline >= y0 && r.baseline <= y1);

  const segs = segmentsOf(upright);
  const cols = columnsOf(segs.filter((s) => !ignored(s)), bodySize, width).sort((a, b) => a.x0 - b.x0);
  const readingCols = direction === 'rtl' ? [...cols].reverse() : cols;
  const gutters = cols.slice(1).map((c, i) => [cols[i].x1, c.x0]);

  // Each segment: its column, or spanning when it crosses a gutter, or none (a running head, a folio).
  for (const s of segs) {
    const crosses = gutters.some(([g0, g1]) => overlap(s.x0, s.x1, g0, g1) > 2 && s.x0 < g0 - 2 && s.x1 > g1 + 2);
    const inside = cols.findIndex((c) => overlap(s.x0, s.x1, c.x0, c.x1) >= 0.7 * (s.x1 - s.x0));
    s.spans = cols.length > 1 && crosses;
    s.column = s.spans || inside < 0 ? null : inside;
  }
  // Rows: segments of one column on one baseline are one row (a table's cells); a spanning segment takes
  // every other segment on its baseline with it.
  const rows = [];
  for (const s of [...segs].sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0)) {
    const same = rows.find((r) => Math.abs(r.baseline - s.baseline) <= 0.3 * Math.max(r.size, s.size)
      && Math.max(r.size, s.size) <= 1.8 * Math.min(r.size, s.size)
      && (r.spans || s.spans || (r.column !== null && r.column === s.column)));
    if (same) {
      same.x0 = Math.min(same.x0, s.x0);
      same.x1 = Math.max(same.x1, s.x1);
      same.dirs.push(...s.dirs);
      same.parts.push(...s.parts);
      same.spans ||= s.spans;
      if (same.spans) same.column = null;
      same.size = Math.max(same.size, s.size);
    } else rows.push({ ...s, dirs: [...s.dirs], parts: [...s.parts] });
  }
  // Rows merged into a spanning row may now cross a gutter they did not before.
  for (const r of rows) {
    if (r.spans) {
      r.column = null;
      for (const other of rows) {
        if (other !== r && !other.spans && Math.abs(other.baseline - r.baseline) <= 0.3 * Math.max(r.size, other.size)) {
          r.x0 = Math.min(r.x0, other.x0);
          r.x1 = Math.max(r.x1, other.x1);
          r.parts.push(...other.parts);
          other.absorbed = true;
        }
      }
    }
  }
  const live = rows.filter((r) => !r.absorbed);

  const out = live.map((r) => {
    const mine = words.filter((w) => {
      const cx = (w.x0 + w.x1) / 2;
      return cx >= r.x0 - 0.5 && cx <= r.x1 + 0.5 && r.baseline >= w.y0 && r.baseline <= w.y1 + 0.5 * r.size;
    }).sort((a, b) => a.x0 - b.x0);
    const y0 = mine.length ? median(mine.map((w) => w.y0)) : r.baseline - 0.8 * r.size;
    const y1 = mine.length ? median(mine.map((w) => w.y1)) : r.baseline + 0.22 * r.size;
    const ink = tightenEnds(raster, r);
    const dropCap = r.chars <= 2 && r.size > 1.6 * bodySize;
    const gaps = [];
    for (let i = 1; i < mine.length; i += 1) if (mine[i].x0 - mine[i - 1].x1 > 0.5) gaps.push([round(mine[i - 1].x1), round(mine[i].x0)]);
    const rtl = r.dirs.filter((d) => d === 'rtl').length > r.dirs.length / 2;
    // Parts drawn one word at a time carry no spaces: a gap wider than a hair between two parts is one.
    const parts = [...r.parts].sort((a, b) => (rtl ? b.x1 - a.x1 : a.x0 - b.x0));
    const text = parts.map((part, i) => {
      const prev = parts[i - 1];
      const gap = prev ? (rtl ? prev.x0 - part.x1 : part.x0 - prev.x1) : 0;
      return (gap > 0.15 * r.size ? ' ' : '') + part.str;
    }).join('').replace(/\s+/g, ' ').trim();
    return {
      x0: round(ink?.x0 ?? r.x0), x1: round(ink?.x1 ?? r.x1), y0: round(y0), y1: round(y1),
      baseline: round(r.baseline), size: round(r.size),
      column: r.column === null ? null : `c${readingCols.indexOf(cols[r.column])}`,
      spans: r.spans, dir: rtl ? 'rtl' : 'ltr', text, gaps,
      ...(ignored(r) || !ink || dropCap ? { ignore: true } : {}),
      ...(Math.abs(r.size - bodySize) > 0.12 * bodySize ? { kind: r.size > bodySize ? 'large' : 'small' } : {}),
    };
  });

  // Reading order: zones between the rows that sit outside the columns; within a zone, the columns in
  // reading order, each top to bottom.
  const seps = out.filter((r) => r.column === null).sort((a, b) => a.baseline - b.baseline);
  const zoneOf = (r) => seps.filter((s) => s.baseline < r.baseline).length;
  const ordered = [];
  for (let z = 0; z <= seps.length; z += 1) {
    const zone = out.filter((r) => r.column !== null && zoneOf(r) === z);
    for (let c = 0; c < readingCols.length; c += 1) ordered.push(...zone.filter((r) => r.column === `c${c}`).sort((a, b) => a.baseline - b.baseline));
    if (z < seps.length) ordered.push(seps[z]);
  }
  ordered.forEach((r, i) => { r.id = `r${i}`; r.order = i; });

  return {
    id: spec.id,
    source: { title: spec.title, ...(spec.url ? { url: spec.url, sha256: spec.sha256 } : { composed: `scripts/layout-corpus/compose.mjs#${spec.compose}` }), page: spec.page, licence: spec.licence, has: spec.has },
    pageWidthPts: round(width),
    pageHeightPts: round(height),
    direction,
    bodySizePts: bodySize,
    letterHeightPts: round(0.7 * bodySize),
    columns: readingCols.map((c, i) => ({ id: `c${i}`, x0: round(c.x0), x1: round(c.x1) })),
    ignore: ignore.map((rect) => rect.map((v) => round(v))),
    rows: ordered.map(({ id, order, ...rest }) => ({ id, order, ...rest })),
  };
}

function writeRaster(file, { width, height, data }) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(width, 0);
  header.writeUInt32LE(height, 4);
  fs.writeFileSync(file, zlib.gzipSync(Buffer.concat([header, Buffer.from(data)]), { level: 9 }));
}

/** A PGM with every truth row's box darkened, for checking truth by eye. */
function writeOverlay(dir, raster, truth) {
  const data = Buffer.from(raster.data);
  const s = PX_PER_POINT;
  const box = (x0, y0, x1, y1, value) => {
    for (let x = Math.floor(x0 * s); x < Math.ceil(x1 * s); x += 1) {
      for (const y of [Math.floor(y0 * s), Math.ceil(y1 * s)]) if (y >= 0 && y < raster.height && x >= 0 && x < raster.width) data[y * raster.width + x] = value;
    }
    for (let y = Math.floor(y0 * s); y < Math.ceil(y1 * s); y += 1) {
      for (const x of [Math.floor(x0 * s), Math.ceil(x1 * s)]) if (y >= 0 && y < raster.height && x >= 0 && x < raster.width) data[y * raster.width + x] = value;
    }
  };
  for (const r of truth.rows) box(r.x0, r.y0, r.x1, r.y1, r.ignore ? 200 : r.spans ? 0 : 90);
  for (const c of truth.columns) box(c.x0, 2, c.x1, truth.pageHeightPts - 2, 60);
  fs.writeFileSync(path.join(dir, `${truth.id}.pgm`), Buffer.concat([Buffer.from(`P5\n${raster.width} ${raster.height}\n255\n`), data]));
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-corpus-'));
  fs.mkdirSync(path.join(LAYOUT, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(LAYOUT, 'truth'), { recursive: true });
  if (overlayDir) fs.mkdirSync(overlayDir, { recursive: true });
  const manifest = [];
  let bytes = 0;
  for (const spec of PAGES) {
    const pdf = await sourcePdf(spec);
    const raster = rasterise(pdf, spec.page, work, spec.id);
    const truth = buildTruth(spec, await textItems(pdf, spec.page), popplerWords(pdf, spec.page), raster);
    const pageFile = path.join(LAYOUT, 'pages', `${spec.id}.gray.gz`);
    writeRaster(pageFile, raster);
    bytes += fs.statSync(pageFile).size;
    fs.writeFileSync(path.join(LAYOUT, 'truth', `${spec.id}.json`), `${JSON.stringify(truth, null, 1)}\n`);
    if (overlayDir) writeOverlay(overlayDir, raster, truth);
    manifest.push({ id: spec.id, width: raster.width, height: raster.height, pxPerPoint: PX_PER_POINT, pageWidthPts: truth.pageWidthPts, pageHeightPts: truth.pageHeightPts });
    const counted = truth.rows.filter((r) => !r.ignore);
    console.log(`${spec.id}: ${truth.columns.length} columns, ${counted.length} rows (${counted.filter((r) => r.spans).length} spanning, ${truth.rows.length - counted.length} ignored), body ${truth.bodySizePts}pt ${truth.direction}`);
  }
  fs.writeFileSync(path.join(LAYOUT, 'pages', 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`${(bytes / 1024 / 1024).toFixed(2)} MB of rasters`);
  if (bytes > SIZE_BUDGET) throw new Error(`rasters are ${bytes} bytes, over the ${SIZE_BUDGET} budget`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
