import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';

describe('PdfRedactTool before a file is opened', () => {
  let container = document.createElement('div');

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  it('renders the initial file dropper zone', () => {
    document.body.appendChild(container);
    act(() => render(<PdfRedactTool />, container));

    const dropzone = container.querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone?.textContent).toContain('Select or drop a PDF to redact');
  });
});
