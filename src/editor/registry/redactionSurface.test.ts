import { describe, expect, it } from 'vitest';
import {
  redactionDrawingPreviewStyle,
  renderRedactionDrawingPreviewContent,
  renderRedactionSurface,
} from './redactionSurface.ts';

function blurChild(node: ReturnType<typeof renderRedactionSurface>) {
  const children = node.props.children;
  return Array.isArray(children) ? children[0] : children;
}

describe('redactionDrawingPreviewStyle', () => {
  it('is a translucent black fill for blackout, distinct from the committed solid fill', () => {
    const preview = redactionDrawingPreviewStyle('blackout', '#ff0000');
    expect(preview.backgroundColor).toBe('rgba(0, 0, 0, 0.7)');
    expect(preview.border).toBe('2px dashed #ff4757');

    const committed = renderRedactionSurface('blackout', '#ff0000').props.style;
    expect(committed.backgroundColor).toBe('#ff0000');
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

describe('renderRedactionSurface blur', () => {
  it('makes the surface a size container with no backdrop-filter of its own', () => {
    const surface = renderRedactionSurface('blur');
    expect(surface.props.style.containerType).toBe('size');
    expect(surface.props.style.backdropFilter).toBe('none');
    expect(surface.props.style.WebkitBackdropFilter).toBe('none');
  });

  it('defaults to the strong radius (0.5) as a fraction of the box height, on the child blur layer', () => {
    const child = blurChild(renderRedactionSurface('blur'));
    expect(child.props.class).toBe('redact-surface__blur');
    expect(child.props.style.backdropFilter).toBe('blur(calc(0.5 * 100cqh))');
    expect(child.props.style.WebkitBackdropFilter).toBe('blur(calc(0.5 * 100cqh))');
  });

  it('reads a lighter radius (0.3) for the light strength', () => {
    const child = blurChild(renderRedactionSurface('blur', undefined, 'light'));
    expect(child.props.style.backdropFilter).toBe('blur(calc(0.3 * 100cqh))');
  });

  it('blackout and whiteout render no blur child', () => {
    expect(renderRedactionSurface('blackout', '#000000').props.children).toBeNull();
    expect(renderRedactionSurface('whiteout', '#ffffff').props.children).toBeNull();
  });
});

describe('renderRedactionDrawingPreviewContent', () => {
  it('returns the blur layer for blur, scaled by strength', () => {
    const content = renderRedactionDrawingPreviewContent('blur', 'light');
    expect(content?.props.class).toBe('redact-surface__blur');
    expect(content?.props.style.backdropFilter).toBe('blur(calc(0.3 * 100cqh))');
  });

  it('returns null for blackout and whiteout', () => {
    expect(renderRedactionDrawingPreviewContent('blackout')).toBeNull();
    expect(renderRedactionDrawingPreviewContent('whiteout')).toBeNull();
  });
});
