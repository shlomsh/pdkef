import { describe, expect, it } from 'vitest';
import { LEVELS, VIEWS, degrade, mulberry32 } from './degrade.js';

const P0 = 200 / 72;
const W = 600;
const H = 800;
const RULES = [200, 400, 600]; // top row of each 4 px rule
const RULE_X0 = 100;
const RULE_X1 = 500;

function makeMaster() {
  const data = new Uint8ClampedArray(W * H).fill(255);
  for (const top of RULES) {
    for (let y = top; y < top + 4; y++) for (let x = RULE_X0; x < RULE_X1; x++) data[y * W + x] = 0;
  }
  return { id: 'synthetic', width: W, height: H, pxPerPoint: P0, data };
}

const master = makeMaster();
const ruleCentrePts = { x: 300 / P0, y: 402 / P0 };

function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('mulberry32', () => {
  it('is seeded and in [0,1)', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('determinism', () => {
  for (const level of ['scan', 'fax', 'phone']) {
    it(`${level}: same seed identical, other seed differs`, () => {
      const a = degrade(master, { level, view: 'native', seed: 1 }).raster.data;
      const b = degrade(master, { level, view: 'native', seed: 1 }).raster.data;
      const c = degrade(master, { level, view: 'native', seed: 2 }).raster.data;
      expect(same(a, b)).toBe(true);
      expect(same(a, c)).toBe(false);
    });
  }
  it('clean at native returns the input unchanged', () => {
    const out = degrade(master, { level: 'clean', view: 'native', seed: 1 });
    expect(out.raster.width).toBe(W);
    expect(out.raster.height).toBe(H);
    expect(same(out.raster.data, master.data)).toBe(true);
  });
});

describe('sizes, mapping and bounds', () => {
  for (const level of LEVELS) {
    for (const view of Object.keys(VIEWS)) {
      it(`${level}/${view}: size, finite output, mapPoint round trip`, () => {
        const out = degrade(master, { level, view, seed: 7 });
        const r = out.raster;
        expect(r.width).toBe(Math.round((W / P0) * VIEWS[view]));
        expect(r.height).toBe(Math.round((H / P0) * VIEWS[view]));
        expect(r.pxPerPoint).toBe(VIEWS[view]);
        expect(r.data.length).toBe(r.width * r.height);
        let bad = 0;
        for (let i = 0; i < r.data.length; i++) if (!Number.isFinite(r.data[i])) bad++;
        expect(bad).toBe(0);
        const wp = W / P0;
        const hp = H / P0;
        for (const [x, y] of [[0, 0], [wp, 0], [0, hp], [wp, hp], [wp / 2, hp / 2]]) {
          const m = out.mapPoint(x, y);
          const u = out.unmapPoint(m.x, m.y);
          expect(Math.abs(u.x - x)).toBeLessThan(0.01);
          expect(Math.abs(u.y - y)).toBeLessThan(0.01);
        }
      });
    }
  }
});

describe('level behaviour', () => {
  it('phone: the rule is dark at its mapped centre, lighter 12 px above', () => {
    const out = degrade(master, { level: 'phone', view: 'native', seed: 3 });
    const m = out.mapPoint(ruleCentrePts.x, ruleCentrePts.y);
    const at = out.raster.data[Math.floor(m.y) * out.raster.width + Math.floor(m.x)];
    const above = out.raster.data[Math.floor(m.y - 12) * out.raster.width + Math.floor(m.x)];
    expect(at).toBeLessThan(140);
    expect(above).toBeGreaterThan(at + 40);
  });

  it('fax: a broken rule is cut across its whole thickness, not row by row', () => {
    const band = [400, 401, 402, 403, 404, 405];
    let breaks = 0;
    let partial = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { data } = degrade(master, { level: 'fax', view: 'native', seed }).raster;
      const at = (x, y) => data[y * W + x];
      for (let x = RULE_X0 + 12; x < RULE_X1 - 12; x++) {
        // Two white pixels in a row: one is salt speckle, which is not a break.
        if (at(x, 402) !== 255 || at(x + 1, 402) !== 255 || at(x - 8, 402) !== 0 || at(x + 9, 402) !== 0) continue;
        if (band.every((y) => at(x, y) === 255)) breaks++;
        else partial++;
      }
    }
    expect(breaks).toBeGreaterThanOrEqual(10);
    expect(partial).toBeLessThanOrEqual(breaks * 0.3);
  });

  it('fax: only pure black and white', () => {
    const { data } = degrade(master, { level: 'fax', view: 'native', seed: 4 }).raster;
    let other = 0;
    let dark = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0 && data[i] !== 255) other++;
      if (data[i] === 0) dark++;
    }
    expect(other).toBe(0);
    expect(dark).toBeGreaterThan(0);
  });

  it('scan: the rule stays dark under noise', () => {
    const out = degrade(master, { level: 'scan', view: 'native', seed: 5 });
    let sum = 0;
    let n = 0;
    for (let px = 150; px < 450; px += 2) {
      const m = out.mapPoint(px / P0, ruleCentrePts.y);
      sum += out.raster.data[Math.floor(m.y) * out.raster.width + Math.floor(m.x)];
      n++;
    }
    expect(sum / n).toBeLessThan(100);
  });
});
