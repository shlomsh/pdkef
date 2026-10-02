import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import fs from 'node:fs';
import * as pdfjsDist from 'pdfjs-dist';
import PdfSignTool from './PdfSignTool.tsx';
import { hebrewSignMessages, type SignMessages } from '../../i18n/toolMessages';
import { saveHandoff } from '../../lib/drafts/draftStore.js';
import { setInputFiles } from '../../test/setInputFiles.js';
import workspaceStyles from '../../editor-ui/Workspace.module.css';

declare const __dirname: string;

// ENC-07: a protected PDF is one quiet state in Sign, not an editor or an alert.

vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/drafts/draftStore.js')>();
  return { ...actual, saveHandoff: vi.fn(actual.saveHandoff) };
});

const { lifecycleSpy } = vi.hoisted(() => ({ lifecycleSpy: vi.fn() }));
vi.mock('../../lib/productAnalytics.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/productAnalytics.ts')>();
  return { ...actual, reportToolLifecycleEvent: lifecycleSpy };
});

const plainDocument = () => ({
  numPages: 1,
  getPermissions: vi.fn(async () => null),
  getPage: vi.fn(() => Promise.resolve({
    getViewport: () => ({ width: 612, height: 792 }),
    render: () => ({ promise: Promise.resolve() }),
  })),
  destroy: vi.fn(),
});

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

function required<T>(value: T | null | undefined, description: string): T {
  if (value == null) throw new Error(`Expected ${description}`);
  return value;
}

async function settleUntil(description: string, ready: () => boolean, limit = 50): Promise<void> {
  for (let i = 0; i < limit && !ready(); i++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  if (!ready()) throw new Error(`Timed out waiting for ${description}`);
}

describe('a protected PDF in Sign (ENC-07)', () => {
  let container = document.createElement('div');

  const fixture = (name: string) => new File(
    [fs.readFileSync(`${__dirname}/../../lib/__fixtures__/encrypted/${name}`)],
    name,
    { type: 'application/pdf' },
  );

  function mockProtection(kind: 'needs-password' | 'owner-restricted') {
    vi.mocked(pdfjsDist.getDocument).mockImplementationOnce(() => ({
      promise: kind === 'needs-password'
        ? Promise.reject(Object.assign(new Error('No password given'), { name: 'PasswordException' }))
        : Promise.resolve({ ...plainDocument(), getPermissions: vi.fn(async () => []) }),
      destroy: vi.fn(),
    }) as unknown as ReturnType<typeof pdfjsDist.getDocument>);
  }

  async function pick(file: File, messages?: Partial<SignMessages>) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfSignTool messages={messages} />, container); });
    await act(async () => { setInputFiles(required(container.querySelector<HTMLInputElement>('input[type="file"]'), 'file input'), [file]); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  }

  const state = () => container.querySelector<HTMLElement>('[data-needs-unlock]');
  const unlockButton = () => required(
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('Unlock it')),
    'the Unlock it button',
  );

  beforeEach(() => {
    lifecycleSpy.mockClear();
    vi.mocked(pdfjsDist.getDocument).mockImplementation(() => ({
      promise: Promise.resolve(plainDocument()),
      destroy: vi.fn(),
    }) as unknown as ReturnType<typeof pdfjsDist.getDocument>);
    window.history.pushState({}, '', '?next=0');
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it.each([
    ['owner-only.pdf', 'owner-restricted', 'This PDF is protected', "It opens without a password, but Sign can't change it as it is. Unlock takes the protection off on your device, then you can sign it."],
    ['needs-password.pdf', 'needs-password', 'This PDF has a password', 'Unlock opens it on your device, then you can sign it.'],
  ] as const)('%s shows the state and never reaches the editor or the failure count', async (name, kind, title, body) => {
    mockProtection(kind);
    await pick(fixture(name));

    const shown = required(state(), 'the needs-unlock state');
    expect(shown.querySelector('h2')?.textContent).toBe(title);
    expect(shown.querySelector('p')?.textContent).toBe(body);
    expect(container.querySelector(`.${workspaceStyles.workspace}`)).toBeNull();
    expect(container.querySelector('[data-editor-element]')).toBeNull();
    expect(lifecycleSpy).not.toHaveBeenCalledWith('tool_operation_failed', 'sign');
    expect(container.textContent).toContain('Replace');
  });

  it('Unlock it parks the file for Unlock, then navigates there', async () => {
    mockProtection('owner-restricted');
    vi.mocked(saveHandoff).mockResolvedValueOnce(true);
    await pick(fixture('owner-only.pdf'));
    const location = { href: '/sign/' };
    vi.stubGlobal('location', location);
    await act(async () => { unlockButton().click(); });
    await settleUntil('the hand-off to Unlock', () => location.href === '/unlock/');
    expect(saveHandoff).toHaveBeenCalledWith('unlock', expect.objectContaining({
      fileName: 'owner-only.pdf', fileType: 'application/pdf', fileBytes: expect.any(ArrayBuffer), from: 'sign',
    }));
  });

  it('a failed save says so quietly and leaves the button usable', async () => {
    mockProtection('needs-password');
    vi.mocked(saveHandoff).mockResolvedValueOnce(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await pick(fixture('needs-password.pdf'));
    await act(async () => { unlockButton().click(); });
    await settleUntil('the failure line', () => (state()?.textContent ?? '').includes("Couldn't open Unlock with this file. Open Unlock and choose it there."));
    expect(unlockButton().disabled).toBe(false);
    expect(lifecycleSpy).not.toHaveBeenCalledWith('tool_operation_failed', 'sign');
  });

  it('choosing another file clears the state', async () => {
    mockProtection('needs-password');
    await pick(fixture('needs-password.pdf'));
    expect(state()).not.toBeNull();
    await act(async () => { setInputFiles(required(container.querySelector<HTMLInputElement>('input[type="file"]'), 'file input'), [fixture('plain.pdf')]); });
    // Replacing a loaded file is confirmed first (MEM-03, BasePdfTool).
    const confirmReplace = required(Array.from(container.querySelectorAll<HTMLButtonElement>('dialog button'))
      .find((button) => button.textContent?.trim() === 'Replace file'), 'Replace file button');
    await act(async () => { confirmReplace.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(state()).toBeNull();
  });

  it('shows the Hebrew title on the Hebrew page', async () => {
    mockProtection('needs-password');
    await pick(fixture('needs-password.pdf'), hebrewSignMessages);
    expect(state()?.querySelector('h2')?.textContent).toBe(hebrewSignMessages.protectedNeedsPasswordTitle);
  });

  it('a plain file opens the editor as before', async () => {
    await pick(fixture('plain.pdf'));
    expect(state()).toBeNull();
    expect(container.querySelector(`.${workspaceStyles.workspace}`)).not.toBeNull();
  });
});
