import { describe, expect, it } from 'vitest';
import { englishCompressMessages as t, hebrewCompressMessages } from '../messages';
import { deriveResultView, formatBytes } from './resultView.ts';

const file = new File([new Uint8Array(1000)], 'a.pdf', { type: 'application/pdf' });
const base: Parameters<typeof deriveResultView>[0] = {
  t,
  file,
  kind: 'pdf',
  level: 'medium',
  targetKB: 100,
  flatten: false,
  isDone: true,
  compressedSize: 500,
  passthrough: false,
  unchanged: false,
  metTarget: true,
  rasterBytes: null,
  imageReason: null,
  keptBytes: 0,
  resultImageBytes: 0,
};

describe('formatBytes', () => {
  it('scales to the unit', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(1_500_000)).toBe('1.5 MB');
  });
});

describe('deriveResultView', () => {
  it('computes the saving and shows only the size on a smaller result', () => {
    const v = deriveResultView(base);
    expect(v.savingsPercent).toBe(50);
    expect(v.downloadDetail).toContain('500');
    expect(v.resultTitle).toBe('');
    expect(v.slightGain).toBe(false);
  });

  it('has no detail before a result exists', () => {
    expect(deriveResultView({ ...base, compressedSize: null, isDone: false }).downloadDetail).toBeUndefined();
  });

  it('flags a slight gain with its title', () => {
    const v = deriveResultView({ ...base, compressedSize: 980, imageReason: 'smaller', keptBytes: 10, resultImageBytes: 100 });
    expect(v.slightGain).toBe(true);
    expect(v.resultTitle).toBe(t.slightGainTitle);
    expect(v.resultNotice).toContain(t.slightGainExtremeHint);
  });

  it('words an honest miss for a target and offers the flatten switch', () => {
    const v = deriveResultView({ ...base, level: 'target', metTarget: false });
    expect(v.closestWarning).not.toBeNull();
    expect(v.showFlatten).toBe(true);
    expect(v.targetMissedNotice).toBeNull();
  });

  it('names an unchanged passthrough', () => {
    const v = deriveResultView({ ...base, passthrough: true, unchanged: true, compressedSize: 1000, rasterBytes: 2000 });
    expect(v.resultTitle).toBe(t.alreadySmallTitle);
    expect(v.closestWarning).toBeNull();
  });
});

// A PDF that came back `share` smaller on the images-only path.
const saved = (share: number, extra: Partial<Parameters<typeof deriveResultView>[0]> = {}) =>
  deriveResultView({ ...base, compressedSize: Math.round(1000 * (1 - share)), imageReason: 'smaller', ...extra });

describe('deriveResultView savings', () => {
  it('rounds the saving to a whole percent', () => {
    expect(deriveResultView({ ...base, compressedSize: 666 }).savingsPercent).toBe(33);
    expect(deriveResultView({ ...base, compressedSize: 994 }).savingsPercent).toBe(1);
  });
});

describe('deriveResultView switch', () => {
  it('is absent on a fresh result with a good saving', () => {
    expect(saved(0.5).showFlatten).toBe(false);
  });

  it('is present once the images could not carry the saving', () => {
    expect(deriveResultView({ ...base, imageReason: 'unsupported', passthrough: true, unchanged: true, compressedSize: 1000 }).showFlatten).toBe(true);
    expect(deriveResultView({ ...base, imageReason: 'no-gain', passthrough: true, unchanged: true, compressedSize: 1000 }).showFlatten).toBe(true);
    expect(saved(0.01).showFlatten).toBe(true);
  });

  it('stays out after reasons the switch cannot help', () => {
    expect(deriveResultView({ ...base, imageReason: 'no-images', passthrough: true, unchanged: true, compressedSize: 1000 }).showFlatten).toBe(false);
    expect(deriveResultView({ ...base, imageReason: 'encrypted', passthrough: true, unchanged: true, compressedSize: 1000 }).showFlatten).toBe(false);
  });

  it('is never offered for an image file', () => {
    expect(deriveResultView({ ...base, kind: 'image', flatten: false, level: 'target', metTarget: false }).showFlatten).toBe(false);
  });
});

