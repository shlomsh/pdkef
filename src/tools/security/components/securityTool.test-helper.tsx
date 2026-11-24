import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, type ComponentProps } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect } from 'vitest';
import PdfSecurityTool from '../PdfSecurityTool.tsx';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import '../../../test/support/realPdfjs.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { setInputFiles } from '../../../test/support/setInputFiles.js';
import { waitUntil as waitFor } from '../../../test/support/waitUntil.ts';

/** @testSeam */
export type Protection = 'open' | 'needs-password' | 'owner-restricted' | 'unreadable';
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(process.cwd(), `src/lib/__fixtures__/encrypted/${name}.pdf`)));
/** @testSeam A real file for each answer the check can give; the needs-password one opens with "u". */
export const BYTES: Record<Protection, Uint8Array<ArrayBuffer>> = {
  open: fixture('plain'),
  'needs-password': fixture('needs-password'),
  'owner-restricted': fixture('owner-only'),
  unreadable: new TextEncoder().encode('this is not a PDF'),
};
/** @testSeam */
export const UNLOCK_PASSWORD = 'u';
/** @testSeam */
export const realFile = (kind: Protection, name = 'test.pdf') => new File([BYTES[kind]], name, { type: 'application/pdf' });
/** @testSeam Under the test's own 5 s limit, so a missing result fails on its assertion rather than on the clock. */
export const waitUntil = (check: () => unknown) => waitFor(check, { timeout: 4000 });

/** @testSeam Mounts the real island in jsdom for each test of the calling suite. */
export function useSecurityTool() {
  const s = {
    harness: null as unknown as ToolHarness,
    container: null as unknown as HTMLDivElement,
    mount(props: ComponentProps<typeof PdfSecurityTool> = {}) {
      act(() => { render(<PdfSecurityTool {...props} />, s.container); });
    },
    text: () => s.container.textContent ?? '',
    buttons: () => Array.from(s.container.querySelectorAll('button')),
    buttonByText: (text: string) => s.buttons().find((button) => button.textContent?.trim() === text),
    click: (el: HTMLElement | undefined | null) => act(async () => {
      if (!el) throw new Error('Expected something to click');
      el.click();
    }),
    announced: () => s.container.querySelector('p.sr-only[role="status"]')?.textContent?.trim() ?? '',
    tag: () => s.container.querySelector('[data-security-preview] [data-preview-tag]')?.textContent,
    /** The rail's Download, not the phone bar's quiet one. */
    railDownload: () => s.container.querySelector<HTMLAnchorElement>('a[download]:not([data-quiet-download])'),
    input: () => s.container.querySelector<HTMLInputElement>('input[type="password"]'),
    form: () => s.container.querySelector('form'),
    replaceDialog: () => s.container.querySelector<HTMLDialogElement>('dialog[aria-labelledby="confirm-replace-title"]'),
    replaceDialogOpen: () => s.replaceDialog()?.open === true,
    dialogButton: (text: string) => Array.from(s.replaceDialog()?.querySelectorAll('button') ?? []).find((button) => button.textContent?.trim() === text),
    drain: () => act(async () => { await drainPromises(); }),
    pick: (file: File) => act(async () => {
      setInputFiles(s.container.querySelector('input[type="file"]'), [file]);
      await drainPromises();
    }),
    /** Picks a file and waits for what a person sees once it is read: the form, the result, the error, or the question about replacing. */
    async load(file: File) {
      await s.pick(file);
      await waitUntil(() => s.replaceDialogOpen() || (s.announced() !== '' && !s.announced().includes('Checking file')));
    },
    async confirmReplace() {
      await s.click(s.dialogButton('Replace file'));
      await waitUntil(() => expect(s.replaceDialogOpen()).toBe(false));
    },
    type: (value: string) => act(async () => {
      const input = s.input();
      if (!input) throw new Error('Expected a password field');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }),
    /** Submits the form and waits for the run it starts to end. */
    async submit() {
      await act(async () => { s.form()?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await waitUntil(() => expect(s.container.querySelector('[data-processing]')).toBeNull());
      await s.harness.flush();
    },
    async submitPassword(value: string) {
      await s.type(value);
      await s.submit();
    },
    /** What the bytes behind the Download link ask of a person, by the real pdf.js check. */
    async outputProtection() {
      const blob = s.harness.blobForUrl(s.railDownload()?.getAttribute('href') ?? s.container.querySelector('a[download]')?.getAttribute('href'));
      if (!blob) throw new Error('Expected a file behind the Download link');
      return probeEncryption(await blob.arrayBuffer());
    },
  };

  beforeEach(() => {
    s.harness = installToolHarness({ trackIndexedDb: true });
    s.container = document.createElement('div');
    document.body.append(s.container);
  });
  afterEach(async () => {
    act(() => { render(null, s.container); });
    s.container.remove();
    // The hand-off intake reads IndexedDB: it must end while the DOM still exists.
    await s.harness.settle();
    s.harness.restore();
  });
  return s;
}
