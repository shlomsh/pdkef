// @ts-nocheck - a Node spike harness, run with `node`; not part of the app.
// RED-12 spike: a covered page saved as its picture plus an invisible text
// layer without the boxed words, read back by the three extractors people
// actually use: pdf.js (Firefox, our own Find), PDFium (Chrome's viewer) and
// PDFKit (macOS Preview). Run from the repo root:
//   node spikes/red-12/run.mts
// Writes spikes/red-12/out/<name>.pdf (with the layer) and <name>.plain.pdf
// (the picture alone, today's export) and prints one report per case.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { buildPageText } from '../../src/tools/redact/find/pageText.ts';
import { matchBoxes } from '../../src/tools/redact/find/matchBoxes.ts';
import { readPageGlyphs } from '../../src/editor/adapters/pdf/pageGlyphs.ts';
import { planTextLayer, groupRuns, textLayerReadsBack } from '../../src/editor/adapters/pdf/textLayer.ts';
import { applyAffineTransform, composeAffineTransforms } from '../../src/editor/geometry/coords.ts';
import { pageGeometryFromPdfJsPage } from '../../src/editor/geometry/coords.ts';
import { createInvisibleFont, drawInvisibleText } from '../../src/editor/adapters/pdf/invisibleText.js';

const ROOT = process.cwd();
const CORPUS = path.join(ROOT, 'spikes/red-01/corpus');
const OUT = path.join(ROOT, 'spikes/red-12/out');
fs.mkdirSync(OUT, { recursive: true });

const measureCtx = createCanvas(10, 10).getContext('2d');
measureCtx.font = '100px sans-serif';
const measure = (text: string) => measureCtx.measureText(text).width;

type Case = {
  name: string;
  file: string;
  page: number; // 1-based
  // A corpus rect ([left, top, width, height] in page percent), a phrase
  // whose Find box becomes the redaction box, or a word boxed the way a
  // careful person would: its glyphs from descender to ascender, plus 1pt.
  rect?: number[];
  boxPhrase?: string;
  exactWord?: string;
  secret: string;
  neighbours?: string[]; // words either side of the box on its line, in reading order
};

const corpus = JSON.parse(fs.readFileSync(path.join(CORPUS, 'corpus.json'), 'utf8'));
const fromCorpus = (file: string, name: string): Case => {
  const e = corpus.find((c: any) => c.file === file);
  return { name, file, page: e.page, rect: e.rect, secret: e.secret, neighbours: e.keepSameLine?.length ? e.keepSameLine : undefined };
};

const CASES: Case[] = [
  fromCorpus('real-world-irs-1040-2024.pdf', 'irs-1040'),
  fromCorpus('real-world-uscis-i9-2025.pdf', 'uscis-i9'),
  fromCorpus('real-world-health-declaration-2021.pdf', 'health-declaration'),
  {
    name: 'health-hebrew-middle-word',
    file: 'real-world-health-declaration-2021.pdf',
    page: 1,
    exactWord: 'לביטחון',
    secret: 'לביטחון',
    neighbours: ['המשרד', 'לאומי'],
  },
  {
    name: 'health-hebrew-middle-word-find-box',
    file: 'real-world-health-declaration-2021.pdf',
    page: 1,
    boxPhrase: 'לביטחון',
    secret: 'לביטחון',
    neighbours: ['המשרד', 'לאומי'],
  },
  {
    name: 'plain-latin-middle-word',
    file: 'real-world-irs-1040-2024.pdf',
    page: 1,
    exactWord: 'separate',
    secret: 'separate',
    neighbours: ['See', 'instructions.'],
  },
  {
    name: 'plain-latin-middle-word-find-box',
    file: 'real-world-irs-1040-2024.pdf',
    page: 1,
    boxPhrase: 'separate',
    secret: 'separate',
    neighbours: ['See', 'instructions.'],
  },
];

async function readPage(bytes: Uint8Array, pageNo: number) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();
  const items = content.items.filter((item: any) => typeof item.str === 'string');
  const opList = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const glyphs = readPageGlyphs(opList, pdfjs.OPS as any, (name) => page.commonObjs.get(name));
  return { doc, page, glyphs, pageText: buildPageText(pageNo - 1, items as any), geometry: pageGeometryFromPdfJsPage(page as any) };
}

