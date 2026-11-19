import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom cannot read page pixels: the real sampler runs, and only its answer is forced where a colour is needed.
vi.mock('#editor-ui/whiteout/pageSampling.ts', { spy: true });
import { sampleRingColor } from '#editor-ui/whiteout/pageSampling.ts';
import { samplePageColor, signPageCanvas } from './whiteoutPageColor.ts';

afterEach(() => { document.body.innerHTML = ''; vi.mocked(sampleRingColor).mockReset(); });

describe('Sign whiteout page colour', () => {
  it('finds the canvas inside the page surface of that page index', () => {
    document.body.innerHTML = '<div data-sign-page-surface="0"><canvas id="a"></canvas></div><div data-sign-page-surface="1"><canvas id="b"></canvas></div>';
    expect(signPageCanvas(1)?.id).toBe('b');
    expect(signPageCanvas(2)).toBeNull();
  });

  it('samples the ring of that page canvas, and is null when the page is not mounted', () => {
    document.body.innerHTML = '<div data-sign-page-surface="0"><canvas id="a"></canvas></div>';
    const box = { left: 1, top: 2, width: 3, height: 4 };
    vi.mocked(sampleRingColor).mockReturnValueOnce('#abcdef');
    expect(samplePageColor(0, box)).toBe('#abcdef');
    expect(sampleRingColor).toHaveBeenCalledWith(document.getElementById('a'), box);
    expect(samplePageColor(5, box)).toBe(null);
  });
});
