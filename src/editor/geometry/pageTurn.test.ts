import { describe, expect, it } from 'vitest';
import { createPageGeometry } from './coords.ts';
import { addTurn, turnElement, turnGeometry, turnPercentBox, turnPercentPoint, turnsOf } from './pageTurn.ts';
import type { EditorElement } from '../model/editorModel.ts';

const portrait = createPageGeometry({ cropBox: { x: 0, y: 0, width: 612, height: 792 } });
const box = { left: 10, top: 20, width: 30, height: 15 };
const near = (a: unknown, b: unknown) => {
  for (const k of Object.keys(b as object)) {
    const x = (a as any)[k], y = (b as any)[k];
    if (typeof y === 'number') expect(x).toBeCloseTo(y, 9); else expect(x).toEqual(y);
  }
};

const base = { id: 'a', pageIndex: 0 };
const ELEMENTS: EditorElement[] = [
  { id: 'a', pageIndex: 0, left: 10, top: 20, type: 'text', text: 'hi', fontSize: 12 },
  { ...base, ...box, type: 'rectangle' },
  { ...base, ...box, type: 'ellipse' },
  { id: 'l', pageIndex: 0, type: 'line', x1: 5, y1: 10, x2: 70, y2: 40 },
  { ...base, ...box, type: 'symbol', mark: 'check' },
  { ...base, ...box, type: 'signature', dataUrl: 'data:,' },
  { ...base, ...box, type: 'whiteout' },
  { ...base, ...box, type: 'blackout' },
  { ...base, ...box, type: 'blur' },
  { ...base, ...box, type: 'blurStroke', points: [[1, 2]], sizePt: 4 },
  { ...base, ...box, type: 'whiteoutStroke', points: [[1, 2]], sizePt: 4, color: '#fff' },
];

describe('page turn geometry', () => {
  it('four quarter turns are the identity for a point and a box', () => {
    near(turnPercentPoint({ x: 12, y: 34 }, 4), { x: 12, y: 34 });
    near(turnPercentBox(box, 4), box);
  });

  it.each(ELEMENTS.map((e) => [e.type, e] as const))('four turns are the identity for %s', (_t, el) => {
    let cur = el;
    let geo = portrait;
    for (let i = 0; i < 4; i++) {
      cur = turnElement(cur, geo, 1);
      geo = turnGeometry(geo, 1);
    }
    near(cur, el);
  });

  it('one turn of a box on a portrait page swaps width and height', () => {
    near(turnPercentBox(box, 1), { left: 65, top: 10, width: 15, height: 30 });
  });

  it('a covering box turns with the page and a line follows', () => {
    near(turnElement(ELEMENTS[1], portrait, 1), { left: 65, top: 10, width: 15, height: 30 });
    near(turnElement(ELEMENTS[3], portrait, 1), { x1: 90, y1: 5, x2: 60, y2: 70 });
  });

  it('an upright signature keeps its size in points on a portrait-to-landscape turn', () => {
    const sig = ELEMENTS[5] as Extract<EditorElement, { type: 'signature' }>;
    const out = turnElement(sig, portrait, 1);
    const to = turnGeometry(portrait, 1);
    expect((out.width * to.width) / 100).toBeCloseTo((sig.width * portrait.width) / 100, 9);
    expect((out.height * to.height) / 100).toBeCloseTo((sig.height * portrait.height) / 100, 9);
    // The center followed the content: old (25, 27.5) -> (72.5, 25).
    expect(out.left + out.width / 2).toBeCloseTo(72.5, 9);
    expect(out.top + out.height / 2).toBeCloseTo(25, 9);
  });

  it('a text element moves as a point and keeps everything else', () => {
    const out = turnElement(ELEMENTS[0], portrait, 1) as any;
    // Anchor = top-left of the one-line box (12pt * 1.05 on a 792pt page = 1.5909%): 100 - (20 + 1.5909).
    near(out, { left: 100 - 20 - (12 * 1.05 * 100) / 792, top: 10, text: 'hi', fontSize: 12, id: 'a' });
  });

  it('a highlight turns with the page: its box and every band follow the text under them', () => {
    const highlight = {
      ...base, type: 'highlight', left: 10, top: 20, width: 40, height: 10, color: '#FFF34D', comment: 'note', direction: 'rtl',
      bands: [{ left: 50, top: 0, width: 50, height: 40 }, { left: 0, top: 60, width: 75, height: 40 }],
    } as EditorElement;
    // A band in page percent, before and after, through the same point map as the page.
    const absolute = (el: any, b: any) => ({ left: el.left + (b.left / 100) * el.width, top: el.top + (b.top / 100) * el.height, width: (b.width / 100) * el.width, height: (b.height / 100) * el.height });
    const turned = turnElement(highlight, portrait, 1) as any;
    near(turned, { ...turnPercentBox(highlight as any, 1), comment: 'note', direction: 'rtl' });
    (highlight as any).bands.forEach((band: any, i: number) => near(absolute(turned, turned.bands[i]), turnPercentBox(absolute(highlight, band), 1)));
    near(turnElement(turnElement(turned, turnGeometry(portrait, 1), 1), turnGeometry(portrait, 2), 2), highlight);
  });

  it('turnGeometry advances the rotation and swaps width and height', () => {
    const g = turnGeometry(portrait, 1);
    expect(g.rotation).toBe(90);
    expect([g.width, g.height]).toEqual([792, 612]);
    expect(turnGeometry(portrait, -1).rotation).toBe(270);
  });

  it('addTurn wraps and drops the entry on the fourth turn', () => {
    let t = {};
    for (let i = 0; i < 3; i++) t = addTurn(t, 2);
    expect(turnsOf(t, 2)).toBe(3);
    expect(addTurn(t, 2)).toEqual({});
    expect(addTurn({}, 2, -1)).toEqual({ 2: 3 });
    expect(turnsOf({}, 5)).toBe(0);
  });

  it('minWidth keeps its span in points', () => {
    const text = { id: 't', pageIndex: 0, type: 'text', text: 'x', fontSize: 12, left: 10, top: 20, minWidth: 30 } as EditorElement;
    const out = turnElement(text, portrait, 1) as any;
    const to = turnGeometry(portrait, 1);
    expect((out.minWidth * to.width) / 100).toBeCloseTo((30 * portrait.width) / 100, 9);
  });

  it('a text with a known width does not hang off the page', () => {
    const text = { id: 't', pageIndex: 0, type: 'text', text: 'x', fontSize: 12, left: 5, top: 5, width: 40 } as EditorElement;
    const out = turnElement(text, portrait, 1) as any;
    expect(out.left + out.width).toBeLessThanOrEqual(100 + 1e-9);
    const minOnly = turnElement({ ...text, width: undefined, minWidth: 40 } as any, portrait, 1) as any;
    expect(minOnly.left + minOnly.minWidth).toBeLessThanOrEqual(100 + 1e-9);
    expect(minOnly.left).toBeGreaterThanOrEqual(0);
  });
});