async function exportCase(c: Case) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(CORPUS, c.file)));
  const { page, pageText, geometry, glyphs } = await readPage(bytes, c.page);

  let boxes;
  if (c.rect) {
    const [left, top, width, height] = c.rect;
    boxes = [{ left, top, width, height }];
  } else if (c.exactWord) {
    const target = [...c.exactWord].sort().join('');
    const words = groupRuns(glyphs).flatMap((run) => {
      const out: typeof run[] = [[]];
      for (const g of run) (g.isSpace || !g.unicode.trim() ? out.push([]) : out[out.length - 1].push(g));
      return out.filter((w) => w.length);
    });
    const word = words.find((w) => [...w.map((g) => g.unicode).join('')].sort().join('') === target);
    if (!word) throw new Error(`${c.name}: no word "${c.exactWord}"`);
    const pts = word.flatMap((g) => {
      const m = composeAffineTransforms(geometry.pdfToViewport, g.matrix);
      return [[0, -0.25], [g.width, -0.25], [0, 0.95], [g.width, 0.95]].map(([x, y]) => applyAffineTransform({ x, y }, m));
    });
    const x0 = Math.min(...pts.map((p) => p.x)) - 1, x1 = Math.max(...pts.map((p) => p.x)) + 1;
    const y0 = Math.min(...pts.map((p) => p.y)) - 1, y1 = Math.max(...pts.map((p) => p.y)) + 1;
    boxes = [{ left: (100 * x0) / geometry.width, top: (100 * y0) / geometry.height, width: (100 * (x1 - x0)) / geometry.width, height: (100 * (y1 - y0)) / geometry.height }];
  } else {
    const at = pageText.text.indexOf(c.boxPhrase!);
    if (at < 0) throw new Error(`${c.name}: "${c.boxPhrase}" not on the page`);
    boxes = matchBoxes(pageText, { start: at, end: at + c.boxPhrase!.length }, geometry, measure);
  }

  // The picture, as today's export draws it (scale 2.5, boxes painted black).
  const scale = 2.5;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise;
  ctx.fillStyle = '#000';
  for (const b of boxes) {
    ctx.fillRect((b.left / 100) * viewport.width, (b.top / 100) * viewport.height, (b.width / 100) * viewport.width, (b.height / 100) * viewport.height);
  }
  const jpeg = canvas.toBuffer('image/jpeg', 95);

  const plan = planTextLayer(glyphs, geometry, boxes);

  const build = async (withLayer: boolean) => {
    const out = await PDFDocument.create();
    const img = await out.embedJpg(jpeg);
    const p = out.addPage([geometry.width, geometry.height]);
    p.drawImage(img, { x: 0, y: 0, width: geometry.width, height: geometry.height });
    if (withLayer) {
      const font = createInvisibleFont(out);
      drawInvisibleText(out, p, font, plan.runs);
      font.finish();
    }
    return out.save();
  };
  const plain = await build(false);
  const layered = await build(true);
  const outPath = path.join(OUT, `${c.name}.pdf`);
  fs.writeFileSync(outPath, layered);
  fs.writeFileSync(path.join(OUT, `${c.name}.plain.pdf`), plain);
  return { outPath, plan, boxes, pageText, layerBytes: layered.length - plain.length, plainBytes: plain.length };
}

function extract(engine: 'pdfium' | 'pdfkit', file: string, find?: string) {
  const args = find ? ['--find', find] : [];
  const out =
    engine === 'pdfium'
      ? execFileSync('node', ['spikes/red-01/pdfium/extract-pdfium.mjs', file, ...args], { maxBuffer: 1 << 28 })
      : execFileSync('swift', ['spikes/red-12/extract-pdfkit.swift', file, ...args], { maxBuffer: 1 << 28 });
  return JSON.parse(out.toString('utf8'));
}

async function extractPdfjs(file: string) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const { pageText } = await readPage(bytes, 1);
  return pageText.text;
}

const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
const tokens = (s: string) => norm(s).split(/\s+/).filter(Boolean);

/** Longest common subsequence length of two token lists. */
function lcs(a: string[], b: string[]) {
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = tmp;
    }
  }
  return prev[b.length];
}

type Extracted = { text: string; chars: { c: string; box: number[] }[] };

/** Per character of the output, how far its box sits from the nearest same
 * character in the original, in points (left and right edges). */
function alignment(orig: Extracted, out: Extracted) {
  const byChar = new Map<string, number[][]>();
  for (const { c, box } of orig.chars) byChar.set(c, [...(byChar.get(c) ?? []), box]);
  const d: number[] = [];
  for (const { c, box } of out.chars) {
    if (/\s/.test(c)) continue;
    const cands = byChar.get(c);
    if (!cands) continue;
    const best = Math.min(...cands.map((b) => Math.max(Math.abs(b[0] - box[0]), Math.abs(b[2] - box[2]), Math.abs(b[1] - box[1]))));
    d.push(best);
  }
  d.sort((a, b) => a - b);
  const q = (p: number) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))].toFixed(2) : '-');
  return `${d.length} chars, median ${q(0.5)} pt, p90 ${q(0.9)} pt, p99 ${q(0.99)} pt`;
}

