import { describe, expect, it } from 'vitest';
import { historyShortcuts, isMacPlatform } from './historyShortcuts.ts';

describe('historyShortcuts', () => {
  it('writes the Mac glyphs on a Mac', () => {
    expect(historyShortcuts(true)).toEqual({ undo: '⌘Z', redo: '⇧⌘Z' });
  });
  it('writes Ctrl elsewhere', () => {
    expect(historyShortcuts(false)).toEqual({ undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z' });
  });
  it('knows a Mac from its platform string', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
    expect(isMacPlatform('')).toBe(false);
  });
});
