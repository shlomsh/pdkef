import { afterEach, describe, expect, it } from 'vitest';
import { samplePageColor, signPageCanvas } from './whiteoutPageColor.ts';

afterEach(() => { document.body.innerHTML = ''; });

describe('Sign whiteout page colour', () => {
  it('finds the canvas inside the page surface of that page index', () => {
    document.body.innerHTML = '<div data-sign-page-surface="0"><canvas id="a"></canvas></div><div data-sign-page-surface="1"><canvas id="b"></canvas></div>';
    expect(signPageCanvas(1)?.id).toBe('b');
    expect(signPageCanvas(2)).toBeNull();
  });

  it('has no colour for a page that is not mounted', () => {
    expect(samplePageColor(5, { left: 1, top: 2, width: 3, height: 4 })).toBeNull();
  });
});
