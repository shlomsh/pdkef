import { describe, expect, it } from 'vitest';
import { englishCompressMessages as t } from '../messages';
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
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB');
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
