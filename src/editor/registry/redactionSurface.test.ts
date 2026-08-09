import { describe, expect, it } from 'vitest';
import { redactionDrawingPreviewStyle, renderRedactionSurface } from './redactionSurface.ts';

describe('redactionDrawingPreviewStyle', () => {
  it('is a translucent black fill for blackout, distinct from the committed solid fill', () => {
    const preview = redactionDrawingPreviewStyle('blackout', '#ff0000');
    expect(preview.backgroundColor).toBe('rgba(0, 0, 0, 0.7)');
    expect(preview.border).toBe('2px dashed #ff4757');

    const committed = renderRedactionSurface('blackout', '#ff0000').props.style;
    expect(committed.backgroundColor).toBe('#ff0000');
  });

  it('reads the blur backdrop the same way the committed surface does', () => {
    const preview = redactionDrawingPreviewStyle('blur');
    expect(preview.backdropFilter).toBe('blur(8px)');
    expect(preview.border).toBe('2px dashed #000');
  });

  it('uses the remembered whiteout color at full opacity when it is black', () => {
    const preview = redactionDrawingPreviewStyle('whiteout', '#000000');
    expect(preview.backgroundColor).toBe('#000000');
    expect(preview.opacity).toBe(1);
  });

  it('dims a non-black whiteout preview to read as a ghost, not the committed color', () => {
    const preview = redactionDrawingPreviewStyle('whiteout', '#ffffff');
    expect(preview.backgroundColor).toBe('#ffffff');
    expect(preview.opacity).toBe(0.7);
  });
});
