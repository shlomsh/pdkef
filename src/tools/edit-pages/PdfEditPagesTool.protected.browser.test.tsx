import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import * as editPagesLib from './lib/editPages.js';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import plainUrl from '../../lib/__fixtures__/encrypted/plain.pdf?url';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';

// A protected PDF is a precondition, not a failure: Edit Pages shows NeedsUnlock (src/shell/NeedsUnlock.tsx)
// in place of the page grid. The real classifier runs under pdf.js's shipped worker against the real fixtures.

answerNetwork();

vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });
vi.mock('./lib/editPages.js', { spy: true });

const fixtureUrls = { 'needs-password': needsPasswordUrl, 'owner-only': ownerOnlyUrl, plain: plainUrl };
const fixtureFile = async (name: keyof typeof fixtureUrls) =>
  new File([await (await fetch(fixtureUrls[name])).arrayBuffer()], `${name}.pdf`, { type: 'application/pdf' });

describe('PdfEditPagesTool with a protected PDF', () => {
  let container: HTMLElement | null = null;
  let input: HTMLInputElement | undefined;
  let harness: BrowserToolHarness;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    input = undefined;
    vi.mocked(editPagesLib.editPages).mockClear();
  });

  afterEach(async () => {
    if (container) {
      act(() => render(null, container!));
      container.remove();
      container = null;
    }
    vi.clearAllMocks();
    await harness.restore();
  });

  // `ready` is the outcome the test reads; the default is the unlock state or the grid of the first file.
  const pick = async (file: File, ready: () => unknown = () => container!.querySelector('[data-needs-unlock]') ?? container!.querySelector('ul[data-page-grid]') ?? false) => {
    container ??= Object.assign(document.createElement('div'));
    if (!container!.isConnected) {
      document.body.appendChild(container!);
      act(() => render(<PdfEditPagesTool />, container!));
    }
    input ??= container!.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => { setInputFiles(input, [file]); });
    await waitUntil(ready);
    await act(async () => { await drainPromises(); });
  };
  const buttons = () => Array.from(container!.querySelectorAll('button')).map((b) => b.textContent!.trim());

  it.each([
    ['needs-password', 'This PDF has a password'],
    ['owner-only', 'This PDF is protected'],
  ] as const)('%s shows the unlock state and no page grid', async (name, title) => {
    const editPagesSpy = vi.mocked(editPagesLib.editPages);
    await pick(await fixtureFile(name));

    expect(container!.querySelector('[data-needs-unlock]')).not.toBeNull();
    expect(container!.textContent).toContain(title);
    expect(container!.textContent).toContain('edit it');
    expect(buttons()).toContain('Unlock it');
    expect(container!.querySelector('ul[data-page-grid]')).toBeNull();
    expect(container!.textContent).not.toMatch(/Could not edit|Undo|Download/);
    // Nothing was built, and the export never ran.
    expect(editPagesSpy).not.toHaveBeenCalled();
    expect(harness.createdBlobs()).toHaveLength(0);
  });

  it('records the kind each protected fixture gets', async () => {
    await pick(await fixtureFile('needs-password'));
    expect(container!.querySelector('[data-needs-unlock]')!.getAttribute('data-needs-unlock')).toBe('needs-password');
    await pick(await fixtureFile('owner-only'), () => container!.querySelector('[data-needs-unlock="owner-restricted"]') ?? false);
    expect(container!.querySelector('[data-needs-unlock]')!.getAttribute('data-needs-unlock')).toBe('owner-restricted');
  });

  it('"Unlock it" parks the file for Unlock and goes there', async () => {
    await pick(await fixtureFile('needs-password'));
    const navigate = vi.fn();
    const { sendHandoff: realSendHandoff } = await vi.importActual<typeof import('#lib/handoff/sendHandoff.ts')>('#lib/handoff/sendHandoff.ts');
    // forced: a real navigation would unload the test page
    const sent = Promise.withResolvers<void>();
    vi.mocked(sendHandoff).mockImplementationOnce(async (target, payload, options) => {
      try { return await realSendHandoff(target, payload, { ...options, navigate }); } finally { sent.resolve(); }
    });
    await act(async () => {
      Array.from(container!.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Unlock it')!.click();
    });
    await sent.promise;
    expect(navigate).toHaveBeenCalledWith('/unlock/');

    expect(await harness.takeHandoff('unlock')).toMatchObject({ from: 'edit-pdf', fileName: 'needs-password.pdf' });
  });

  it('a normal file picked after a protected one shows the grid', async () => {
    await pick(await fixtureFile('needs-password'));
    await pick(await fixtureFile('plain'), () => (container!.querySelector('ul[data-page-grid]') && !container!.querySelector('[data-needs-unlock]')) || false);

    expect(container!.querySelector('[data-needs-unlock]')).toBeNull();
    expect(container!.querySelector('ul[data-page-grid]')).not.toBeNull();
  });
});
