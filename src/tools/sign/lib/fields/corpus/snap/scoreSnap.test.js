import { describe, expect, it } from 'vitest';
import { classify, cutWindow, MAX_SNAP_PX, runSnapCorpus } from './scoreSnap.js';
import { listPages, loadPageRaster, loadTruth } from './pageStore.js';

const declineAll = () => ({ snapped: false, reason: 'no-rule' });

// Cheats on purpose: reads the truth through the 4th argument, which the real function ignores. It snaps to
// the nearest rule above the tap that covers its x within the snap radius, and declines when a second rule is
// nearly as close, which is exactly how the corpus defines a correct snap. It proves the scoring end to end.
function oracleSnap(_window, tap, { maxSnapPx }, o) {
  const p = o.unmapPoint(o.origin.x + tap.x, o.origin.y + tap.y);
  const radius = maxSnapPx / o.pxPerPoint;
  const near = o.truth.rules
    .filter((r) => p.x >= r.x0 && p.x <= r.x1)
    .map((r) => ({ r, d: Math.abs(p.y - r.y) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d);
  if (!near.length) return { snapped: false, reason: 'no-rule' };
  if (near[1] && near[1].d < 1.3 * near[0].d) return { snapped: false, reason: 'ambiguous' };
  const rule = near[0].r;
  const a = o.mapPoint(rule.x0, rule.y);
  const b = o.mapPoint(rule.x1, rule.y);
  const at = o.mapPoint(p.x, rule.y);
  return { snapped: true, kind: 'rule', x0: a.x - o.origin.x, x1: b.x - o.origin.x, y: at.y - o.origin.y };
}

const manifest = listPages();
const sample = () => {
  const entry = manifest.find((m) => m.id.startsWith('thai-sso')) ?? manifest[0];
  return [{ raster: loadPageRaster(entry.id), truth: loadTruth(entry.id) }];
};

describe('cutWindow', () => {
  it('centres the tap, keeps sub-pixel offsets, and whitens what lies off the page', () => {
    const raster = { width: 10, height: 10, pxPerPoint: 1, data: new Uint8ClampedArray(100).fill(0) };
    const { window, tap, origin } = cutWindow(raster, 0.25, 0.75, 4, 3);
    expect(window.width).toBe(9);
    expect(window.height).toBe(7);
    expect(tap.x).toBeCloseTo(4 + (0.25 - 0));
    expect(tap.y).toBeCloseTo(3 + (0.75 - 1));
    expect(origin).toEqual({ x: -4, y: -2 });
    expect(window.data[0]).toBe(255); // off the page
    expect(window.data[2 * 9 + 4]).toBe(0); // on the page
  });
});

describe('classify', () => {
  const rule = { id: 'r', x0: 100, x1: 400, y: 200, thickness: 1 };
  const base = { rule, tapWin: { x: 50, y: 60 }, origin: { x: 0, y: 0 }, unmapPoint: (x, y) => ({ x, y }), maxSnapPx: 57 };
  const snapAt = (y, extra = {}) => ({ snapped: true, kind: 'rule', x0: 0, x1: 99, y, ...extra });

  it('a decline is declined, whatever was expected', () => {
    expect(classify({ snapped: false, reason: 'no-rule' }, { ...base, expect: { kind: 'snap', ruleId: 'r' } }).outcome).toBe('declined');
  });
  it('a snap onto the expected rule is correct, onto another is wrong', () => {
    const ctx = { ...base, expect: { kind: 'snap', ruleId: 'r' }, tapWin: { x: 250, y: 160 }, maxSnapPx: 57 };
    expect(classify(snapAt(200, { x0: 100, x1: 400 }), ctx).outcome).toBe('correct');
    expect(classify(snapAt(190, { x0: 100, x1: 400 }), ctx).outcome).toBe('wrong');
  });
  it('a snap on a decoy is wrong', () => {
    const ctx = { ...base, expect: { kind: 'decline', why: 'far' }, tapWin: { x: 250, y: 160 } };
    expect(classify(snapAt(200, { x0: 100, x1: 400 }), ctx).outcome).toBe('wrong');
  });
  it('moving the tap further than the stated distance is wrong even onto the right rule', () => {
    const ctx = { ...base, expect: { kind: 'snap', ruleId: 'r' }, tapWin: { x: 250, y: 100 }, maxSnapPx: 57 };
    expect(classify(snapAt(200, { x0: 100, x1: 400 }), ctx)).toMatchObject({ outcome: 'wrong', why: 'too-far' });
  });
});

describe('the corpus run', () => {
  it('declining everything scores no snaps and a decline rate of 1', () => {
    const { summary } = runSnapCorpus({ pages: sample(), snap: declineAll, levels: ['clean'], views: ['native'] });
    expect(summary.snaps).toBe(0);
    expect(summary.precision).toBeNull();
    expect(summary.declineRate).toBe(1);
    expect(summary.total).toBeGreaterThan(50);
  });

  it('the oracle is almost never wrong on clean pages and snaps on a good share of taps', () => {
    const { summary } = runSnapCorpus({ pages: sample(), snap: oracleSnap, levels: ['clean'], views: ['native'] });
    expect(summary.snaps).toBeGreaterThan(30);
    expect(summary.precision).toBeGreaterThan(0.97);
    expect(MAX_SNAP_PX).toBeGreaterThan(50);
  });

  it('the oracle still scores under skew and noise, which the harness maps back exactly', () => {
    const { summary } = runSnapCorpus({ pages: sample(), snap: oracleSnap, levels: ['scan', 'phone'], views: ['fit'] });
    expect(summary.precision).toBeGreaterThan(0.97);
  });
});
