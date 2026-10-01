import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import BrushControls, {
  clampBrushSize,
  DEFAULT_BRUSH,
  brushStyleOf,
  resolveBrush,
} from './BrushControls.tsx';
import type { DocumentStyle } from '../../editor/model/documentStyle.ts';
import { getAppStyle, rememberAppStyle } from '../../editor/workspace/preferenceStore.ts';

describe('brush settings', () => {
  it('a document follows its own choice, else the latest choice anywhere, else the default', () => {
    expect(resolveBrush(undefined, {})).toEqual(DEFAULT_BRUSH);
    expect(resolveBrush(undefined, { brushMode: 'brush', brushSize: 25 })).toEqual({ mode: 'brush', size: 25 });
    expect(resolveBrush({ brushSize: 8 }, { brushMode: 'brush', brushSize: 25 })).toEqual({ mode: 'brush', size: 8 });
  });

  it('starts new documents at the last choice and keeps each document its own', () => {
    localStorage.clear();
    // Document A: the person picks size 30.
    let carriedA: Partial<DocumentStyle> | undefined;
    expect(resolveBrush(carriedA, getAppStyle()).size).toBe(DEFAULT_BRUSH.size);
    carriedA = brushStyleOf({ mode: 'brush', size: 30 });
    rememberAppStyle(carriedA);
    // Document B opens fresh: it starts at A's size.
    expect(resolveBrush(undefined, getAppStyle())).toEqual({ mode: 'brush', size: 30 });
    // B changes; the last choice moves to B's.
    const carriedB = brushStyleOf({ mode: 'brush', size: 10 });
    rememberAppStyle(carriedB);
    // Reopening A restores A's own choice, not B's.
    expect(resolveBrush(carriedA, getAppStyle())).toEqual({ mode: 'brush', size: 30 });
    expect(resolveBrush(carriedB, getAppStyle())).toEqual({ mode: 'brush', size: 10 });
    // The old browser-wide key is gone.
    expect(localStorage.getItem('pdf-toolkit:redact-brush:v1')).toBeNull();
    localStorage.clear();
  });

  it('keeps the size between 2 and 40', () => {
    expect(clampBrushSize(0)).toBe(2);
    expect(clampBrushSize(99)).toBe(40);
    expect(clampBrushSize(Number.NaN)).toBe(DEFAULT_BRUSH.size);
  });
});

describe('BrushControls', () => {
  it('shows size only in brush mode and colours only for whiteout', () => {
    const host = document.createElement('div');
    const props = { onSettings: () => {}, color: '#ffffff', onColor: () => {}, eyedropping: false, onToggleEyedropper: () => {} };
    act(() => render(<BrushControls tool="whiteout" settings={{ mode: 'box', size: 12 }} {...props} />, host));
    expect(host.querySelector('input[type="range"]')).toBeNull();
    act(() => render(<BrushControls tool="whiteout" settings={{ mode: 'brush', size: 12 }} {...props} />, host));
    expect(host.querySelector('input[type="range"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Pick a colour from the page"]')).not.toBeNull();
    act(() => render(<BrushControls tool="blur" settings={{ mode: 'brush', size: 12 }} {...props} />, host));
    expect(host.querySelector('[aria-label="Pick a colour from the page"]')).toBeNull();
    act(() => render(null, host));
  });
});