function rawStreamLeak(file: string, secret: string) {
  // The layer's text is CID-coded, so a plain-text search of the streams can't
  // find even kept words; decode every stream and search for the secret's
  // UTF-16BE and UTF-8 forms as well as its plain form.
  const buf = fs.readFileSync(file);
  const s = buf.toString('latin1');
  const hits: string[] = [];
  const forms = [secret, Buffer.from(secret, 'utf8').toString('latin1'), Buffer.from(secret, 'utf16le').swap16().toString('latin1')];
  if (forms.some((f) => s.includes(f))) hits.push('raw');
  return hits;
}

const key = (w: string) => [...w].sort().join('');
const report: string[] = [];
for (const c of CASES) {
  const r = await exportCase(c);
  const original = path.join(CORPUS, c.file);
  const back = await readPage(new Uint8Array(fs.readFileSync(r.outPath)), 1);
  const readsBack = textLayerReadsBack(r.plan, back.glyphs, back.geometry, r.boxes);
  const keptKeys = new Set(r.plan.runs.flatMap((run) => tokens(run.text)).map(key));
  const lines = [`## ${c.name}`, '',
    `- Read-back check (RED-09): ${readsBack ? 'passes' : 'FAILS'}.`,
    `- Words written ${r.plan.kept}, left out ${r.plan.dropped}. Layer adds ${r.layerBytes} bytes to a ${r.plainBytes}-byte picture page (${((100 * r.layerBytes) / r.plainBytes).toFixed(1)}%).`];

  const out: Record<string, Extracted> = {
    pdfjs: { text: await extractPdfjs(r.outPath), chars: [] },
    pdfium: extract('pdfium', r.outPath).pages[0],
    pdfkit: extract('pdfkit', r.outPath).pages[0],
  };
  const orig: Record<string, Extracted> = {
    pdfjs: { text: (await readPage(new Uint8Array(fs.readFileSync(original)), c.page)).pageText.text, chars: [] },
    pdfium: extract('pdfium', original).pages[c.page - 1],
    pdfkit: extract('pdfkit', original).pages[c.page - 1],
  };

  const secretKeys = tokens(c.secret).map(key);
  for (const engine of ['pdfjs', 'pdfium', 'pdfkit']) {
    const outKeys = tokens(out[engine].text).map(key);
    const origKeys = tokens(orig[engine].text).map(key);
    const leaked = secretKeys.filter((k) => outKeys.includes(k) && !keptKeys.has(k));
    const missing = [...keptKeys].filter((k) => !outKeys.includes(k));
    const order = lcs(origKeys, outKeys) / Math.max(1, outKeys.length);
    let neighbours = '';
    if (c.neighbours) {
      const [left, right] = c.neighbours;
      const flat = norm(out[engine].text);
      const li = flat.indexOf(left);
      const ri = flat.indexOf(right, li + 1);
      const line = li >= 0 ? flat.slice(li).split('\n')[0].slice(0, 40) : '?';
      neighbours = ` "${left}" then "${right}": ${li >= 0 && ri > li && !flat.slice(li, ri).includes('\n') ? 'in order on one line' : 'NOT in order'} ("${line}").`;
    }
    lines.push(`- ${engine}: secret ${leaked.length ? 'LEAKED' : 'absent'}; written words not found ${missing.length}; ${out[engine].text.length ? (100 * order).toFixed(1) : '-'}% of words in the original's order.${neighbours}`);
  }
  for (const engine of ['pdfium', 'pdfkit'] as const) {
    const word = tokens(c.secret)[0];
    const search = extract(engine, r.outPath, word);
    const origHits = extract(engine, original, word).hits.length;
    lines.push(`- ${engine} search "${word}": ${search.hits.length} hits (original ${origHits}).`);
  }
  lines.push(`- Selection vs original, PDFium: ${alignment(orig.pdfium, out.pdfium)}.`);
  lines.push(`- Raw file search for the secret: ${rawStreamLeak(r.outPath, c.secret).length ? 'FOUND' : 'not found'}.`);
  report.push(lines.join('\n'));
  console.log(lines.join('\n') + '\n');
}
fs.writeFileSync(path.join(OUT, 'report.md'), report.join('\n\n') + '\n');
