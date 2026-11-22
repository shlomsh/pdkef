import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import PdfHighlightTool from './PdfHighlightTool.tsx';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { onAction, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import type { ActionName } from '#lib/telemetry/errorReportSchema.ts';

answerNetwork();

let container: HTMLElement | null = null;
let harness: BrowserToolHarness;

beforeEach(async () => { harness = await installBrowserToolHarness(); });

afterEach(async () => {
  if (container) {
    act(() => render(null, container!));
    container.remove();
    container = null;
  }
  await harness.restore();
  resetActionTrailForTests();
});

async function openPdf(name: string): Promise<void> {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage([612, 792]);
  const file = new File([(await doc.save()) as BlobPart], name, { type: 'application/pdf' });
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<PdfHighlightTool />, container!));
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => { setInputFiles(input, [file]); });
  await waitUntil(() => container!.querySelector('[data-lamp-part="cord"]') !== null);
}

describe('PdfHighlightTool with a PDF open', () => {
  it('records no undo when there is nothing to undo', async () => {
    await openPdf('plain.pdf');
    const heard: ActionName[] = [];
    const stop = onAction((name) => heard.push(name));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    });
    stop();
    expect(heard).not.toContain('undo');
  });
});
