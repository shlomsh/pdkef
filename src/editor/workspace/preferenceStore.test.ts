import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEditorPreference, setEditorPreference } from './preferenceStore.ts';

describe('editor workspace preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips typed scalar preferences through their established keys', () => {
    expect(setEditorPreference('lastFontSize', 16)).toBe(true);
    expect(setEditorPreference('lastSymbolMark', 'x')).toBe(true);
    expect(setEditorPreference('lastWhiteoutColor', '#f4e7d4')).toBe(true);

    expect(localStorage.getItem('pdf-toolkit:lastFontSize')).toBe('16');
    expect(localStorage.getItem('pdf-toolkit:lastSymbolMark')).toBe('x');
    expect(localStorage.getItem('pdf-toolkit:lastWhiteoutColor')).toBe('#f4e7d4');
    expect(getEditorPreference('lastFontSize')).toBe(16);
    expect(getEditorPreference('lastSymbolMark')).toBe('x');
    expect(getEditorPreference('lastWhiteoutColor')).toBe('#f4e7d4');
  });

  it('round-trips saved signatures and rejects malformed persisted values', () => {
    const signatures = [{ id: 'sig-1', dataUrl: 'data:image/png;base64,abc', aspectRatio: 2 }];
    setEditorPreference('savedSignatures', signatures);
    expect(getEditorPreference('savedSignatures')).toEqual(signatures);

    localStorage.setItem('pdf-toolkit:signatures', JSON.stringify([
      { id: 'sig-2', dataUrl: 'data:image/png;base64,def', aspectRatio: '0.4' },
    ]));
    expect(getEditorPreference('savedSignatures')).toBeNull();

    localStorage.setItem('pdf-toolkit:signatures', '{broken');
    expect(getEditorPreference('savedSignatures')).toBeNull();
    localStorage.setItem('pdf-toolkit:lastSymbolWidth', '0');
    expect(getEditorPreference('lastSymbolWidth')).toBeNull();
    localStorage.setItem('pdf-toolkit:lastSymbolMark', 'cross');
    expect(getEditorPreference('lastSymbolMark')).toBeNull();
  });

  it('degrades without throwing when localStorage is blocked', () => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };

    try {
      expect(getEditorPreference('lastColor')).toBeNull();
      expect(setEditorPreference('lastColor', '#000000')).toBe(false);
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
