// A browser with no usable IndexedDB (a locked-down window): jsdom has none, and this file never installs one.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PdfImageToPdfTool from './PdfImageToPdfTool.tsx';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/support/waitUntil.ts';

// A real, valid 1x1 transparent PNG (67 bytes).
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const png = () => Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) {
    act(() => render(null, container!));
    container.remove();
    container = null;
  }
});

describe('PdfImageToPdfTool UI flow', () => {
  describe('Clean it up as a scan', () => {
    const scanButton = () => Array.from(container!.querySelectorAll('button')).find((b) => b.textContent.includes('Clean it up as a scan'));

    it('says so and stays put when the save fails', async () => {
      expect(typeof indexedDB).toBe('undefined');
      const navigate = vi.fn();
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => render(<PdfImageToPdfTool navigate={navigate} />, container!));
      await act(async () => {
        setInputFiles(container!.querySelector('input[type="file"]'), [new File([png()], 'a.png', { type: 'image/png' })]);
      });
      await waitUntil(() => expect(scanButton()).toBeDefined());
      await act(async () => scanButton()!.click());
      await waitUntil(() => expect(container!.textContent).toContain('Could not open Scan to PDF. Try again.'));
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
