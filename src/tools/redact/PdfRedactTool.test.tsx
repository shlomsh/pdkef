import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { waitUntil } from '../../test/support/waitUntil.ts';

describe('PdfRedactTool before a file is opened', () => {
  let container = document.createElement('div');

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  it('renders the initial file dropper zone', async () => {
    document.body.appendChild(container);
    act(() => render(<PdfRedactTool />, container));

    // BasePdfTool shows a holding dropzone with no file input until the on-device draft check settles;
    // wait for the input so the tool's mount effects are done before the test unmounts it.
    await waitUntil(() => container.querySelector('input[type="file"]') !== null);

    const dropzone = container.querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone?.textContent).toContain('Select or drop a PDF to redact');
  });
});
