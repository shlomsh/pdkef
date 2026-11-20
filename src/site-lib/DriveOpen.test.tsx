import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveOpen from './DriveOpen.tsx';
import { fetchDriveFile } from './drive/driveClient.ts';
import { requestDriveToken } from './drive/googleToken.ts';
import { forgetSaved, remember, savedToken, toGoogle } from './drive/driveSignIn.ts';
import { saveToken } from './drive/driveSession.ts';
import { DRIVE_TOKEN_KEY } from '#lib/handoff/driveSaveLink.ts';
import { loadPicker, openPicker } from './drive/drivePicker.ts';
import { drainPromises } from '../test/support/drainPromises.ts';
import { waitUntil } from '../test/support/waitUntil.ts';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { peekHandoff } from '#lib/drafts/draftStore.ts';

// Network stays replaced for the MSW wave: Google's sign-in popup (googleToken), the Drive download
// (driveClient, a fetch to googleapis) and the Picker (drivePicker, gapi). Everything else runs for real:
// intent, route, saved token and redirect return on the page's own URL and localStorage, the chooser,
// and the hand-off on fake-indexeddb. The two spies see the redirect and the hand-off.
vi.mock('./drive/googleToken.ts', () => ({ requestDriveToken: vi.fn() }));
vi.mock('./drive/driveClient.ts', () => ({ fetchDriveFile: vi.fn() }));
vi.mock('./drive/drivePicker.ts', () => ({ loadPicker: vi.fn(), openPicker: vi.fn() }));
vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });
vi.mock('./drive/driveSignIn.ts', { spy: true });

const OPEN_WITH = `?state=${encodeURIComponent(JSON.stringify({ ids: ['abc123abcdef'], action: 'open', userId: 'u1' }))}`;
const FILE = { fileId: 'abc123abcdef', resourceKey: undefined };
const CHROME = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const at = (search: string, hash = '') => history.replaceState(null, '', `/drive/${search}${hash}`);
const redirectBack = (fragment: string) => `#${fragment}`;
const desktopChrome = () => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME); // forced: jsdom's agent is no Chrome
const saved = (token: string, user?: string) => saveToken(localStorage, token, 3600, Date.now(), user);

const PDF = { ok: true, name: 'a.pdf', mimeType: 'application/pdf', bytes: new ArrayBuffer(4) } as never;
const button = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('button');

const chooserShown = (c: HTMLElement) => c.textContent!.includes('Black out private parts');
const flush = () => act(async () => { await drainPromises(); });

