import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BLUR_STRENGTH } from '#editor/model/blurStrength.ts';
import { rememberAppStyle, setEditorPreference } from '#editor/workspace/preferenceStore.ts';
import { initialRedactStateFromPreferences } from './initialRedactState.ts';

describe('initialRedactStateFromPreferences', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('starts from the tool defaults when nothing is remembered', () => {
    const { tool } = initialRedactStateFromPreferences();
    expect(tool.activeColor).toBe('#ffffff');
    expect(tool.activeBlurStrength).toBe(DEFAULT_BLUR_STRENGTH);
    expect(tool.activeStyle).toBeNull();
  });

  it('starts from the legacy browser-wide preferences', () => {
    setEditorPreference('lastWhiteoutColor', '#123456');
    setEditorPreference('lastBlurStrength', 0.25);
    const { tool } = initialRedactStateFromPreferences();
    expect(tool.activeColor).toBe('#123456');
    expect(tool.activeBlurStrength).toBe(0.25);
  });

  it('prefers the app-wide style a new document starts from, brush included', () => {
    setEditorPreference('lastWhiteoutColor', '#123456');
    rememberAppStyle({ whiteoutColor: '#eeeeee', blurStrength: 0.45, brushMode: 'brush', brushSize: 12 });
    const { tool } = initialRedactStateFromPreferences();
    expect(tool.activeColor).toBe('#eeeeee');
    expect(tool.activeBlurStrength).toBe(0.45);
    expect(tool.brush).toEqual({ mode: 'brush', size: 12 });
  });
});
