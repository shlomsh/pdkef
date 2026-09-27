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
import { planTextLayer } from '../../src/tools/redact/find/textLayer.ts';
import { pageGeometryFromPdfJsPage } from '../../src/editor/geometry/coords.ts';
import { createInvisibleFont, drawInvisibleWords } from '../../src/editor/adapters/pdf/invisibleText.js';

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
  // Either a corpus rect ([left, top, width, height] in page percent) or a
  // phrase whose Find box becomes the redaction box.
  rect?: number[];
  boxPhrase?: string;
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
    boxPhrase: 'לביטחון',
    secret: 'לביטחון',
    neighbours: ['המשרד', 'לאומי'],
  },
  {
    name: 'plain-latin-middle-word',
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
  return { doc, page, pageText: buildPageText(pageNo - 1, items as any), geometry: pageGeometryFromPdfJsPage(page as any) };
}

async function exportCase(c: Case) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(CORPUS, c.file)));
  const { page, pageText, geometry } = await readPage(bytes, c.page);

  let boxes;
  if (c.rect) {
    const [left, top, width, height] = c.rect;
    boxes = [{ left, top, width, height }];
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

  const plan = planTextLayer(pageText, geometry, boxes, measure);

  const build = async (withLayer: boolean) => {
    const out = await PDFDocument.create();
    const img = await out.embedJpg(jpeg);
    const p = out.addPage([geometry.width, geometry.height]);
    p.drawImage(img, { x: 0, y: 0, width: geometry.width, height: geometry.height });
    if (withLayer) {
      const font = createInvisibleFont(out);
      drawInvisibleWords(out, p, font, plan.words);
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

/** Word boxes from an extractor's char list, keyed by the word's sorted letters. */
function wordBoxes(page: { text: string; chars: { c: string; box: number[] }[] }) {
  const words: { key: string; box: number[] }[] = [];
  let cur: { cs: string[]; box: number[] } | null = null;
  const flush = () => {
    if (cur && cur.cs.length) words.push({ key: [...cur.cs].sort().join(''), box: cur.box });
    cur = null;
  };
  for (const { c, box } of page.chars) {
    if (/\s/.test(c)) { flush(); continue; }
    if (!cur) cur = { cs: [], box: [...box] };
    else if (Math.abs(box[1] - cur.box[1]) > 4 || box[0] - cur.box[2] > 6 || cur.box[0] - box[2] > 6) { flush(); cur = { cs: [], box: [...box] }; }
    cur.cs.push(c);
    cur.box = [Math.min(cur.box[0], box[0]), Math.min(cur.box[1], box[1]), Math.max(cur.box[2], box[2]), Math.max(cur.box[3], box[3])];
  }
  flush();
  return words;
}

/** How far each output word's box sits from the same word in the original, in points. */
function alignment(orig: ReturnType<typeof wordBoxes>, out: ReturnType<typeof wordBoxes>) {
  const byKey = new Map<string, number[][]>();
  for (const w of orig) byKey.set(w.key, [...(byKey.get(w.key) ?? []), w.box]);
  const d: number[] = [];
  for (const w of out) {
    const cands = byKey.get(w.key);
    if (!cands) continue;
    const best = Math.min(...cands.map((b) => Math.max(Math.abs(b[0] - w.box[0]), Math.abs(b[2] - w.box[2]), Math.abs(b[1] - w.box[1]))));
    d.push(best);
  }
  d.sort((a, b) => a - b);
  const q = (p: number) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))].toFixed(1) : '-');
  return `${d.length} words matched, median ${q(0.5)} pt, p90 ${q(0.9)} pt, max ${q(1)} pt`;
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

const report: string[] = [];
for (const c of CASES) {
  const r = await exportCase(c);
  const original = path.join(CORPUS, c.file);
  const kept = r.plan.words.map((w) => w.text);
  const lines = [`## ${c.name}`, '',
    `- Words written ${kept.length}, left out ${r.plan.dropped}. Layer adds ${r.layerBytes} bytes to a ${r.plainBytes}-byte picture page (${((100 * r.layerBytes) / r.plainBytes).toFixed(1)}%).`];

  const texts: Record<string, string> = { pdfjs: await extractPdfjs(r.outPath) };
  const pdfium = extract('pdfium', r.outPath);
  const pdfkit = extract('pdfkit', r.outPath);
  texts.pdfium = pdfium.pages[0].text;
  texts.pdfkit = pdfkit.pages[0].text;
  const origPdfium = extract('pdfium', original).pages[c.page - 1];
  const origPdfkit = extract('pdfkit', original).pages[c.page - 1];

  const secretWords = tokens(c.secret);
  for (const [engine, text] of Object.entries(texts)) {
    const toks = tokens(text);
    const leaked = secretWords.filter((w) => toks.includes(w) && !kept.includes(w));
    const missing = kept.filter((w) => !toks.includes(w));
    const order = lcs(kept, toks) / Math.max(1, kept.length);
    let neighbours = '';
    if (c.neighbours) {
      const [left, right] = c.neighbours;
      const flat = norm(text);
      const li = flat.indexOf(left);
      const ri = flat.indexOf(right, li + 1);
      neighbours = ` Neighbours "${left}" then "${right}": ${li >= 0 && ri > li ? 'in order' : 'NOT in order'} ("${li >= 0 ? flat.slice(li, Math.min(flat.length, li + 40)).split('\n')[0] : '?'}").`;
    }
    lines.push(`- ${engine}: secret ${leaked.length ? `LEAKED (${leaked.join(' ')})` : 'absent'}; kept words missing ${missing.length}${missing.length ? ` (${missing.slice(0, 6).join(' ')})` : ''}; in page order ${(100 * order).toFixed(1)}%.${neighbours}`);
  }
  for (const engine of ['pdfium', 'pdfkit'] as const) {
    const search = extract(engine, r.outPath, secretWords[0]);
    const origHits = extract(engine, original, secretWords[0]).hits.length;
    lines.push(`- ${engine} search "${secretWords[0]}": ${search.hits.length} hits (original page had ${origHits}; kept elsewhere: ${kept.filter((w) => w.includes(secretWords[0])).length}).`);
  }
  lines.push(`- Selection vs original, PDFium: ${alignment(wordBoxes(origPdfium), wordBoxes(pdfium.pages[0]))}.`);
  lines.push(`- Selection vs original, PDFKit: ${alignment(wordBoxes(origPdfkit), wordBoxes(pdfkit.pages[0]))}.`);
  lines.push(`- Raw file search for the secret: ${rawStreamLeak(r.outPath, c.secret).length ? 'FOUND' : 'not found'}.`);
  report.push(lines.join('\n'));
  console.log(lines.join('\n') + '\n');
}
fs.writeFileSync(path.join(OUT, 'report.md'), report.join('\n\n') + '\n');