describe('DriveOpen', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    indexedDB = new IDBFactory();
    localStorage.clear();
    sessionStorage.clear();
    at(OPEN_WITH);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.restoreAllMocks();
  });

  it('starts one token request and one fetch when the Google button is tapped twice', async () => {
    let resolveToken!: (value: { ok: true; token: string; expiresInSeconds: number }) => void;
    vi.mocked(requestDriveToken).mockReturnValue(new Promise((resolve) => { resolveToken = resolve; }));
    vi.mocked(fetchDriveFile).mockResolvedValue({ ok: true, name: 'a.pdf', mimeType: 'application/pdf', bytes: new ArrayBuffer(4) } as never);
    act(() => render(<DriveOpen />, container));
    const button = container.querySelector<HTMLButtonElement>('button')!;

    act(() => { button.click(); button.click(); });
    expect(requestDriveToken).toHaveBeenCalledTimes(1);

    resolveToken({ ok: true, token: 't', expiresInSeconds: 3600 });
    await flush();
    expect(fetchDriveFile).toHaveBeenCalledTimes(1);
    expect(chooserShown(container)).toBe(true);
  });

  // DRIVE-10: Open with reuses the sign-in it already has instead of stopping on the button every time.
  it('opens the file straight away with a saved token, no button and no popup', async () => {
    saved('saved', 'u1');
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(fetchDriveFile).toHaveBeenCalledWith(expect.any(Function), 'saved', FILE);
    expect(requestDriveToken).not.toHaveBeenCalled();
    expect(chooserShown(container)).toBe(true);
  });

  it('opens the file with the token Google sent back from the redirect', async () => {
    desktopChrome();
    at('', redirectBack(`access_token=fresh&expires_in=3599&state=${encodeURIComponent(`none|${OPEN_WITH}`)}`));
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(fetchDriveFile).toHaveBeenCalledWith(expect.any(Function), 'fresh', FILE);
    expect(savedToken('u1')).toBe('fresh');
    expect(location.search).toBe(OPEN_WITH);
    expect(toGoogle).not.toHaveBeenCalled();
    expect(chooserShown(container)).toBe(true);
  });

  it('signs in quietly by redirect on desktop Chrome when nothing is saved', async () => {
    desktopChrome();
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).toHaveBeenCalledWith('none', expect.any(String));
    expect(button(container)).toBeNull();
  });

  it('waits for a tap on the popup route when nothing is saved', async () => {
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).not.toHaveBeenCalled();
    expect(fetchDriveFile).not.toHaveBeenCalled();
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  it('shows the button, not another redirect, when the redirect sign-in came back refused', async () => {
    desktopChrome();
    at('', redirectBack(`error=access_denied&state=${encodeURIComponent(`select_account|${OPEN_WITH}`)}`));
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).not.toHaveBeenCalled();
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  it('forgets a saved token Google rejects and falls back to the button', async () => {
    saved('stale', 'u1');
    desktopChrome();
    vi.mocked(fetchDriveFile).mockResolvedValue({ ok: false, error: 'unauthorized' });
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(forgetSaved).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DRIVE_TOKEN_KEY)).toBeNull();
    expect(toGoogle).not.toHaveBeenCalled();
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  it('remembers the token from the popup so the next Open with needs no tap', async () => {
    vi.mocked(requestDriveToken).mockResolvedValue({ ok: true, token: 'popped', expiresInSeconds: 3599 });
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await flush();
    act(() => { button(container)!.click(); });
    await flush();
    expect(remember).toHaveBeenCalledWith('popped', 3599, 'u1');
    expect(savedToken('u1')).toBe('popped');
    expect(chooserShown(container)).toBe(true);
  });

  // DRIVE-10: the account Drive names is the one every sign-in asks for, and the only one a saved token serves.
  it('looks up only the Drive account\'s saved token before the quiet redirect', async () => {
    desktopChrome();
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(savedToken).toHaveBeenCalledWith('u1');
    expect(toGoogle).toHaveBeenCalledWith('none', location.search); // the hint is read from this search, see driveRedirect.test.ts
  });

  it('hints the Drive account to the popup and remembers its token for that account', async () => {
    vi.mocked(requestDriveToken).mockResolvedValue({ ok: true, token: 'popped', expiresInSeconds: 3599 });
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await flush();
    act(() => { button(container)!.click(); });
    await flush();
    expect(requestDriveToken).toHaveBeenCalledWith('u1');
    expect(remember).toHaveBeenCalledWith('popped', 3599, 'u1');
  });

  // DRIVE-11: the choice does not wait for the download.
  it('shows the tool choice while the file is still downloading, then gives it the file', async () => {
    saved('saved', 'u1');
    let arrive!: (value: never) => void;
    vi.mocked(fetchDriveFile).mockReturnValue(new Promise((resolve) => { arrive = resolve; }));
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(chooserShown(container)).toBe(true);
    expect(container.textContent).toContain('Your file is on its way.');
    expect(container.textContent).not.toContain('a.pdf');

    arrive(PDF);
    await flush();
    expect(container.textContent).toContain('a.pdf');
    await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Sign'))!.click(); });
    await waitUntil(() => sessionStorage.length > 0);
    expect(await peekHandoff('sign')).toMatchObject({ fileName: 'a.pdf', from: 'drive' });
  });

  it('names Drive as the sender of a picked file', async () => {
    at('?pick=1&tool=sign&return=%2Fsign%2F');
    desktopChrome();
    saved('saved');
    vi.mocked(loadPicker).mockResolvedValue(true);
    vi.mocked(openPicker).mockResolvedValue({ action: 'picked', docs: [{ id: 'f1' }] } as never);
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await waitUntil(() => sessionStorage.length > 0);
    expect(vi.mocked(sendHandoff).mock.calls[0][1]).toMatchObject({ fileName: 'a.pdf', from: 'drive' });
    expect(await peekHandoff('sign')).toMatchObject({ fileName: 'a.pdf', from: 'drive' });
  });

  it('leaves the choice for the button when the download is refused', async () => {
    saved('stale', 'u1');
    let arrive!: (value: { ok: false; error: 'unauthorized' }) => void;
    vi.mocked(fetchDriveFile).mockReturnValue(new Promise((resolve) => { arrive = resolve; }));
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(chooserShown(container)).toBe(true);
    expect(container.textContent).toContain('Your file is on its way.');

    arrive({ ok: false, error: 'unauthorized' });
    await flush();
    expect(chooserShown(container)).toBe(false);
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });
});
