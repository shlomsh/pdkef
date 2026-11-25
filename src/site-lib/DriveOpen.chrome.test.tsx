// @vitest-environment jsdom
// @vitest-environment-options { "userAgent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveOpen from './DriveOpen.tsx';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders } from '../test/support/network.ts';
import { forgetSaved, savedToken, toGoogle } from './drive/driveSignIn.ts';
import { saveToken } from './drive/driveSession.ts';
import { DRIVE_TOKEN_KEY } from '#lib/handoff/driveSaveLink.ts';
import { loadPicker, openPicker } from './drive/drivePicker.ts';
import { drainPromises } from '../test/support/drainPromises.ts';
import { waitUntil } from '../test/support/waitUntil.ts';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { peekHandoff } from '#lib/drafts/draftStore.ts';

// Replaced: Google's sign-in popup (googleToken) and the Picker (drivePicker, gapi), which load Google's scripts.
// The Drive download is the real driveClient; MSW answers its two requests to googleapis. Everything else
// runs for real: intent, route, saved token and redirect return on the page's own URL and localStorage, the
// chooser, and the hand-off on fake-indexeddb. The two spies see the redirect and the hand-off.
// Forced: the Picker loads Google's scripts, which cannot run in a test
vi.mock('./drive/drivePicker.ts', () => ({ loadPicker: vi.fn(), openPicker: vi.fn() }));
vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });
vi.mock('./drive/driveSignIn.ts', { spy: true });

const OPEN_WITH = `?state=${encodeURIComponent(JSON.stringify({ ids: ['abc123abcdef'], action: 'open', userId: 'u1' }))}`;
const at = (search: string, hash = '') => history.replaceState(null, '', `/drive/${search}${hash}`);
const redirectBack = (fragment: string) => `#${fragment}`;
const saved = (token: string, user?: string) => saveToken(localStorage, token, 3600, Date.now(), user);

answerNetwork();

const meta = (id: string) => `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType&supportsAllDrives=true`;
const media = (id: string) => `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
const FILE_META = meta('abc123abcdef');
const FILE_MEDIA = media('abc123abcdef');

type Answer = () => Response | Promise<Response>;
const pdfMeta: Answer = () => HttpResponse.json({ name: 'a.pdf', mimeType: 'application/pdf' });
const pdfBytes: Answer = () => new HttpResponse(new Uint8Array([1, 2, 3, 4]));
const refused: Answer = () => new HttpResponse(null, { status: 401 });

const drive = (...answers: Answer[]) => answerInTurn('get', 'https://www.googleapis.com/drive/v3/files/:id', ...answers);
const downloads = () => drive(pdfMeta, pdfBytes);
const arrived = (c: HTMLElement) => c.textContent!.includes('a.pdf');
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

  it('opens the file with the token Google sent back from the redirect', async () => {
    at('', redirectBack(`access_token=fresh&expires_in=3599&state=${encodeURIComponent(`none|${OPEN_WITH}`)}`));
    const seen = downloads();
    act(() => render(<DriveOpen />, container));
    await waitUntil(() => arrived(container));
    expect(seen.map((r) => r.url)).toEqual([FILE_META, FILE_MEDIA]);
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer fresh' });
    expect(sentHeaders(seen[1])).toEqual({ authorization: 'Bearer fresh' });
    expect(savedToken('u1')).toBe('fresh');
    expect(location.search).toBe(OPEN_WITH);
    expect(toGoogle).not.toHaveBeenCalled();
    expect(chooserShown(container)).toBe(true);
  });

  it('signs in quietly by redirect on desktop Chrome when nothing is saved', async () => {
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).toHaveBeenCalledWith('none', expect.any(String));
    expect(button(container)).toBeNull();
  });

  it('shows the button, not another redirect, when the redirect sign-in came back refused', async () => {
    at('', redirectBack(`error=access_denied&state=${encodeURIComponent(`select_account|${OPEN_WITH}`)}`));
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).not.toHaveBeenCalled();
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  it('forgets a saved token Google rejects and falls back to the button', async () => {
    saved('stale', 'u1');
    const seen = drive(refused);
    act(() => render(<DriveOpen />, container));
    await waitUntil(() => expect(button(container)?.textContent).toContain('Sign in with Google'));
    expect(seen).toHaveLength(1);
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer stale' });
    expect(forgetSaved).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DRIVE_TOKEN_KEY)).toBeNull();
    expect(toGoogle).not.toHaveBeenCalled();
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  // DRIVE-10: the account Drive names is the one every sign-in asks for, and the only one a saved token serves.
  it('looks up only the Drive account\'s saved token before the quiet redirect', async () => {
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(savedToken).toHaveBeenCalledWith('u1');
    expect(toGoogle).toHaveBeenCalledWith('none', location.search); // the hint is read from this search, see driveRedirect.test.ts
  });

  it('names Drive as the sender of a picked file', async () => {
    at('?pick=1&tool=sign&return=%2Fsign%2F');
    saved('saved');
    // Forced: the mocked Google picker answers
    vi.mocked(loadPicker).mockResolvedValue(true);
    // Forced: the mocked Google picker answers
    vi.mocked(openPicker).mockResolvedValue({ action: 'picked', docs: [{ id: 'f1' }] } as never);
    const seen = downloads();
    act(() => render(<DriveOpen />, container));
    await waitUntil(() => sessionStorage.length > 0);
    expect(seen.map((r) => r.url)).toEqual([meta('f1'), media('f1')]);
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer saved' });
    expect(vi.mocked(sendHandoff).mock.calls[0][1]).toMatchObject({ fileName: 'a.pdf', from: 'drive' });
    expect(await peekHandoff('sign')).toMatchObject({ fileName: 'a.pdf', from: 'drive' });
  });
});
