import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import PdfSignTool from './PdfSignTool.tsx';
import { hebrewSignMessages } from './messages';
import type { SignMessages } from '#editor/registry/messages.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/support/waitUntil.ts';
import '../../test/support/realPdfjs.ts';
import { openNewerStore } from '#lib/drafts/newerStore.test-helper.ts';

declare const __dirname: string;

// ENC-07: a protected PDF is one quiet state in Sign, not an editor or an alert.

// pdf.js runs for real over the fixtures (realPdfjs.ts), as do draftStore, analytics and the annotation read-back.

function required<T>(value: T | null | undefined, description: string): T {
  if (value == null) throw new Error(`Expected ${description}`);
  return value;
}

describe('a protected PDF in Sign (ENC-07)', () => {
  let container = document.createElement('div');
  let harness: ToolHarness;
  // The failed-operation events Sign counted so far.
  const signFailures = async () => {
    await harness.flush();
    return harness.usageEvents('tool_operation_failed').filter((event) => event.properties.tool === 'sign');
  };

  const fixture = (name: string) => new File(
    [fs.readFileSync(`${__dirname}/../../lib/__fixtures__/encrypted/${name}`)],
    name,
    { type: 'application/pdf' },
  );

  async function pick(file: File, messages?: Partial<SignMessages>) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfSignTool messages={messages} />, container); });
    await act(async () => { setInputFiles(required(container.querySelector<HTMLInputElement>('input[type="file"]'), 'file input'), [file]); });
  }

  const state = () => container.querySelector<HTMLElement>('[data-needs-unlock]');
  // A protected file ends in the needs-unlock state (a lazy parser chunk and pdf.js run before it shows).
  const stateShown = () => waitUntil(() => state() !== null);
  const unlockButton = () => required(
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('Unlock it')),
    'the Unlock it button',
  );

  beforeEach(() => {
    harness = installToolHarness();
    window.history.pushState({}, '', '?next=0');
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
    harness.restore();
  });

  it.each([
    ['owner-only.pdf', 'This PDF is protected', "It opens without a password, but Sign can't change it as it is. Unlock takes the protection off on your device, then you can sign it."],
    ['needs-password.pdf', 'This PDF has a password', 'Unlock opens it on your device, then you can sign it.'],
  ] as const)('%s shows the state and never reaches the editor or the failure count', async (name, title, body) => {
    await pick(fixture(name));
    await stateShown();

    const shown = required(state(), 'the needs-unlock state');
    expect(shown.querySelector('h2')?.textContent).toBe(title);
    expect(shown.querySelector('p')?.textContent).toBe(body);
    expect(container.querySelector('[aria-busy]')).toBeNull();
    expect(container.querySelector('[data-editor-element]')).toBeNull();
    expect(await signFailures()).toEqual([]);
    expect(container.textContent).toContain('Replace');
  });

  it('Unlock it parks the file for Unlock, then navigates there', async () => {
    await pick(fixture('owner-only.pdf'));
    await stateShown();
    const location = { href: '/sign/' };
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: no navigation in jsdom, so location is replaced to see where the button sends the page
    vi.stubGlobal('location', location);
    await act(async () => { unlockButton().click(); });
    await waitUntil(() => location.href === '/unlock/');
    // The hand-off marker is set once the file is parked: the next page reads it before it paints.
    expect(sessionStorage.getItem('pdkef:handoff-pending:unlock')).not.toBeNull();
    const parked = await harness.takeHandoff('unlock');
    expect(parked).toEqual(expect.objectContaining({ fileName: 'owner-only.pdf', fileType: 'application/pdf', from: 'sign' }));
    // The bytes are the file's own (read back from IndexedDB, so a different realm's ArrayBuffer).
    expect((parked?.fileBytes as ArrayBuffer).byteLength).toBe(fixture('owner-only.pdf').size);
  });

  it('a failed save says so quietly and leaves the button usable', async () => {
    vi.spyOn(console, 'error');
    // A database already at a newer version refuses the product's open, so the file cannot be parked.
    await openNewerStore();
    await pick(fixture('needs-password.pdf'));
    await stateShown();
    await act(async () => { unlockButton().click(); });
    await waitUntil(() => (state()?.textContent ?? '').includes("Couldn't open Unlock with this file. Open Unlock and choose it there."));
    expect(unlockButton().disabled).toBe(false);
    expect(await signFailures()).toEqual([]);
  });

  it('choosing another file clears the state', async () => {
    await pick(fixture('needs-password.pdf'));
    await stateShown();
    expect(state()).not.toBeNull();
    await act(async () => { setInputFiles(required(container.querySelector<HTMLInputElement>('input[type="file"]'), 'file input'), [fixture('plain.pdf')]); });
    // Replacing a loaded file is confirmed first (MEM-03, BasePdfTool).
    const confirmReplace = required(Array.from(container.querySelectorAll<HTMLButtonElement>('dialog button'))
      .find((button) => button.textContent?.trim() === 'Replace file'), 'Replace file button');
    await act(async () => { confirmReplace.click(); });
    await waitUntil(() => state() === null);
    expect(state()).toBeNull();
  });

  it('shows the Hebrew title on the Hebrew page', async () => {
    await pick(fixture('needs-password.pdf'), hebrewSignMessages);
    await stateShown();
    expect(state()?.querySelector('h2')?.textContent).toBe(hebrewSignMessages.protectedNeedsPasswordTitle);
  });

  it('a plain file opens the editor as before', async () => {
    await pick(fixture('plain.pdf'));
    await waitUntil(() => container.querySelector('[aria-busy]') !== null);
    expect(state()).toBeNull();
    expect(container.querySelector('[aria-busy]')).not.toBeNull();
  });
});