describe('deriveResultView result card honesty (COMP-02)', () => {
  it('a 1% result at Balanced says only a little smaller, already compact, and points at Extreme', () => {
    const v = saved(0.01);
    expect(v.resultTitle).toBe('Only a little smaller');
    expect(v.resultNotice).toContain('already compact, so making them smaller saved 1%.');
    expect(v.resultNotice).toContain('"Smallest" can go further');
    expect(v.showFlatten).toBe(true);
  });

  it('at the smallest level the same result has no Extreme hint', () => {
    const v = saved(0.01, { level: 'high' });
    expect(v.resultTitle).toBe('Only a little smaller');
    expect(v.resultNotice).toContain('already compact, so making them smaller saved 1%.');
    expect(v.resultNotice).not.toContain('"Smallest" can go further');
  });

  it('when most image bytes were kept it says they could not be recompressed', () => {
    const v = saved(0.001, { keptBytes: 900, resultImageBytes: 1000 });
    expect(v.resultNotice).toContain("stored in a way I can't recompress, so it stayed as it was and this saved less than 1%");
    expect(v.resultNotice).not.toContain('already compact');
  });

  it('an image re-encoded but not smaller reads as compact, not kept', () => {
    const v = saved(0.001, { keptBytes: 10, resultImageBytes: 1000 });
    expect(v.resultNotice).toContain('already compact');
    expect(v.resultNotice).not.toContain("can't recompress");
  });

  it('4% still gets the slight-gain title', () => {
    const v = saved(0.04);
    expect(v.resultTitle).toBe('Only a little smaller');
    expect(v.resultNotice).toContain('saved 4%');
  });

  it('exactly 5% has no slight-gain title', () => {
    const v = saved(0.05);
    expect(v.slightGain).toBe(false);
    expect(v.resultTitle).toBe('');
  });

  it('5% and over has no title and shows no notice', () => {
    const v = saved(0.06);
    expect(v.resultTitle).toBe('');
    expect(v.resultNotice).toBe('');
    expect(v.closestWarning).toBeNull();
  });

  it('the flatten path under 5% gets the title and keeps its rasterize notice', () => {
    const v = deriveResultView({ ...base, flatten: true, compressedSize: 990, rasterBytes: 990 });
    expect(v.resultTitle).toBe('Only a little smaller');
    expect(v.resultNotice).toBe(t.rasterizeNotice);
    expect(v.resultNotice).not.toContain('already compact');
  });

  it('Exact size met with a small gain has no title', () => {
    const v = saved(0.01, { level: 'target', metTarget: true });
    expect(v.resultTitle).toBe('');
    expect(v.resultNotice).not.toContain('already compact');
  });

  it('no result card text mentions links or drawings', () => {
    const views = [
      saved(0.01),
      saved(0.01, { level: 'high' }),
      saved(0.001, { keptBytes: 900, resultImageBytes: 1000 }),
      saved(0.04),
      saved(0.5),
    ];
    for (const v of views) expect(`${v.resultTitle} ${v.resultNotice} ${v.downloadDetail}`).not.toMatch(/links|drawings/);
  });
});

describe('deriveResultView when the input comes back', () => {
  const back = { passthrough: true, unchanged: true, compressedSize: 1000 };

  it.each([
    ['no-images', 'There are no images in this PDF', 'Already as small as it gets'],
    ['no-gain', 'already compact, so making them smaller saved nothing', 'Already as small as it gets'],
    ['encrypted', "This PDF is locked, so its images can't be recompressed here", 'This PDF is locked'],
    ['unsupported', "stored in a way I can't recompress, so nothing was changed", 'Left as it was'],
  ])('reason %s shows its notice and says the PDF is unchanged', (reason, text, title) => {
    const v = deriveResultView({ ...base, ...back, imageReason: reason });
    expect(v.resultNotice).toContain(text);
    expect(v.resultTitle).toBe(title);
    expect(v.closestWarning).toBeNull();
    expect(v.slightGain).toBe(false);
  });

  it('reason under-target shows the untouched notice and is not "already as small as it gets"', () => {
    const v = deriveResultView({ ...base, level: 'target', passthrough: true, unchanged: false, compressedSize: 1000, imageReason: 'under-target' });
    expect(v.resultNotice).toContain('so the file is untouched');
    expect(v.resultTitle).toBe('Already under your target');
    expect(v.resultTitle).not.toBe(t.alreadySmallTitle);
  });
});

describe('deriveResultView target missed on the image path', () => {
  it('names both sizes, drops "Closest achievable", and offers the switch', () => {
    const v = deriveResultView({ ...base, level: 'target', metTarget: false, imageReason: 'smaller', file: new File([new Uint8Array(3_000_000)], 'big.pdf'), compressedSize: 2_500_000 });
    expect(v.targetMissedNotice).toBe(`Shrinking the images got this PDF to ${formatBytes(2_500_000)}, above your 100 KB target. Turning the pages into pictures, with the switch above, can go smaller.`);
    expect(v.closestWarning).toBeNull();
    expect(v.showFlatten).toBe(true);
  });
});

describe('deriveResultView download detail line size', () => {
  const big = new File([new Uint8Array(3000)], 'test_doc.pdf');

  it('wraps the size in LRI/PDI in Hebrew', () => {
    const detail = deriveResultView({ ...base, t: hebrewCompressMessages, file: big, compressedSize: 1500 }).downloadDetail;
    expect(detail).toMatch(/\u2066[^\u2066\u2069]*\d[^\u2066\u2069]*\u2069/);
  });

  it('adds no isolates in English', () => {
    const detail = deriveResultView({ ...base, file: big, compressedSize: 1500 }).downloadDetail;
    expect(detail).toMatch(/\d+(\.\d+)? [KM]B/);
    expect(detail).not.toContain('\u2066');
    expect(detail).not.toContain('\u2069');
  });
});
