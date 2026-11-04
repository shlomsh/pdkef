import { describe, expect, it } from 'vitest';
import type { GrayImage, Quad } from '#lib/pageEnhance/quad.ts';
import { cornerError, formatKpiTable, quadIou, scoreDetector, type KpiCase } from './kpi.ts';

const sq = (x0: number, y0: number, x1: number, y1: number): Quad => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const image: GrayImage = { width: 1, height: 1, data: new Uint8ClampedArray(1) };
const shift = (q: Quad, d: number): Quad => q.map((p) => ({ x: p.x + d, y: p.y })) as Quad;

describe('cornerError', () => {
  it('is the largest per-axis distance between matched corners', () => {
    const a = sq(0.1, 0.1, 0.9, 0.9);
    expect(cornerError(a, a)).toBe(0);
    const b = a.map((p, i) => (i === 2 ? { x: p.x + 0.03, y: p.y - 0.05 } : p)) as Quad;
    expect(cornerError(b, a)).toBeCloseTo(0.05, 10);
  });
});

describe('quadIou', () => {
  it('is 1 for equal quads, 0 for disjoint, and exact for a half overlap', () => {
    const a = sq(0, 0, 0.5, 0.5);
    expect(quadIou(a, a)).toBeCloseTo(1, 10);
    expect(quadIou(a, sq(0.6, 0.6, 1, 1))).toBe(0);
    expect(quadIou(sq(0, 0, 1, 1), shift(sq(0, 0, 1, 1), 0.5))).toBeCloseTo(1 / 3, 10);
  });
  it('does not care which way the corners wind', () => {
    const a = sq(0.1, 0.1, 0.6, 0.7);
    expect(quadIou(a, [...a].reverse() as Quad)).toBeCloseTo(1, 10);
  });
});

describe('scoreDetector', () => {
  const truth = sq(0.2, 0.2, 0.8, 0.8);
  const cases: KpiCase[] = [
    { name: 'exact', image, truth, conditions: ['plain'] },
    { name: 'near', image, truth, conditions: ['shadow'] },
    { name: 'far', image, truth, conditions: ['shadow', 'glare'] },
    { name: 'missed', image, truth, conditions: ['clutter'] },
    { name: 'empty', image, truth: null, conditions: ['no-page'] },
    { name: 'phantom', image, truth: null, conditions: ['no-page'] },
  ];
  const answers: Record<string, Quad | null> = {
    exact: truth,
    near: shift(truth, 0.03),
    far: shift(truth, 0.1),
    missed: null,
    empty: null,
    phantom: sq(0.1, 0.1, 0.9, 0.9),
  };
  const result = scoreDetector(cases, (_img, c) => answers[c.name]);

  it('counts found-rates at each tolerance', () => {
    expect(result.n).toBe(6);
    expect(result.found['0.02']).toBeCloseTo(2 / 6, 10); // exact, empty
    expect(result.found['0.035']).toBeCloseTo(3 / 6, 10); // + near
    expect(result.found['0.08']).toBeCloseTo(3 / 6, 10);
  });
  it('counts confidently wrong answers, including a page invented on no page', () => {
    expect(result.confidentlyWrong).toBe(2); // far, phantom
  });
  it('scores null on no-page photos', () => {
    expect(result.nullOnNoPage).toBeCloseTo(0.5, 10);
  });
  it('reports error and IoU over the photos that have a page', () => {
    expect(result.maxError).toBe(1); // the missed photo counts as the worst answer
    expect(result.medianError).toBeCloseTo(0.065, 10);
    expect(result.medianIou).toBeGreaterThan(0);
  });
  it('splits found-rate by condition at 0.035', () => {
    expect(result.byCondition.shadow).toBeCloseTo(0.5, 10);
    expect(result.byCondition.plain).toBe(1);
    expect(result.byCondition.clutter).toBe(0);
  });
  it('prints a table naming every KPI', () => {
    const t = formatKpiTable(result);
    for (const word of ['found@0.02', 'found@0.035', 'found@0.08', 'median err', 'max err', 'median IoU', 'confidently wrong', 'null on no page', 'shadow']) expect(t).toContain(word);
  });
});
