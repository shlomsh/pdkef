import { describe, expect, it } from 'vitest';
import { pageSizeQuietLabel, sizeValueText } from './tableText.ts';

describe('sizeValueText', () => {
  it('is the built size once the PDF is ready', () => {
    expect(sizeValueText('ready', 2048, 'ltr')).toMatch(/2(\.0)? KB/);
  });

  it('is null while it builds, idle or failed, so the caller shows the preparing state', () => {
    expect(sizeValueText('pending', 2048, 'ltr')).toBeNull();
    expect(sizeValueText('idle', 0, 'ltr')).toBeNull();
    expect(sizeValueText('error', 0, 'ltr')).toBeNull();
  });
});

describe('pageSizeQuietLabel', () => {
  it('names the chosen paper', () => {
    expect(pageSizeQuietLabel('fit')).toBe('Page size: Fit');
    expect(pageSizeQuietLabel('a4')).toBe('Page size: A4');
    expect(pageSizeQuietLabel('letter')).toBe('Page size: Letter');
  });
});
