import { describe, expect, it } from 'vitest';
import { latestOnly, pinchedZoom, zoomRange } from './cameraZoom.ts';

describe('zoomRange', () => {
  it('is null when the camera offers no zoom', () => {
    expect(zoomRange(undefined)).toBeNull();
    expect(zoomRange({})).toBeNull();
    expect(zoomRange({ zoom: { min: 1, max: 1 } })).toBeNull();
  });
  it('stops at five times the minimum, and defaults the step', () => {
    expect(zoomRange({ zoom: { min: 1, max: 100, step: 0.5 } })).toEqual({ min: 1, max: 5, step: 0.5 });
    expect(zoomRange({ zoom: { min: 1, max: 3 } })).toEqual({ min: 1, max: 3, step: 0 });
  });
});

describe('pinchedZoom', () => {
  const range = { min: 1, max: 5, step: 0.1 };
  it('scales from the zoom the pinch began at', () => {
    expect(pinchedZoom(2, 100, 150, range)).toBeCloseTo(3);
    expect(pinchedZoom(2, 100, 50, range)).toBeCloseTo(1);
  });
  it('stays inside the range', () => {
    expect(pinchedZoom(2, 100, 900, range)).toBe(5);
    expect(pinchedZoom(2, 100, 10, range)).toBe(1);
  });
  it('lands on the step, counted from the minimum', () => {
    expect(pinchedZoom(1, 100, 123, { min: 1, max: 5, step: 0.5 })).toBe(1.0);
    expect(pinchedZoom(1, 100, 130, { min: 1, max: 5, step: 0.5 })).toBe(1.5);
  });
  it('without a step keeps the exact value', () => {
    expect(pinchedZoom(1, 100, 123, { min: 1, max: 5, step: 0 })).toBeCloseTo(1.23);
  });
});

describe('latestOnly', () => {
  const later = () => {
    const done: Array<() => void> = [];
    const sent: number[] = [];
    const apply = (value: number) => new Promise<void>((resolve) => { sent.push(value); done.push(resolve); });
    return { apply, sent, finish: async () => { done.shift()?.(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); } };
  };
  it('sends the first value at once, and only the newest of those that came while it ran', async () => {
    const { apply, sent, finish } = later();
    const send = latestOnly(apply);
    send(1); send(2); send(3);
    expect(sent).toEqual([1]);
    await finish();
    expect(sent).toEqual([1, 3]);
    await finish();
    expect(sent).toHaveLength(2);
  });
  it('a refusal costs that value only, and the next still goes', async () => {
    const sent: number[] = [];
    const apply = async (value: number) => { sent.push(value); if (sent.length === 1) throw new Error('no'); };
    const send = latestOnly(apply);
    send(1);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    send(2);
    expect(sent).toEqual([1, 2]);
  });
});
