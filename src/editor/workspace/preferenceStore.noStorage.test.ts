// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  getEditorPreference,
  rememberRecentWhiteoutColor,
  setEditorPreference,
  setSavedSignatures,
} from './preferenceStore.ts';

// Under Node there is no localStorage at all, so every read and write really refuses, as in a browser with site
// data blocked. These tests moved here from preferenceStore.test.ts for that environment.
const scope = 'test-user';
const storageRefuses = () => {
  expect(typeof window).toBe('undefined');
  expect(() => localStorage.getItem('probe')).toThrow();
  expect(() => localStorage.setItem('probe', 'x')).toThrow();
};

describe('editor workspace preferences without storage', () => {
  it('degrades without throwing when localStorage is blocked', () => {
    storageRefuses();
    expect(getEditorPreference('penColor', { userScope: scope })).toBeNull();
    expect(setEditorPreference('penColor', '#000000', { userScope: scope })).toBe(false);
    expect(setSavedSignatures([{ id: 'memory-only', dataUrl: 'data:image/png;base64,abc', aspectRatio: 2 }], { userScope: scope })).toBe(false);
  });
});

describe('recent whiteout colours without storage (RED-53)', () => {
  it('falls back to the in-memory list when storage cannot be read', () => {
    storageRefuses();
    expect(rememberRecentWhiteoutColor('#bbbbbb', ['#aaaaaa'], { userScope: scope })).toEqual(['#bbbbbb', '#aaaaaa']);
  });
});
