// RED-12 spike: how far a word's estimated extent (one advance per pdf.js
// item, split by a measurement) lands from where its glyphs really are.
// Ground truth is PDFium's per-glyph boxes on the original page. Reports the
// error at each word's two ends, in ems of its font size, for three
// measurements: character count, a sans-serif canvas font (what the island
// uses today), and the page's own embedded font.
//   node spikes/red-12/estimate-error.mts
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPageText } from '../../src/tools/redact/find/pageText.ts';
import { sliceFractions, fractionBox, countChars } from '../../src/tools/redact/find/matchBoxes.ts';

const FILES = ['real-world-irs-1040-2024.pdf', 'real-world-uscis-i9-2025.pdf', 'real-world-health-declaration-2021.pdf'];
const CORPUS = path.join(process.cwd(), 'spikes/red-01/corpus');
const ctx = createCanvas(10, 10).getContext('2d');
const measureWith = (family: string) => (text: string) => {
  ctx.font = `100px ${family}`;
  return ctx.measureText(text).width;
};

type Box = { x0: number; x1: number; y0: number; y1: number };

function truthWords(file: string): { word: string; box: Box }[] {
  const out = JSON.parse(execFileSync('node', ['spikes/red-01/pdfium/extract-pdfium.mjs', file], { maxBuffer: 1 << 28 }).toString());
  const words: { word: string; box: Box }[] = [];
  let cur: { word: string; box: Box } | null = null;
  const flush = () => { if (cur) words.push(cur); cur = null; };
  for (const { c, box } of out.pages[0].chars) {
    if (/\s/.test(c)) { flush(); continue; }
    const b = { x0: box[0], y0: box[1], x1: box[2], y1: box[3] };
    const h = b.y1 - b.y0 || 1;
    if (cur && (Math.abs(b.y0 - cur.box.y0) > h || Math.max(b.x0 - cur.box.x1, cur.box.x0 - b.x1) > 0.6 * h)) flush();
    if (!cur) cur = { word: '', box: { ...b } };
    cur.word += c;
    cur.box = { x0: Math.min(cur.box.x0, b.x0), y0: Math.min(cur.box.y0, b.y0), x1: Math.max(cur.box.x1, b.x1), y1: Math.max(cur.box.y1, b.y1) };
  }
  flush();
  return words;
}

const key = (w: string) => [...w].sort().join('');
const results: Record<string, number[]> = { chars: [], sans: [], font: [] };
const spaces: number[] = [];

for (const name of FILES) {
  const file = path.join(CORPUS, name);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), fontExtraProperties: true, disableFontFace: true }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  await page.render({ canvasContext: canvas.getContext('2d') as any, viewport: vp, canvas: canvas as any }).promise;
  const content = await page.getTextContent();
  const fontNames = new Set(content.items.map((i: any) => i.fontName));
  const registered = new Set<string>();
  for (const f of fontNames) {
    try {
      const font = page.commonObjs.get(f);
      if (font?.data) { GlobalFonts.register(Buffer.from(font.data), f); registered.add(f); }
    } catch { /* not loaded */ }
  }
  const items = content.items.filter((i: any) => typeof i.str === 'string') as any[];
  const pageText = buildPageText(0, items);
  // PlacedItem has no font; recover it by matching transform and width.
  const fontOf = (t: number[], w: number) => items.find((i) => i.transform === t || (i.transform[4] === t[4] && i.transform[5] === t[5] && i.width === w))?.fontName;
  const truth = truthWords(file);
  const byKey = new Map<string, Box[]>();
  for (const t of truth) byKey.set(key(t.word), [...(byKey.get(key(t.word)) ?? []), t.box]);

  for (const item of pageText.items) {
    const str = pageText.text.slice(item.start, item.end);
    const words = [...str.matchAll(/\S+/g)];
    if (words.length < 2) continue; // single-word items are exact at both ends
    const fontName = fontOf(item.transform, item.width);
    const measures: Record<string, (s: string) => number> = {
      chars: countChars,
      sans: measureWith('sans-serif'),
      font: registered.has(fontName) ? measureWith(`"${fontName}"`) : measureWith('sans-serif'),
    };
    for (const m of words) {
      const cands = byKey.get(key(m[0]));
      if (!cands) continue;
      const em = item.height;
      for (const [label, measure] of Object.entries(measures)) {
        const { f0, f1 } = sliceFractions(item, str, m.index!, m.index! + m[0].length, measure, 0);
        const est = fractionBox(item, f0, f1);
        const nearest = cands.reduce((best, c) => {
          const d = Math.abs((c.x0 + c.x1) / 2 - (est.x0 + est.x1) / 2) + Math.abs(c.y0 - est.y0);
          return d < best.d ? { d, c } : best;
        }, { d: Infinity, c: cands[0] });
        if (Math.abs(nearest.c.y0 - est.y0) > em) continue;
        results[label].push(Math.max(Math.abs(nearest.c.x0 - est.x0), Math.abs(nearest.c.x1 - est.x1)) / em);
      }
    }
  }
  // Gaps between neighbouring truth words on one line, in ems.
  for (let i = 1; i < truth.length; i++) {
    const a = truth[i - 1].box, b = truth[i].box;
    const h = a.y1 - a.y0;
    if (Math.abs(a.y0 - b.y0) < 0.3 * h && h > 0) spaces.push(Math.max(b.x0 - a.x1, a.x0 - b.x1) / h);
  }
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3) : '-'; };
for (const [label, xs] of Object.entries(results)) {
  console.log(`${label.padEnd(5)} n=${xs.length} median ${q(xs, 0.5)} em, p90 ${q(xs, 0.9)}, p99 ${q(xs, 0.99)}, max ${q(xs, 1)}, >0.35em ${xs.filter((x) => x > 0.35).length}`);
}
const pos = spaces.filter((s) => s > 0);
console.log(`gap between words (glyph box to glyph box): n=${pos.length} p5 ${q(pos, 0.05)} em, median ${q(pos, 0.5)} em`);
