import { describe, expect, it } from 'vitest';
import { BLACKOUT_COLOR, drawnBoxElement, type DrawnBoxType } from './drawnBox.ts';

const patch = { left: 10, top: 20, width: 30, height: 5 };

function build(type: DrawnBoxType, overrides: Partial<Parameters<typeof drawnBoxElement>[0]> = {}) {
  return drawnBoxElement({ newId: () => 'box-1', pageIndex: 2, type, patch, blurStrength: 0.55, samplePage: () => null, ...overrides });
}

describe('drawnBoxElement', () => {
  it('places a blackout in the blackout colour', () => {
    expect(build('blackout')).toEqual({ id: 'box-1', pageIndex: 2, ...patch, type: 'blackout', color: BLACKOUT_COLOR });
  });

  it('places a blur at the given strength', () => {
    expect(build('blur')).toEqual({ id: 'box-1', pageIndex: 2, ...patch, type: 'blur', strength: 0.55 });
  });

  it('places a whiteout in the sampled page colour, following the page', () => {
    const sampled: Array<[number, unknown]> = [];
    const samplePage = (pageIndex: number, box: unknown) => { sampled.push([pageIndex, box]); return '#fafafa'; };
    expect(build('whiteout', { samplePage })).toEqual({
      id: 'box-1', pageIndex: 2, ...patch, type: 'whiteout', color: '#fafafa', colorMode: 'auto',
    });
    expect(sampled).toEqual([[2, patch]]);
  });

  it('falls back to white when the page cannot be sampled', () => {
    expect(build('whiteout', { samplePage: () => undefined })).toMatchObject({ color: '#ffffff', colorMode: 'auto' });
    expect(build('whiteout')).toMatchObject({ color: '#ffffff', colorMode: 'auto' });
  });

  it('places nothing for a press that drew nothing, and never samples the page', () => {
    let samples = 0;
    const samplePage = () => { samples += 1; return '#fafafa'; };
    expect(build('whiteout', { patch: undefined, samplePage })).toBeNull();
    expect(build('whiteout', { patch: { ...patch, width: 1 }, samplePage })).toBeNull();
    expect(build('whiteout', { patch: { ...patch, height: 0.5 }, samplePage })).toBeNull();
    expect(samples).toBe(0);
  });

  it('never asks for an id when the press drew nothing, and asks once for a box that is placed', () => {
    let asked = 0;
    const newId = () => { asked += 1; return `box-${asked}`; };
    build('blackout', { patch: undefined, newId });
    build('blackout', { patch: { ...patch, width: 1 }, newId });
    build('blackout', { patch: { ...patch, height: 0.5 }, newId });
    expect(asked).toBe(0);
    expect(build('blackout', { newId })).toMatchObject({ id: 'box-1' });
    expect(asked).toBe(1);
  });

  it('places a box just over one percent in both directions', () => {
    expect(build('blackout', { patch: { left: 0, top: 0, width: 1.1, height: 1.1 } })).not.toBeNull();
  });
});
