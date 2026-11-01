import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import PdfHighlightTool from './PdfHighlightTool.tsx';
import { englishHighlightMessages as t } from './messages.ts';

let container: HTMLElement | null = null;

afterEach(() => {
  if (container) {
    act(() => render(null, container!));
    container.remove();
    container = null;
  }
});

describe('PdfHighlightTool', () => {
  it('opens on the empty sheet that asks for a PDF', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfHighlightTool />, container!));
    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
    expect(container.textContent).toContain(t.emptyMessage);
  });
});
