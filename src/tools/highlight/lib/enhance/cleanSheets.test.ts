// Guard (PE-07): clean, upright, single flatbed pages stay 'straight', so Highlight never suggests Scan for them.
// The real assess and scanVerdict, no mocks. A page that is wrongly flagged stays here as `it.fails`.
import { describe, expect, it } from 'vitest';
import { gray, leaning } from '#lib/pageEnhance/leaning.test-helper.ts';
import { assess, type Assessment } from '#lib/pageEnhance/plan.ts';
import type { RgbaImage } from '#lib/pageEnhance/quad.ts';
import { scanVerdict } from './scanCheck.ts';

/** About READ_LONG_EDGE_PX on the long edge. */
const LONG = 1000;
const SHORT = 700;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

class Canvas {
  data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number, paper = 255) {
    this.data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let i = 0; i < width * height; i += 1) this.data.fill(paper, i * 4, i * 4 + 3);
  }
  rect(x0: number, y0: number, x1: number, y1: number, v: number) {
    for (let y = Math.max(0, y0); y < Math.min(this.height, y1); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(this.width, x1); x += 1) this.data.fill(v, (y * this.width + x) * 4, (y * this.width + x) * 4 + 3);
    }
  }
  /** One line of words from x0, ending exactly at x1 when `justify`, else ragged to about `fill` of the width. */
  line(x0: number, x1: number, y: number, r: () => number, justify: boolean, fill = 1) {
    const words: number[] = [];
    let used = 0;
    const target = (x1 - x0) * (justify ? 1 : fill * (0.8 + 0.2 * r()));
    while (used < target - 60) {
      const w = 20 + Math.floor(r() * 40);
      words.push(w);
      used += w + 8;
    }
    const total = words.reduce((a, b) => a + b, 0);
    const gap = justify ? ((x1 - x0) - total) / Math.max(1, words.length - 1) : 8;
    let x = x0;
    for (const w of words) {
      this.rect(Math.round(x), y, Math.round(x + w), y + 9, 25);
      x += w + gap;
    }
  }
  /** Light uniform grain, seeded. */
  grain(seed: number, amp: number) {
    const r = rng(seed);
    for (let i = 0; i < this.width * this.height; i += 1) {
      const d = Math.round((r() - 0.5) * 2 * amp);
      for (let c = 0; c < 3; c += 1) this.data[i * 4 + c] = Math.max(0, Math.min(255, this.data[i * 4 + c] + d));
    }
  }
  image(): RgbaImage {
    return { width: this.width, height: this.height, data: this.data };
  }
}

const MARGIN = 80;
const PITCH = 24;

function justified(paper = 255): Canvas {
  const c = new Canvas(SHORT, LONG, paper);
  const r = rng(11);
  for (let y = MARGIN; y < LONG - MARGIN; y += PITCH) c.line(MARGIN, SHORT - MARGIN, y, r, true);
  return c;
}

function ragged(paper = 255): Canvas {
  const c = new Canvas(SHORT, LONG, paper);
  const r = rng(22);
  let para = 0;
  for (let y = MARGIN; y < LONG - MARGIN; y += PITCH) {
    para += 1;
    if (para % 7 === 0) continue;
    const last = para % 7 === 6;
    c.line(MARGIN, SHORT - MARGIN, y, r, false, last ? 0.3 : 1);
  }
  return c;
}

function twoColumns(paper = 255): Canvas {
  const c = new Canvas(SHORT, LONG, paper);
  const r = rng(33);
  c.rect(MARGIN, MARGIN, SHORT - MARGIN, MARGIN + 28, 25);
  const mid = SHORT / 2;
  for (let y = MARGIN + 60; y < LONG - MARGIN; y += PITCH) {
    c.line(MARGIN, mid - 22, y, r, true);
    c.line(mid + 22, SHORT - MARGIN, y, r, true);
  }
  return c;
}

function table(): Canvas {
  const c = new Canvas(SHORT, LONG);
  const r = rng(44);
  const x0 = 60;
  const x1 = SHORT - 60;
  for (let y = 100; y <= 900; y += 50) c.rect(x0, y, x1, y + 2, 20);
  for (const x of [x0, 230, SHORT / 2 - 1, 500, x1 - 2]) c.rect(x, 100, x + 2, 902, 20);
  for (let y = 112; y < 900; y += 50) {
    c.line(x0 + 10, 215, y, r, false, 0.8);
    c.line(245, SHORT / 2 - 12, y, r, false, 0.8);
    c.line(SHORT / 2 + 12, 485, y, r, false, 0.8);
    c.line(515, x1 - 12, y, r, false, 0.8);
  }
  return c;
}

function mostlyBlank(): Canvas {
  const c = new Canvas(SHORT, LONG);
  c.rect(MARGIN, 120, MARGIN + 320, 150, 25);
  return c;
}

function photoPage(): Canvas {
  const c = new Canvas(SHORT, LONG);
  const r = rng(55);
  c.rect(MARGIN, 120, SHORT - MARGIN, 640, 40);
  c.line(MARGIN + 100, SHORT - MARGIN - 100, 670, r, false, 0.6);
  return c;
}

function landscape(): Canvas {
  const c = new Canvas(LONG, SHORT);
  const r = rng(66);
  for (let y = 70; y < SHORT - 70; y += PITCH) c.line(70, LONG - 70, y, r, true);
  return c;
}

function noisy(make: (paper: number) => Canvas, seed: number): Canvas {
  const c = make(232);
  c.grain(seed, 8);
  return c;
}

const pages: Array<[string, () => RgbaImage]> = [
  ['a justified text page', () => justified().image()],
  ['a ragged-right page with paragraph gaps and a short last line', () => ragged().image()],
  ['a two-column article with a white gutter', () => twoColumns().image()],
  ['a table with ruled lines and a full-height rule at centre', () => table().image()],
  ['a mostly blank page with one short heading', () => mostlyBlank().image()],
  ['a page with a large dark photo block and a caption', () => photoPage().image()],
  ['a grainy grey-paper justified page', () => noisy(justified, 1).image()],
  ['a grainy grey-paper ragged-right page', () => noisy(ragged, 2).image()],
  ['a grainy grey-paper two-column page', () => noisy(twoColumns, 3).image()],
  ['a landscape text page', () => landscape().image()],
];

/** Pages the guard currently catches wrongly; each is named with the wrong field. Empty means all clean. */
const KNOWN_WRONG: Record<string, string> = {};

const assessed = new Map<string, Assessment>();
const read = (name: string, make: () => RgbaImage) => {
  if (!assessed.has(name)) assessed.set(name, assess(gray(make())));
  return assessed.get(name)!;
};

describe('clean upright single pages stay straight', () => {
  for (const [name, make] of pages) {
    const run = KNOWN_WRONG[name] ? it.fails : it;
    run(name, () => {
      const a = read(name, make);
      expect(a.crooked).toBe(false);
      expect(a.spine).toBeFalsy();
      expect(a.possibleSpine).toBeFalsy();
      expect(scanVerdict([a])).toBe('straight');
    });
  }

  it('a mixed set of all of them is straight', () => {
    const sheets = pages.filter(([name]) => !KNOWN_WRONG[name]).map(([name, make]) => read(name, make));
    expect(scanVerdict(sheets)).toBe('straight');
  });
});

describe('positive control', () => {
  it('a page leaning 3 degrees is crooked, so the guard cannot pass by detecting nothing', () => {
    const a = assess(gray(leaning(600, 800, 3)));
    expect(a.crooked).toBe(true);
    expect(scanVerdict([a])).toBe('lean');
  });
});
