import { describe, expect, it } from 'vitest';
import { DEFAULT_BLUR_STRENGTH } from '../../editor/model/blurStrength.ts';
import { resolveRedactBlurStrength, resolveWhiteoutColor } from './redactStyle.ts';

describe('resolveWhiteoutColor (RED-40)', () => {
  it('prefers the document, then the app style, then the legacy preference, then white', () => {
    expect(resolveWhiteoutColor({ whiteoutColor: '#111111' }, { whiteoutColor: '#222222' }, '#333333')).toBe('#111111');
    expect(resolveWhiteoutColor({}, { whiteoutColor: '#222222' }, '#333333')).toBe('#222222');
    expect(resolveWhiteoutColor(undefined, {}, '#333333')).toBe('#333333');
    expect(resolveWhiteoutColor(undefined, {}, null)).toBe('#ffffff');
    expect(resolveWhiteoutColor(undefined, {})).toBe('#ffffff');
  });
});

describe('resolveRedactBlurStrength (RED-40)', () => {
  it('prefers the document, then the app style, then the legacy preference, then the default', () => {
    expect(resolveRedactBlurStrength({ blurStrength: 0.2 }, { blurStrength: 0.45 }, 0.5)).toBe(0.2);
    expect(resolveRedactBlurStrength({}, { blurStrength: 0.45 }, 0.5)).toBe(0.45);
    expect(resolveRedactBlurStrength(undefined, {}, 0.5)).toBe(0.5);
    expect(resolveRedactBlurStrength(undefined, {})).toBe(DEFAULT_BLUR_STRENGTH);
  });

  it('resolves a legacy string strength', () => {
    expect(resolveRedactBlurStrength(undefined, {}, 'light')).toBe(0.3);
    expect(resolveRedactBlurStrength(undefined, {}, 'medium')).toBe(0.4);
    expect(resolveRedactBlurStrength(undefined, {}, 'strong')).toBe(0.5);
  });

  it('clamps an out-of-range value', () => {
    expect(resolveRedactBlurStrength({ blurStrength: 5 }, {})).toBe(0.55);
  });
});
